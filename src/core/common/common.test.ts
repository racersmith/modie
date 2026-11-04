/**
 * Unit tests for common artifact primitives.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import {
  escapeRegex,
  findDeepestCommonAncestor,
  formatArtifactFilename,
  formatTaskBranch,
  generateSlug,
  getSubtypeContainerName,
  isArtifactFilename,
  isValidArtifactId,
  isValidSlug,
  MODIE_VERSION,
  normalizeTaskId,
  parseArtifactFilename,
  parseSubtaskId,
  parseTaskBranch,
  parseTaskIdFromBranch,
  resolveArtifactDirectories,
  resolveGoverningScope,
  resolveScopeDirectory,
  slugToTitle,
  taskBranchGlob,
  taskKey,
  toPosixRelative,
  walkAncestorsForFile,
  extractCwd,
  buildAncestralScopes,
} from "./index.ts";

describe("Common Primitives - Slug Generation & Validation (RULE-1, RULE-35)", () => {
  // @verifies RULE-1, RULE-35
  it("[RULE-1][RULE-35] should generate valid kebab-case slugs from human titles", () => {
    const rule25Tag = makeTestTag("RULE", 25);
    expect(generateSlug("Artifact Tag Resolution")).toBe(
      "artifact-tag-resolution",
    );
    expect(generateSlug(`Interface Core Decoupling (${rule25Tag})`)).toBe(
      `interface-core-decoupling-${rule25Tag.toLowerCase()}`,
    );
    expect(generateSlug("   Leading and Trailing Spaces   ")).toBe(
      "leading-and-trailing-spaces",
    );
    expect(generateSlug("Multiple---Dashes__and$$Symbols")).toBe(
      "multiple-dashes-and-symbols",
    );
  });

  // @verifies RULE-1
  it("[RULE-1] should validate strict kebab-case slugs", () => {
    expect(isValidSlug("valid-slug-123")).toBe(true);
    expect(isValidSlug("single")).toBe(true);
    expect(isValidSlug("Invalid-Slug")).toBe(false);
    expect(isValidSlug("invalid_slug")).toBe(false);
    expect(isValidSlug("-leading-dash")).toBe(false);
    expect(isValidSlug("trailing-dash-")).toBe(false);
    expect(isValidSlug("double--dash")).toBe(false);
  });

  it("should throw error on empty or non-alphanumeric input", () => {
    expect(() => generateSlug("")).toThrow();
    expect(() => generateSlug("   ")).toThrow();
    expect(() => generateSlug("!@#$%^&*()")).toThrow();
  });
});

describe("Common Primitives - Filename Formatting & Parsing (RULE-1, RULE-35, ADR-1, ADR-2)", () => {
  // @verifies RULE-1, RULE-35, ADR-1, ADR-2
  it("[RULE-1][RULE-35][ADR-1][ADR-2] should format valid filenames for all indexable subtypes", () => {
    const rule1Tag = makeTestTag("RULE", 1);
    expect(
      formatArtifactFilename({
        slug: "artifact-filename-structure",
        subtype: "RULE",
        id: 1,
      }),
    ).toBe(`artifact-filename-structure.${rule1Tag}.md`);

    const adr1Tag = makeTestTag("ADR", 1);
    expect(
      formatArtifactFilename({
        slug: "self-indexing-filenames",
        subtype: "ADR",
        id: 1,
      }),
    ).toBe(`self-indexing-filenames.${adr1Tag}.md`);

    const task12Tag = makeTestTag("TASK", 12);
    expect(
      formatArtifactFilename({
        slug: "show-artifact-by-tag",
        subtype: "TASK",
        id: "12",
      }),
    ).toBe(`show-artifact-by-tag.${task12Tag}.md`);
  });

  // @verifies RULE-1, RULE-35, ADR-1
  it("[RULE-1][RULE-35][ADR-1] should format archived artifacts with .ARCHIVED suffix", () => {
    const rule99Tag = makeTestTag("RULE", 99);
    expect(
      formatArtifactFilename({
        slug: "legacy-rule",
        subtype: "RULE",
        id: 99,
        isArchived: true,
      }),
    ).toBe(`legacy-rule.${rule99Tag}.ARCHIVED.md`);

    const adr5Tag = makeTestTag("ADR", 5);
    expect(
      formatArtifactFilename({
        slug: "superseded-adr",
        subtype: "ADR",
        id: 5,
        isArchived: true,
      }),
    ).toBe(`superseded-adr.${adr5Tag}.ARCHIVED.md`);
  });

  // @verifies RULE-1, RULE-35, ADR-1, ADR-2
  it("[RULE-1][RULE-35][ADR-1][ADR-2] should parse valid filenames across all subtypes", () => {
    const rule29Tag = makeTestTag("RULE", 29);
    const parsedRule = parseArtifactFilename(
      `src/.modie/rules/artifact-tag-resolution.${rule29Tag}.md`,
    );
    expect(parsedRule).not.toBeNull();
    expect(parsedRule?.slug).toBe("artifact-tag-resolution");
    expect(parsedRule?.subtype).toBe("RULE");
    expect(parsedRule?.id).toBe("29");
    expect(parsedRule?.tag).toBe(rule29Tag);
    expect(parsedRule?.isArchived).toBe(false);

    const adr6Tag = makeTestTag("ADR", 6);
    const parsedAdr = parseArtifactFilename(
      `src/.modie/adrs/ephemeral-task-lifecycle.${adr6Tag}.md`,
    );
    expect(parsedAdr).not.toBeNull();
    expect(parsedAdr?.subtype).toBe("ADR");
    expect(parsedAdr?.id).toBe("6");
    expect(parsedAdr?.tag).toBe(adr6Tag);
    expect(parsedAdr?.isArchived).toBe(false);

    const adr3Tag = makeTestTag("ADR", 3);
    const parsedArchived = parseArtifactFilename(
      `old-decision.${adr3Tag}.ARCHIVED.md`,
    );
    expect(parsedArchived).not.toBeNull();
    expect(parsedArchived?.isArchived).toBe(true);
    expect(parsedArchived?.tag).toBe(adr3Tag);

    const taskSubTag = makeTestTag("TASK", "2-1");
    const parsedTask = parseArtifactFilename(`task-list.${taskSubTag}.md`);
    expect(parsedTask).not.toBeNull();
    expect(parsedTask?.subtype).toBe("TASK");
    expect(parsedTask?.id).toBe("2-1");
    expect(parsedTask?.tag).toBe(taskSubTag);
  });

  it("should return null for non-artifact filenames", () => {
    expect(parseArtifactFilename("README.md")).toBeNull();
    expect(parseArtifactFilename("MOTIVE.md")).toBeNull();
    expect(parseArtifactFilename("GIST.md")).toBeNull();
    expect(parseArtifactFilename("invalid.UNKNOWN-1.md")).toBeNull();
  });

  it("should validate allowed artifact ID formats", () => {
    expect(isValidArtifactId("1")).toBe(true);
    expect(isValidArtifactId("42")).toBe(true);
    expect(isValidArtifactId("2-1")).toBe(true);
    expect(isValidArtifactId("J101")).toBe(true);
    expect(isValidArtifactId("")).toBe(false);
    expect(isValidArtifactId("   ")).toBe(false);
  });

  // @verifies RULE-35
  it("[RULE-35] should identify artifact files by subtype using isArtifactFilename", () => {
    const rule1Tag = makeTestTag("RULE", 1);
    const adr1Tag = makeTestTag("ADR", 1);
    const task1Tag = makeTestTag("TASK", 1);
    expect(isArtifactFilename(`rule-test.${rule1Tag}.md`)).toBe(true);
    expect(isArtifactFilename(`rule-test.${rule1Tag}.md`, "RULE")).toBe(true);
    expect(isArtifactFilename(`rule-test.${rule1Tag}.md`, "ADR")).toBe(false);
    expect(isArtifactFilename(`adr-test.${adr1Tag}.md`, "ADR")).toBe(true);
    expect(isArtifactFilename(`task-test.${task1Tag}.md`, "TASK")).toBe(true);
  });
});

describe("Common Primitives - Subtype Directory Resolution (RULE-8, RULE-34, ADR-10)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-common-dirs-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-8, ADR-10
  it("[RULE-8][ADR-10] should map subtypes to their recognized container directory names", () => {
    expect(getSubtypeContainerName("RULE")).toBe("rules");
    expect(getSubtypeContainerName("ADR")).toBe("adrs");
    expect(getSubtypeContainerName("TASK")).toBe("tasks");
  });

  // @verifies RULE-8, RULE-34, ADR-10
  it("[RULE-8][RULE-34][ADR-10] should resolve target container and normalized scope for RULE, ADR, and TASK", () => {
    const cwd = workspace.cwd;

    // RULE resolution
    const ruleRes = resolveArtifactDirectories(
      "RULE",
      "src/interfaces",
      cwd,
    );
    expect(ruleRes.normalizedScopeDir).toBe(
      workspace.resolve("src/interfaces"),
    );
    expect(ruleRes.targetDir).toBe(
      workspace.resolve("src/interfaces/.modie/rules"),
    );

    // ADR resolution
    const adrRes = resolveArtifactDirectories("ADR", "src", cwd);
    expect(adrRes.normalizedScopeDir).toBe(workspace.resolve("src"));
    expect(adrRes.targetDir).toBe(workspace.resolve("src/.modie/adrs"));

    // TASK resolution
    const taskRes = resolveArtifactDirectories("TASK", "src", cwd);
    expect(taskRes.normalizedScopeDir).toBe(workspace.resolve("src"));
    expect(taskRes.targetDir).toBe(workspace.resolve("src/.modie/tasks"));
  });

  // @verifies RULE-8, RULE-34, ADR-10
  it("[RULE-8][RULE-34][ADR-10] should strip container segment when scope input explicitly points to container", () => {
    const cwd = workspace.cwd;

    // .modie/<subtype> container input
    const ruleModieRes = resolveArtifactDirectories(
      "RULE",
      "src/.modie/rules",
      cwd,
    );
    expect(ruleModieRes.normalizedScopeDir).toBe(workspace.resolve("src"));
    expect(ruleModieRes.targetDir).toBe(workspace.resolve("src/.modie/rules"));

    const adrModieRes = resolveArtifactDirectories(
      "ADR",
      "src/.modie/adrs",
      cwd,
    );
    expect(adrModieRes.normalizedScopeDir).toBe(workspace.resolve("src"));
    expect(adrModieRes.targetDir).toBe(workspace.resolve("src/.modie/adrs"));

    const taskModieRes = resolveArtifactDirectories(
      "TASK",
      "src/.modie/tasks",
      cwd,
    );
    expect(taskModieRes.normalizedScopeDir).toBe(workspace.resolve("src"));
    expect(taskModieRes.targetDir).toBe(workspace.resolve("src/.modie/tasks"));

    // .modie root container input
    const rootModieRes = resolveArtifactDirectories(
      "RULE",
      "src/.modie",
      cwd,
    );
    expect(rootModieRes.normalizedScopeDir).toBe(workspace.resolve("src"));
    expect(rootModieRes.targetDir).toBe(workspace.resolve("src/.modie/rules"));
  });
});

describe("Common Primitives - Deepest Common Ancestor (RULE-6, RULE-12, RULE-34)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-common-ancestor-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-6, RULE-12, RULE-34
  it("[RULE-6][RULE-12][RULE-34] should compute deepest common ancestor from multiple paths", () => {
    const cwd = workspace.cwd;
    const ancestor = findDeepestCommonAncestor(
      ["src/interfaces/cli/bin.ts", "src/interfaces/cli/task-create.ts"],
      cwd,
    );
    expect(ancestor).toBe(workspace.resolve("src/interfaces/cli"));

    const mixedAncestor = findDeepestCommonAncestor(
      ["src/interfaces/cli/bin.ts", "src/core/task-creation.ts"],
      cwd,
    );
    expect(mixedAncestor).toBe(workspace.resolve("src"));
  });

  it("should return null for empty path arrays", () => {
    expect(findDeepestCommonAncestor([])).toBeNull();
  });
});

describe("Common Primitives - Centralized Governing Scope Resolution (RULE-8, RULE-9, RULE-12, ADR-10)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-governing-scope-");
    await workspace.mkdir(".modie");
    await workspace.mkdir("src/.modie");
    await workspace.mkdir("src/interfaces/cli/.modie");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-8, RULE-12, ADR-10
  it("[RULE-8][RULE-12][ADR-10] should resolve governing scope for artifacts and container directories", () => {
    const cwd = workspace.cwd;

    // Artifact file inside .modie/rules
    const ruleFileScope = resolveGoverningScope(
      "src/interfaces/cli/.modie/rules/rule-1.RULE-1.md",
      cwd,
    );
    expect(ruleFileScope.relativeScope).toBe("src/interfaces/cli");
    expect(ruleFileScope.scopeDir).toBe(
      workspace.resolve("src/interfaces/cli"),
    );

    // .modie container directory
    const modieDirScope = resolveGoverningScope(
      "src/.modie/rules",
      cwd,
    );
    expect(modieDirScope.relativeScope).toBe("src");
    expect(modieDirScope.scopeDir).toBe(workspace.resolve("src"));

    // .modie root container
    const rootModieScope = resolveGoverningScope(".modie", cwd);
    expect(rootModieScope.relativeScope).toBe(".");
    expect(rootModieScope.scopeDir).toBe(workspace.resolve("."));
  });

  // @verifies RULE-8, RULE-9, RULE-12
  it("[RULE-8][RULE-9][RULE-12] should resolve nearest ancestor scope for arbitrary source files and deep paths", async () => {
    const cwd = workspace.cwd;

    // Deep source file without its own .modie
    await workspace.writeFile(
      "src/interfaces/cli/commands/read/read.ts",
      "export const x = 1;",
    );
    const deepFileScope = resolveGoverningScope(
      "src/interfaces/cli/commands/read/read.ts",
      cwd,
    );
    expect(deepFileScope.relativeScope).toBe("src/interfaces/cli");
    expect(deepFileScope.scopeDir).toBe(
      workspace.resolve("src/interfaces/cli"),
    );

    // File at workspace root
    await workspace.writeFile("package.json", "{}");
    const rootFileScope = resolveGoverningScope("package.json", cwd);
    expect(rootFileScope.relativeScope).toBe(".");
    expect(rootFileScope.scopeDir).toBe(workspace.resolve("."));

    // Directory having its own .modie
    const cliDirScope = resolveGoverningScope("src/interfaces/cli", cwd);
    expect(cliDirScope.relativeScope).toBe("src/interfaces/cli");
    expect(cliDirScope.scopeDir).toBe(workspace.resolve("src/interfaces/cli"));
  });
});

describe("Common Primitives - Path Normalization & Regex Escaping", () => {
  it("should normalize relative paths to POSIX format with forward slashes", () => {
    expect(toPosixRelative("/a/b", "/a/b")).toBe(".");
    expect(toPosixRelative("/a/b", "/a/b/c/d.ts")).toBe("c/d.ts");
    expect(toPosixRelative("/a/b/c", "/a/b/d")).toBe("../d");
  });

  it("should escape regex special characters accurately", () => {
    expect(escapeRegex("TASK-12.3[beta]+foo")).toBe("TASK-12\\.3\\[beta\\]\\+foo");
    expect(escapeRegex("simple")).toBe("simple");
    expect(escapeRegex("^$*+?.()|{}[]\\")).toBe(
      "\\^\\$\\*\\+\\?\\.\\(\\)\\|\\{\\}\\[\\]\\\\",
    );
  });
});

describe("Common Primitives - String Idioms: slugToTitle, normalizeTaskId, taskKey", () => {
  it("should convert kebab-case slugs into human titles", () => {
    expect(slugToTitle("create-task-cli")).toBe("create task cli");
    expect(slugToTitle("single")).toBe("single");
    expect(slugToTitle("")).toBe("");
    expect(slugToTitle(null)).toBe("");
    expect(slugToTitle(undefined)).toBe("");
  });

  it("should normalize task IDs and strip prefixes consistently", () => {
    expect(normalizeTaskId("TASK-42")).toBe("42");
    expect(normalizeTaskId("task-2-1")).toBe("2-1");
    expect(normalizeTaskId("TASK-J101")).toBe("J101");
    expect(normalizeTaskId("42")).toBe("42");
    expect(normalizeTaskId("7-1")).toBe("7-1");
  });

  it("should produce canonical lowercase task lookup keys", () => {
    expect(taskKey("TASK-42")).toBe("42");
    expect(taskKey("TASK-J101")).toBe("j101");
    expect(taskKey("task-2-1")).toBe("2-1");
    expect(taskKey("MY-TASK-SLUG")).toBe("my-task-slug");
  });
});

describe("Common Primitives - Task Branch Grammar & Hierarchy (RULE-28, ADR-9)", () => {
  // @verifies RULE-28, ADR-9
  it("[RULE-28][ADR-9] should parse task branches into taskId and optional slug", () => {
    expect(
      parseTaskBranch("task/2-task-id-allocation-and-rule-alignment"),
    ).toEqual({
      taskId: "2",
      slug: "task-id-allocation-and-rule-alignment",
      parentId: "2",
    });

    expect(parseTaskBranch("task/2-1-subtask-test")).toEqual({
      taskId: "2-1",
      slug: "subtask-test",
      parentId: "2-1",
    });

    expect(parseTaskBranch("task/J101-prefixed-task")).toEqual({
      taskId: "J101",
      slug: "prefixed-task",
      parentId: "J101",
    });

    expect(parseTaskBranch("task/TASK-30-resolve-current-task")).toEqual({
      taskId: "30",
      slug: "resolve-current-task",
      parentId: "30",
    });

    expect(parseTaskBranch("task/42")).toEqual({
      taskId: "42",
      slug: undefined,
      parentId: "42",
    });

    expect(parseTaskBranch("dev")).toBeNull();
    expect(parseTaskBranch("main")).toBeNull();
    expect(parseTaskBranch("feature/user-auth")).toBeNull();
    expect(parseTaskBranch("")).toBeNull();
    expect(parseTaskBranch(null)).toBeNull();
    expect(parseTaskBranch(undefined)).toBeNull();
  });

  // @verifies RULE-28
  it("[RULE-28] should parse taskId directly from branch names", () => {
    expect(parseTaskIdFromBranch("task/2-setup")).toBe("2");
    expect(parseTaskIdFromBranch("task/TASK-2-setup")).toBe("2");
    expect(parseTaskIdFromBranch("task/106-1-sub")).toBe("106-1");
    expect(parseTaskIdFromBranch("task/J101-auth")).toBe("J101");
    expect(parseTaskIdFromBranch("main")).toBeNull();
  });

  // @verifies RULE-28, ADR-9
  it("[RULE-28][ADR-9] should parse subtask ID tokens into parentId and sequence", () => {
    expect(parseSubtaskId("2-1")).toEqual({ parentId: "2", sequence: "1" });
    expect(parseSubtaskId("TASK-106-2")).toEqual({
      parentId: "106",
      sequence: "2",
    });
    expect(parseSubtaskId("J101-3")).toEqual({
      parentId: "J101",
      sequence: "3",
    });
    expect(parseSubtaskId("42")).toBeNull();
    expect(parseSubtaskId("TASK-42")).toBeNull();
  });

  // @verifies RULE-28
  it("[RULE-28] should format task branch names and globs canonically", () => {
    expect(formatTaskBranch("2", "setup-task")).toBe("task/2-setup-task");
    expect(formatTaskBranch("TASK-2", "setup-task")).toBe("task/2-setup-task");
    expect(formatTaskBranch("2")).toBe("task/2");
    expect(taskBranchGlob("2")).toBe("task/2-*");
    expect(taskBranchGlob("TASK-2")).toBe("task/2-*");
    expect(taskBranchGlob()).toBe("task/*");
  });
});

describe("Common Primitives - Dynamic Version Resolution", () => {
  it("should export non-empty dynamic package version", () => {
    expect(typeof MODIE_VERSION).toBe("string");
    expect(MODIE_VERSION.length).toBeGreaterThan(0);
    expect(MODIE_VERSION).toBe("0.0.1");
  });
});

describe("Common Primitives - Scope Directory Resolution & Ancestral Walking", () => {
  it("should resolve scope directories and strip .modie containers accurately", async () => {
    await using workspace = await createFixtureWorkspace("modie-common-scope-");

    const normCwd = workspace.cwd;

    // Root
    const r1 = resolveScopeDirectory(".", normCwd);
    expect(r1.scope).toBe(".");
    expect(r1.scopeDir).toBe(normCwd);

    // Deep nested with .modie
    const r2 = resolveScopeDirectory("src/core/.modie/gists", normCwd, "GIST");
    expect(r2.scope).toBe("src/core");
    expect(r2.scopeDir).toContain("src/core");

    // Invalid outside workspace root
    expect(() =>
      resolveScopeDirectory("../outside", normCwd, "test"),
    ).toThrow();
  });

  it("should extract cwd from string, options, or fallback", () => {
    expect(extractCwd("/tmp")).toBe("/tmp");
    expect(extractCwd({ cwd: "/tmp" })).toBe("/tmp");
    expect(extractCwd()).toBe(process.cwd());
  });

  it("should walk ancestor directories from startDir to stopDir in leaf-to-root order", async () => {
    await using workspace = await createFixtureWorkspace("modie-ancestor-walk-");

    const visited: string[] = [];
    const collected = await walkAncestorsForFile(
      `${workspace.cwd}/src/core/nested`,
      workspace.cwd,
      (dir) => {
        visited.push(dir);
        return dir === workspace.cwd ? "root" : null;
      },
    );

    expect(collected).toEqual(["root"]);
    expect(visited.length).toBeGreaterThanOrEqual(3);
    expect(visited[visited.length - 1]).toBe(workspace.cwd);
  });

  it("should compute pure ancestral scope prefix path vectors without I/O", () => {
    expect(buildAncestralScopes(".")).toEqual(["."]);
    expect(buildAncestralScopes("")).toEqual(["."]);
    expect(buildAncestralScopes("src")).toEqual([".", "src"]);
    expect(buildAncestralScopes("src/core/query")).toEqual([
      ".",
      "src",
      "src/core",
      "src/core/query",
    ]);
  });
});


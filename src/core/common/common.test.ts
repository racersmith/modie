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
  findDeepestCommonAncestor,
  formatArtifactFilename,
  generateSlug,
  getSubtypeContainerName,
  isArtifactFilename,
  isValidArtifactId,
  isValidSlug,
  parseArtifactFilename,
  resolveArtifactDirectories,
  resolveGoverningScope,
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

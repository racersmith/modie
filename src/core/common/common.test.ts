/**
 * Unit tests for common artifact primitives.
 * @verifies RULE-1, RULE-6, RULE-8, RULE-12, ADR-1, ADR-2, ADR-4, ADR-10
 */

import { describe, expect, it } from "bun:test";
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
} from "./index.ts";

describe("Common Primitives - Slug Generation & Validation (RULE-1)", () => {
  // @verifies RULE-1
  it("[RULE-1] should generate valid kebab-case slugs from human titles", () => {
    expect(generateSlug("Artifact Tag Resolution")).toBe("artifact-tag-resolution");
    expect(generateSlug("Interface Core Decoupling (RULE-25)")).toBe("interface-core-decoupling-rule-25");
    expect(generateSlug("   Leading and Trailing Spaces   ")).toBe("leading-and-trailing-spaces");
    expect(generateSlug("Multiple---Dashes__and$$Symbols")).toBe("multiple-dashes-and-symbols");
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

describe("Common Primitives - Filename Formatting & Parsing (RULE-1, ADR-1, ADR-2)", () => {
  // @verifies RULE-1, ADR-1, ADR-2
  it("[RULE-1][ADR-1][ADR-2] should format valid filenames for all indexable subtypes", () => {
    expect(
      formatArtifactFilename({
        slug: "artifact-filename-structure",
        subtype: "RULE",
        id: 1,
      }),
    ).toBe("artifact-filename-structure.RULE-1.md");

    expect(
      formatArtifactFilename({
        slug: "self-indexing-filenames",
        subtype: "ADR",
        id: 1,
      }),
    ).toBe("self-indexing-filenames.ADR-1.md");

    expect(
      formatArtifactFilename({
        slug: "show-artifact-by-tag",
        subtype: "TASK",
        id: "12",
      }),
    ).toBe("show-artifact-by-tag.TASK-12.md");
  });

  // @verifies RULE-1, ADR-1
  it("[RULE-1][ADR-1] should format archived artifacts with .ARCHIVED suffix", () => {
    expect(
      formatArtifactFilename({
        slug: "legacy-rule",
        subtype: "RULE",
        id: 99,
        isArchived: true,
      }),
    ).toBe("legacy-rule.RULE-99.ARCHIVED.md");

    expect(
      formatArtifactFilename({
        slug: "superseded-adr",
        subtype: "ADR",
        id: 5,
        isArchived: true,
      }),
    ).toBe("superseded-adr.ADR-5.ARCHIVED.md");
  });

  // @verifies RULE-1, ADR-1, ADR-2
  it("[RULE-1][ADR-1][ADR-2] should parse valid filenames across all subtypes", () => {
    const parsedRule = parseArtifactFilename("src/.rules/artifact-tag-resolution.RULE-29.md");
    expect(parsedRule).not.toBeNull();
    expect(parsedRule?.slug).toBe("artifact-tag-resolution");
    expect(parsedRule?.subtype).toBe("RULE");
    expect(parsedRule?.id).toBe("29");
    expect(parsedRule?.tag).toBe("RULE-29");
    expect(parsedRule?.isArchived).toBe(false);

    const parsedAdr = parseArtifactFilename("src/.adrs/ephemeral-task-lifecycle.ADR-6.md");
    expect(parsedAdr).not.toBeNull();
    expect(parsedAdr?.subtype).toBe("ADR");
    expect(parsedAdr?.id).toBe("6");
    expect(parsedAdr?.tag).toBe("ADR-6");
    expect(parsedAdr?.isArchived).toBe(false);

    const parsedArchived = parseArtifactFilename("old-decision.ADR-3.ARCHIVED.md");
    expect(parsedArchived).not.toBeNull();
    expect(parsedArchived?.isArchived).toBe(true);
    expect(parsedArchived?.tag).toBe("ADR-3");

    const parsedTask = parseArtifactFilename("task-list.TASK-2-1.md");
    expect(parsedTask).not.toBeNull();
    expect(parsedTask?.subtype).toBe("TASK");
    expect(parsedTask?.id).toBe("2-1");
    expect(parsedTask?.tag).toBe("TASK-2-1");
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

  it("should identify artifact files by subtype using isArtifactFilename", () => {
    expect(isArtifactFilename("rule-test.RULE-1.md")).toBe(true);
    expect(isArtifactFilename("rule-test.RULE-1.md", "RULE")).toBe(true);
    expect(isArtifactFilename("rule-test.RULE-1.md", "ADR")).toBe(false);
    expect(isArtifactFilename("adr-test.ADR-1.md", "ADR")).toBe(true);
    expect(isArtifactFilename("task-test.TASK-1.md", "TASK")).toBe(true);
  });
});

describe("Common Primitives - Subtype Directory Resolution (RULE-8, ADR-10)", () => {
  // @verifies RULE-8, ADR-10
  it("[RULE-8][ADR-10] should map subtypes to their recognized container directory names", () => {
    expect(getSubtypeContainerName("RULE")).toBe("rules");
    expect(getSubtypeContainerName("ADR")).toBe("adrs");
    expect(getSubtypeContainerName("TASK")).toBe("tasks");
  });

  // @verifies RULE-8, ADR-10
  it("[RULE-8][ADR-10] should resolve target container and normalized scope for RULE, ADR, and TASK", () => {
    const cwd = "/workspace";

    // RULE resolution
    const ruleRes = resolveArtifactDirectories("RULE", "src/interfaces", true, cwd);
    expect(ruleRes.normalizedScopeDir).toBe("/workspace/src/interfaces");
    expect(ruleRes.targetDir).toBe("/workspace/src/interfaces/.modie/rules");

    // ADR resolution
    const adrRes = resolveArtifactDirectories("ADR", "src", true, cwd);
    expect(adrRes.normalizedScopeDir).toBe("/workspace/src");
    expect(adrRes.targetDir).toBe("/workspace/src/.modie/adrs");

    // TASK resolution
    const taskRes = resolveArtifactDirectories("TASK", "src", true, cwd);
    expect(taskRes.normalizedScopeDir).toBe("/workspace/src");
    expect(taskRes.targetDir).toBe("/workspace/src/.modie/tasks");

    // Flat placement (--flat / useSubtypeContainer: false)
    const flatRes = resolveArtifactDirectories("RULE", "src", false, cwd);
    expect(flatRes.normalizedScopeDir).toBe("/workspace/src");
    expect(flatRes.targetDir).toBe("/workspace/src");
  });

  // @verifies RULE-8, ADR-10
  it("[RULE-8][ADR-10] should strip container segment when scope input explicitly points to container", () => {
    const cwd = "/workspace";

    // .modie/<subtype> container input
    const ruleModieRes = resolveArtifactDirectories("RULE", "src/.modie/rules", true, cwd);
    expect(ruleModieRes.normalizedScopeDir).toBe("/workspace/src");
    expect(ruleModieRes.targetDir).toBe("/workspace/src/.modie/rules");

    const adrModieRes = resolveArtifactDirectories("ADR", "src/.modie/adrs", true, cwd);
    expect(adrModieRes.normalizedScopeDir).toBe("/workspace/src");
    expect(adrModieRes.targetDir).toBe("/workspace/src/.modie/adrs");

    const taskModieRes = resolveArtifactDirectories("TASK", "src/.modie/tasks", true, cwd);
    expect(taskModieRes.normalizedScopeDir).toBe("/workspace/src");
    expect(taskModieRes.targetDir).toBe("/workspace/src/.modie/tasks");

    // .modie root container input
    const rootModieRes = resolveArtifactDirectories("RULE", "src/.modie", true, cwd);
    expect(rootModieRes.normalizedScopeDir).toBe("/workspace/src");
    expect(rootModieRes.targetDir).toBe("/workspace/src/.modie/rules");

    // Legacy dot-container inputs (ADR-3)
    const ruleLegacyRes = resolveArtifactDirectories("RULE", "src/.rules", true, cwd);
    expect(ruleLegacyRes.normalizedScopeDir).toBe("/workspace/src");
    expect(ruleLegacyRes.targetDir).toBe("/workspace/src/.rules");

    const adrLegacyRes = resolveArtifactDirectories("ADR", "src/.adrs", true, cwd);
    expect(adrLegacyRes.normalizedScopeDir).toBe("/workspace/src");
    expect(adrLegacyRes.targetDir).toBe("/workspace/src/.adrs");

    const taskLegacyRes = resolveArtifactDirectories("TASK", "src/.tasks", true, cwd);
    expect(taskLegacyRes.normalizedScopeDir).toBe("/workspace/src");
    expect(taskLegacyRes.targetDir).toBe("/workspace/src/.tasks");
  });
});

describe("Common Primitives - Deepest Common Ancestor (RULE-6, RULE-12)", () => {
  // @verifies RULE-6, RULE-12
  it("[RULE-6][RULE-12] should compute deepest common ancestor from multiple paths", () => {
    const cwd = "/workspace";
    const ancestor = findDeepestCommonAncestor(
      ["src/interfaces/cli/bin.ts", "src/interfaces/cli/task-create.ts"],
      cwd,
    );
    expect(ancestor).toBe("/workspace/src/interfaces/cli");

    const mixedAncestor = findDeepestCommonAncestor(
      ["src/interfaces/cli/bin.ts", "src/core/task-creation.ts"],
      cwd,
    );
    expect(mixedAncestor).toBe("/workspace/src");
  });

  it("should return null for empty path arrays", () => {
    expect(findDeepestCommonAncestor([])).toBeNull();
  });
});

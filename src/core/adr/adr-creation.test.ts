/**
 * Unit tests for Core ADR Creation Service.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAdr,
  resolveAdrDirectories,
  validateAdrScope,
} from "./index.ts";

describe("ADR Creation - Scope & Directory Resolution (RULE-8)", () => {
  // @verifies RULE-8
  it("[RULE-8] should resolve target container inside normalized scope", () => {
    const { normalizedScopeDir, targetDir } = resolveAdrDirectories(
      "src/core",
      true,
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/core");
    expect(targetDir).toBe("/mock/root/src/core/.modie/adrs");
  });

  // @verifies RULE-8
  it("[RULE-8] should strip .modie/adrs container when already present in input", () => {
    const { normalizedScopeDir, targetDir } = resolveAdrDirectories(
      "src/core/.modie/adrs",
      true,
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/core");
    expect(targetDir).toBe("/mock/root/src/core/.modie/adrs");
  });

  // @verifies RULE-8
  it("[RULE-8] should strip legacy .adrs container when already present in input", () => {
    const { normalizedScopeDir, targetDir } = resolveAdrDirectories(
      "src/core/.adrs",
      true,
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/core");
    expect(targetDir).toBe("/mock/root/src/core/.adrs");
  });

  // @verifies RULE-8
  it("[RULE-8] should return flat directory when useSubtypeContainer is false", () => {
    const { normalizedScopeDir, targetDir } = resolveAdrDirectories(
      "src/core",
      false,
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/core");
    expect(targetDir).toBe("/mock/root/src/core");
  });
});

describe("ADR Creation - Frontmatter Validation & Rule Scope (RULE-14, RULE-17)", () => {
  // @verifies RULE-14
  it("[RULE-14] should reject non-ADR and non-RULE links with RULE-14 error", async () => {
    await expect(
      validateAdrScope("/mock/dir", ["TASK-10"], process.cwd()),
    ).rejects.toThrow("RULE-14");
    await expect(
      validateAdrScope("/mock/dir", ["MOTIVE-1"], process.cwd()),
    ).rejects.toThrow("RULE-14");
  });

  // @verifies RULE-17
  it("[RULE-17] should succeed when referencing a RULE in the same directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-scope-same-"));
    const ruleDir = join(tempDir, ".rules");
    await mkdir(ruleDir, { recursive: true });
    await writeFile(
      join(ruleDir, "local-invariant.RULE-201.md"),
      "Invariant claim\n",
      "utf8",
    );

    // ADR scoped in tempDir (same scope as RULE)
    await expect(
      validateAdrScope(tempDir, ["RULE-201"], tempDir),
    ).resolves.toBeUndefined();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-17
  it("[RULE-17] should succeed when referencing a RULE in a descendant subtree", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-scope-descendant-"));
    const subRuleDir = join(tempDir, "submodule", ".rules");
    await mkdir(subRuleDir, { recursive: true });
    await writeFile(
      join(subRuleDir, "sub-invariant.RULE-202.md"),
      "Sub invariant claim\n",
      "utf8",
    );

    // ADR scoped in tempDir (ancestor of submodule where RULE resides)
    await expect(
      validateAdrScope(tempDir, ["RULE-202"], tempDir),
    ).resolves.toBeUndefined();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-17
  it("[RULE-17] should reject referencing an ancestor RULE with RULE-17 error", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-scope-ancestor-"));
    const rootRuleDir = join(tempDir, ".rules");
    await mkdir(rootRuleDir, { recursive: true });
    await writeFile(
      join(rootRuleDir, "root-invariant.RULE-203.md"),
      "Root invariant claim\n",
      "utf8",
    );

    // ADR scoped in tempDir/src/nested (descendant of root where RULE resides)
    const nestedAdrScope = join(tempDir, "src", "nested");
    await mkdir(nestedAdrScope, { recursive: true });

    await expect(
      validateAdrScope(nestedAdrScope, ["RULE-203"], tempDir),
    ).rejects.toThrow("RULE-17");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-17
  it("[RULE-17] should reject referencing a sibling RULE with RULE-17 error", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-scope-sibling-"));
    const siblingRuleDir = join(tempDir, "sibling-module", ".rules");
    await mkdir(siblingRuleDir, { recursive: true });
    await writeFile(
      join(siblingRuleDir, "sibling-invariant.RULE-204.md"),
      "Sibling invariant claim\n",
      "utf8",
    );

    // ADR scoped in tempDir/target-module
    const targetAdrScope = join(tempDir, "target-module");
    await mkdir(targetAdrScope, { recursive: true });

    await expect(
      validateAdrScope(targetAdrScope, ["RULE-204"], tempDir),
    ).rejects.toThrow("RULE-17");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-14
  it("[RULE-14] should allow referencing another ADR anywhere without RULE-17 restriction", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-to-adr-"));
    const otherAdrDir = join(tempDir, "other", ".adrs");
    await mkdir(otherAdrDir, { recursive: true });
    await writeFile(
      join(otherAdrDir, "prior-decision.ADR-205.md"),
      "---\nlinks: []\n---\n# Context\nPrior decision\n",
      "utf8",
    );

    const localScope = join(tempDir, "local");
    await mkdir(localScope, { recursive: true });

    await expect(
      validateAdrScope(localScope, ["ADR-205"], tempDir),
    ).resolves.toBeUndefined();

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("ADR Creation - Execution & Disk Writing (ADR-1, ADR-2, ADR-4, RULE-1, RULE-8)", () => {
  // @verifies ADR-1, ADR-2, ADR-4, RULE-1, RULE-8
  it("[ADR-1][ADR-2][ADR-4][RULE-1][RULE-8] should create an ADR artifact on disk with sequential monotonic ID", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-create-"));

    const result = await createAdr({
      title: "First Architecture Decision",
      context: "Context description of the architecture choice.",
      alternatives: "- Alternative 1\n- Alternative 2",
      decision: "We adopt Solution A.",
      cwd: tempDir,
    });

    expect(result.id).toBe("1");
    expect(result.tag).toBe("ADR-1");
    expect(result.filename).toBe("first-architecture-decision.ADR-1.md");
    expect(result.relativePath).toContain(".modie/adrs/first-architecture-decision.ADR-1.md");

    const onDisk = await readFile(result.filepath, "utf8");
    expect(onDisk).toContain("# Context\n\nContext description of the architecture choice.");
    expect(onDisk).toContain("# Alternatives Considered\n\n- Alternative 1\n- Alternative 2");
    expect(onDisk).toContain("# Decision\n\nWe adopt Solution A.");

    // Second ADR should allocate ID 2
    const result2 = await createAdr({
      title: "Second Architecture Decision",
      context: "Another decision context.",
      cwd: tempDir,
    });

    expect(result2.id).toBe("2");
    expect(result2.tag).toBe("ADR-2");
    expect(result2.filename).toBe("second-architecture-decision.ADR-2.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-8
  it("[RULE-8] should create flat ADR file when useSubtypeContainer is false", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-adr-flat-"));

    const result = await createAdr({
      title: "Flat Decision Record",
      useSubtypeContainer: false,
      cwd: tempDir,
    });

    expect(result.relativePath).toBe("flat-decision-record.ADR-1.md");
    expect(result.filepath).toBe(join(tempDir, "flat-decision-record.ADR-1.md"));

    const onDisk = await readFile(result.filepath, "utf8");
    expect(onDisk).toContain("# Context");

    await rm(tempDir, { recursive: true, force: true });
  });

  it("should reject creation with empty title", async () => {
    await expect(
      createAdr({
        title: "   ",
      }),
    ).rejects.toThrow("ADR title must be a non-empty string.");
  });
});

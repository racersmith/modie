/**
 * Unit tests for Core Rule Creation Service.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createRule,
  resolveRuleDirectories,
  validateRuleAncestry,
} from "./rule-creation.ts";

describe("Rule Creation - Scope & Directory Resolution (RULE-8)", () => {
  // @verifies RULE-8
  it("[RULE-8] should resolve target container inside normalized scope", () => {
    const { normalizedScopeDir, targetDir } = resolveRuleDirectories(
      "src/interfaces",
      true,
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/interfaces");
    expect(targetDir).toBe("/mock/root/src/interfaces/.rules");
  });

  // @verifies RULE-8
  it("[RULE-8] should strip .rules container when already present in input", () => {
    const { normalizedScopeDir, targetDir } = resolveRuleDirectories(
      "src/interfaces/.rules",
      true,
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/interfaces");
    expect(targetDir).toBe("/mock/root/src/interfaces/.rules");
  });

  // @verifies RULE-8
  it("[RULE-8] should return flat directory when useSubtypeContainer is false", () => {
    const { normalizedScopeDir, targetDir } = resolveRuleDirectories(
      "src/interfaces",
      false,
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/interfaces");
    expect(targetDir).toBe("/mock/root/src/interfaces");
  });
});

describe("Rule Creation - Frontmatter Validation & Ancestry (RULE-13, RULE-16)", () => {
  // @verifies RULE-13
  it("[RULE-13] should reject non-ADR links with RULE-13 error", async () => {
    await expect(
      validateRuleAncestry("/mock/dir", ["RULE-1"], process.cwd()),
    ).rejects.toThrow("RULE-13");
    await expect(
      validateRuleAncestry("/mock/dir", ["TASK-10"], process.cwd()),
    ).rejects.toThrow("RULE-13");
  });

  // @verifies RULE-16
  it("[RULE-16] should succeed when referencing an ancestor ADR", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-ancestry-"));
    const adrDir = join(tempDir, ".adrs");
    await mkdir(adrDir, { recursive: true });
    await writeFile(
      join(adrDir, "system-architecture.ADR-100.md"),
      "---\nlinks: []\n---\n# Context\nSystem architecture ADR\n",
      "utf8",
    );

    // Rule scoped in a sub-package (e.g. tempDir/src/interfaces)
    const ruleScope = join(tempDir, "src", "interfaces");
    await mkdir(ruleScope, { recursive: true });

    // ADR is at tempDir (root), Rule is at tempDir/src/interfaces -> Root is ancestor of sub-package
    await expect(
      validateRuleAncestry(ruleScope, ["ADR-100"], tempDir),
    ).resolves.toBeUndefined();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-16
  it("[RULE-16] should succeed when referencing an ADR in the same directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-same-dir-"));
    const adrDir = join(tempDir, ".adrs");
    await mkdir(adrDir, { recursive: true });
    await writeFile(
      join(adrDir, "local-decision.ADR-101.md"),
      "---\nlinks: []\n---\n# Context\nLocal decision ADR\n",
      "utf8",
    );

    // Rule scoped in tempDir (same scope as ADR)
    await expect(
      validateRuleAncestry(tempDir, ["ADR-101"], tempDir),
    ).resolves.toBeUndefined();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-16
  it("[RULE-16] should reject referencing an ADR in a sibling directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-sibling-"));

    // ADR in tempDir/src/core/.adrs/
    const coreAdrDir = join(tempDir, "src", "core", ".adrs");
    await mkdir(coreAdrDir, { recursive: true });
    await writeFile(
      join(coreAdrDir, "core-decision.ADR-102.md"),
      "---\nlinks: []\n---\n# Context\nCore decision ADR\n",
      "utf8",
    );

    // Rule scoped in tempDir/src/interfaces
    const interfacesRuleScope = join(tempDir, "src", "interfaces");
    await mkdir(interfacesRuleScope, { recursive: true });

    await expect(
      validateRuleAncestry(interfacesRuleScope, ["ADR-102"], tempDir),
    ).rejects.toThrow("RULE-16");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-16
  it("[RULE-16] should reject referencing an ADR in a descendant directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-descendant-"));

    // ADR in tempDir/src/interfaces/cli/.adrs/
    const cliAdrDir = join(tempDir, "src", "interfaces", "cli", ".adrs");
    await mkdir(cliAdrDir, { recursive: true });
    await writeFile(
      join(cliAdrDir, "cli-decision.ADR-103.md"),
      "---\nlinks: []\n---\n# Context\nCLI decision ADR\n",
      "utf8",
    );

    // Rule scoped at tempDir/src/interfaces (parent of CLI)
    const interfacesRuleScope = join(tempDir, "src", "interfaces");

    await expect(
      validateRuleAncestry(interfacesRuleScope, ["ADR-103"], tempDir),
    ).rejects.toThrow("RULE-16");

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("Rule Creation - Execution & Disk Writing (RULE-1, RULE-3, RULE-8, RULE-11, RULE-13)", () => {
  // @verifies RULE-1, RULE-3, RULE-8, RULE-11
  it("[RULE-1][RULE-3][RULE-8][RULE-11] should create a rule artifact on disk with sequential monotonic ID", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-create-"));

    const result = await createRule({
      title: "First Invariant Rule",
      assertion: "All inputs must be strictly validated before parsing.",
      cwd: tempDir,
    });

    expect(result.id).toBe("1");
    expect(result.tag).toBe("RULE-1");
    expect(result.filename).toBe("first-invariant-rule.RULE-1.md");
    expect(result.relativePath).toContain(".rules/first-invariant-rule.RULE-1.md");

    const onDisk = await readFile(result.filepath, "utf8");
    expect(onDisk).toBe("All inputs must be strictly validated before parsing.\n");

    // Second rule should allocate ID 2
    const result2 = await createRule({
      title: "Second Invariant Rule",
      assertion: "All outputs must be formatted according to standard conventions.",
      cwd: tempDir,
    });

    expect(result2.id).toBe("2");
    expect(result2.tag).toBe("RULE-2");
    expect(result2.filename).toBe("second-invariant-rule.RULE-2.md");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-8
  it("[RULE-8] should create flat rule file when useSubtypeContainer is false", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-flat-"));

    const result = await createRule({
      title: "Flat Invariant Rule",
      assertion: "Flat placement rule assertion.",
      useSubtypeContainer: false,
      cwd: tempDir,
    });

    expect(result.relativePath).toBe("flat-invariant-rule.RULE-1.md");
    expect(result.filepath).toBe(join(tempDir, "flat-invariant-rule.RULE-1.md"));

    const onDisk = await readFile(result.filepath, "utf8");
    expect(onDisk).toBe("Flat placement rule assertion.\n");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-13, RULE-16
  it("[RULE-13][RULE-16] should render frontmatter with ancestor ADR links", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-rule-links-"));

    // Create ancestor ADR
    const adrDir = join(tempDir, ".adrs");
    await mkdir(adrDir, { recursive: true });
    await writeFile(
      join(adrDir, "governance.ADR-10.md"),
      "---\nlinks: []\n---\n# Context\nGovernance ADR\n",
      "utf8",
    );

    const result = await createRule({
      title: "Governed Invariant Rule",
      assertion: "All components must respect governance boundary.",
      links: ["ADR-10"],
      cwd: tempDir,
    });

    expect(result.artifact.links).toEqual(["ADR-10"]);
    const onDisk = await readFile(result.filepath, "utf8");
    expect(onDisk.startsWith("---\nlinks:\n  - ADR-10\n---")).toBe(true);
    expect(onDisk).toContain("All components must respect governance boundary.");

    await rm(tempDir, { recursive: true, force: true });
  });

  it("should reject creation with empty title", async () => {
    await expect(
      createRule({
        title: "   ",
      }),
    ).rejects.toThrow("Rule title must be a non-empty string.");
  });
});

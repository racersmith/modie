/**
 * Unit tests for artifact relocation service.
 * Complies with RULE-6, RULE-8, RULE-12, RULE-16, RULE-17, RULE-34, and RULE-35.
 * @verifies RULE-6, RULE-8, RULE-12, RULE-16, RULE-17, RULE-34, RULE-35
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../domain/index.ts";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../platform/testing/index.ts";
import { relocateArtifact } from "./relocate.ts";

describe("Artifact Relocation Pipeline Service (RULE-6, RULE-8, RULE-12, RULE-16, RULE-17, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-relocate-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-8, RULE-12, RULE-34, RULE-35
  it("[RULE-8][RULE-12][RULE-34][RULE-35] should relocate an artifact to an explicit target directory scope and scaffold MOTIVE.md", async () => {
    const ruleTag = formatArtifactTag("RULE", 701);

    await workspace.createRule({
      id: 701,
      title: "Core Domain Logic",
      scopeDir: "src",
    });

    const result = await relocateArtifact(ruleTag, "src/core", {
      cwd: workspace.cwd,
      scaffoldMotive: true,
    });

    expect(result.tag).toBe(ruleTag);
    expect(result.previousScope).toBe("src");
    expect(result.newScope).toBe("src/core");
    expect(result.scaffoldedMotive).toBe(true);

    // Verify file moved on disk
    expect(existsSync(result.previousFilepath)).toBe(false);
    expect(existsSync(result.newFilepath)).toBe(true);

    // Verify motive created in target directory
    const motivePath = join(workspace.cwd, "src/core/.modie/MOTIVE.md");
    expect(existsSync(motivePath)).toBe(true);
  });

  // @verifies RULE-8, RULE-12, RULE-34, RULE-35
  it("[RULE-8][RULE-12][RULE-34][RULE-35] should move file to new scope without mutating unrelated files", async () => {
    const ruleTag = formatArtifactTag("RULE", 702);

    await workspace.createRule({
      id: 702,
      title: "Isolated Logic",
      scopeDir: "src/isolated",
    });

    const result = await relocateArtifact(ruleTag, "src", {
      cwd: workspace.cwd,
    });

    expect(result.newScope).toBe("src");
    expect(existsSync(result.previousFilepath)).toBe(false);
    expect(existsSync(result.newFilepath)).toBe(true);
  });

  // @verifies RULE-16, RULE-34, RULE-35
  it("[RULE-16][RULE-34][RULE-35] should reject rule relocation if linked ADR does not reside at or above target scope", async () => {
    const adrTag = formatArtifactTag("ADR", 703);
    const ruleTag = formatArtifactTag("RULE", 703);

    // ADR in src/core
    await workspace.createAdr({
      id: 703,
      title: "Core Architecture Decision",
      scopeDir: "src/core",
    });

    // Rule in src/core linking to ADR
    await workspace.createRule({
      id: 703,
      title: "Core Rule",
      scopeDir: "src/core",
      links: [adrTag],
    });

    // Attempting to move rule to src/interfaces (sibling of src/core)
    expect(
      relocateArtifact(ruleTag, "src/interfaces", {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/RULE-16/);
  });

  // @verifies RULE-12, RULE-34, RULE-35
  it("[RULE-12][RULE-34][RULE-35] should automatically resolve optimal target scope when targetScope is omitted", async () => {
    const ruleTag = formatArtifactTag("RULE", 704);

    // Placed at 'src', but cited only in 'src/core/domain'
    await workspace.createRule({
      id: 704,
      title: "Domain Specific Invariant",
      scopeDir: "src",
    });

    await workspace.writeFile(
      "src/core/domain/a.ts",
      `// @verifies ${ruleTag}\nexport const a = 1;`,
    );
    await workspace.writeFile(
      "src/core/domain/b.ts",
      `// @verifies ${ruleTag}\nexport const b = 2;`,
    );
    await workspace.writeFile(
      "src/core/domain/c.ts",
      `// @verifies ${ruleTag}\nexport const c = 3;`,
    );

    const result = await relocateArtifact(ruleTag, undefined, {
      cwd: workspace.cwd,
      scaffoldMotive: false,
    });

    expect(result.previousScope).toBe("src");
    expect(result.newScope).toBe("src/core/domain");
    expect(existsSync(result.newFilepath)).toBe(true);
    expect(existsSync(result.previousFilepath)).toBe(false);
  });
});


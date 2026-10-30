/**
 * Unit tests for Core ADR Creation Service.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-1, ADR-2, ADR-4, ADR-7, RULE-1, RULE-8, RULE-14, RULE-17, RULE-23, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { getArtifactDetails, resolveArtifactByTag } from "../query/index.ts";
import { createFixtureWorkspace, makeTestTag } from "../testing/index.ts";
import { createAdr, resolveAdrDirectories, validateAdrScope } from "./index.ts";

describe("ADR Creation - Scope & Directory Resolution (RULE-8)", () => {
  // @verifies RULE-8
  it("[RULE-8] should resolve target container inside normalized scope", () => {
    const { normalizedScopeDir, targetDir } = resolveAdrDirectories(
      "src/core",
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/core");
    expect(targetDir).toBe("/mock/root/src/core/.modie/adrs");
  });

  // @verifies RULE-8
  it("[RULE-8] should strip .modie/adrs container when already present in input", () => {
    const { normalizedScopeDir, targetDir } = resolveAdrDirectories(
      "src/core/.modie/adrs",
      "/mock/root",
    );
    expect(normalizedScopeDir).toBe("/mock/root/src/core");
    expect(targetDir).toBe("/mock/root/src/core/.modie/adrs");
  });
});

describe("ADR Creation - Frontmatter Validation & Rule Scope (RULE-14, RULE-17, RULE-34)", () => {
  // @verifies RULE-14
  it("[RULE-14] should reject non-ADR and non-RULE links with RULE-14 error", async () => {
    const taskTag = makeTestTag("TASK", 10);
    const motiveTag = makeTestTag("MOTIVE", 1);

    await expect(
      validateAdrScope("/mock/dir", [taskTag], process.cwd()),
    ).rejects.toThrow("RULE-14");
    await expect(
      validateAdrScope("/mock/dir", [motiveTag], process.cwd()),
    ).rejects.toThrow("RULE-14");
  });

  // @verifies RULE-17, RULE-34
  it("[RULE-17][RULE-34] should succeed when referencing a RULE in the same directory", async () => {
    const workspace = await createFixtureWorkspace("adr-scope-same-");
    const rule = await workspace.createRule({
      id: 201,
      slug: "local-invariant",
      body: "Invariant claim\n",
    });

    // ADR scoped in workspace.cwd (same scope as RULE)
    await expect(
      validateAdrScope(workspace.cwd, [rule.tag], workspace.cwd),
    ).resolves.toBeUndefined();

    await workspace.cleanup();
  });

  // @verifies RULE-17, RULE-34
  it("[RULE-17][RULE-34] should succeed when referencing a RULE in a descendant subtree", async () => {
    const workspace = await createFixtureWorkspace("adr-scope-descendant-");
    const rule = await workspace.createRule({
      id: 202,
      slug: "sub-invariant",
      body: "Sub invariant claim\n",
      scopeDir: "submodule",
    });

    // ADR scoped in workspace.cwd (ancestor of submodule where RULE resides)
    await expect(
      validateAdrScope(workspace.cwd, [rule.tag], workspace.cwd),
    ).resolves.toBeUndefined();

    await workspace.cleanup();
  });

  // @verifies RULE-17, RULE-34
  it("[RULE-17][RULE-34] should reject referencing an ancestor RULE with RULE-17 error", async () => {
    const workspace = await createFixtureWorkspace("adr-scope-ancestor-");
    const rule = await workspace.createRule({
      id: 203,
      slug: "root-invariant",
      body: "Root invariant claim\n",
    });

    // ADR scoped in workspace.cwd/src/nested (descendant of root where RULE resides)
    const nestedAdrScope = await workspace.mkdir("src/nested");

    await expect(
      validateAdrScope(nestedAdrScope, [rule.tag], workspace.cwd),
    ).rejects.toThrow("RULE-17");

    await workspace.cleanup();
  });

  // @verifies RULE-17, RULE-34
  it("[RULE-17][RULE-34] should reject referencing a sibling RULE with RULE-17 error", async () => {
    const workspace = await createFixtureWorkspace("adr-scope-sibling-");
    const rule = await workspace.createRule({
      id: 204,
      slug: "sibling-invariant",
      body: "Sibling invariant claim\n",
      scopeDir: "sibling-module",
    });

    // ADR scoped in workspace.cwd/target-module
    const targetAdrScope = await workspace.mkdir("target-module");

    await expect(
      validateAdrScope(targetAdrScope, [rule.tag], workspace.cwd),
    ).rejects.toThrow("RULE-17");

    await workspace.cleanup();
  });

  // @verifies RULE-14, RULE-34
  it("[RULE-14][RULE-34] should allow referencing another ADR anywhere without RULE-17 restriction", async () => {
    const workspace = await createFixtureWorkspace("adr-to-adr-");
    const adr = await workspace.createAdr({
      id: 205,
      slug: "prior-decision",
      context: "Prior decision",
      scopeDir: "other",
    });

    const localScope = await workspace.mkdir("local");

    await expect(
      validateAdrScope(localScope, [adr.tag], workspace.cwd),
    ).resolves.toBeUndefined();

    await workspace.cleanup();
  });
});

describe("ADR Creation - Execution & Disk Writing (ADR-1, ADR-2, ADR-4, RULE-1, RULE-8, RULE-34)", () => {
  // @verifies ADR-1, ADR-2, ADR-4, RULE-1, RULE-8, RULE-34
  it("[ADR-1][ADR-2][ADR-4][RULE-1][RULE-8][RULE-34] should create an ADR artifact on disk with sequential monotonic ID", async () => {
    const workspace = await createFixtureWorkspace("adr-create-");

    const result = await createAdr({
      title: "First Architecture Decision",
      context: "Context description of the architecture choice.",
      alternatives: "- Alternative 1\n- Alternative 2",
      decision: "We adopt Solution A.",
      cwd: workspace.cwd,
    });

    const expectedAdr1Tag = makeTestTag("ADR", 1);
    expect(result.id).toBe("1");
    expect(result.tag).toBe(expectedAdr1Tag);
    expect(result.filename).toBe(
      `first-architecture-decision.${expectedAdr1Tag}.md`,
    );
    expect(result.relativePath).toContain(
      `.modie/adrs/first-architecture-decision.${expectedAdr1Tag}.md`,
    );

    const onDisk = await workspace.readFile(result.filepath);
    expect(onDisk).toContain(
      "# Context\n\nContext description of the architecture choice.",
    );
    expect(onDisk).toContain(
      "# Alternatives Considered\n\n- Alternative 1\n- Alternative 2",
    );
    expect(onDisk).toContain("# Decision\n\nWe adopt Solution A.");

    // Second ADR should allocate ID 2
    const result2 = await createAdr({
      title: "Second Architecture Decision",
      context: "Another decision context.",
      cwd: workspace.cwd,
    });

    const expectedAdr2Tag = makeTestTag("ADR", 2);
    expect(result2.id).toBe("2");
    expect(result2.tag).toBe(expectedAdr2Tag);
    expect(result2.filename).toBe(
      `second-architecture-decision.${expectedAdr2Tag}.md`,
    );

    await workspace.cleanup();
  });

  it("should reject creation with empty title", async () => {
    await expect(
      createAdr({
        title: "   ",
      }),
    ).rejects.toThrow("ADR title must be a non-empty string.");
  });

  // @verifies ADR-4, ADR-8, RULE-25, RULE-26, RULE-34
  it("[ADR-4][ADR-8][RULE-25][RULE-26][RULE-34] should persist summary frontmatter and support roundtrip parsing via query services", async () => {
    const workspace = await createFixtureWorkspace("adr-summary-roundtrip-");

    const result = await createAdr({
      title: "Progressive Context Disclosure",
      summary:
        "Include concise frontmatter summary on ADRs for token-efficient context compilation.",
      context: "Detailed problem statement.",
      alternatives: "- Inject full ADR markdown\n- Omit ADRs completely",
      decision: "Emit concise summary signpost in compiled context.",
      cwd: workspace.cwd,
    });

    expect(result.artifact.summary).toBe(
      "Include concise frontmatter summary on ADRs for token-efficient context compilation.",
    );

    const onDisk = await workspace.readFile(result.filepath);
    expect(onDisk).toContain(
      "summary: Include concise frontmatter summary on ADRs for token-efficient context compilation.",
    );

    const resolved = await resolveArtifactByTag(result.tag, {
      cwd: workspace.cwd,
    });
    expect(resolved.summary).toBe(
      "Include concise frontmatter summary on ADRs for token-efficient context compilation.",
    );

    const details = await getArtifactDetails(result.tag, {
      cwd: workspace.cwd,
    });
    expect(details.summary).toBe(
      "Include concise frontmatter summary on ADRs for token-efficient context compilation.",
    );

    await workspace.cleanup();
  });
});

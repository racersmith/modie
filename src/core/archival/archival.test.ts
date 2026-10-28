/**
 * Unit tests for Guarded Artifact Archival core service.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies RULE-4, RULE-25, RULE-31, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { createFixtureWorkspace, makeTestTag } from "../testing/index.ts";
import { archiveArtifact, archiveAdr, archiveRule } from "./index.ts";

describe("Core Artifact Archival - Guarded Archival & Reference Invariance (RULE-4, RULE-25, RULE-31, RULE-34)", () => {
  // @verifies RULE-4, RULE-31, RULE-34
  it("[RULE-4][RULE-31][RULE-34] should successfully archive an unreferenced ADR and rename to .ARCHIVED.md", async () => {
    const workspace = await createFixtureWorkspace("archival-adr-");

    const adr = await workspace.createAdr({
      id: 1,
      slug: "initial-architecture",
      context: "Initial context.",
    });

    const result = await archiveArtifact({
      tag: adr.tag,
      cwd: workspace.cwd,
    });

    expect(result.tag).toBe(adr.tag);
    expect(result.canArchive).toBe(true);
    expect(result.forced).toBe(false);
    expect(result.archivedFilename).toBe(
      `initial-architecture.${adr.tag}.ARCHIVED.md`,
    );
    expect(result.archivedRelativePath).toBe(
      `.modie/adrs/initial-architecture.${adr.tag}.ARCHIVED.md`,
    );

    // Check that old file is gone and new file exists
    const archivedContent = await workspace.readFile(result.archivedFilepath);
    expect(archivedContent).toContain("# Context\n\nInitial context.");

    await workspace.cleanup();
  });

  // @verifies RULE-4, RULE-31, RULE-34
  it("[RULE-4][RULE-31][RULE-34] should successfully archive an unreferenced RULE via archiveRule", async () => {
    const workspace = await createFixtureWorkspace("archival-rule-");

    const rule = await workspace.createRule({
      id: 1,
      slug: "single-purpose",
      body: "Rule description.",
    });

    const result = await archiveRule(rule.tag, { cwd: workspace.cwd });

    expect(result.tag).toBe(rule.tag);
    expect(result.archivedFilename).toBe(
      `single-purpose.${rule.tag}.ARCHIVED.md`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-31, RULE-34
  it("[RULE-31][RULE-34] should strictly reject archiving when active incoming references exist", async () => {
    const workspace = await createFixtureWorkspace("archival-reject-");

    // Target ADR
    const adr = await workspace.createAdr({
      id: 1,
      slug: "old-decision",
      context: "Old decision.",
    });

    // Active RULE referencing target ADR
    await workspace.createRule({
      id: 1,
      slug: "dependent-rule",
      links: [adr.tag],
      body: `Must follow ${adr.tag}.`,
    });

    // Archiving should throw due to active incoming reference
    expect(
      archiveArtifact({
        tag: adr.tag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("active incoming reference(s) exist");

    await workspace.cleanup();
  });

  // @verifies RULE-31, RULE-34
  it("[RULE-31][RULE-34] should bypass active references guard when --force is provided", async () => {
    const workspace = await createFixtureWorkspace("archival-force-");

    const adr = await workspace.createAdr({
      id: 1,
      slug: "old-decision",
      context: "Old decision.",
    });

    await workspace.createRule({
      id: 1,
      slug: "dependent-rule",
      links: [adr.tag],
      body: "Dependent rule.",
    });

    const result = await archiveAdr(adr.tag, {
      force: true,
      cwd: workspace.cwd,
    });

    expect(result.canArchive).toBe(false);
    expect(result.forced).toBe(true);
    expect(result.archivedFilename).toBe(`old-decision.${adr.tag}.ARCHIVED.md`);

    await workspace.cleanup();
  });

  // @verifies RULE-31, RULE-34
  it("[RULE-31][RULE-34] should reject archiving an artifact that is already archived", async () => {
    const workspace = await createFixtureWorkspace("archival-already-");

    const adr = await workspace.createAdr({
      id: 1,
      slug: "old-decision",
      isArchived: true,
      context: "Already archived.",
    });

    expect(
      archiveArtifact({
        tag: adr.tag,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("is already archived");

    await workspace.cleanup();
  });

  // @verifies RULE-31, RULE-34
  it("[RULE-31][RULE-34] should reject when subtype constraint does not match target artifact", async () => {
    const workspace = await createFixtureWorkspace(
      "archival-subtype-mismatch-",
    );

    const adr = await workspace.createAdr({
      id: 1,
      slug: "my-decision",
    });

    expect(
      archiveArtifact({
        tag: adr.tag,
        subtype: "RULE",
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow();

    await workspace.cleanup();
  });
});

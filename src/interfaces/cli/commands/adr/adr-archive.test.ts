/**
 * Integration and unit tests for `modie adr archive`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies RULE-4, RULE-25, RULE-27, RULE-31, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { captureCli, createTestWorkspace } from "../../test-utils.ts";

describe("CLI ADR Archive - Execution & Stream Separation (RULE-4, RULE-25, RULE-27, RULE-31, RULE-34)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit adr archive subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "archive",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Usage: modie adr archive <tag-or-path> [options]",
    );
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["adr", "archive"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required ADR identifier.");
  });

  // @verifies RULE-25, RULE-27, RULE-31, RULE-34
  it("[RULE-25][RULE-27][RULE-31][RULE-34] should archive an unreferenced ADR with relative path to stdout and status to stderr", async () => {
    const workspace = await createTestWorkspace("cli-adr-archive-");
    const adr = await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-1",
      slug: "single-database",
      context: "Single database.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "archive",
      adr.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".modie/adrs/single-database.ADR-TEST-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived ADR ADR-TEST-1: single-database.ADR-TEST-1.ARCHIVED.md",
    );

    const archivedContent = await readFile(
      join(workspace.cwd, stdout.trim()),
      "utf8",
    );
    expect(archivedContent).toContain("# Context\nSingle database.");

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-31, RULE-34
  it("[RULE-27][RULE-31][RULE-34] should reject archiving when active references exist", async () => {
    const workspace = await createTestWorkspace("cli-adr-reject-");

    const adr = await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-1",
      slug: "target-decision",
      context: "Target.",
    });

    await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "dependent",
      links: [adr.tag],
      body: "Dependent rule.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "archive",
      adr.tag,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      `Error: Cannot archive ${adr.tag}: 1 active incoming reference(s) exist.`,
    );
    expect(stderr).toContain(
      `Active artifact RULE-TEST-1 (links) maintains link to ${adr.tag}`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-31, RULE-34
  it("[RULE-25][RULE-27][RULE-31][RULE-34] should bypass active references guard with --force", async () => {
    const workspace = await createTestWorkspace("cli-adr-force-");

    const adr = await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-1",
      slug: "forced-decision",
      context: "Forced.",
    });

    await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "dependent",
      links: [adr.tag],
      body: "Dependent.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "archive",
      adr.tag,
      "--force",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".modie/adrs/forced-decision.ADR-TEST-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived ADR ADR-TEST-1: forced-decision.ADR-TEST-1.ARCHIVED.md (forced with active references)",
    );

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should emit machine JSON to stdout when --json is passed", async () => {
    const workspace = await createTestWorkspace("cli-adr-json-");

    const adr = await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-1",
      slug: "json-decision",
      context: "Json.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "adr",
      "archive",
      adr.tag,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Archived ADR ADR-TEST-1");

    const parsed = JSON.parse(stdout);
    expect(parsed.tag).toBe("ADR-TEST-1");
    expect(parsed.archivedFilename).toBe("json-decision.ADR-TEST-1.ARCHIVED.md");
    expect(parsed.canArchive).toBe(true);

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should execute adr archive via bin.ts subprocess", async () => {
    const workspace = await createTestWorkspace("cli-adr-subprocess-");

    const adr = await workspace.createArtifact({
      subtype: "ADR",
      id: "TEST-1",
      slug: "sub-decision",
      context: "Subprocess.",
    });

    const { stdout, stderr } = await workspace.execBin([
      "adr",
      "archive",
      adr.tag,
    ]);

    expect(stdout.trim()).toBe(".modie/adrs/sub-decision.ADR-TEST-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived ADR ADR-TEST-1: sub-decision.ADR-TEST-1.ARCHIVED.md",
    );

    await workspace.cleanup();
  });
});

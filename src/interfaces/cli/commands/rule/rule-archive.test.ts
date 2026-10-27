/**
 * Integration and unit tests for `modie rule archive`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies RULE-4, RULE-25, RULE-27, RULE-31, RULE-34
 */

import { describe, expect, it } from "bun:test";
import { captureCli, createTestWorkspace } from "../../test-utils.ts";

describe("CLI Rule Archive - Execution & Stream Separation (RULE-4, RULE-25, RULE-27, RULE-31, RULE-34)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit rule archive subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "rule",
      "archive",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Usage: modie rule archive <tag-or-path> [options]",
    );
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["rule", "archive"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required RULE identifier.");
  });

  // @verifies RULE-25, RULE-27, RULE-31, RULE-34
  it("[RULE-25][RULE-27][RULE-31][RULE-34] should archive an unreferenced RULE with relative path to stdout and status to stderr", async () => {
    const workspace = await createTestWorkspace("cli-rule-archive-");
    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "single-purpose",
      body: "Rule description.\n",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "archive",
      rule.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".modie/rules/single-purpose.RULE-TEST-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived RULE RULE-TEST-1: single-purpose.RULE-TEST-1.ARCHIVED.md",
    );

    const archivedContent = await workspace.readFile(stdout);
    expect(archivedContent).toContain("Rule description.");

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-31, RULE-34
  it("[RULE-27][RULE-31][RULE-34] should reject archiving when active references exist", async () => {
    const workspace = await createTestWorkspace("cli-rule-reject-");

    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "target-rule",
      body: "Target rule.",
    });

    await workspace.createArtifact({
      subtype: "TASK",
      id: "TEST-1",
      slug: "dependent-task",
      links: [rule.tag],
      context: "Dependent task.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "archive",
      rule.tag,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      `Error: Cannot archive ${rule.tag}: 1 active incoming reference(s) exist.`,
    );
    expect(stderr).toContain(
      `Active artifact TASK-TEST-1 (links) maintains link to ${rule.tag}`,
    );

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-31, RULE-34
  it("[RULE-25][RULE-27][RULE-31][RULE-34] should bypass active references guard with --force", async () => {
    const workspace = await createTestWorkspace("cli-rule-force-");

    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "forced-rule",
      body: "Forced rule.",
    });

    await workspace.createArtifact({
      subtype: "TASK",
      id: "TEST-1",
      slug: "dependent-task",
      links: [rule.tag],
      context: "Dependent task.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "archive",
      rule.tag,
      "--force",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".modie/rules/forced-rule.RULE-TEST-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived RULE RULE-TEST-1: forced-rule.RULE-TEST-1.ARCHIVED.md (forced with active references)",
    );

    await workspace.cleanup();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should emit machine JSON to stdout when --json is passed", async () => {
    const workspace = await createTestWorkspace("cli-rule-json-");

    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "json-rule",
      body: "Json rule.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "archive",
      rule.tag,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Archived RULE RULE-TEST-1");

    const parsed = JSON.parse(stdout);
    expect(parsed.tag).toBe("RULE-TEST-1");
    expect(parsed.archivedFilename).toBe("json-rule.RULE-TEST-1.ARCHIVED.md");
    expect(parsed.canArchive).toBe(true);

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should execute rule archive via bin.ts subprocess", async () => {
    const workspace = await createTestWorkspace("cli-rule-subprocess-");

    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "sub-rule",
      body: "Subprocess rule.",
    });

    const { stdout, stderr } = await workspace.execBin([
      "rule",
      "archive",
      rule.tag,
    ]);

    expect(stdout.trim()).toBe(".modie/rules/sub-rule.RULE-TEST-1.ARCHIVED.md");
    expect(stderr).toContain(
      "✓ Archived RULE RULE-TEST-1: sub-rule.RULE-TEST-1.ARCHIVED.md",
    );

    await workspace.cleanup();
  });
});

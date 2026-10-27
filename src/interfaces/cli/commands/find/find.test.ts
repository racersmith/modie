/**
 * Integration and unit tests for `modie find`.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createTestWorkspace,
  makeTestTag,
  type TestWorkspace,
} from "../../test-utils.ts";

describe("CLI Find - Execution & Stream Separation (RULE-25, RULE-27, RULE-29, RULE-34, RULE-35)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-find-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-27
  it("[RULE-27] should emit find help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "find",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie find");
  });

  // @verifies RULE-25, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-27][RULE-29][RULE-34] should find active RULE artifact and emit relative path to stdout", async () => {
    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "find",
      rule.tag,
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe(rule.relativePath);
  });

  // @verifies RULE-25, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-27][RULE-29][RULE-34] should emit absolute path to stdout when --absolute is passed", async () => {
    const adr = await workspace.createAdr({
      id: "TEST-1",
      slug: "self-indexing-filenames",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "find",
      adr.tag,
      "--absolute",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe(adr.filepath);
    expect(stdout.trim().startsWith("/")).toBe(true);
  });

  // @verifies RULE-25, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-27][RULE-29][RULE-34] should emit JSON payload to stdout when --json is passed", async () => {
    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "find",
      rule.tag,
      "--json",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(rule.tag);
    expect(parsed.subtype).toBe("RULE");
    expect(parsed.id).toBe(rule.id);
    expect(parsed.isArchived).toBe(false);
    expect(parsed.relativePath).toBe(rule.relativePath);
  });

  // @verifies RULE-29, RULE-34
  it("[RULE-29][RULE-34] should find archived artifact in custom directory", async () => {
    const archived = await workspace.createAdr({
      id: "TEST-99",
      slug: "legacy-decision",
      isArchived: true,
      rawContent: "---\nlinks: []\n---\n# Archived ADR\n",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "find",
      archived.tag,
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe(archived.relativePath);

    const jsonResult = await workspace.captureCli([
      "find",
      archived.tag,
      "--json",
    ]);
    expect(jsonResult.exitCode).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout.trim());
    expect(parsed.isArchived).toBe(true);
    expect(parsed.tag).toBe(archived.tag);
  });

  // @verifies RULE-27, RULE-35
  it("[RULE-27][RULE-35] should report error to stderr when artifact tag is not found", async () => {
    const missingTag = makeTestTag("RULE", "TEST-9999");
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "find",
      missingTag,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Error: Artifact "${missingTag}" was not found`);
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["find"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required artifact identifier");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "find",
      rule.tag,
      "--bogus",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--bogus"');
  });

  // @verifies RULE-25, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-27][RULE-29][RULE-34] should execute find via bin.ts subprocess", async () => {
    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
    });

    const { stdout, stderr } = await workspace.execBin(["find", rule.tag]);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe(rule.relativePath);
  });
});

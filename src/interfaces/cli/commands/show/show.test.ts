/**
 * Integration and unit tests for `modie show`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * Enforces RULE-25, RULE-26, RULE-27, RULE-29, and RULE-34 (fixture-based test isolation).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "../../test-utils.ts";

describe("CLI Show - Execution & Stream Separation (RULE-25, RULE-26, RULE-27, RULE-29, RULE-34)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-show-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-27
  it("[RULE-27] should emit show help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["show", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie show");
  });

  // @verifies RULE-25, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-27][RULE-29][RULE-34] should emit human-readable overview to stderr and empty stdout for a RULE", async () => {
    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "artifact-filename-structure",
      body: "All indexable Modie artifact filenames must conform to grammar.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli(["show", rule.tag]);
    expect(exitCode).toBe(0);
    // RULE-27: stdout must be empty for human overview mode
    expect(stdout).toBe("");
    // Stderr must have human overview
    expect(stderr).toContain(`${rule.tag}: ${rule.slug}`);
    expect(stderr).toContain("Subtype:     RULE");
    expect(stderr).toContain(`ID:          ${rule.id}`);
    expect(stderr).toContain(`Path:        ${rule.relativePath}`);
    expect(stderr).toContain("Status:      Active");
  });

  // @verifies RULE-25, RULE-26, RULE-27, RULE-34
  it("[RULE-25][RULE-26][RULE-27][RULE-34] should emit agent-optimized JSON to stdout and empty stderr when --json is passed", async () => {
    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "artifact-filename-structure",
      body: "All indexable Modie artifact filenames must conform to grammar.",
      links: ["ADR-TEST-1", "ADR-TEST-2"],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "show",
      rule.tag,
      "--json",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(rule.tag);
    expect(parsed.subtype).toBe("RULE");
    expect(parsed.id).toBe(rule.id);
    expect(parsed.slug).toBe(rule.slug);
    expect(parsed.relativePath).toBe(rule.relativePath);
    expect(parsed.isArchived).toBe(false);
    expect(parsed.links).toEqual(["ADR-TEST-1", "ADR-TEST-2"]);
    expect(parsed.body).toBeDefined();
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should emit raw unparsed markdown to stdout and empty stderr when --raw is passed", async () => {
    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "artifact-filename-structure",
      body: "All indexable Modie artifact filenames must conform to grammar.",
      links: ["ADR-TEST-1"],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "show",
      rule.tag,
      "--raw",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("links:");
    expect(stdout).toContain("All indexable Modie artifact filenames must conform to grammar.");
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should show task with dependencies, context, and criteria in stderr", async () => {
    const task = await workspace.createArtifact({
      subtype: "TASK",
      id: "TEST-701",
      slug: "sample-work",
      rawContent: `---
depends_on:
  - TASK-TEST-700
links:
  - RULE-TEST-1
---

# Context
Detailed test context for show command.

# Acceptance Criteria

- [x] First completed criteria
- [ ] Second pending criteria
`,
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli(["show", task.tag]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(`${task.tag}: sample-work`);
    expect(stderr).toContain("Depends On:  TASK-TEST-700");
    expect(stderr).toContain("Links:       RULE-TEST-1");
    expect(stderr).toContain("Context:\n  Detailed test context for show command.");
    expect(stderr).toContain("Acceptance Criteria:");
    expect(stderr).toContain("1. [x] First completed criteria");
    expect(stderr).toContain("2. [ ] Second pending criteria");

    // Also verify --json with criteria and depends_on
    const jsonResult = await workspace.captureCli(["show", task.tag, "--json"]);
    expect(jsonResult.exitCode).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout.trim());
    expect(parsed.depends_on).toEqual(["TASK-TEST-700"]);
    expect(parsed.context).toBe("Detailed test context for show command.");
    expect(parsed.acceptanceCriteria.length).toBe(2);
    expect(parsed.acceptanceCriteria[0].completed).toBe(true);
    expect(parsed.acceptanceCriteria[1].completed).toBe(false);
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when artifact is not found", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["show", "ADR-TEST-9999"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Artifact "ADR-TEST-9999" was not found');
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["show"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required artifact identifier");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "artifact-filename-structure",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "show",
      rule.tag,
      "--invalid",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--invalid"');
  });

  // @verifies RULE-25, RULE-26, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-26][RULE-27][RULE-29][RULE-34] should execute show via bin.ts subprocess", async () => {
    const rule = await workspace.createArtifact({
      subtype: "RULE",
      id: "TEST-1",
      slug: "artifact-filename-structure",
    });

    const { stdout, stderr } = await workspace.execBin([
      "show",
      rule.tag,
      "--json",
    ]);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(rule.tag);
    expect(parsed.subtype).toBe("RULE");
  });
});


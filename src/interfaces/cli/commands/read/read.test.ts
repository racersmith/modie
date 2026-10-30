/**
 * Integration and unit tests for `modie read` and equivalence with `modie show`.
 * Validates TASK-50, RULE-25, RULE-26, RULE-27, RULE-29, RULE-34, and RULE-35.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createTestWorkspace,
  makeTestTag,
  type TestWorkspace,
} from "../../test-utils.ts";

describe("CLI Read - Execution & Stream Separation (RULE-25, RULE-26, RULE-27, RULE-29, RULE-34, RULE-35)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-read-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-27
  it("[RULE-27] should emit read help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "read",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie read");
  });

  // @verifies RULE-25, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-27][RULE-29][RULE-34] should emit human-readable overview with scope to stderr and empty stdout for a RULE", async () => {
    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
      body: "All indexable Modie artifact filenames must conform to grammar.",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "read",
      rule.tag,
    ]);
    expect(exitCode).toBe(0);
    // RULE-27: stdout must be empty for human overview mode
    expect(stdout).toBe("");
    // Stderr must have human overview
    expect(stderr).toContain(`${rule.tag}: ${rule.slug}`);
    expect(stderr).toContain("Subtype:     RULE");
    expect(stderr).toContain(`ID:          ${rule.id}`);
    expect(stderr).toContain(`Path:        ${rule.relativePath}`);
    expect(stderr).toContain("Scope:       .");
    expect(stderr).toContain("Status:      Active");
  });

  // @verifies RULE-25, RULE-26, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-26][RULE-27][RULE-34][RULE-35] should emit agent-optimized JSON to stdout and empty stderr when --json is passed", async () => {
    const linkAdr1 = makeTestTag("ADR", "TEST-1");
    const linkAdr2 = makeTestTag("ADR", "TEST-2");

    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
      body: "All indexable Modie artifact filenames must conform to grammar.",
      links: [linkAdr1, linkAdr2],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "read",
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
    expect(parsed.scope).toBe(".");
    expect(parsed.isArchived).toBe(false);
    expect(parsed.links).toEqual([linkAdr1, linkAdr2]);
    expect(parsed.body).toBeDefined();
  });

  // @verifies RULE-27, RULE-34, RULE-35
  it("[RULE-27][RULE-34][RULE-35] should emit raw unparsed markdown to stdout and empty stderr when --raw is passed", async () => {
    const linkAdr1 = makeTestTag("ADR", "TEST-1");
    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
      body: "All indexable Modie artifact filenames must conform to grammar.",
      links: [linkAdr1],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "read",
      rule.tag,
      "--raw",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("links:");
    expect(stdout).toContain(
      "All indexable Modie artifact filenames must conform to grammar.",
    );
  });

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should read task with dependencies, context, criteria, and scope", async () => {
    const taskDep = makeTestTag("TASK", "TEST-700");
    const taskLink = makeTestTag("RULE", "TEST-1");

    const task = await workspace.createTask({
      id: "TEST-701",
      slug: "sample-work",
      rawContent: `---
depends_on:
  - ${taskDep}
links:
  - ${taskLink}
---

# Context
Detailed test context for read command.

# Acceptance Criteria

- [x] First completed criteria
- [ ] Second pending criteria
`,
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "read",
      task.tag,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(`${task.tag}: sample-work`);
    expect(stderr).toContain(`Scope:       .`);
    expect(stderr).toContain(`Depends On:  ${taskDep}`);
    expect(stderr).toContain(`Links:       ${taskLink}`);
    expect(stderr).toContain(
      "Context:\n  Detailed test context for read command.",
    );
    expect(stderr).toContain("Acceptance Criteria:");
    expect(stderr).toContain("1. [x] First completed criteria");
    expect(stderr).toContain("2. [ ] Second pending criteria");

    // Also verify --json with criteria and depends_on
    const jsonResult = await workspace.captureCli(["read", task.tag, "--json"]);
    expect(jsonResult.exitCode).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout.trim());
    expect(parsed.depends_on).toEqual([taskDep]);
    expect(parsed.scope).toBe(".");
    expect(parsed.context).toBe("Detailed test context for read command.");
    expect(parsed.acceptanceCriteria.length).toBe(2);
    expect(parsed.acceptanceCriteria[0].completed).toBe(true);
    expect(parsed.acceptanceCriteria[1].completed).toBe(false);
  });

  // @verifies RULE-8, RULE-12, RULE-25, RULE-27, RULE-34
  it("[RULE-8][RULE-12][RULE-25][RULE-27][RULE-34] should resolve governing codebase scope for scoped artifacts", async () => {
    const scopedRule = await workspace.createRule({
      id: "TEST-SCOPE-1",
      slug: "scoped-rule",
      scopeDir: "src/interfaces/cli",
      body: "Scoped rule content",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "read",
      scopedRule.tag,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Scope:       src/interfaces/cli");

    const jsonResult = await workspace.captureCli([
      "read",
      scopedRule.tag,
      "--json",
    ]);
    expect(jsonResult.exitCode).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout.trim());
    expect(parsed.scope).toBe("src/interfaces/cli");
  });

  // @verifies RULE-27, RULE-35
  it("[RULE-27][RULE-35] should report error to stderr when artifact is not found", async () => {
    const missingTag = makeTestTag("ADR", "TEST-9999");
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "read",
      missingTag,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Error: Artifact "${missingTag}" was not found`);
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli(["read"]);
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
      "read",
      rule.tag,
      "--invalid",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--invalid"');
  });

  // @verifies RULE-25, RULE-26, RULE-27, RULE-29, RULE-34
  it("[RULE-25][RULE-26][RULE-27][RULE-29][RULE-34] should execute read via bin.ts subprocess", async () => {
    const rule = await workspace.createRule({
      id: "TEST-1",
      slug: "artifact-filename-structure",
    });

    const { stdout, stderr } = await workspace.execBin([
      "read",
      rule.tag,
      "--json",
    ]);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(rule.tag);
    expect(parsed.subtype).toBe("RULE");
    expect(parsed.scope).toBe(".");
  });
});

describe("Purged Show Command (TASK-50)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-purged-show-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("should reject show as an unknown command", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "show",
      "RULE-1",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown command "show"');
  });
});

/**
 * Integration and unit tests for `modie show`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { captureCli } from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI Show - Execution & Stream Separation (RULE-25, RULE-26, RULE-27, RULE-29)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit show help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["show", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie show");
  });

  // @verifies RULE-25, RULE-27, RULE-29
  it("[RULE-25][RULE-27][RULE-29] should emit human-readable overview to stderr and empty stdout for a RULE", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["show", "RULE-1"]);
    expect(exitCode).toBe(0);
    // RULE-27: stdout must be empty for human overview mode
    expect(stdout).toBe("");
    // Stderr must have human overview
    expect(stderr).toContain("RULE-1: artifact-filename-structure");
    expect(stderr).toContain("Subtype:     RULE");
    expect(stderr).toContain("ID:          1");
    expect(stderr).toContain("Path:        src/.modie/rules/artifact-filename-structure.RULE-1.md");
    expect(stderr).toContain("Status:      Active");
  });

  // @verifies RULE-25, RULE-26, RULE-27
  it("[RULE-25][RULE-26][RULE-27] should emit agent-optimized JSON to stdout and empty stderr when --json is passed", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "show",
      "RULE-1",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("RULE-1");
    expect(parsed.subtype).toBe("RULE");
    expect(parsed.id).toBe("1");
    expect(parsed.slug).toBe("artifact-filename-structure");
    expect(parsed.relativePath).toBe(
      "src/.modie/rules/artifact-filename-structure.RULE-1.md",
    );
    expect(parsed.isArchived).toBe(false);
    expect(Array.isArray(parsed.links)).toBe(true);
    expect(parsed.body).toBeDefined();
  });

  // @verifies RULE-27
  it("[RULE-27] should emit raw unparsed markdown to stdout and empty stderr when --raw is passed", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "show",
      "RULE-1",
      "--raw",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("links:");
    expect(stdout).toContain("tokenized grammar");
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should show task with dependencies, context, and criteria in stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-show-task-"));
    const taskPath = join(tempDir, "sample-work.TASK-701.md");
    await writeFile(
      taskPath,
      `---
depends_on:
  - TASK-700
links:
  - RULE-1
---

# Context
Detailed test context for show command.

# Acceptance Criteria

- [x] First completed criteria
- [ ] Second pending criteria
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["show", "TASK-701"],
      tempDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("TASK-701: sample-work");
    expect(stderr).toContain("Depends On:  TASK-700");
    expect(stderr).toContain("Links:       RULE-1");
    expect(stderr).toContain("Context:\n  Detailed test context for show command.");
    expect(stderr).toContain("Acceptance Criteria:");
    expect(stderr).toContain("1. [x] First completed criteria");
    expect(stderr).toContain("2. [ ] Second pending criteria");

    // Also verify --json with criteria and depends_on
    const jsonResult = await captureCli(
      ["show", "TASK-701", "--json"],
      tempDir,
    );
    expect(jsonResult.exitCode).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout.trim());
    expect(parsed.depends_on).toEqual(["TASK-700"]);
    expect(parsed.context).toBe("Detailed test context for show command.");
    expect(parsed.acceptanceCriteria.length).toBe(2);
    expect(parsed.acceptanceCriteria[0].completed).toBe(true);
    expect(parsed.acceptanceCriteria[1].completed).toBe(false);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when artifact is not found", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["show", "ADR-9999"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Artifact "ADR-9999" was not found');
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["show"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required artifact identifier");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "show",
      "RULE-1",
      "--invalid",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--invalid"');
  });

  // @verifies RULE-25, RULE-26, RULE-27, RULE-29
  it("[RULE-25][RULE-26][RULE-27][RULE-29] should execute show via bin.ts subprocess", async () => {
    const binPath = "./src/interfaces/cli/bin.ts";
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      binPath,
      "show",
      "RULE-1",
      "--json",
    ]);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("RULE-1");
    expect(parsed.subtype).toBe("RULE");
  });
});

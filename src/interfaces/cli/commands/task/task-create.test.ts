/**
 * Integration and unit tests for `modie task create`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import { captureCli } from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI Task Creation - Execution & Stream Separation (RULE-25, RULE-27)", () => {
  // @verifies RULE-1, RULE-25, RULE-27, ADR-1, ADR-6, ADR-9
  it("[RULE-1][RULE-25][RULE-27][ADR-1][ADR-6][ADR-9] should create a task with machine path to stdout and status to stderr", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "create",
      "CLI Stream Verification Task",
      "--scope",
      "src/interfaces/cli",
      "--context",
      "Verifying CLI stream output separation",
      "--depends-on",
      "TASK-1",
      "--links",
      "ADR-1,RULE-27",
      "--criteria",
      "Verify stdout path,Verify stderr log",
      "--branch",
      "dev",
    ]);

    expect(exitCode).toBe(0);

    // RULE-27: stdout must strictly contain the machine-parsable relative file path
    expect(stdout).toContain(".modie/tasks/cli-stream-verification-task.TASK-");
    expect(stdout).not.toContain("✓");

    // RULE-27: stderr must strictly contain human status and diagnostics
    expect(stderr).toContain("✓ Created task");

    // Clean up created file
    await rm(stdout.trim(), { force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "create",
      "JSON Output Mode Task",
      "--scope",
      "src/interfaces/cli",
      "--branch",
      "dev",
      "--json",
    ]);

    expect(exitCode).toBe(0);

    // RULE-27: stdout must be valid parseable JSON
    const parsed = JSON.parse(stdout);
    expect(parsed.slug).toBe("json-output-mode-task");
    expect(parsed.filename).toContain("json-output-mode-task.TASK-");
    expect(parsed.relativePath).toContain(".modie/tasks");

    // Status diagnostics emitted to stderr
    expect(stderr).toContain("✓ Created task");

    // Clean up created file
    await rm(parsed.filepath, { force: true });
  });

  // @verifies ADR-9
  it("[ADR-9] should support prefix tag via --prefix flag", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "create",
      "Prefixed CLI Task",
      "--scope",
      "src/interfaces/cli",
      "--prefix",
      "C",
      "--branch",
      "feature/new-command",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.id).toBe("C1");
    expect(parsed.filename).toBe("prefixed-cli-task.TASK-C1.md");

    await rm(parsed.filepath, { force: true });
  });
});

describe("CLI Task Creation - Validation & Errors (RULE-15, RULE-18, RULE-27)", () => {
  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when title is omitted", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["task", "create"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required task title");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flags", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "create",
      "Some Title",
      "--unknown-flag",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--unknown-flag"');
  });

  // @verifies RULE-15, RULE-27
  it("[RULE-15][RULE-27] should report domain link validation error to stderr with exit code 1", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "create",
      "Invalid Links Test",
      "--links",
      "TASK-1", // Illegal per RULE-15
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Invalid task link target");
    expect(stderr).toContain("RULE-15");
  });
});

describe("CLI Task Creation - Repeated Flags & Punctuation Support", () => {
  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should preserve criteria with punctuation verbatim when using -a or --criterion", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "create",
      "Verbatim Criteria Test",
      "--scope",
      "src/interfaces/cli",
      "--branch",
      "dev",
      "-a",
      "Export checkTaskItem from index.ts, including all types",
      "--criterion",
      "Ensure stdout and stderr separation, per RULE-27",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.acceptanceCriteria.length).toBe(2);
    expect(parsed.acceptanceCriteria[0].text).toBe(
      "Export checkTaskItem from index.ts, including all types",
    );
    expect(parsed.acceptanceCriteria[1].text).toBe(
      "Ensure stdout and stderr separation, per RULE-27",
    );

    await rm(parsed.filepath, { force: true });
  });

  // @verifies RULE-15, RULE-25
  it("[RULE-15][RULE-25] should support repeated -l / --link flags without comma splitting", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "create",
      "Repeated Links Test",
      "--scope",
      "src/interfaces/cli",
      "--branch",
      "dev",
      "--link",
      "ADR-6",
      "-l",
      "RULE-25",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual(["ADR-6", "RULE-25"]);

    await rm(parsed.filepath, { force: true });
  });
});

describe("CLI Task Creation - Subprocess Execution", () => {
  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute bin.ts as a child process and return valid output", async () => {
    const binPath = "./src/interfaces/cli/bin.ts";
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "create",
      "Subprocess Verification Task",
      "--scope",
      "src/interfaces/cli",
      "--branch",
      "dev",
      "--json",
    ]);

    expect(stderr).toContain("✓ Created task");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.slug).toBe("subprocess-verification-task");
    expect(parsed.filename).toContain("subprocess-verification-task.TASK-");

    await rm(parsed.filepath, { force: true });
  });
});

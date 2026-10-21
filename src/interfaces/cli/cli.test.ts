/**
 * Integration and unit tests for the Modie CLI.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { runCli } from "./cli.ts";
import type { CliIoOptions } from "./types.ts";

const execFileAsync = promisify(execFile);

/**
 * Helper to capture stdout, stderr, and exitCode from in-process CLI execution.
 */
async function captureCli(
  args: string[],
  cwd: string = process.cwd(),
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";

  const io: CliIoOptions = {
    stdout: (msg) => {
      stdout += (stdout ? "\n" : "") + msg;
    },
    stderr: (msg) => {
      stderr += (stderr ? "\n" : "") + msg;
    },
    cwd,
  };

  const exitCode = await runCli(args, io);
  return { exitCode, stdout, stderr };
}

describe("CLI Harness - Global Commands & Stream Separation (RULE-27)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit global help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("modie <command>");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit version to stdout with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("0.1.0");
    expect(stderr).toBe("");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit error to stderr on unknown command with non-zero exit code", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["unknown-command"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown command "unknown-command"');
  });

  // @verifies RULE-27
  it("[RULE-27] should emit task subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["task", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie task <subcommand>");
  });
});

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
    expect(stdout).toContain(".tasks/cli-stream-verification-task.TASK-");
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
    expect(parsed.relativePath).toContain(".tasks");

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

describe("CLI Task Check - Execution & Stream Separation (RULE-22, RULE-25, RULE-27)", () => {
  // @verifies RULE-22, RULE-25, RULE-27
  it("[RULE-22][RULE-25][RULE-27] should check off an item, emit file path to stdout and status to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-check-"));
    const taskPath = join(tempDir, "cli-check-test.TASK-200.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-22
---

# Context
Test task for CLI check.

# Acceptance Criteria

- [ ] First item to check
- [ ] Second item to check
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "check", taskPath, "--item", "1"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    // Machine payload to stdout
    expect(stdout.trim()).toBe(taskPath);
    // Diagnostics to stderr
    expect(stderr).toContain("✓ Checked item 1 on TASK-200");
    expect(stderr).toContain("(1/2 complete)");

    const updated = await readFile(taskPath, "utf8");
    expect(updated).toContain("- [x] First item to check");
    expect(updated).toContain("- [ ] Second item to check");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-22, RULE-27
  it("[RULE-22][RULE-27] should emit machine JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-check-json-"));
    const taskPath = join(tempDir, "cli-json.TASK-201.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
JSON check test.

# Acceptance Criteria

- [ ] JSON item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "check", taskPath, "--item", "1", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.taskId).toBe("201");
    expect(parsed.itemIndex).toBe(1);
    expect(parsed.completed).toBe(true);
    expect(parsed.allCompleted).toBe(true);

    expect(stderr).toContain("✓ Checked item 1");
    expect(stderr).toContain(
      "✓ All acceptance criteria for TASK-201 are satisfied!",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-22, RULE-27
  it("[RULE-22][RULE-27] should support unchecking an item with -u / --uncheck", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-uncheck-"));
    const taskPath = join(tempDir, "cli-uncheck.TASK-202.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Uncheck test.

# Acceptance Criteria

- [x] Already checked item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "check", taskPath, "--item", "1", "--uncheck"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("○ Unchecked item 1 on TASK-202");

    const updated = await readFile(taskPath, "utf8");
    expect(updated).toContain("- [ ] Already checked item");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when --item flag is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      "TASK-7-2",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required --item flag");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when task identifier is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "task",
      "check",
      "--item",
      "1",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required task identifier");
  });
});

describe("CLI Task Complete - Execution & Stream Separation (RULE-21, RULE-22, RULE-25, RULE-27)", () => {
  // @verifies RULE-21, RULE-22, RULE-27
  it("[RULE-21][RULE-22][RULE-27] should reject completion with error to stderr when criteria are incomplete", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-complete-err-"));
    const taskPath = join(tempDir, "incomplete-task.TASK-300.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-21
  - RULE-22
---

# Context
Incomplete task.

# Acceptance Criteria

- [ ] Pending deliverable
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "Error: Cannot complete task 300: 1 acceptance criteria remain unchecked",
    );

    // File must NOT be deleted
    const content = await readFile(taskPath, "utf8");
    expect(content).toBeDefined();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-21, RULE-22, RULE-25, RULE-27
  it("[RULE-21][RULE-22][RULE-25][RULE-27] should complete task and delete file when all criteria are satisfied", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-complete-ok-"));
    const taskPath = join(tempDir, "complete-task.TASK-301.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-21
  - RULE-22
---

# Context
Satisfied task.

# Acceptance Criteria

- [x] Completed deliverable
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath],
      tempDir,
    );

    expect(exitCode).toBe(0);
    // Machine payload to stdout
    expect(stdout.trim()).toBe(taskPath);
    // Human status to stderr
    expect(stderr).toContain(
      "✓ Completed task TASK-301: complete-task.TASK-301.md (artifact deleted per RULE-21)",
    );

    // File MUST be deleted per RULE-21
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-21, RULE-27
  it("[RULE-21][RULE-27] should support --force to bypass incomplete criteria", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-force-"));
    const taskPath = join(tempDir, "force-task.TASK-302.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Forced task.

# Acceptance Criteria

- [ ] Incomplete item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath, "--force"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Completed task TASK-302");
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-21, RULE-27
  it("[RULE-21][RULE-27] should support --keep-file to retain artifact on disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-keep-"));
    const taskPath = join(tempDir, "keep-task.TASK-303.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Retain test.

# Acceptance Criteria

- [x] Checked item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath, "--keep-file"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("(artifact retained)");

    const content = await readFile(taskPath, "utf8");
    expect(content).toContain("- [x] Checked item");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-complete-json-"));
    const taskPath = join(tempDir, "json-complete.TASK-304.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
JSON complete test.

# Acceptance Criteria

- [x] Item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "complete", taskPath, "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.taskId).toBe("304");
    expect(parsed.deleted).toBe(true);
    expect(parsed.criteriaCompleted).toBe(1);

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("CLI Executable Subprocess - End-to-End via bin.ts", () => {
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

  // @verifies RULE-21, RULE-22, RULE-25, RULE-27
  it("[RULE-21][RULE-22][RULE-25][RULE-27] should execute full check and complete lifecycle via bin.ts subprocess", async () => {
    const binPath = "./src/interfaces/cli/bin.ts";

    // 1. Create a task with two criteria
    const createResult = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "create",
      "Subprocess Lifecycle Task",
      "--scope",
      "src/interfaces/cli",
      "--branch",
      "dev",
      "-a",
      "Step one",
      "-a",
      "Step two",
      "--json",
    ]);
    const created = JSON.parse(createResult.stdout.trim());
    const taskPath = created.filepath;

    // 2. Check item 1
    const check1 = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "check",
      taskPath,
      "--item",
      "1",
    ]);
    expect(check1.stderr).toContain("✓ Checked item 1");
    expect(check1.stdout.trim()).toBe(taskPath);

    // 3. Attempt to complete (should fail because item 2 is incomplete)
    try {
      await execFileAsync(process.execPath, [
        binPath,
        "task",
        "complete",
        taskPath,
      ]);
      expect(true).toBe(false); // should not reach here
    } catch (err: any) {
      expect(err.stderr).toContain("1 acceptance criteria remain unchecked");
    }

    // 4. Check item 2
    const check2 = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "check",
      taskPath,
      "--item",
      "2",
    ]);
    expect(check2.stderr).toContain("✓ All acceptance criteria");

    // 5. Complete task
    const completeResult = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "complete",
      taskPath,
    ]);
    expect(completeResult.stderr).toContain("✓ Completed task");
    expect(completeResult.stderr).toContain("artifact deleted per RULE-21");

    // Verify deletion
    await expect(readFile(taskPath, "utf8")).rejects.toThrow();
  });
});

describe("CLI Task List - Execution & Stream Separation (ADR-6, RULE-18, RULE-25, RULE-27)", () => {
  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should emit human-readable table to stderr and empty stdout with exit code 0", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-list-"));
    const taskPath = join(tempDir, "sample-task.TASK-501.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Acceptance Criteria
- [ ] Sample criterion
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "list"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    // RULE-27: stdout must be empty in human-readable mode
    expect(stdout).toBe("");
    // RULE-27: stderr must contain the human table
    expect(stderr).toContain("Active Task Queue");
    expect(stderr).toContain("TASK-501");
    expect(stderr).toContain("READY");
    expect(stderr).toContain("0/1");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should emit machine-parsable JSON array to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-list-json-"));
    const taskPath = join(tempDir, "sample-task.TASK-502.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
---

# Acceptance Criteria
- [ ] Item one
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "list", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("502");
    expect(parsed[0].fullTaskId).toBe("TASK-502");
    expect(parsed[0].readiness).toBe("READY");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies ADR-6, RULE-18, RULE-27
  it("[ADR-6][RULE-18][RULE-27] should support --ready and --blocked filters", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-list-filter-"));
    const taskA = join(tempDir, "ready-task.TASK-503.md");
    const taskB = join(tempDir, "blocked-task.TASK-504.md");

    await writeFile(
      taskA,
      `---\ndepends_on: []\nlinks: []\n---\n# Acceptance Criteria\n- [ ] A\n`,
      "utf8",
    );
    await writeFile(
      taskB,
      `---\ndepends_on:\n  - TASK-503\nlinks: []\n---\n# Acceptance Criteria\n- [ ] B\n`,
      "utf8",
    );

    // Test --ready
    const readyResult = await captureCli(
      ["task", "list", "--ready", "--json"],
      tempDir,
    );
    expect(readyResult.exitCode).toBe(0);
    const readyTasks = JSON.parse(readyResult.stdout.trim());
    expect(readyTasks.length).toBe(1);
    expect(readyTasks[0].id).toBe("503");

    // Test --blocked
    const blockedResult = await captureCli(
      ["task", "list", "--blocked", "--json"],
      tempDir,
    );
    expect(blockedResult.exitCode).toBe(0);
    const blockedTasks = JSON.parse(blockedResult.stdout.trim());
    expect(blockedTasks.length).toBe(1);
    expect(blockedTasks[0].id).toBe("504");
    expect(blockedTasks[0].blockedBy).toEqual(["TASK-503"]);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report notice to stderr when active queue is empty", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-empty-"));
    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "list"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Active task queue is empty");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should support task ls alias", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-ls-"));
    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "ls", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("[]");

    await rm(tempDir, { recursive: true, force: true });
  });
});

describe("CLI Task Status - Deep Inspection & Stream Separation (RULE-22, RULE-25, RULE-27)", () => {
  // @verifies RULE-22, RULE-25, RULE-27
  it("[RULE-22][RULE-25][RULE-27] should emit detailed human inspection to stderr and exit code 0", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-status-"));
    const taskPath = join(tempDir, "status-task.TASK-601.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links:
  - ADR-6
  - RULE-22
---

# Context
Inspection test description.

# Acceptance Criteria
- [x] Done item
- [ ] Pending item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "status", "TASK-601"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("TASK-601");
    expect(stderr).toContain("Status:      READY");
    expect(stderr).toContain("Progress:    1/2 criteria satisfied");
    expect(stderr).toContain("1. [x] Done item");
    expect(stderr).toContain("2. [ ] Pending item");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine JSON to stdout when --json is passed to status", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-status-json-"));
    const taskPath = join(tempDir, "json-status.TASK-602.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Acceptance Criteria
- [ ] Only item
`,
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "status", "TASK-602", "--json"],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe("602");
    expect(parsed.readiness).toBe("READY");
    expect(parsed.criteriaTotal).toBe(1);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when status targets non-existent task", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-status-err-"));
    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "status", "TASK-9999"],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Task \"TASK-9999\" was not found");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute task list via bin.ts subprocess", async () => {
    const binPath = "./src/interfaces/cli/bin.ts";
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      binPath,
      "task",
      "list",
      "--json",
    ]);

    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    // TASK-9 is active in repo
    const task9 = parsed.find((t: any) => t.id === "9");
    expect(task9).toBeDefined();
    expect(task9.readiness).toBe("READY");
  });
});

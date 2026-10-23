/**
 * Integration and unit tests for `modie task list` and `modie task status`.
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
    if (parsed.length > 0) {
      expect(parsed[0].id).toBeDefined();
      expect(parsed[0].readiness).toBeDefined();
    }
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

  // @verifies ADR-6, RULE-25, RULE-27, RULE-28
  it("[ADR-6][RULE-25][RULE-27][RULE-28] should resolve current task on task branch for bare task status and --current", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-status-branch-"));

    // Initialize git repo in tempDir
    await Bun.$`git init -b dev`.cwd(tempDir).quiet();
    await Bun.$`git config user.email "test@example.com"`.cwd(tempDir).quiet();
    await Bun.$`git config user.name "Tester"`.cwd(tempDir).quiet();
    await writeFile(join(tempDir, "README.md"), "# Init", "utf8");
    await Bun.$`git add . && git commit -m "init"`.cwd(tempDir).quiet();

    // Create task file
    const taskPath = join(tempDir, "active-feature.TASK-701.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Active feature context.

# Acceptance Criteria
- [x] First item
- [ ] Second item
`,
      "utf8",
    );
    await Bun.$`git add . && git commit -m "add task"`.cwd(tempDir).quiet();

    // 1. On non-task branch (dev): bare status returns queue table, --current throws
    const nonTaskStatus = await captureCli(["task", "status", "--json"], tempDir);
    expect(nonTaskStatus.exitCode).toBe(0);
    const queue = JSON.parse(nonTaskStatus.stdout.trim());
    expect(Array.isArray(queue)).toBe(true);
    expect(queue.length).toBe(1);
    expect(queue[0].isCurrent).toBe(false);

    const nonTaskCurrent = await captureCli(["task", "status", "--current"], tempDir);
    expect(nonTaskCurrent.exitCode).toBe(1);
    expect(nonTaskCurrent.stderr).toContain("Not on a task branch");

    // 2. Checkout task branch: task/701-active-feature
    await Bun.$`git checkout -b task/701-active-feature`.cwd(tempDir).quiet();

    // Bare `task status` should now automatically resolve TASK-701
    const branchStatus = await captureCli(["task", "status"], tempDir);
    expect(branchStatus.exitCode).toBe(0);
    expect(branchStatus.stderr).toContain("TASK-701: active-feature");
    expect(branchStatus.stderr).toContain("Progress:    1/2 criteria satisfied");
    expect(branchStatus.stderr).toContain("1. [x] First item");
    expect(branchStatus.stderr).toContain("2. [ ] Second item");

    // `task status --current` should also return TASK-701
    const currentStatus = await captureCli(["task", "status", "-c", "--json"], tempDir);
    expect(currentStatus.exitCode).toBe(0);
    const parsedCurrent = JSON.parse(currentStatus.stdout.trim());
    expect(parsedCurrent.id).toBe("701");
    expect(parsedCurrent.fullTaskId).toBe("TASK-701");
    expect(parsedCurrent.isCurrent).toBe(true);

    // `task list` should display CURRENT in STATUS column
    const listResult = await captureCli(["task", "list"], tempDir);
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stderr).toContain("CURRENT");
    expect(listResult.stderr).toContain("TASK-701");

    // `task list --json` should have isCurrent: true
    const listJson = await captureCli(["task", "list", "--json"], tempDir);
    expect(listJson.exitCode).toBe(0);
    const listItems = JSON.parse(listJson.stdout.trim());
    expect(listItems[0].isCurrent).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });
});

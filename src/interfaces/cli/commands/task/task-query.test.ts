/**
 * Integration and unit tests for `modie task list` and `modie task status`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { createTestWorkspace, makeTestTag } from "../../test-utils.ts";

describe("CLI Task List - Execution & Stream Separation (ADR-6, RULE-18, RULE-25, RULE-27)", () => {
  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should emit human-readable table to stderr and empty stdout with exit code 0", async () => {
    await using workspace = await createTestWorkspace("modie-cli-list-");
    const task = await workspace.createTask({
      id: 501,
      slug: "sample-task",
      criteria: ["Sample criterion"],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "list",
    ]);

    expect(exitCode).toBe(0);
    // RULE-27: stdout must be empty in human-readable mode
    expect(stdout).toBe("");
    // RULE-27: stderr must contain the human table
    expect(stderr).toContain("Active Task Queue");
    expect(stderr).toContain(task.tag);
    expect(stderr).toContain("READY");
    expect(stderr).toContain("0/1");
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should emit machine-parsable JSON array to stdout when --json is passed", async () => {
    await using workspace = await createTestWorkspace("modie-cli-list-json-");
    const task = await workspace.createTask({
      id: 502,
      slug: "sample-task",
      criteria: ["Item one"],
      links: [makeTestTag("ADR", 6)],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "list",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("502");
    expect(parsed[0].fullTaskId).toBe(task.tag);
    expect(parsed[0].readiness).toBe("READY");
  });

  // @verifies ADR-6, RULE-18, RULE-27
  it("[ADR-6][RULE-18][RULE-27] should support --ready and --blocked filters", async () => {
    await using workspace = await createTestWorkspace("modie-cli-list-filter-");
    const taskA = await workspace.createTask({
      id: 503,
      slug: "ready-task",
      criteria: ["A"],
    });
    const taskB = await workspace.createTask({
      id: 504,
      slug: "blocked-task",
      criteria: ["B"],
      depends_on: [taskA.tag],
    });

    // Test --ready
    const readyResult = await workspace.captureCli([
      "task",
      "list",
      "--ready",
      "--json",
    ]);
    expect(readyResult.exitCode).toBe(0);
    const readyTasks = JSON.parse(readyResult.stdout.trim());
    expect(readyTasks.length).toBe(1);
    expect(readyTasks[0].id).toBe("503");
    expect(readyTasks[0].fullTaskId).toBe(taskA.tag);

    // Test --blocked
    const blockedResult = await workspace.captureCli([
      "task",
      "list",
      "--blocked",
      "--json",
    ]);
    expect(blockedResult.exitCode).toBe(0);
    const blockedTasks = JSON.parse(blockedResult.stdout.trim());
    expect(blockedTasks.length).toBe(1);
    expect(blockedTasks[0].id).toBe("504");
    expect(blockedTasks[0].fullTaskId).toBe(taskB.tag);
    expect(blockedTasks[0].blockedBy).toEqual([taskA.tag]);
  });

  // @verifies RULE-27
  it("[RULE-27] should report notice to stderr when active queue is empty", async () => {
    await using workspace = await createTestWorkspace("modie-cli-empty-");
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "list",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Active task queue is empty");
  });

  // @verifies RULE-27
  it("[RULE-27] should support task ls alias", async () => {
    await using workspace = await createTestWorkspace("modie-cli-ls-");
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "ls",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("[]");
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should execute task list via bin.ts subprocess against fixture workspace", async () => {
    await using workspace = await createTestWorkspace("modie-bin-list-");
    const task = await workspace.createTask({
      id: 505,
      slug: "bin-task",
      criteria: ["Item"],
    });

    const { stdout, stderr } = await workspace.execBin([
      "task",
      "list",
      "--json",
    ]);

    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("505");
    expect(parsed[0].fullTaskId).toBe(task.tag);
    expect(parsed[0].readiness).toBe("READY");
  });
});

describe("CLI Task Status - Deep Inspection & Stream Separation (RULE-22, RULE-25, RULE-27)", () => {
  // @verifies RULE-22, RULE-25, RULE-27
  it("[RULE-22][RULE-25][RULE-27] should emit detailed human inspection to stderr and exit code 0", async () => {
    await using workspace = await createTestWorkspace("modie-cli-status-");
    const task = await workspace.createTask({
      id: 601,
      slug: "status-task",
      context: "Inspection test description.",
      links: [makeTestTag("ADR", 6), makeTestTag("RULE", 22)],
      criteria: [{ text: "Done item", completed: true }, "Pending item"],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "status",
      task.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(task.tag);
    expect(stderr).toContain("Status:      READY");
    expect(stderr).toContain("Progress:    1/2 criteria satisfied");
    expect(stderr).toContain("1. [x] Done item");
    expect(stderr).toContain("2. [ ] Pending item");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine JSON to stdout when --json is passed to status", async () => {
    await using workspace = await createTestWorkspace("modie-cli-status-json-");
    const task = await workspace.createTask({
      id: 602,
      slug: "json-status",
      criteria: ["Only item"],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "status",
      task.tag,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe("602");
    expect(parsed.fullTaskId).toBe(task.tag);
    expect(parsed.readiness).toBe("READY");
    expect(parsed.criteriaTotal).toBe(1);
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when status targets non-existent task", async () => {
    await using workspace = await createTestWorkspace("modie-cli-status-err-");
    const nonExistentTag = makeTestTag("TASK", 9999);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "status",
      nonExistentTag,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Error: Task "${nonExistentTag}" was not found`);
  });

  // @verifies ADR-6, RULE-25, RULE-27, RULE-28
  it("[ADR-6][RULE-25][RULE-27][RULE-28] should resolve current task on task branch for bare task status and --current", async () => {
    await using workspace = await createTestWorkspace(
      "modie-cli-status-branch-",
    );

    // Initialize git repo in workspace
    await workspace.initGit({ defaultBranch: "dev", initialCommit: true });

    // Create task file
    const task = await workspace.createTask({
      id: 701,
      slug: "active-feature",
      context: "Active feature context.",
      criteria: [{ text: "First item", completed: true }, "Second item"],
    });
    await workspace.gitCommit("add task");

    // 1. On non-task branch (dev): bare status returns queue table, --current throws
    const nonTaskStatus = await workspace.captureCli([
      "task",
      "status",
      "--json",
    ]);
    expect(nonTaskStatus.exitCode).toBe(0);
    const queue = JSON.parse(nonTaskStatus.stdout.trim());
    expect(Array.isArray(queue)).toBe(true);
    expect(queue.length).toBe(1);
    expect(queue[0].isCurrent).toBe(false);

    const nonTaskCurrent = await workspace.captureCli([
      "task",
      "status",
      "--current",
    ]);
    expect(nonTaskCurrent.exitCode).toBe(1);
    expect(nonTaskCurrent.stderr).toContain("Not on a task branch");

    // 2. Checkout task branch: task/701-active-feature
    const branchName = `task/701-${task.slug}`;
    await Bun.$`git checkout -b ${branchName}`.cwd(workspace.cwd).quiet();

    // Bare `task status` should now automatically resolve task
    const branchStatus = await workspace.captureCli(["task", "status"]);
    expect(branchStatus.exitCode).toBe(0);
    expect(branchStatus.stderr).toContain(`${task.tag}: ${task.slug}`);
    expect(branchStatus.stderr).toContain(
      "Progress:    1/2 criteria satisfied",
    );
    expect(branchStatus.stderr).toContain("1. [x] First item");
    expect(branchStatus.stderr).toContain("2. [ ] Second item");

    // `task status --current` should also return task
    const currentStatus = await workspace.captureCli([
      "task",
      "status",
      "-c",
      "--json",
    ]);
    expect(currentStatus.exitCode).toBe(0);
    const parsedCurrent = JSON.parse(currentStatus.stdout.trim());
    expect(parsedCurrent.id).toBe("701");
    expect(parsedCurrent.fullTaskId).toBe(task.tag);
    expect(parsedCurrent.isCurrent).toBe(true);

    // `task list` should display CURRENT in STATUS column
    const listResult = await workspace.captureCli(["task", "list"]);
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stderr).toContain("CURRENT");
    expect(listResult.stderr).toContain(task.tag);

    // `task list --json` should have isCurrent: true
    const listJson = await workspace.captureCli(["task", "list", "--json"]);
    expect(listJson.exitCode).toBe(0);
    const listItems = JSON.parse(listJson.stdout.trim());
    expect(listItems[0].isCurrent).toBe(true);
  });

  // @verifies ADR-6, ADR-9, RULE-21, RULE-25, RULE-27, RULE-34, RULE-35
  it("[ADR-6][ADR-9][RULE-21][RULE-25][RULE-27][RULE-34][RULE-35] should support --history flag on task status to query completed task history and branches", async () => {
    await using workspace = await createTestWorkspace(
      "modie-cli-status-history-",
    );
    await workspace.initGit({ defaultBranch: "dev", initialCommit: true });

    const task = await workspace.createTask({
      id: 750,
      slug: "historical-feature",
      context: "Historical feature context.",
      criteria: [{ text: "Shipped item", completed: true }],
    });

    await Bun.$`git add .`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(`feat(${task.tag}): ${task.slug}`);
    await workspace.remove(task);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${task.tag} artifact`,
    );

    // 1. Without --history: strict active resolution rejects deleted task
    const strictRes = await workspace.captureCli(["task", "status", task.tag]);
    expect(strictRes.exitCode).toBe(1);
    expect(strictRes.stderr).toContain(
      `Task "${task.tag}" was not found among active tasks on disk`,
    );

    // 2. With --history: resolves completed task details from Git history
    const histRes = await workspace.captureCli([
      "task",
      "status",
      task.tag,
      "--history",
      "--json",
    ]);
    expect(histRes.exitCode).toBe(0);
    const parsed = JSON.parse(histRes.stdout.trim());
    expect(parsed.fullTaskId).toBe(task.tag);
    expect(parsed.readiness).toBe("COMPLETED");
    expect(parsed.isHistorical).toBe(true);
    expect(parsed.criteriaCompleted).toBe(1);

    // 3. Bare `task status --history --json` lists historical tasks
    const listHistRes = await workspace.captureCli([
      "task",
      "status",
      "--history",
      "--json",
    ]);
    expect(listHistRes.exitCode).toBe(0);
    const histList = JSON.parse(listHistRes.stdout.trim());
    expect(Array.isArray(histList)).toBe(true);
    expect(histList.some((t: any) => t.fullTaskId === task.tag)).toBe(true);
  });
});

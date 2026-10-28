import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createTestWorkspace,
  makeTestTag,
  type TestWorkspace,
} from "../../test-utils.ts";

describe("CLI Task Start & Merge - Execution & Stream Separation (RULE-25, RULE-27, RULE-28)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-branch-");
    await workspace.initGit({ defaultBranch: "main", initialCommit: true });

    // Create dev trunk branch
    await Bun.$`git checkout -b dev`.cwd(workspace.cwd).quiet();

    // Create .modie/config.json with protected: ["main"], trunk: "dev"
    await workspace.writeFile(
      ".modie/config.json",
      JSON.stringify({
        git: {
          trunk: "dev",
          protectedBranches: ["main"],
        },
      }),
    );
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("[RULE-27] should emit help for task start and task merge to stderr with exitCode 0", async () => {
    const startHelp = await workspace.captureCli(["task", "start", "--help"]);
    expect(startHelp.exitCode).toBe(0);
    expect(startHelp.stdout).toBe("");
    expect(startHelp.stderr).toContain("Usage: modie task start");

    const mergeHelp = await workspace.captureCli(["task", "merge", "--help"]);
    expect(mergeHelp.exitCode).toBe(0);
    expect(mergeHelp.stdout).toBe("");
    expect(mergeHelp.stderr).toContain("Usage: modie task merge");
  });

  it("[RULE-27] should report error to stderr when identifier argument is missing", async () => {
    const startRes = await workspace.captureCli(["task", "start"]);
    expect(startRes.exitCode).toBe(1);
    expect(startRes.stdout).toBe("");
    expect(startRes.stderr).toContain(
      "Error: Missing required task identifier",
    );

    const mergeRes = await workspace.captureCli(["task", "merge"]);
    expect(mergeRes.exitCode).toBe(1);
    expect(mergeRes.stdout).toBe("");
    expect(mergeRes.stderr).toContain(
      "Error: Missing required task identifier",
    );
  });

  it("[RULE-25][RULE-27][RULE-28] should start task branch with machine name to stdout and status to stderr", async () => {
    const task = await workspace.createTask({
      id: 200,
      slug: "cli-feat",
      criteria: ["Item"],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "start",
      task.tag,
    ]);

    const expectedBranch = `task/200-${task.slug}`;
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(expectedBranch);
    expect(stderr).toContain(`✓ Switched to branch "${expectedBranch}"`);

    // Verify git branch is currently task/200-cli-feat
    const curBranch = await Bun.$`git branch --show-current`
      .cwd(workspace.cwd)
      .text();
    expect(curBranch.trim()).toBe(expectedBranch);
  });

  it("[RULE-27] should emit machine JSON to stdout when --json is passed to task start", async () => {
    const task = await workspace.createTask({
      id: 201,
      slug: "json-feat",
      criteria: ["Item"],
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "start",
      task.tag,
      "--json",
    ]);

    const expectedBranch = `task/201-${task.slug}`;
    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Switched to branch "${expectedBranch}"`);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.branchName).toBe(expectedBranch);
    expect(parsed.baseBranch).toBe("dev");
    expect(parsed.created).toBe(true);
  });

  it("[RULE-28] should reject starting a task from a protected branch", async () => {
    const task = await workspace.createTask({
      id: 202,
      slug: "prot",
      criteria: ["Item"],
    });

    // Switch to main (protected)
    await Bun.$`git checkout main`.cwd(workspace.cwd).quiet();

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "start",
      task.tag,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Cannot start task from protected branch "main"');
  });

  it("[RULE-25][RULE-27][RULE-28] should merge a completed subtask back into parent branch", async () => {
    const parentTask = await workspace.createTask({
      id: 203,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: parent");
    await workspace.captureCli(["task", "start", parentTask.tag]);

    const subTaskTag = makeTestTag("TASK", "203-1");
    const subTask = await workspace.createTask({
      id: "203-1",
      slug: "sub",
      depends_on: [parentTask.tag],
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${subTaskTag}): sub`);
    await workspace.captureCli(["task", "start", subTaskTag]);

    // Code mutation and artifact deletion on subtask branch
    await workspace.writeFile("code.txt", "hello world\n");
    await Bun.$`git add code.txt`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit("feat: code");
    await workspace.remove(subTask);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${subTaskTag} artifact`,
    );

    // Execute CLI task merge
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "merge",
      subTaskTag,
    ]);

    const expectedParentBranch = `task/203-${parentTask.slug}`;
    const expectedSubBranch = `task/203-1-${subTask.slug}`;
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(expectedParentBranch);
    expect(stderr).toContain(
      `✓ Merged task branch "${expectedSubBranch}" into "${expectedParentBranch}"`,
    );

    // Subtask branch deleted
    const bList = await Bun.$`git branch --list ${expectedSubBranch}`
      .cwd(workspace.cwd)
      .text();
    expect(bList.trim()).toBe("");
  });

  it("[RULE-28] should reject merging subtask directly into trunk dev via CLI", async () => {
    const parentTask = await workspace.createTask({
      id: 204,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: parent");
    await workspace.captureCli(["task", "start", parentTask.tag]);

    const subTaskTag = makeTestTag("TASK", "204-1");
    const subTask = await workspace.createTask({
      id: "204-1",
      slug: "sub",
      depends_on: [parentTask.tag],
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${subTaskTag}): sub`);
    await workspace.captureCli(["task", "start", subTaskTag]);

    await workspace.remove(subTask);
    await Bun.$`git add -u`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit(
      `chore(task): delete completed ${subTaskTag} artifact`,
    );

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "merge",
      subTaskTag,
      "--target",
      "dev",
    ]);

    const expectedSubBranch = `task/204-1-${subTask.slug}`;
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      `Subtask branch "${expectedSubBranch}" cannot be merged directly into trunk branch "dev" per RULE-28`,
    );
  });

  // @verifies RULE-21, RULE-22, RULE-25, RULE-27, RULE-28
  it("[RULE-21][RULE-22][RULE-25][RULE-27][RULE-28] should infer task ID from current branch for check, complete, and merge", async () => {
    // 1. Author and commit task on dev
    const task = await workspace.createTask({
      id: 205,
      slug: "branch-infer",
      context: "Testing branch inference.",
      criteria: ["First deliverable", "Second deliverable"],
    });
    await workspace.gitCommit(`docs: task ${task.id}`);

    // 2. Start task branch (checks out task/205-branch-infer)
    const startRes = await workspace.captureCli(["task", "start", task.tag]);
    expect(startRes.exitCode).toBe(0);

    // 3. Check item 1 omitting task ID
    const checkRes1 = await workspace.captureCli([
      "task",
      "check",
      "--item",
      "1",
    ]);
    expect(checkRes1.exitCode).toBe(0);
    expect(checkRes1.stderr).toContain(`Checked item 1 on ${task.tag}`);

    // 4. Check item 2 omitting task ID
    const checkRes2 = await workspace.captureCli([
      "task",
      "check",
      "--item",
      "2",
    ]);
    expect(checkRes2.exitCode).toBe(0);
    expect(checkRes2.stderr).toContain(`Checked item 2 on ${task.tag}`);
    expect(checkRes2.stderr).toContain(
      `All acceptance criteria for ${task.tag} are satisfied`,
    );

    // Make an implementation commit on the task branch so working tree is clean
    await workspace.writeFile("feature.ts", "export const feat = true;\n");
    await Bun.$`git add feature.ts`.cwd(workspace.cwd).quiet();
    await workspace.gitCommit("feat: implement feature");

    // 5. Complete task omitting task ID
    const completeRes = await workspace.captureCli(["task", "complete"]);
    expect(completeRes.exitCode).toBe(0);
    expect(completeRes.stderr).toContain(`✓ Completed task ${task.tag}`);

    // 6. Merge task omitting task ID
    const mergeRes = await workspace.captureCli(["task", "merge"]);
    const expectedBranch = `task/205-${task.slug}`;
    expect(mergeRes.exitCode).toBe(0);
    expect(mergeRes.stdout.trim()).toBe("dev");
    expect(mergeRes.stderr).toContain(
      `✓ Merged task branch "${expectedBranch}" into "dev"`,
    );

    // Verify checked-out branch is now dev and source branch was deleted
    const currentBranch = await Bun.$`git rev-parse --abbrev-ref HEAD`
      .cwd(workspace.cwd)
      .text();
    expect(currentBranch.trim()).toBe("dev");
    const bList = await Bun.$`git branch --list ${expectedBranch}`
      .cwd(workspace.cwd)
      .text();
    expect(bList.trim()).toBe("");
  });

  // @verifies RULE-27, RULE-28
  it("[RULE-27][RULE-28] should report clear error when omitting task ID on non-task branch", async () => {
    // Current branch is dev (not a task branch)
    const checkRes = await workspace.captureCli([
      "task",
      "check",
      "--item",
      "1",
    ]);
    expect(checkRes.exitCode).toBe(1);
    expect(checkRes.stderr).toContain(
      "Error: Missing required task identifier and current git branch",
    );

    const completeRes = await workspace.captureCli(["task", "complete"]);
    expect(completeRes.exitCode).toBe(1);
    expect(completeRes.stderr).toContain(
      "Error: Missing required task identifier and current git branch",
    );

    const mergeRes = await workspace.captureCli(["task", "merge"]);
    expect(mergeRes.exitCode).toBe(1);
    expect(mergeRes.stderr).toContain(
      "Error: Missing required task identifier and current git branch",
    );
  });
});

/**
 * Integration tests for current-branch task origin tracking and merge-back automation.
 * @verifies RULE-21, RULE-28, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { taskBranchBaseConfigKey } from "../../domain/index.ts";
import type { FixtureWorkspace } from "../../platform/testing/index.ts";
import { defaultVcsAdapter } from "../../platform/vcs/git-cli-adapter.ts";
import { mergeTaskBranch, startTaskBranch } from "./branching.ts";
import { ForeignBranchAncestryError } from "./errors.ts";
import {
  commitFile,
  completeTaskInGit,
  createBranchingWorkspace,
  getCurrentBranch,
  getHeadHash,
} from "./test-helpers.ts";

describe("Current-Branch Origin Tracking & Merge-Back Automation (RULE-28, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createBranchingWorkspace("modie-origin-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should complete a multi-task loop on a zero-commit feature branch and clean up branch config", async () => {
    await Bun.$`git checkout -b feat/abc`.cwd(workspace.cwd).quiet();
    const featHeadBefore = await getHeadHash(workspace);
    const devHeadBefore = await getHeadHash(workspace, "dev");
    expect(featHeadBefore).toBe(devHeadBefore);

    const task1 = await workspace.createTask({
      id: 401,
      slug: "feat-step-one",
      criteria: [{ text: "Deliver step 1", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${task1.tag}`);

    const start1 = await startTaskBranch(task1.tag, { cwd: workspace.cwd });
    expect(start1.baseBranch).toBe("feat/abc");
    expect(start1.targetBranch).toBe("feat/abc");
    expect(start1.created).toBe(true);

    const recorded1 = await defaultVcsAdapter.getConfig(
      taskBranchBaseConfigKey(start1.branchName),
      workspace.cwd,
    );
    expect(recorded1).toBe("feat/abc");

    await commitFile(workspace, "step1.txt", "step 1\n", "feat: step 1");
    await completeTaskInGit(workspace, task1);

    const merge1 = await mergeTaskBranch(task1.tag, { cwd: workspace.cwd });
    expect(merge1.targetBranch).toBe("feat/abc");
    expect(merge1.deletedSourceBranch).toBe(true);

    expect(await getCurrentBranch(workspace)).toBe("feat/abc");
    expect(
      await defaultVcsAdapter.getConfig(
        taskBranchBaseConfigKey(start1.branchName),
        workspace.cwd,
      ),
    ).toBeNull();
    expect(await getHeadHash(workspace, "dev")).toBe(devHeadBefore);

    const task2 = await workspace.createTask({
      id: 402,
      slug: "feat-step-two",
      criteria: [{ text: "Deliver step 2", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${task2.tag}`);

    const start2 = await startTaskBranch(task2.tag, { cwd: workspace.cwd });
    expect(start2.baseBranch).toBe("feat/abc");
    expect(start2.targetBranch).toBe("feat/abc");
    expect(await workspace.readFile("step1.txt")).toBe("step 1\n");

    await completeTaskInGit(workspace, task2);

    const merge2 = await mergeTaskBranch(task2.tag, { cwd: workspace.cwd });
    expect(merge2.targetBranch).toBe("feat/abc");
    expect(await getHeadHash(workspace, "dev")).toBe(devHeadBefore);
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should fall back to trunk on detached HEAD and allow base override on protected branch", async () => {
    await Bun.$`git checkout -b feat/override-base`.cwd(workspace.cwd).quiet();
    await commitFile(
      workspace,
      "override.txt",
      "from feature\n",
      "feat: feature commit",
    );

    await Bun.$`git checkout --detach dev`.cwd(workspace.cwd).quiet();
    const detachedTask = await workspace.createTask({
      id: 403,
      slug: "detached-root",
      criteria: ["Item"],
    });
    await workspace.gitCommit(`docs: add ${detachedTask.tag}`);

    const detachedStart = await startTaskBranch(detachedTask.tag, {
      cwd: workspace.cwd,
    });
    expect(detachedStart.baseBranch).toBe("dev");
    expect(detachedStart.targetBranch).toBe("dev");
    expect(
      await defaultVcsAdapter.getConfig(
        taskBranchBaseConfigKey(detachedStart.branchName),
        workspace.cwd,
      ),
    ).toBe("dev");

    await Bun.$`git checkout main`.cwd(workspace.cwd).quiet();
    const protTask = await workspace.createTask({
      id: 404,
      slug: "protected-override",
      criteria: ["Item"],
    });

    await expect(
      startTaskBranch(protTask.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Cannot start task from protected branch "main"/);

    const overrideStart = await startTaskBranch(protTask.tag, {
      base: "feat/override-base",
      cwd: workspace.cwd,
    });
    expect(overrideStart.baseBranch).toBe("feat/override-base");
    expect(overrideStart.targetBranch).toBe("feat/override-base");
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should reject starting a root task while on another active task branch unless base is specified", async () => {
    const firstTask = await workspace.createTask({
      id: 405,
      slug: "active-root",
      criteria: ["Item"],
    });
    const secondTask = await workspace.createTask({
      id: 406,
      slug: "chained-root",
      criteria: ["Item"],
    });
    await workspace.gitCommit(
      `docs: add ${firstTask.tag} and ${secondTask.tag}`,
    );

    const firstStart = await startTaskBranch(firstTask.tag, {
      cwd: workspace.cwd,
    });
    expect(firstStart.created).toBe(true);

    const reStart = await startTaskBranch(firstTask.tag, {
      cwd: workspace.cwd,
    });
    expect(reStart.created).toBe(false);
    expect(reStart.branchName).toBe(firstStart.branchName);

    await expect(
      startTaskBranch(secondTask.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Cannot start root task .* while checked out on active task branch "task\/405-active-root"/,
    );

    const explicitStart = await startTaskBranch(secondTask.tag, {
      base: "dev",
      cwd: workspace.cwd,
    });
    expect(explicitStart.created).toBe(true);
    expect(explicitStart.baseBranch).toBe("dev");
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should fail loudly if recorded modieBase no longer exists and fall back to trunk only when unrecorded", async () => {
    await Bun.$`git checkout -b feat/ephemeral`.cwd(workspace.cwd).quiet();
    const task = await workspace.createTask({
      id: 407,
      slug: "deleted-origin",
      criteria: [{ text: "Done", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${task.tag}`);

    const started = await startTaskBranch(task.tag, { cwd: workspace.cwd });
    expect(started.baseBranch).toBe("feat/ephemeral");

    await completeTaskInGit(workspace, task);
    await Bun.$`git branch -D feat/ephemeral`.cwd(workspace.cwd).quiet();

    await expect(
      mergeTaskBranch(task.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Cannot merge into recorded origin branch "feat\/ephemeral": Branch no longer exists locally/,
    );

    const recovered = await mergeTaskBranch(task.tag, {
      target: "dev",
      cwd: workspace.cwd,
    });
    expect(recovered.targetBranch).toBe("dev");

    const legacyTask = await workspace.createTask({
      id: 408,
      slug: "legacy-no-config",
      criteria: [{ text: "Done", completed: true }],
    });
    await Bun.$`git checkout -b task/408-legacy-no-config`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.gitCommit(`feat(${legacyTask.tag}): add legacy`);
    await completeTaskInGit(workspace, legacyTask);

    const legacyMerge = await mergeTaskBranch(legacyTask.tag, {
      cwd: workspace.cwd,
    });
    expect(legacyMerge.targetBranch).toBe("dev");
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should enforce foreign task ancestry guard when merging into feature branch targets", async () => {
    await Bun.$`git checkout -b feat/guarded`.cwd(workspace.cwd).quiet();
    await commitFile(workspace, "base.txt", "feature base\n", "feat: base");

    const taskA = await workspace.createTask({
      id: 409,
      slug: "foreign-a",
      criteria: ["Item"],
    });
    await workspace.gitCommit(`docs: add ${taskA.tag}`);
    await startTaskBranch(taskA.tag, { cwd: workspace.cwd });
    await commitFile(
      workspace,
      "foreign.txt",
      "foreign commit\n",
      "feat: foreign unmerged work",
    );

    const taskB = await workspace.createTask({
      id: 410,
      slug: "leaked-b",
      criteria: [{ text: "Done", completed: true }],
    });
    await Bun.$`git checkout -b task/410-leaked-b`.cwd(workspace.cwd).quiet();
    await defaultVcsAdapter.setConfig(
      taskBranchBaseConfigKey("task/410-leaked-b"),
      "feat/guarded",
      workspace.cwd,
    );
    await workspace.gitCommit(`feat(${taskB.tag}): task B`);
    await completeTaskInGit(workspace, taskB);

    let thrown: unknown;
    try {
      await mergeTaskBranch(taskB.tag, { cwd: workspace.cwd });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ForeignBranchAncestryError);
    const ancErr = thrown as ForeignBranchAncestryError;
    expect(ancErr.targetBranch).toBe("feat/guarded");
    expect(ancErr.foreignTaskBranch).toBe("task/409-foreign-a");

    await Bun.$`git checkout feat/guarded`.cwd(workspace.cwd).quiet();
    const taskC = await workspace.createTask({
      id: 411,
      slug: "clean-c",
      criteria: [{ text: "Done", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${taskC.tag}`);
    await startTaskBranch(taskC.tag, { cwd: workspace.cwd });
    await completeTaskInGit(workspace, taskC);

    const cleanMerge = await mergeTaskBranch(taskC.tag, {
      cwd: workspace.cwd,
    });
    expect(cleanMerge.targetBranch).toBe("feat/guarded");
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should keep subtask branching and merging bound to parent branch when parent originates from a feature branch", async () => {
    await Bun.$`git checkout -b feat/parent-origin`.cwd(workspace.cwd).quiet();

    const parent = await workspace.createTask({
      id: 412,
      slug: "feat-parent",
      criteria: [{ text: "Parent done", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${parent.tag}`);

    const parentStart = await startTaskBranch(parent.tag, {
      cwd: workspace.cwd,
    });
    expect(parentStart.baseBranch).toBe("feat/parent-origin");
    expect(parentStart.targetBranch).toBe("feat/parent-origin");

    const sub = await workspace.createTask({
      id: "412-1",
      slug: "feat-sub",
      depends_on: [parent.tag],
      criteria: [{ text: "Sub done", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${sub.tag}`);

    const subStart = await startTaskBranch(sub.tag, { cwd: workspace.cwd });
    expect(subStart.isSubtask).toBe(true);
    expect(subStart.baseBranch).toBe(parentStart.branchName);
    expect(subStart.targetBranch).toBe(parentStart.branchName);
    expect(
      await defaultVcsAdapter.getConfig(
        taskBranchBaseConfigKey(subStart.branchName),
        workspace.cwd,
      ),
    ).toBeNull();

    await commitFile(
      workspace,
      "sub-feature.txt",
      "sub work\n",
      "feat: sub work",
    );
    await completeTaskInGit(workspace, sub);

    await expect(
      mergeTaskBranch(sub.tag, { target: "dev", cwd: workspace.cwd }),
    ).rejects.toThrow(/cannot be merged directly into trunk/);
    await expect(
      mergeTaskBranch(sub.tag, {
        target: "feat/parent-origin",
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/Subtasks must merge back into their parent task branch/);

    const subMerge = await mergeTaskBranch(sub.tag, { cwd: workspace.cwd });
    expect(subMerge.targetBranch).toBe(parentStart.branchName);

    await completeTaskInGit(workspace, parent);
    const parentMerge = await mergeTaskBranch(parent.tag, {
      cwd: workspace.cwd,
    });
    expect(parentMerge.targetBranch).toBe("feat/parent-origin");
  });
});

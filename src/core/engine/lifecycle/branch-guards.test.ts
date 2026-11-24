/**
 * Unit tests for lifecycle pre-merge guards, depth caps, ancestry checks, and domain errors.
 * @verifies RULE-21, RULE-22, RULE-28, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../domain/index.ts";
import type { FixtureWorkspace } from "../../platform/testing/index.ts";
import { defaultVcsAdapter } from "../../platform/vcs/git-cli-adapter.ts";
import {
  assertNoActiveSubtasks,
  assertSourceBranchExists,
  assertTargetBranchExists,
  assertTaskCompleted,
} from "./branch-guard.ts";
import {
  computeTaskBranchTopology,
  mergeTaskBranch,
  resolveMergeTarget,
  startTaskBranch,
} from "./branching.ts";
import {
  ActiveSubtaskPendingError,
  ForeignBranchAncestryError,
  TaskIncompleteError,
} from "./errors.ts";
import {
  commitFile,
  completeTaskInGit,
  createBranchingWorkspace,
} from "./test-helpers.ts";

describe("Pre-Merge Guard Decomposition & Domain Errors (RULE-21, RULE-22, RULE-28)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createBranchingWorkspace("modie-guard-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("assertSourceBranchExists should verify branch existence", async () => {
    await expect(
      assertSourceBranchExists(
        defaultVcsAdapter,
        "non-existent-branch",
        "999",
        workspace.cwd,
      ),
    ).rejects.toThrow(/Task branch "non-existent-branch" does not exist/);

    await expect(
      assertSourceBranchExists(
        defaultVcsAdapter,
        "dev",
        "999",
        workspace.cwd,
      ),
    ).resolves.toBeUndefined();
  });

  it("assertTargetBranchExists should verify target branch existence", async () => {
    await expect(
      assertTargetBranchExists(
        defaultVcsAdapter,
        "non-existent-target",
        workspace.cwd,
      ),
    ).rejects.toThrow(/Branch does not exist in local git repository/);

    await expect(
      assertTargetBranchExists(defaultVcsAdapter, "dev", workspace.cwd),
    ).resolves.toBeUndefined();
  });

  it("assertTaskCompleted should throw typed TaskIncompleteError with diagnostic details", async () => {
    const taskIncomplete = await workspace.createTask({
      id: 201,
      slug: "incomplete",
      criteria: [
        { text: "Done item", completed: true },
        { text: "Pending item", completed: false },
      ],
    });

    let thrownError: unknown;
    try {
      await assertTaskCompleted(
        taskIncomplete.tag,
        "201",
        "task/201-incomplete",
        { cwd: workspace.cwd, vcs: defaultVcsAdapter },
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(TaskIncompleteError);
    const incErr = thrownError as TaskIncompleteError;
    expect(incErr.taskId).toBe("201");
    expect(incErr.reason).toBe("incomplete_criteria");
    expect(incErr.incompleteCriteriaCount).toBe(1);

    const taskUnfinished = await workspace.createTask({
      id: 202,
      slug: "unfinished",
      criteria: [{ text: "Done item", completed: true }],
    });

    thrownError = null;
    try {
      await assertTaskCompleted(
        taskUnfinished.tag,
        "202",
        "task/202-unfinished",
        { cwd: workspace.cwd, vcs: defaultVcsAdapter },
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(TaskIncompleteError);
    const unfinErr = thrownError as TaskIncompleteError;
    expect(unfinErr.taskId).toBe("202");
    expect(unfinErr.reason).toBe("artifact_not_completed");

    await workspace.remove(taskUnfinished);
    thrownError = null;
    try {
      await assertTaskCompleted(undefined, "202", "task/202-unfinished", {
        cwd: workspace.cwd,
        vcs: defaultVcsAdapter,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(TaskIncompleteError);
    const noRecErr = thrownError as TaskIncompleteError;
    expect(noRecErr.taskId).toBe("202");
    expect(noRecErr.reason).toBe("no_completion_record");

    await expect(
      assertTaskCompleted(taskIncomplete.tag, "201", "task/201-incomplete", {
        cwd: workspace.cwd,
        vcs: defaultVcsAdapter,
        force: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("resolveMergeTarget should resolve and guard subtask and root task targets", async () => {
    const subtaskTopology = {
      taskId: "10-1",
      slug: "sub",
      branchName: "task/10-1-sub",
      currentBranch: "task/10-1-sub",
      isCurrentBranchProtected: false,
      isSubtask: true,
      parentId: "10",
      parentBranchName: "task/10-parent",
      trunkBranch: "dev",
      expectedBaseBranch: "task/10-parent",
      protectedBranches: ["main"],
    };

    expect(resolveMergeTarget(subtaskTopology)).toBe("task/10-parent");

    expect(() =>
      resolveMergeTarget(subtaskTopology, { target: "dev" }),
    ).toThrow(/Subtask branch .* cannot be merged directly into trunk/);

    expect(
      resolveMergeTarget(subtaskTopology, { target: "dev", force: true }),
    ).toBe("dev");

    expect(() =>
      resolveMergeTarget(subtaskTopology, { target: "main" }),
    ).toThrow(/Cannot merge subtask branch .* into protected branch/);

    const rootTopology = {
      taskId: "10",
      slug: "parent",
      branchName: "task/10-parent",
      currentBranch: "task/10-parent",
      isCurrentBranchProtected: false,
      isSubtask: false,
      trunkBranch: "dev",
      expectedBaseBranch: "dev",
      protectedBranches: ["main"],
    };

    expect(resolveMergeTarget(rootTopology)).toBe("dev");

    const featureOriginTopology = {
      ...rootTopology,
      recordedBaseBranch: "feat/abc",
      expectedBaseBranch: "feat/abc",
    };
    expect(resolveMergeTarget(featureOriginTopology)).toBe("feat/abc");
    expect(
      resolveMergeTarget(featureOriginTopology, { target: "dev" }),
    ).toBe("dev");

    expect(() =>
      resolveMergeTarget(rootTopology, { target: "main" }),
    ).toThrow(
      /Cannot merge root task branch .* directly into protected branch/,
    );
    expect(() =>
      resolveMergeTarget({
        ...rootTopology,
        recordedBaseBranch: "main",
      }),
    ).toThrow(
      /Cannot merge root task branch .* directly into protected branch/,
    );
  });

  it("assertNoActiveSubtasks should throw typed ActiveSubtaskPendingError when child branches exist", async () => {
    const parentTopology = {
      taskId: "210",
      slug: "parent",
      branchName: "task/210-parent",
      currentBranch: "task/210-parent",
      isCurrentBranchProtected: false,
      isSubtask: false,
      trunkBranch: "dev",
      expectedBaseBranch: "dev",
      protectedBranches: ["main"],
    };

    await Bun.$`git branch task/210-1-child`.cwd(workspace.cwd).quiet();

    let thrown: unknown;
    try {
      await assertNoActiveSubtasks(
        defaultVcsAdapter,
        parentTopology,
        workspace.cwd,
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ActiveSubtaskPendingError);
    const subtaskErr = thrown as ActiveSubtaskPendingError;
    expect(subtaskErr.parentTaskId).toBe("210");
    expect(subtaskErr.activeSubtaskBranches).toContain("task/210-1-child");

    await expect(
      assertNoActiveSubtasks(
        defaultVcsAdapter,
        parentTopology,
        workspace.cwd,
        { force: true },
      ),
    ).resolves.toBeUndefined();

    await Bun.$`git branch -D task/210-1-child`.cwd(workspace.cwd).quiet();
    await expect(
      assertNoActiveSubtasks(
        defaultVcsAdapter,
        parentTopology,
        workspace.cwd,
      ),
    ).resolves.toBeUndefined();
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should explicitly reject multi-level task IDs in topology, start, and merge", async () => {
    const deepTag = formatArtifactTag("TASK", "300-1-1");
    const deepTask = await workspace.createTask({
      id: "300-1-1",
      slug: "too-deep",
      criteria: [{ text: "Done", completed: true }],
    });
    await workspace.gitCommit(`feat(${deepTag}): add deep task`);

    await expect(
      computeTaskBranchTopology(deepTask.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/exceeds the maximum subtask depth of 1 per RULE-28/);

    await expect(
      startTaskBranch(deepTask.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/exceeds the maximum subtask depth of 1 per RULE-28/);

    await expect(
      mergeTaskBranch(deepTask.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/exceeds the maximum subtask depth of 1 per RULE-28/);
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should block merging into trunk when source branch contains unmerged commits from another active task branch", async () => {
    const taskA = await workspace.createTask({
      id: 301,
      slug: "parent-a",
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${taskA.tag}`);
    await startTaskBranch(taskA.tag, { cwd: workspace.cwd });
    await commitFile(
      workspace,
      "parent-work.txt",
      "unmerged parent work\n",
      "feat: unmerged work on task 301",
    );

    const taskB = await workspace.createTask({
      id: 302,
      slug: "leaked-child",
      criteria: [{ text: "Item", completed: true }],
    });
    await Bun.$`git checkout -b task/302-${taskB.slug}`
      .cwd(workspace.cwd)
      .quiet();
    await workspace.gitCommit(`feat(${taskB.tag}): task on leaked branch`);
    await completeTaskInGit(workspace, taskB);

    let thrown: unknown;
    try {
      await mergeTaskBranch(taskB.tag, { cwd: workspace.cwd });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForeignBranchAncestryError);
    const ancErr = thrown as ForeignBranchAncestryError;
    expect(ancErr.sourceBranch).toBe(`task/302-${taskB.slug}`);
    expect(ancErr.targetBranch).toBe("dev");
    expect(ancErr.foreignTaskBranch).toBe(`task/301-${taskA.slug}`);

    await Bun.$`git checkout dev`.cwd(workspace.cwd).quiet();
    const taskC = await workspace.createTask({
      id: 303,
      slug: "clean-root",
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`docs: add ${taskC.tag}`);
    await startTaskBranch(taskC.tag, { cwd: workspace.cwd });
    await completeTaskInGit(workspace, taskC);

    const cleanMerge = await mergeTaskBranch(taskC.tag, {
      cwd: workspace.cwd,
    });
    expect(cleanMerge.targetBranch).toBe("dev");

    const forcedMerge = await mergeTaskBranch(taskB.tag, {
      cwd: workspace.cwd,
      force: true,
    });
    expect(forcedMerge.targetBranch).toBe("dev");
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should reject invalid --base targets and mis-parented existing subtask branches on startTaskBranch", async () => {
    const parent = await workspace.createTask({
      id: 304,
      slug: "root-parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit(`docs: add ${parent.tag}`);
    await startTaskBranch(parent.tag, { cwd: workspace.cwd });

    const subTag = formatArtifactTag("TASK", "304-1");
    const sub = await workspace.createTask({
      id: "304-1",
      slug: "child-sub",
      depends_on: [parent.tag],
      criteria: ["Item"],
    });
    await workspace.gitCommit(`docs: add ${subTag}`);
    await startTaskBranch(sub.tag, { cwd: workspace.cwd });

    const rootOther = await workspace.createTask({
      id: 305,
      slug: "other-root",
      criteria: ["Item"],
    });
    await workspace.gitCommit(`docs: add ${rootOther.tag}`);

    await expect(
      startTaskBranch(rootOther.tag, { base: "main", cwd: workspace.cwd }),
    ).rejects.toThrow(/from protected base branch "main"/);

    await expect(
      startTaskBranch(rootOther.tag, {
        base: `task/304-1-${sub.slug}`,
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(/from subtask branch .* Subtasks cannot spawn nested/);

    const sub2Tag = formatArtifactTag("TASK", "304-2");
    await Bun.$`git checkout task/304-${parent.slug}`
      .cwd(workspace.cwd)
      .quiet();
    const sub2 = await workspace.createTask({
      id: "304-2",
      slug: "wrong-base-sub",
      depends_on: [parent.tag],
      criteria: ["Item"],
    });
    await workspace.gitCommit(`docs: add ${sub2Tag}`);

    await expect(
      startTaskBranch(sub2.tag, { base: "dev", cwd: workspace.cwd }),
    ).rejects.toThrow(/Subtasks must branch from their parent task branch/);

    await Bun.$`git checkout dev`.cwd(workspace.cwd).quiet();
    await commitFile(
      workspace,
      "trunk-advance.txt",
      "trunk commit\n",
      "feat: advance dev ahead of parent",
    );
    await Bun.$`git branch task/304-2-${sub2.slug} dev`
      .cwd(workspace.cwd)
      .quiet();

    await expect(
      startTaskBranch(sub2.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/contains trunk history .* not present in parent branch/);
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("[RULE-28][RULE-34][RULE-35] should block start and merge when tracked working tree has uncommitted changes", async () => {
    const task = await workspace.createTask({
      id: 306,
      slug: "dirty-tree",
      criteria: [{ text: "Item", completed: true }],
    });
    await commitFile(
      workspace,
      "tracked.txt",
      "v1\n",
      `docs: add ${task.tag} and tracked.txt`,
    );

    await startTaskBranch(task.tag, { cwd: workspace.cwd });
    await completeTaskInGit(workspace, task);

    await workspace.writeFile("tracked.txt", "uncommitted v2\n");

    await expect(
      mergeTaskBranch(task.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Cannot merge task branch with uncommitted tracked/);

    const otherTask = await workspace.createTask({
      id: 307,
      slug: "clean-switch",
      criteria: ["Item"],
    });
    await expect(
      startTaskBranch(otherTask.tag, { base: "dev", cwd: workspace.cwd }),
    ).rejects.toThrow(/Cannot start task branch with uncommitted tracked/);

    await Bun.$`git checkout -- tracked.txt`.cwd(workspace.cwd).quiet();
    const mergeRes = await mergeTaskBranch(task.tag, { cwd: workspace.cwd });
    expect(mergeRes.targetBranch).toBe("dev");
  });
});

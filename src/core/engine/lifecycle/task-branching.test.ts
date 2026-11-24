/**
 * Integration tests for hierarchical task branching and merge workflows.
 * @verifies RULE-21, RULE-28, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { formatTaskBranch, parseSubtaskId } from "../../domain/index.ts";
import type { FixtureWorkspace } from "../../platform/testing/index.ts";
import {
  computeTaskBranchTopology,
  mergeTaskBranch,
  startTaskBranch,
} from "./branching.ts";
import {
  branchExistsInGit,
  commitFile,
  completeTaskInGit,
  createBranchingWorkspace,
  getCurrentBranch,
} from "./test-helpers.ts";

describe("Task Branching Service (RULE-28)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createBranchingWorkspace("modie-branching-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("should format canonical task branch names", () => {
    expect(formatTaskBranch("11", "branching-automation")).toBe(
      "task/11-branching-automation",
    );
    expect(formatTaskBranch("TASK-2-1", "create-template")).toBe(
      "task/2-1-create-template",
    );
  });

  it("should parse subtask parent ID and sequence tokens per RULE-28", () => {
    expect(parseSubtaskId("2-1")).toEqual({ parentId: "2", sequence: "1" });
    expect(parseSubtaskId("TASK-11-2")).toEqual({
      parentId: "11",
      sequence: "2",
    });
    expect(parseSubtaskId("TASK-J101-3")).toEqual({
      parentId: "J101",
      sequence: "3",
    });
    expect(parseSubtaskId("11")).toBeNull();
    expect(parseSubtaskId("TASK-11")).toBeNull();
  });

  it("should compute topology for a root task from trunk", async () => {
    const task = await workspace.createTask({
      id: 100,
      slug: "root-feat",
      criteria: ["Item"],
    });

    const topo = await computeTaskBranchTopology(task.tag, {
      cwd: workspace.cwd,
    });
    expect(topo.taskId).toBe(task.id);
    expect(topo.slug).toBe(task.slug);
    expect(topo.branchName).toBe(`task/100-${task.slug}`);
    expect(topo.isSubtask).toBe(false);
    expect(topo.expectedBaseBranch).toBe("dev");
    expect(topo.isCurrentBranchProtected).toBe(false);
    expect(topo.trunkBranch).toBe("dev");
    expect(topo.protectedBranches).toEqual(["main"]);
  });

  it("should guard against starting a task from a protected branch", async () => {
    const task = await workspace.createTask({
      id: 101,
      slug: "protected-test",
      criteria: ["Item"],
    });

    await Bun.$`git checkout main`.cwd(workspace.cwd).quiet();

    await expect(
      startTaskBranch(task.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(/Cannot start task from protected branch "main"/);
  });

  it("should create and checkout a root task branch from trunk", async () => {
    const task = await workspace.createTask({
      id: 102,
      slug: "feat",
      criteria: ["Item"],
    });

    const res = await startTaskBranch(task.tag, { cwd: workspace.cwd });
    const expectedBranch = `task/102-${task.slug}`;
    expect(res.branchName).toBe(expectedBranch);
    expect(res.baseBranch).toBe("dev");
    expect(res.created).toBe(true);
    expect(await getCurrentBranch(workspace)).toBe(expectedBranch);
  });

  it("should prevent starting a subtask if the parent task branch does not exist", async () => {
    const parent = await workspace.createTask({
      id: 102,
      slug: "feat",
      criteria: ["Item"],
    });
    const subtask = await workspace.createTask({
      id: "102-1",
      slug: "child",
      depends_on: [parent.tag],
      criteria: ["Item"],
    });

    await expect(
      startTaskBranch(subtask.tag, { cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Parent task branch "task\/102-feat" does not exist in local git branches.*RULE-28/,
    );
  });

  it("should branch a subtask directly from its parent task branch per RULE-28", async () => {
    const parent = await workspace.createTask({
      id: 103,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: add parent task");
    await startTaskBranch(parent.tag, { cwd: workspace.cwd });

    const subtask = await workspace.createTask({
      id: "103-1",
      slug: "sub",
      depends_on: [parent.tag],
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: add subtask");

    const res = await startTaskBranch(subtask.tag, { cwd: workspace.cwd });
    expect(res.branchName).toBe(`task/103-1-${subtask.slug}`);
    expect(res.baseBranch).toBe(`task/103-${parent.slug}`);
    expect(res.isSubtask).toBe(true);
    expect(await getCurrentBranch(workspace)).toBe(`task/103-1-${subtask.slug}`);
  });

  it("should reject merging a subtask directly into trunk dev per RULE-28", async () => {
    const parent = await workspace.createTask({
      id: 104,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: parent");
    await startTaskBranch(parent.tag, { cwd: workspace.cwd });

    const subtask = await workspace.createTask({
      id: "104-1",
      slug: "sub",
      depends_on: [parent.tag],
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${subtask.tag}): sub`);
    await startTaskBranch(subtask.tag, { cwd: workspace.cwd });
    await completeTaskInGit(workspace, subtask);

    await expect(
      mergeTaskBranch(subtask.tag, { target: "dev", cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Subtask branch "task\/104-1-sub" cannot be merged directly into trunk branch "dev" per RULE-28/,
    );
  });

  it("should reject merging any task branch into a protected branch", async () => {
    const task = await workspace.createTask({
      id: 105,
      slug: "root",
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${task.tag}): root`);
    await startTaskBranch(task.tag, { cwd: workspace.cwd });
    await completeTaskInGit(workspace, task);

    await expect(
      mergeTaskBranch(task.tag, { target: "main", cwd: workspace.cwd }),
    ).rejects.toThrow(
      /Cannot merge root task branch.*directly into protected branch "main"/,
    );
  });

  it("should successfully merge a subtask back into its parent branch and delete the subtask branch", async () => {
    const parent = await workspace.createTask({
      id: 106,
      slug: "parent",
      criteria: ["Item"],
    });
    await workspace.gitCommit("docs: parent");
    await startTaskBranch(parent.tag, { cwd: workspace.cwd });

    const subtask = await workspace.createTask({
      id: "106-1",
      slug: "sub",
      depends_on: [parent.tag],
      criteria: [{ text: "Item", completed: true }],
    });
    await workspace.gitCommit(`feat(${subtask.tag}): sub`);
    await startTaskBranch(subtask.tag, { cwd: workspace.cwd });

    await commitFile(
      workspace,
      "subtask.txt",
      "subtask code\n",
      "feat: subtask implementation",
    );
    await completeTaskInGit(workspace, subtask);

    const mergeRes = await mergeTaskBranch(subtask.tag, { cwd: workspace.cwd });
    expect(mergeRes.sourceBranch).toBe(`task/106-1-${subtask.slug}`);
    expect(mergeRes.targetBranch).toBe(`task/106-${parent.slug}`);
    expect(mergeRes.deletedSourceBranch).toBe(true);
    expect(await getCurrentBranch(workspace)).toBe(`task/106-${parent.slug}`);
    expect(await branchExistsInGit(workspace, "task/106-1-sub")).toBe(false);
  });
});

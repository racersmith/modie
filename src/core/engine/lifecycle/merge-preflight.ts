/**
 * Modie Core: Atomic Complete-and-Merge Preflight & Orchestration Service.
 * Complies with RULE-21, RULE-22, RULE-28, and RULE-32.
 *
 * Validates merge preconditions prior to mutating the working tree, committing,
 * or deleting a task artifact so merge-guard failures abort atomically.
 */

import type { TaskBranchTopology } from "../../domain/index.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import {
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "../context/index.ts";
import {
  assertNoActiveSubtasks,
  assertNoForeignTaskAncestry,
  assertSourceBranchExists,
  assertTargetBranchExists,
} from "./branch-guard.ts";
import {
  computeTaskBranchTopology,
  mergeTaskBranch,
  resolveMergeTarget,
  resolveTaskIdentifier,
} from "./branching.ts";
import { completeTask, type CompleteTaskResult } from "./completion.ts";
import type { MergeTaskBranchResult } from "./types.ts";

export interface TaskMergePreflightOptions {
  target?: string;
  force?: boolean;
  cwd?: string;
  vcs?: IVcsAdapter;
  workspace?: WorkspaceContext;
}

export interface TaskMergePreflightResult {
  taskId: string;
  topology: TaskBranchTopology;
  sourceBranch: string;
  targetBranch: string;
}

export interface CompleteAndMergeTaskOptions {
  target?: string;
  keepBranch?: boolean;
  force?: boolean;
  cwd?: string;
  vcs?: IVcsAdapter;
  workspace?: WorkspaceContext;
}

export interface CompleteAndMergeTaskResult {
  completion: CompleteTaskResult;
  merge: MergeTaskBranchResult;
}

/**
 * Validates branch-topology merge preconditions prior to committing or deleting a task artifact.
 * Verifies source branch existence, merge target resolution and existence,
 * absence of active child subtask branches, and absence of foreign task ancestry (RULE-28).
 */
export async function assertTaskMergePreflight(
  taskIdentifier?: string,
  options: TaskMergePreflightOptions = {},
): Promise<TaskMergePreflightResult> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;
  const targetId = await resolveTaskIdentifier(taskIdentifier, vcs, cwd);
  const topology = await computeTaskBranchTopology(targetId, {
    ...options,
    workspace: ctx,
    cwd,
    vcs,
  });
  const sourceBranch = topology.branchName;

  // 1. Verify source task branch exists
  await assertSourceBranchExists(vcs, sourceBranch, topology.taskId, cwd);

  // 2. Resolve merge target and enforce trunk/parent and protected-branch policies
  const targetBranch = resolveMergeTarget(topology, options);

  // 3. Verify resolved target branch exists locally
  await assertTargetBranchExists(vcs, targetBranch, cwd, {
    recordedBase:
      !options.target &&
      !topology.isSubtask &&
      Boolean(topology.recordedBaseBranch),
  });

  // 4. Verify no active child subtask branches remain unmerged
  await assertNoActiveSubtasks(vcs, topology, cwd, options);

  // 5. Verify source branch does not carry unmerged commits from another active task branch
  await assertNoForeignTaskAncestry(
    vcs,
    topology,
    sourceBranch,
    targetBranch,
    cwd,
    options,
  );

  return {
    taskId: topology.taskId,
    topology,
    sourceBranch,
    targetBranch,
  };
}

/**
 * Atomically runs merge preflight guards before executing the two-phase task completion
 * ceremony and merging the task branch into its resolved target branch (RULE-21, RULE-22, RULE-28, RULE-32).
 * Merge-guard failures abort cleanly before any working-tree mutation, commit, or artifact deletion.
 */
export async function completeAndMergeTask(
  taskIdentifier?: string,
  options: CompleteAndMergeTaskOptions = {},
): Promise<CompleteAndMergeTaskResult> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;

  // 1. Run preflight guards prior to any commit or artifact deletion
  const preflight = await assertTaskMergePreflight(taskIdentifier, {
    target: options.target,
    force: options.force,
    cwd,
    vcs,
    workspace: ctx,
  });

  // 2. Execute two-phase commit completion ceremony and delete task artifact
  const completion = await completeTask(taskIdentifier ?? preflight.taskId, {
    commit: true,
    force: options.force,
    cwd,
    vcs,
    workspace: ctx,
  });

  // 3. Merge completed task branch into resolved target and delete task branch
  const merge = await mergeTaskBranch(completion.taskId, {
    target: options.target,
    keepBranch: options.keepBranch,
    force: options.force,
    cwd,
    vcs,
    workspace: ctx,
  });

  return {
    completion,
    merge,
  };
}

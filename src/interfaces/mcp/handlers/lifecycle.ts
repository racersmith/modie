/**
 * Cluster 2: Task Lifecycle State Machine MCP Tool Handlers.
 * Implements RULE-21, RULE-22, RULE-25, RULE-26, RULE-28, and RULE-32.
 */

import {
  assertTargetBranchExists,
  checkTaskItem,
  completeTask,
  computeTaskBranchTopology,
  detectGitBranch,
  getTaskStatus,
  mergeTaskBranch,
  resolveMergeTarget,
  resolveWorkspaceContext,
  startTaskBranch,
  type TaskStatusDetails,
  type WorkspaceContext,
} from "../../../core/index.ts";
import { McpToolError } from "../errors.ts";
import { renderTaskMissionBrief } from "../renderers/index.ts";
import type {
  CheckCriteriaInput,
  CheckCriteriaOutput,
  CompleteTaskInput,
  CompleteTaskOutput,
  StartTaskInput,
} from "../schemas.ts";
import { resolveActiveTaskId } from "./shared.ts";

/**
 * 4. start_task handler
 * Checks out or creates hierarchical task branch and returns the Markdown Mission Brief.
 */
export async function handleStartTask(
  args: StartTaskInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<string> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const taskId = await resolveActiveTaskId(args.task_id, ctx);
  try {
    await startTaskBranch(taskId, {
      base: args.base,
      cwd,
      workspace: ctx,
    });
  } catch (err: any) {
    throw McpToolError.invalidParameter({
      message: `Failed to start task "${taskId}": ${err?.message}`,
      parameter: args.base ? "base" : "task_id",
      tool: "start_task",
    });
  }

  let status: TaskStatusDetails;
  try {
    status = await getTaskStatus(taskId, {
      cwd,
      workspace: ctx,
    });
  } catch (err: any) {
    throw McpToolError.artifactNotFound({
      message: err?.message ?? `Task "${taskId}" was not found.`,
      identifier: taskId,
    });
  }

  const activeBranch = await detectGitBranch(ctx);
  return renderTaskMissionBrief(status, activeBranch, cwd);
}

/**
 * 5. check_criteria handler
 * Atomically marks one or more acceptance criteria complete or incomplete.
 */
export async function handleCheckCriteria(
  args: CheckCriteriaInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<CheckCriteriaOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const taskId = await resolveActiveTaskId(args.task_id, ctx);

  for (const itemIndex of args.items) {
    try {
      await checkTaskItem(taskId, itemIndex, {
        completed: !args.uncheck,
        cwd,
        workspace: ctx,
      });
    } catch (err: any) {
      throw McpToolError.invalidParameter({
        message: `Failed to check criteria item ${itemIndex} on task "${taskId}": ${err?.message}`,
        parameter: "items",
        tool: "check_criteria",
      });
    }
  }

  const status = await getTaskStatus(taskId, {
    cwd,
    workspace: ctx,
  });
  const acceptanceCriteria = (status.acceptanceCriteria ?? []).map((c, i) => ({
    item: i + 1,
    text: c.text,
    completed: c.completed,
  }));

  return {
    taskId: status.fullTaskId || `TASK-${status.id}`,
    checkedItems: args.items,
    progress: status.criteriaProgress,
    allCriteriaSatisfied: status.allCriteriaSatisfied,
    acceptanceCriteria,
  };
}

/**
 * 6. complete_task handler
 * Verifies criteria, executes two-phase commit ceremony, merges to target branch, and deletes task branch.
 */
export async function handleCompleteTask(
  args: CompleteTaskInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<CompleteTaskOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const taskId = await resolveActiveTaskId(args.task_id, ctx);

  // 1. Pre-validate merge target resolution and existence before artifact deletion/commits
  const topology = await computeTaskBranchTopology(taskId, {
    cwd,
    workspace: ctx,
  });
  const resolvedTarget = resolveMergeTarget(topology, {
    target: args.target,
  });
  await assertTargetBranchExists(ctx.vcs, resolvedTarget, cwd, {
    recordedBase:
      !args.target &&
      !topology.isSubtask &&
      Boolean(topology.recordedBaseBranch),
  });

  // 2. Complete task (verifies criteria, two-phase commit, deletes task artifact)
  const completeResult = await completeTask(taskId, {
    commit: true,
    cwd,
    workspace: ctx,
  });

  // 3. Merge task branch into resolved target and delete task branch
  const mergeResult = await mergeTaskBranch(taskId, {
    target: args.target,
    cwd,
    workspace: ctx,
  });

  return {
    taskId: `TASK-${completeResult.taskId}`,
    merged: true,
    targetBranch: mergeResult.targetBranch,
    deletedBranch: mergeResult.sourceBranch,
    message: `Completed TASK-${completeResult.taskId} and merged ${mergeResult.sourceBranch} into ${mergeResult.targetBranch}.`,
  };
}

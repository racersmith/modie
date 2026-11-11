/**
 * Hierarchical task branching automation and protected branch enforcement.
 * Complies with RULE-21, RULE-28, and RULE-33.
 */

import { readFile } from "node:fs/promises";
import { loadModieConfig } from "../../platform/config/loader.ts";
import { inspectGitDeletedArtifacts } from "../traversal/artifact-history.ts";
import {
  formatTaskBranch,
  normalizeTaskId,
  parseSubtaskId,
  parseTaskBranch,
  parseTaskIdFromBranch,
  parseTaskMarkdown,
  taskBranchGlob,
  taskKey,
} from "../../domain/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context/index.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import { resolveTaskFile } from "./completion.ts";
import { scanActiveArtifacts } from "../traversal/active-scanner.ts";
import {
  detectArtifactCollisions,
  assertSourceBranchExists,
  assertTargetBranchExists,
  assertNoActiveSubtasks,
  assertNoCollisions,
  assertTaskCompleted,
  findTaskFileOnDisk,
} from "./branch-guard.ts";

export {
  detectArtifactCollisions,
  assertSourceBranchExists,
  assertTargetBranchExists,
  assertNoActiveSubtasks,
  assertNoCollisions,
  assertTaskCompleted,
  findTaskFileOnDisk,
};

import type {
  TaskBranchTopology,
} from "../../domain/index.ts";
import type {
  MergeTaskBranchOptions,
  MergeTaskBranchResult,
  StartTaskBranchOptions,
  StartTaskBranchResult,
} from "./types.ts";

/**
 * Resolves a task's ID and slug for branching operations.
 * Checks active tasks on disk, local git branches, and Git deletion logs.
 */
async function resolveTaskMetaForBranching(
  taskIdentifier: string,
  cwd: string,
  vcs: IVcsAdapter,
): Promise<{ id: string; slug: string; filepath?: string }> {
  // 1. Attempt to resolve active task on disk
  try {
    const filepath = await resolveTaskFile(taskIdentifier, {
      cwd,
      vcs,
    });
    const content = await readFile(filepath, "utf8");
    const parsed = parseTaskMarkdown(content, filepath);
    return {
      id: parsed.id,
      slug: parsed.slug,
      filepath,
    };
  } catch {
    // Not found as active on disk; fall through
  }

  const normalized = normalizeTaskId(taskIdentifier);

  // 2. Inspect deleted artifacts in Git history (ground truth for completed tasks)
  const deleted = await inspectGitDeletedArtifacts(cwd, "TASK", vcs);
  const matchDeleted = deleted.find(
    (d) => normalizeTaskId(d.id) === normalized,
  );
  if (matchDeleted) {
    return {
      id: matchDeleted.id,
      slug: matchDeleted.slug,
    };
  }

  // 3. Check local git branches matching task/<normalized>-*
  const branchList = await vcs.run(
    ["branch", "--list", `task/${normalized}-*`],
    cwd,
  );
  if (branchList && branchList.length > 0) {
    const firstBranch = branchList
      .split("\n")
      .map((b) => b.replace(/^\*?\s+/, "").trim())[0];
    const prefix = `task/${normalized}-`;
    if (firstBranch && firstBranch.startsWith(prefix)) {
      return {
        id: normalized,
        slug: firstBranch.slice(prefix.length),
      };
    }
  }

  throw new Error(
    `Cannot resolve task "${taskIdentifier}": No active artifact on disk, matching git branch, or git history record found.`,
  );
}

/**
 * Finds the parent task branch for a subtask per RULE-28.
 */
async function findParentTaskBranch(
  parentId: string,
  cwd: string,
  vcs: IVcsAdapter,
): Promise<string | undefined> {
  const normParent = normalizeTaskId(parentId);
  const normParentKey = taskKey(parentId);

  // 1. Check existing local git branches
  const branches = await vcs.run(
    ["branch", "--list", taskBranchGlob(normParent)],
    cwd,
  );
  if (branches) {
    const matched = branches
      .split("\n")
      .map((b) => b.replace(/^\*?\s+/, "").trim())
      .filter((b) => {
        // Exclude subtask branches of this parent (e.g. task/106-1-sub when looking for parent 106)
        const parsed = parseTaskBranch(b);
        return Boolean(parsed && parsed.taskId === normParent);
      });
    if (matched.length > 0 && matched[0]) {
      return matched[0];
    }
  }

  // 2. Check active task file on disk with exact ID match
  const activeTasks = (await scanActiveArtifacts(cwd, "TASK")).filter(
    (a) => !a.isArchived,
  );
  const parentTask = activeTasks.find((t) => taskKey(t.id) === normParentKey);
  if (parentTask) {
    return formatTaskBranch(normParent, parentTask.slug);
  }

  // 3. Check deleted artifacts in Git
  const deleted = await inspectGitDeletedArtifacts(cwd, "TASK", vcs);
  const matchDeleted = deleted.find((d) => taskKey(d.id) === normParentKey);
  if (matchDeleted && matchDeleted.slug) {
    return formatTaskBranch(normParent, matchDeleted.slug);
  }

  return undefined;
}

/**
 * Computes the branch topology for a task, determining parentage, base branch,
 * target branch, and protected branch status.
 */
export async function computeTaskBranchTopology(
  taskIdentifier: string,
  options: {
    base?: string;
    cwd?: string;
    vcs?: IVcsAdapter;
    workspace?: WorkspaceContext;
  } = {},
): Promise<TaskBranchTopology> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;
  const config = await loadModieConfig(cwd, vcs);
  const meta = await resolveTaskMetaForBranching(taskIdentifier, cwd, vcs);
  const currentBranch = await vcs.detectCurrentBranch(cwd);

  const subtaskInfo = parseSubtaskId(meta.id);
  const isSubtask = subtaskInfo !== null;
  const branchName = formatTaskBranch(meta.id, meta.slug);

  let parentBranchName: string | undefined;
  let expectedBaseBranch: string;

  if (isSubtask && subtaskInfo) {
    parentBranchName = await findParentTaskBranch(
      subtaskInfo.parentId,
      cwd,
      vcs,
    );
    expectedBaseBranch =
      options.base ??
      parentBranchName ??
      formatTaskBranch(subtaskInfo.parentId);
  } else {
    expectedBaseBranch = options.base ?? config.trunk;
  }

  const isCurrentBranchProtected = currentBranch
    ? config.protectedBranches.includes(currentBranch)
    : false;

  return {
    taskId: meta.id,
    slug: meta.slug,
    branchName,
    isSubtask,
    parentId: subtaskInfo?.parentId,
    subtaskSequence: subtaskInfo?.sequence,
    parentBranchName,
    expectedBaseBranch,
    currentBranch,
    isCurrentBranchProtected,
    trunkBranch: config.trunk,
    protectedBranches: config.protectedBranches,
  };
}

/**
 * Starts a task branch per RULE-28.
 * Validates branch hierarchy, guards against starting directly from protected branches,
 * and creates/checks out the task branch.
 */
export async function startTaskBranch(
  taskIdentifier: string,
  options: StartTaskBranchOptions = {},
): Promise<StartTaskBranchResult> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;
  const topology = await computeTaskBranchTopology(taskIdentifier, {
    ...options,
    workspace: ctx,
    cwd,
    vcs,
  });

  // 1. Guard against starting directly from a protected branch
  if (topology.isCurrentBranchProtected && !options.base && !options.force) {
    throw new Error(
      `Cannot start task from protected branch "${topology.currentBranch}". Protected branches cannot spawn task branches directly. Please switch to trunk branch "${topology.trunkBranch}" or specify --base.`,
    );
  }

  // 2. Validate subtask parent branch existence per RULE-28
  if (topology.isSubtask) {
    if (!topology.parentBranchName) {
      throw new Error(
        `Cannot start subtask "TASK-${topology.taskId}": Parent task "TASK-${topology.parentId}" does not have an active task branch or active artifact on disk. Subtasks must branch from their parent task branch per RULE-28.`,
      );
    }

    const parentExists = await vcs.branchExists(topology.parentBranchName, cwd);
    if (!parentExists) {
      throw new Error(
        `Cannot start subtask "TASK-${topology.taskId}": Parent task branch "${topology.parentBranchName}" does not exist in local git branches. Create or checkout the parent task branch first per RULE-28.`,
      );
    }
  }

  const baseBranch = options.base ?? topology.expectedBaseBranch;
  const targetExists = await vcs.branchExists(topology.branchName, cwd);

  // 3. Checkout or create the target branch
  if (targetExists) {
    if (topology.currentBranch !== topology.branchName) {
      await vcs.checkout(topology.branchName, cwd);
    }
    return {
      taskId: topology.taskId,
      slug: topology.slug,
      branchName: topology.branchName,
      baseBranch,
      created: false,
      isSubtask: topology.isSubtask,
      parentBranch: topology.parentBranchName,
    };
  }

  // Create new branch from baseBranch
  await vcs.checkoutNewBranch(topology.branchName, baseBranch, cwd);

  return {
    taskId: topology.taskId,
    slug: topology.slug,
    branchName: topology.branchName,
    baseBranch,
    created: true,
    isSubtask: topology.isSubtask,
    parentBranch: topology.parentBranchName,
  };
}

async function resolveTaskIdentifier(
  taskIdentifier: string | undefined,
  vcs: IVcsAdapter,
  cwd: string,
): Promise<string> {
  const trimmed = taskIdentifier?.trim();
  if (trimmed) {
    return trimmed;
  }
  const currentBranch = await vcs.detectCurrentBranch(cwd);
  const inferredId = parseTaskIdFromBranch(currentBranch);
  if (!inferredId) {
    const branchDisplay = currentBranch ? ` "${currentBranch}"` : "";
    throw new Error(
      `No task identifier provided and current git branch${branchDisplay} is not a task branch (expected "task/<id>-<slug>").`,
    );
  }
  return inferredId;
}

function resolveSubtaskTarget(
  topology: TaskBranchTopology,
  targetOverride?: string,
  force?: boolean,
): string {
  const targetBranch =
    targetOverride ?? topology.parentBranchName ?? topology.expectedBaseBranch;

  // RULE-28: Subtasks must never be merged directly into trunk
  if (targetBranch === topology.trunkBranch && !force) {
    throw new Error(
      `Subtask branch "${topology.branchName}" cannot be merged directly into trunk branch "${targetBranch}" per RULE-28. Subtasks must merge back into their parent task branch ("${topology.parentBranchName}").`,
    );
  }

  // Prohibit merging into protected branches
  if (topology.protectedBranches.includes(targetBranch) && !force) {
    throw new Error(
      `Cannot merge subtask branch "${topology.branchName}" into protected branch "${targetBranch}". Protected branches cannot receive direct task merges.`,
    );
  }

  return targetBranch;
}

function resolveRootTaskTarget(
  topology: TaskBranchTopology,
  targetOverride?: string,
  force?: boolean,
): string {
  const targetBranch = targetOverride ?? topology.trunkBranch;

  // Prohibit merging root tasks directly into protected branches
  if (topology.protectedBranches.includes(targetBranch) && !force) {
    throw new Error(
      `Cannot merge root task branch "${topology.branchName}" directly into protected branch "${targetBranch}". Merges must target trunk branch "${topology.trunkBranch}".`,
    );
  }

  return targetBranch;
}

/**
 * Resolves the merge target branch and enforces trunk vs parent and protected branch policies per RULE-28.
 */
export function resolveMergeTarget(
  topology: TaskBranchTopology,
  options: { target?: string; force?: boolean } = {},
): string {
  return topology.isSubtask
    ? resolveSubtaskTarget(topology, options.target, options.force)
    : resolveRootTaskTarget(topology, options.target, options.force);
}

/**
 * Executes the git merge ceremony and deletes the source task branch unless retained.
 */
export async function executeBranchMerge(
  vcs: IVcsAdapter,
  topology: TaskBranchTopology,
  sourceBranch: string,
  targetBranch: string,
  cwd: string,
  options: { keepBranch?: boolean } = {},
): Promise<MergeTaskBranchResult> {
  const mergeHash = await vcs.merge(
    sourceBranch,
    targetBranch,
    `merge: ${sourceBranch} into ${targetBranch}`,
    cwd,
  );

  const deleteSource = !options.keepBranch;
  if (deleteSource) {
    await vcs.deleteBranch(sourceBranch, cwd);
  }

  return {
    taskId: topology.taskId,
    slug: topology.slug,
    sourceBranch,
    targetBranch,
    deletedSourceBranch: deleteSource,
    isSubtask: topology.isSubtask,
    mergeCommitHash: mergeHash || undefined,
  };
}

/**
 * Merges a completed task branch back into its parent branch or trunk per RULE-28.
 * Validates branch hierarchy, verifies criteria satisfaction & artifact deletion,
 * guards against protected branch violations, and performs atomic merge.
 */
export async function mergeTaskBranch(
  taskIdentifier?: string,
  options: MergeTaskBranchOptions = {},
): Promise<MergeTaskBranchResult> {
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

  // 1. Verify source branch exists
  await assertSourceBranchExists(vcs, sourceBranch, topology.taskId, cwd);

  // 2. Verify completion status per RULE-21 and RULE-22
  await assertTaskCompleted(taskIdentifier, topology.taskId, sourceBranch, {
    cwd,
    vcs,
    force: options.force,
  });

  // 3. Determine and guard target branch per RULE-28
  const targetBranch = resolveMergeTarget(topology, options);

  // 4. Verify target branch exists in local git branches
  await assertTargetBranchExists(vcs, targetBranch, cwd);

  // 5. Verify all child subtasks have completed and merged per RULE-28
  await assertNoActiveSubtasks(vcs, topology, cwd, options);

  // 6. Pre-merge artifact collision guard (RULE-33)
  await assertNoCollisions(vcs, sourceBranch, targetBranch, cwd, options);

  // 7. Execute checkout, merge, and source branch deletion
  return executeBranchMerge(
    vcs,
    topology,
    sourceBranch,
    targetBranch,
    cwd,
    options,
  );
}

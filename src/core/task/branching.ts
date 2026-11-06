/**
 * Hierarchical task branching automation and protected branch enforcement.
 * Complies with ADR-6, ADR-9, ADR-10, RULE-21, RULE-28, and RULE-33.
 */

import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { loadModieConfig } from "../config/loader.ts";
import {
  detectGitBranch,
  inspectGitDeletedArtifacts,
  inspectGitTreeArtifacts,
  runGit,
  runGitCommand,
} from "../resolver/git-inspector.ts";
import type { DiscoveredArtifact, IndexableSubtype } from "../common/types.ts";
import {
  formatTaskBranch,
  formatTaskBranchName,
  normalizeTaskId,
  parseArtifactFilename,
  parseSubtaskId,
  parseTaskBranch,
  parseTaskIdFromBranch,
  taskBranchGlob,
  taskKey,
} from "../common/index.ts";
import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type { IVcsAdapter } from "../vcs/types.ts";
import { resolveTaskFile } from "./completion.ts";
import {
  ActiveSubtaskPendingError,
  ArtifactCollisionError,
  TaskIncompleteError,
} from "./errors.ts";
import { parseTaskMarkdown } from "./parser.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";

import type {
  ArtifactCollision,
  MergeTaskBranchOptions,
  MergeTaskBranchResult,
  StartTaskBranchOptions,
  StartTaskBranchResult,
  TaskBranchTopology,
} from "./types.ts";

export type { ArtifactCollision };
export {
  ActiveSubtaskPendingError,
  ArtifactCollisionError,
  TaskIncompleteError,
};

/**
 * Detects indexable artifact collisions between a source branch and a target branch prior to merge.
 * Complies with RULE-1, ADR-6, ADR-9, and RULE-33.
 */
export async function detectArtifactCollisions(
  sourceBranch: string,
  targetBranch: string,
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<ArtifactCollision[]> {
  const [sourceArtifacts, targetArtifacts] = await Promise.all([
    vcs.inspectTreeArtifacts(sourceBranch, cwd),
    vcs.inspectTreeArtifacts(targetBranch, cwd),
  ]);

  if (sourceArtifacts.length === 0 || targetArtifacts.length === 0) {
    return [];
  }

  // Find common ancestor commit between target and source branches
  const mergeBase = await vcs.mergeBase(targetBranch, sourceBranch, cwd);

  const baseArtifacts = mergeBase
    ? await vcs.inspectTreeArtifacts(mergeBase, cwd)
    : [];

  const baseMap = new Map<string, DiscoveredArtifact>();
  for (const art of baseArtifacts) {
    baseMap.set(art.tag.toUpperCase(), art);
  }

  const targetMap = new Map<string, DiscoveredArtifact>();
  const targetPathMap = new Map<string, DiscoveredArtifact>();
  for (const art of targetArtifacts) {
    targetMap.set(art.tag.toUpperCase(), art);
    targetPathMap.set(art.filepath, art);
  }

  const collisions: ArtifactCollision[] = [];
  const seenCollisions = new Set<string>();

  for (const sourceArt of sourceArtifacts) {
    const tagKey = sourceArt.tag.toUpperCase();
    const targetArt = targetMap.get(tagKey);
    const baseArt = baseMap.get(tagKey);

    if (targetArt) {
      if (!baseArt) {
        // Tag was created independently on both branches
        const key = `${tagKey}:${sourceArt.filepath}:${targetArt.filepath}:duplicate_tag`;
        if (!seenCollisions.has(key)) {
          seenCollisions.add(key);
          collisions.push({
            tag: sourceArt.tag,
            subtype: sourceArt.subtype,
            id: sourceArt.id,
            sourceFilepath: sourceArt.filepath,
            targetFilepath: targetArt.filepath,
            reason: "duplicate_tag",
          });
        }
      } else if (
        sourceArt.filepath !== targetArt.filepath &&
        sourceArt.filepath !== baseArt.filepath &&
        targetArt.filepath !== baseArt.filepath
      ) {
        // Artifact existed at base but filepaths diverged on both branches independently
        const key = `${tagKey}:${sourceArt.filepath}:${targetArt.filepath}:divergent_filepath`;
        if (!seenCollisions.has(key)) {
          seenCollisions.add(key);
          collisions.push({
            tag: sourceArt.tag,
            subtype: sourceArt.subtype,
            id: sourceArt.id,
            sourceFilepath: sourceArt.filepath,
            targetFilepath: targetArt.filepath,
            reason: "divergent_filepath",
          });
        }
      }
    }

    // Check for filepath collision with different tag
    const targetArtSamePath = targetPathMap.get(sourceArt.filepath);
    if (
      targetArtSamePath &&
      targetArtSamePath.tag.toUpperCase() !== sourceArt.tag.toUpperCase()
    ) {
      const key = `${sourceArt.filepath}:${sourceArt.tag}:${targetArtSamePath.tag}:filepath_conflict`;
      if (!seenCollisions.has(key)) {
        seenCollisions.add(key);
        collisions.push({
          tag: sourceArt.tag,
          subtype: sourceArt.subtype,
          id: sourceArt.id,
          sourceFilepath: sourceArt.filepath,
          targetFilepath: targetArtSamePath.filepath,
          reason: "filepath_conflict",
        });
      }
    }
  }

  return collisions;
}

/**
 * Resolves a task's ID and slug for branching operations.
 * Checks active tasks on disk, local git branches, and Git deletion logs.
 */
async function resolveTaskMetaForBranching(
  taskIdentifier: string,
  cwd: string,
  vcs: IVcsAdapter = defaultVcsAdapter,
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
  const deleted = await vcs.inspectDeletedArtifacts(cwd, "TASK");
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
 * Finds the parent task branch for a subtask per RULE-28 and ADR-9.
 */
async function findParentTaskBranch(
  parentId: string,
  cwd: string,
  vcs: IVcsAdapter = defaultVcsAdapter,
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
  const activeTasks = await scanActiveTasks(cwd);
  const parentTask = activeTasks.find(
    (t) => taskKey(t.id) === normParentKey,
  );
  if (parentTask) {
    return formatTaskBranch(normParent, parentTask.slug);
  }

  // 3. Check deleted artifacts in Git
  const deleted = await vcs.inspectDeletedArtifacts(cwd, "TASK");
  const matchDeleted = deleted.find(
    (d) => taskKey(d.id) === normParentKey,
  );
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
  options: { base?: string; cwd?: string; vcs?: IVcsAdapter } = {},
): Promise<TaskBranchTopology> {
  const cwd = options.cwd ?? process.cwd();
  const vcs = options.vcs ?? defaultVcsAdapter;
  const config = await loadModieConfig(cwd, vcs);
  const meta = await resolveTaskMetaForBranching(taskIdentifier, cwd, vcs);
  const currentBranch = await vcs.detectCurrentBranch(cwd);

  const subtaskInfo = parseSubtaskId(meta.id);
  const isSubtask = subtaskInfo !== null;
  const branchName = formatTaskBranchName(meta.id, meta.slug);

  let parentBranchName: string | undefined;
  let expectedBaseBranch: string;

  if (isSubtask && subtaskInfo) {
    parentBranchName = await findParentTaskBranch(
      subtaskInfo.parentId,
      cwd,
      vcs,
    );
    expectedBaseBranch =
      options.base ?? parentBranchName ?? formatTaskBranch(subtaskInfo.parentId);
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
 * Starts a task branch per RULE-28 and ADR-9.
 * Validates branch hierarchy, guards against starting directly from protected branches,
 * and creates/checks out the task branch.
 */
export async function startTaskBranch(
  taskIdentifier: string,
  options: StartTaskBranchOptions = {},
): Promise<StartTaskBranchResult> {
  const cwd = options.cwd ?? process.cwd();
  const vcs = options.vcs ?? defaultVcsAdapter;
  const topology = await computeTaskBranchTopology(taskIdentifier, {
    ...options,
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

/**
 * Verifies that the source task branch exists in the local git repository.
 */
export async function assertSourceBranchExists(
  vcs: IVcsAdapter,
  sourceBranch: string,
  taskId: string,
  cwd: string,
): Promise<void> {
  const sourceExists = await vcs.branchExists(sourceBranch, cwd);
  if (!sourceExists) {
    throw new Error(
      `Cannot merge task "TASK-${taskId}": Task branch "${sourceBranch}" does not exist in local git branches.`,
    );
  }
}

/**
 * Searches for an active task file on disk matching taskIdentifier or canonical taskId.
 */
async function findTaskFileOnDisk(
  taskIdentifier: string | undefined,
  taskId: string,
  cwd: string,
): Promise<string | null> {
  if (taskIdentifier) {
    const candidatePath = isAbsolute(taskIdentifier)
      ? taskIdentifier
      : resolve(cwd, taskIdentifier);
    try {
      const fileStat = await stat(candidatePath);
      if (fileStat.isFile()) {
        const parsed = parseArtifactFilename(basename(candidatePath));
        if (parsed && parsed.subtype === "TASK" && !parsed.isArchived) {
          return candidatePath;
        }
      }
    } catch {
      // not a direct accessible file path
    }
  }

  const activeTasks = await scanActiveTasks(cwd);
  const normId = normalizeTaskId(taskId);
  const trimmedIdent = taskIdentifier?.trim().toLowerCase();
  const match = activeTasks.find(
    (t) =>
      normalizeTaskId(t.id) === normId ||
      (trimmedIdent && t.slug.toLowerCase() === trimmedIdent),
  );
  return match ? match.filepath : null;
}

/**
 * Verifies that the task artifact has satisfied all acceptance criteria and completed
 * the completion ceremony (deletion per RULE-21) before merge.
 * Throws typed `TaskIncompleteError` on any completion failure.
 */
export async function assertTaskCompleted(
  taskIdentifier: string | undefined,
  taskId: string,
  sourceBranch: string,
  options: { cwd?: string; vcs?: IVcsAdapter; force?: boolean } = {},
): Promise<void> {
  if (options.force) {
    return;
  }

  const cwd = options.cwd ?? process.cwd();
  const vcs = options.vcs ?? defaultVcsAdapter;
  const filepath = await findTaskFileOnDisk(taskIdentifier, taskId, cwd);

  if (filepath !== null) {
    const content = await readFile(filepath, "utf8");
    const parsed = parseTaskMarkdown(content, filepath);
    const incomplete = parsed.acceptanceCriteria.filter((c) => !c.completed);

    if (incomplete.length > 0) {
      throw new TaskIncompleteError(
        `Cannot merge task branch "${sourceBranch}": Task "TASK-${taskId}" has ${incomplete.length} incomplete acceptance criteria. Verify all criteria before merging per RULE-22 and RULE-28.`,
        {
          taskId,
          reason: "incomplete_criteria",
          incompleteCriteriaCount: incomplete.length,
        },
      );
    }

    throw new TaskIncompleteError(
      `Cannot merge task branch "${sourceBranch}": Task "TASK-${taskId}" artifact has not been completed. Run 'modie task complete ${taskId}' to execute the completion ceremony before merging per RULE-21 and RULE-28.`,
      {
        taskId,
        reason: "artifact_not_completed",
      },
    );
  }

  // File not found on disk: verify that it was completed/deleted in Git
  const deleted = await vcs.inspectDeletedArtifacts(cwd, "TASK");
  const isDeletedInGit = deleted.some(
    (d) => normalizeTaskId(d.id) === normalizeTaskId(taskId),
  );

  if (!isDeletedInGit) {
    throw new TaskIncompleteError(
      `Cannot merge task branch "${sourceBranch}": Task "TASK-${taskId}" has neither an active verified artifact nor a completion record in Git history per RULE-21.`,
      {
        taskId,
        reason: "no_completion_record",
      },
    );
  }
}

function resolveSubtaskTarget(
  topology: TaskBranchTopology,
  targetOverride?: string,
  force?: boolean,
): string {
  const targetBranch =
    targetOverride ??
    topology.parentBranchName ??
    topology.expectedBaseBranch;

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
 * Verifies that the target merge branch exists in the local git repository.
 */
export async function assertTargetBranchExists(
  vcs: IVcsAdapter,
  targetBranch: string,
  cwd: string,
): Promise<void> {
  const targetExists = await vcs.branchExists(targetBranch, cwd);
  if (!targetExists) {
    throw new Error(
      `Cannot merge into target branch "${targetBranch}": Branch does not exist in local git repository.`,
    );
  }
}

/**
 * Verifies that all child subtasks have completed and merged back into the parent
 * task branch before merging into trunk per RULE-28.
 * Throws typed `ActiveSubtaskPendingError` if active child subtask branches exist.
 */
export async function assertNoActiveSubtasks(
  vcs: IVcsAdapter,
  topology: TaskBranchTopology,
  cwd: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (topology.isSubtask || options.force) {
    return;
  }

  const normId = normalizeTaskId(topology.taskId);
  const subtaskBranchesOut = await vcs.run(
    ["branch", "--list", `task/${normId}-*`],
    cwd,
  );
  if (!subtaskBranchesOut || subtaskBranchesOut.length === 0) {
    return;
  }

  const activeChildBranches = subtaskBranchesOut
    .split("\n")
    .map((b) => b.replace(/^\*?\s+/, "").trim())
    .filter(
      (b) =>
        new RegExp(`^task/${normId}-\\d+-`).test(b) &&
        b !== topology.branchName,
    );

  if (activeChildBranches.length > 0) {
    throw new ActiveSubtaskPendingError(
      `Cannot merge parent task branch "${topology.branchName}" into trunk: Active child subtask branch "${activeChildBranches[0]}" has not been merged into parent branch per RULE-28.`,
      {
        parentTaskId: topology.taskId,
        activeSubtaskBranches: activeChildBranches,
      },
    );
  }
}

/**
 * Verifies that no newly introduced or renamed artifacts collide with artifacts
 * on the target branch per RULE-33.
 * Throws typed `ArtifactCollisionError` when collisions are detected unless forced.
 */
export async function assertNoCollisions(
  vcs: IVcsAdapter,
  sourceBranch: string,
  targetBranch: string,
  cwd: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (options.force) {
    return;
  }

  const collisions = await detectArtifactCollisions(
    sourceBranch,
    targetBranch,
    cwd,
    vcs,
  );

  if (collisions.length > 0) {
    const details = collisions
      .map(
        (c) =>
          `  - ${c.tag}: source "${c.sourceFilepath}" collides with target "${c.targetFilepath}" (${c.reason})`,
      )
      .join("\n");
    throw new ArtifactCollisionError(
      `Cannot merge task branch "${sourceBranch}" into "${targetBranch}": ${collisions.length} artifact collision(s) detected:\n${details}\nResolve collisions or pass --force to override.`,
      {
        sourceBranch,
        targetBranch,
        collisions,
      },
    );
  }
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

  const deleteSource = !Boolean(options.keepBranch);
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
  const cwd = options.cwd ?? process.cwd();
  const vcs = options.vcs ?? defaultVcsAdapter;
  const targetId = await resolveTaskIdentifier(taskIdentifier, vcs, cwd);
  const topology = await computeTaskBranchTopology(targetId, {
    ...options,
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

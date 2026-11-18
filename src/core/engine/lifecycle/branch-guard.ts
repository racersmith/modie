/**
 * Modie Core: Task Branch Guard & Collision Detection Service (RULE-21, RULE-28, RULE-33).
 *
 * Enforces tree collision guards, pre-merge branch validation, subtask hierarchy integrity,
 * and completion ceremony verification before task merges.
 */

import { basename, isAbsolute, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import {
  type WorkspaceContext,
  resolveWorkspaceContext,
} from "../context/index.ts";
import {
  inspectGitTreeArtifacts,
  inspectGitDeletedArtifacts,
} from "../traversal/artifact-history.ts";
import { scanActiveArtifacts } from "../traversal/active-scanner.ts";
import {
  escapeRegex,
  isMultiLevelSubtaskId,
  normalizeTaskId,
  parseArtifactFilename,
  parseSubtaskId,
  parseTaskBranch,
  parseTaskMarkdown,
  type ArtifactCollision,
  type DiscoveredArtifact,
  type TaskBranchTopology,
} from "../../domain/index.ts";
import {
  ActiveSubtaskPendingError,
  ArtifactCollisionError,
  ForeignBranchAncestryError,
  TaskIncompleteError,
} from "./errors.ts";

/**
 * Searches for an active task file on disk matching taskIdentifier or canonical taskId.
 */
export async function findTaskFileOnDisk(
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

  const activeTasks = (await scanActiveArtifacts(cwd, "TASK")).filter(
    (a) => !a.isArchived,
  );
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
 * Helper to check collisions for a single source artifact against target and base trees.
 */
function checkArtifactCollision(
  sourceArt: DiscoveredArtifact,
  targetMap: Map<string, DiscoveredArtifact>,
  baseMap: Map<string, DiscoveredArtifact>,
  targetPathMap: Map<string, DiscoveredArtifact>,
  seenCollisions: Set<string>,
): ArtifactCollision[] {
  const collisions: ArtifactCollision[] = [];
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

  return collisions;
}

/**
 * Detects indexable artifact collisions between a source branch and a target branch prior to merge.
 * Complies with RULE-1 and RULE-33.
 */
export async function detectArtifactCollisions(
  sourceBranch: string,
  targetBranch: string,
  cwdOrContext?: string | WorkspaceContext,
  vcs?: IVcsAdapter,
): Promise<ArtifactCollision[]> {
  const ctx = resolveWorkspaceContext(cwdOrContext, vcs);
  const cwd = ctx.root;
  const effectiveVcs = ctx.vcs;

  const [sourceArtifacts, targetArtifacts] = await Promise.all([
    inspectGitTreeArtifacts(sourceBranch, cwd, undefined, effectiveVcs),
    inspectGitTreeArtifacts(targetBranch, cwd, undefined, effectiveVcs),
  ]);

  if (sourceArtifacts.length === 0 || targetArtifacts.length === 0) {
    return [];
  }

  // Find common ancestor commit between target and source branches
  const mergeBase = await effectiveVcs.mergeBase(
    targetBranch,
    sourceBranch,
    cwd,
  );

  const baseArtifacts = mergeBase
    ? await inspectGitTreeArtifacts(mergeBase, cwd, undefined, vcs)
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
    const artCollisions = checkArtifactCollision(
      sourceArt,
      targetMap,
      baseMap,
      targetPathMap,
      seenCollisions,
    );
    collisions.push(...artCollisions);
  }

  return collisions;
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

  const escapedNormId = escapeRegex(normId);
  const childBranchRegex = new RegExp(`^task/${escapedNormId}-\\d+-`);
  const activeChildBranches = subtaskBranchesOut
    .split("\n")
    .map((b) => b.replace(/^\*?\s+/, "").trim())
    .filter(
      (b) =>
        childBranchRegex.test(b) &&
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
 * Verifies that the task artifact has satisfied all acceptance criteria and completed
 * the completion ceremony (deletion per RULE-21) before merge.
 * Throws typed `TaskIncompleteError` on any completion failure.
 */
export async function assertTaskCompleted(
  taskIdentifier: string | undefined,
  taskId: string,
  sourceBranch: string,
  options: {
    cwd?: string;
    vcs?: IVcsAdapter;
    force?: boolean;
    workspace?: WorkspaceContext;
  } = {},
): Promise<void> {
  if (options.force) {
    return;
  }

  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;
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
  const deleted = await inspectGitDeletedArtifacts(cwd, "TASK", vcs);
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

/**
 * Verifies that there are no uncommitted tracked/staged working tree changes
 * before executing branch-switching start or merge operations.
 */
export async function assertCleanTrackedWorkingTree(
  vcs: IVcsAdapter,
  cwd: string,
  operation: "start" | "merge",
  options: { force?: boolean } = {},
): Promise<void> {
  if (options.force) {
    return;
  }

  const porcelain = await vcs.getStatusPorcelain(cwd);
  const dirtyTracked = porcelain
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0 && !l.startsWith("?? "));

  if (dirtyTracked.length > 0) {
    throw new Error(
      `Cannot ${operation} task branch with uncommitted tracked or staged changes:\n  ${dirtyTracked.join("\n  ")}\nCommit or stash your changes first (or pass --force to override).`,
    );
  }
}

/**
 * Validates an explicit --base branch override when starting a task branch per RULE-28.
 */
export function assertValidStartBaseBranch(
  topology: TaskBranchTopology,
  base: string | undefined,
  options: { force?: boolean } = {},
): void {
  if (!base || options.force) {
    return;
  }

  if (topology.protectedBranches.includes(base)) {
    throw new Error(
      `Cannot start task "TASK-${topology.taskId}" from protected base branch "${base}". Protected branches cannot be used as task branch bases per RULE-28.`,
    );
  }

  const baseTask = parseTaskBranch(base);
  if (
    baseTask &&
    (parseSubtaskId(baseTask.taskId) !== null ||
      isMultiLevelSubtaskId(baseTask.taskId))
  ) {
    throw new Error(
      `Cannot start task "TASK-${topology.taskId}" from subtask branch "${base}" per RULE-28. Subtasks cannot spawn nested task branches.`,
    );
  }

  if (
    topology.isSubtask &&
    topology.parentBranchName &&
    base !== topology.parentBranchName
  ) {
    throw new Error(
      `Cannot start subtask "TASK-${topology.taskId}" from base branch "${base}" per RULE-28. Subtasks must branch from their parent task branch "${topology.parentBranchName}".`,
    );
  }
}

/**
 * Verifies that a pre-existing subtask branch has not diverged onto trunk history
 * absent from its parent task branch per RULE-28.
 */
export async function assertSubtaskBranchAncestry(
  vcs: IVcsAdapter,
  topology: TaskBranchTopology,
  cwd: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (!topology.isSubtask || !topology.parentBranchName || options.force) {
    return;
  }

  const subTrunkMb = await vcs.mergeBase(
    topology.branchName,
    topology.trunkBranch,
    cwd,
  );
  if (!subTrunkMb) {
    return;
  }

  const inParent = await vcs.isAncestor(
    subTrunkMb,
    topology.parentBranchName,
    cwd,
  );
  if (!inParent) {
    throw new Error(
      `Subtask branch "${topology.branchName}" contains trunk history (${subTrunkMb}) not present in parent branch "${topology.parentBranchName}" per RULE-28. Rebase onto "${topology.parentBranchName}" or pass --force to override.`,
    );
  }
}

/**
 * Verifies before merging into trunk that the source branch does not carry
 * unmerged commits inherited from another active task branch per RULE-28.
 */
export async function assertNoForeignTaskAncestry(
  vcs: IVcsAdapter,
  topology: TaskBranchTopology,
  sourceBranch: string,
  targetBranch: string,
  cwd: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (targetBranch !== topology.trunkBranch || options.force) {
    return;
  }

  const branches = await vcs.listBranches(cwd);
  for (const otherBranch of branches) {
    if (otherBranch === sourceBranch || otherBranch === targetBranch) {
      continue;
    }
    if (!parseTaskBranch(otherBranch)) {
      continue;
    }

    const mb = await vcs.mergeBase(sourceBranch, otherBranch, cwd);
    if (!mb) {
      continue;
    }

    const mbInTrunk = await vcs.isAncestor(mb, targetBranch, cwd);
    if (!mbInTrunk) {
      throw new ForeignBranchAncestryError(
        `Cannot merge "${sourceBranch}" into trunk "${targetBranch}": source branch contains unmerged commit (${mb}) from active task branch "${otherBranch}" per RULE-28. Merge into the parent branch or pass --force to override.`,
        {
          sourceBranch,
          targetBranch,
          foreignTaskBranch: otherBranch,
          sharedCommit: mb,
        },
      );
    }
  }
}

/**
 * Hierarchical task branching automation and protected branch enforcement.
 * Complies with ADR-6, ADR-9, ADR-10, RULE-21, RULE-28, and RULE-33.
 */

import { readFile } from "node:fs/promises";
import { loadModieConfig } from "../config/loader.ts";
import {
  detectGitBranch,
  inspectGitDeletedArtifacts,
  inspectGitTreeArtifacts,
  runGit,
  runGitCommand,
} from "../resolver/git-inspector.ts";
import type { DiscoveredArtifact, IndexableSubtype } from "../common/types.ts";
import { parseTaskIdFromBranch } from "../common/index.ts";
import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type { IVcsAdapter } from "../vcs/types.ts";
import { normalizeTaskId, resolveTaskFile } from "./completion.ts";
import { parseTaskMarkdown } from "./parser.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";
import type {
  MergeTaskBranchOptions,
  MergeTaskBranchResult,
  StartTaskBranchOptions,
  StartTaskBranchResult,
  TaskBranchTopology,
} from "./types.ts";

/**
 * Formats canonical task branch name: `task/<id>-<slug>`
 */
export function formatTaskBranchName(taskId: string, slug: string): string {
  const normId = normalizeTaskId(taskId);
  return `task/${normId}-${slug}`;
}

/**
 * Parses subtask parent ID and sequence from task ID token per ADR-9.
 * Subtasks follow `TASK-<parentId>-<sequence>` (e.g. `2-1`, `11-2`, `J101-1`).
 */
export function parseSubtaskId(
  taskId: string,
): { parentId: string; sequence: string } | null {
  const normId = normalizeTaskId(taskId);
  const match = normId.match(/^([A-Za-z0-9]+)-([0-9]+)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    parentId: match[1],
    sequence: match[2],
  };
}

/**
 * Checks whether a local git branch exists.
 */
export async function branchExists(
  branchName: string,
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<boolean> {
  return vcs.branchExists(branchName, cwd);
}

export interface ArtifactCollision {
  tag: string;
  subtype: IndexableSubtype;
  id: string;
  sourceFilepath: string;
  targetFilepath: string;
  reason: "duplicate_tag" | "divergent_filepath" | "filepath_conflict";
}

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
      allowZombie: true,
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

  // 1. Check existing local git branches
  const branches = await vcs.run(
    ["branch", "--list", `task/${normParent}-*`],
    cwd,
  );
  if (branches) {
    const matched = branches
      .split("\n")
      .map((b) => b.replace(/^\*?\s+/, "").trim())
      .filter((b) => {
        // Exclude subtask branches of this parent (e.g. task/106-1-sub when looking for parent 106)
        const match = b.match(/^task\/([A-Za-z0-9]+)-(.*)$/);
        return Boolean(
          match &&
          match[1] === normParent &&
          match[2] &&
          !/^\d+-/.test(match[2]),
        );
      });
    if (matched.length > 0 && matched[0]) {
      return matched[0];
    }
  }

  // 2. Check active task file on disk with exact ID match
  const activeTasks = await scanActiveTasks(cwd);
  const parentTask = activeTasks.find(
    (t) => normalizeTaskId(t.id).toLowerCase() === normParent.toLowerCase(),
  );
  if (parentTask) {
    return `task/${normParent}-${parentTask.slug}`;
  }

  // 3. Check deleted artifacts in Git
  const deleted = await vcs.inspectDeletedArtifacts(cwd, "TASK");
  const matchDeleted = deleted.find(
    (d) => normalizeTaskId(d.id).toLowerCase() === normParent.toLowerCase(),
  );
  if (matchDeleted && matchDeleted.slug) {
    return `task/${normParent}-${matchDeleted.slug}`;
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
    parentBranchName = await findParentTaskBranch(subtaskInfo.parentId, cwd, vcs);
    expectedBaseBranch =
      options.base ?? parentBranchName ?? `task/${subtaskInfo.parentId}`;
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
  const topology = await computeTaskBranchTopology(taskIdentifier, { ...options, vcs });

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
  let targetId = taskIdentifier?.trim();

  if (!targetId) {
    const currentBranch = await vcs.detectCurrentBranch(cwd);
    const inferredId = parseTaskIdFromBranch(currentBranch);
    if (!inferredId) {
      const branchDisplay = currentBranch ? ` "${currentBranch}"` : "";
      throw new Error(
        `No task identifier provided and current git branch${branchDisplay} is not a task branch (expected "task/<id>-<slug>").`,
      );
    }
    targetId = inferredId;
  }
  const topology = await computeTaskBranchTopology(targetId, { ...options, vcs });
  const sourceBranch = topology.branchName;

  // 1. Verify source branch exists
  const sourceExists = await vcs.branchExists(sourceBranch, cwd);
  if (!sourceExists) {
    throw new Error(
      `Cannot merge task "TASK-${topology.taskId}": Task branch "${sourceBranch}" does not exist in local git branches.`,
    );
  }

  // 2. Verify completion status per RULE-21 and RULE-22
  try {
    const filepath = await resolveTaskFile(taskIdentifier, {
      cwd,
      allowZombie: true,
      vcs,
    });
    const content = await readFile(filepath, "utf8");
    const parsed = parseTaskMarkdown(content, filepath);
    const incomplete = parsed.acceptanceCriteria.filter((c) => !c.completed);

    if (incomplete.length > 0 && !options.force) {
      throw new Error(
        `Cannot merge task branch "${sourceBranch}": Task "TASK-${topology.taskId}" has ${incomplete.length} incomplete acceptance criteria. Verify all criteria before merging per RULE-22 and RULE-28.`,
      );
    }

    if (!options.force) {
      throw new Error(
        `Cannot merge task branch "${sourceBranch}": Task "TASK-${topology.taskId}" artifact has not been completed. Run 'modie task complete ${topology.taskId}' to execute the completion ceremony before merging per RULE-21 and RULE-28.`,
      );
    }
  } catch (error: unknown) {
    // If resolveTaskFile fails because file was deleted (or zombie), verify completion
    if (
      error instanceof Error &&
      error.message.includes("incomplete acceptance criteria")
    ) {
      throw error;
    }
    if (
      error instanceof Error &&
      error.message.includes("artifact has not been completed")
    ) {
      throw error;
    }
    // File not found on disk: verify that it was completed/deleted in Git
    const deleted = await vcs.inspectDeletedArtifacts(cwd, "TASK");
    const isDeletedInGit = deleted.some(
      (d) => normalizeTaskId(d.id) === normalizeTaskId(topology.taskId),
    );
    if (!isDeletedInGit && !options.force) {
      throw new Error(
        `Cannot merge task branch "${sourceBranch}": Task "TASK-${topology.taskId}" has neither an active verified artifact nor a completion record in Git history per RULE-21.`,
      );
    }
  }

  // 3. Determine and guard target branch
  let targetBranch: string;

  if (topology.isSubtask) {
    targetBranch =
      options.target ?? topology.parentBranchName ?? topology.expectedBaseBranch;

    // RULE-28: Subtasks must never be merged directly into trunk
    if (targetBranch === topology.trunkBranch && !options.force) {
      throw new Error(
        `Subtask branch "${sourceBranch}" cannot be merged directly into trunk branch "${targetBranch}" per RULE-28. Subtasks must merge back into their parent task branch ("${topology.parentBranchName}").`,
      );
    }

    // Prohibit merging into protected branches
    if (topology.protectedBranches.includes(targetBranch) && !options.force) {
      throw new Error(
        `Cannot merge subtask branch "${sourceBranch}" into protected branch "${targetBranch}". Protected branches cannot receive direct task merges.`,
      );
    }
  } else {
    targetBranch = options.target ?? topology.trunkBranch;

    // Prohibit merging root tasks directly into protected branches
    if (topology.protectedBranches.includes(targetBranch) && !options.force) {
      throw new Error(
        `Cannot merge root task branch "${sourceBranch}" directly into protected branch "${targetBranch}". Merges must target trunk branch "${topology.trunkBranch}".`,
      );
    }

    // Verify all child subtasks have completed and merged per RULE-28
    const normId = normalizeTaskId(topology.taskId);
    const subtaskBranchesOut = await vcs.run(
      ["branch", "--list", `task/${normId}-*`],
      cwd,
    );
    if (subtaskBranchesOut && subtaskBranchesOut.length > 0) {
      const activeChildBranches = subtaskBranchesOut
        .split("\n")
        .map((b) => b.replace(/^\*?\s+/, "").trim())
        .filter(
          (b) =>
            new RegExp(`^task/${normId}-\\d+-`).test(b) && b !== sourceBranch,
        );

      if (activeChildBranches.length > 0 && !options.force) {
        throw new Error(
          `Cannot merge parent task branch "${sourceBranch}" into trunk: Active child subtask branch "${activeChildBranches[0]}" has not been merged into parent branch per RULE-28.`,
        );
      }
    }
  }

  // 4. Verify target branch exists in local git branches
  const targetExists = await vcs.branchExists(targetBranch, cwd);
  if (!targetExists) {
    throw new Error(
      `Cannot merge into target branch "${targetBranch}": Branch does not exist in local git repository.`,
    );
  }

  // Pre-merge artifact collision guard (RULE-33)
  if (!options.force) {
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
      throw new Error(
        `Cannot merge task branch "${sourceBranch}" into "${targetBranch}": ${collisions.length} artifact collision(s) detected:\n${details}\nResolve collisions or pass --force to override.`,
      );
    }
  }

  // 5. Execute checkout and merge
  const mergeHash = await vcs.merge(
    sourceBranch,
    targetBranch,
    `merge: ${sourceBranch} into ${targetBranch}`,
    cwd,
  );

  // 6. Delete source branch unless keepBranch is specified
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

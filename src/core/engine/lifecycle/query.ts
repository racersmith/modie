/**
 * Active task queue query service and DAG dependency readiness evaluation.
 * Implements RULE-18, RULE-21 and RULE-22.
 */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import {
  compareTaskIds,
  parseTaskIdFromBranch,
  parseTaskMarkdown,
  taskKey,
  type DiscoveredArtifact,
} from "../../domain/index.ts";
import { scanActiveArtifacts } from "../traversal/active-scanner.ts";
import { detectGitBranch } from "../traversal/git-inspector.ts";
import { resolveWorkspaceContext } from "../context/resolver.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import { computeTaskBranchTopology } from "./branching.ts";
import { resolveTaskFile } from "./completion.ts";
import { queryTaskHistory } from "./history-query.ts";
import {
  type TaskQueueItem,
  type RawTaskDataRecord,
  buildActiveTaskMap,
  buildTaskQueueItems,
  filterTaskQueueItems,
} from "./readiness.ts";

export interface TaskQueueQueryOptions {
  /**
   * Root directory for active task scanning.
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;

  /**
   * Filter to only include unblocked tasks ready for execution (readiness === "READY").
   */
  readyOnly?: boolean;

  /**
   * Filter to only include blocked tasks waiting on dependencies (readiness === "BLOCKED").
   */
  blockedOnly?: boolean;

  /**
   * Generic filter selector: "all", "ready", or "blocked".
   */
  filter?: "all" | "ready" | "blocked";

  /**
   * Optional scope directory path filter (only tasks within this directory will be returned).
   */
  scope?: string;

  /**
   * Pre-provided active task metadata (useful for isolated unit testing).
   */
  activeTasks?: DiscoveredArtifact[];

  /**
   * Optional git branch name override for resolving the current active task.
   */
  currentBranch?: string;

  /**
   * Explicit current task ID override.
   */
  currentTaskId?: string;
}

export interface TaskStatusQueryOptions {
  /**
   * Root directory for task resolution.
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;

  /**
   * Whether to query completed task history and branches in Git when the task
   * is not active on disk (RULE-21). Defaults to false.
   */
  history?: boolean;

  /**
   * Optional VCS adapter override.
   */
  vcs?: IVcsAdapter;
}

export interface TaskStatusDetails extends TaskQueueItem {
  incompleteCriteria: string[];
  baseBranch?: string;
  targetBranch?: string;
}

type RawTaskRecord = RawTaskDataRecord;

async function loadRawTaskFiles(
  discovered: DiscoveredArtifact[],
  cwd: string,
): Promise<RawTaskRecord[]> {
  const rawTasks: RawTaskRecord[] = [];
  for (const disc of discovered) {
    try {
      const content = await readFile(disc.filepath, "utf8");
      const parsed = parseTaskMarkdown(content, disc.filepath);
      const relPath = relative(cwd, disc.filepath);
      rawTasks.push({
        discovered: disc,
        parsed,
        relativePath: relPath,
      });
    } catch {
      // If a file cannot be read, skip gracefully
    }
  }
  return rawTasks;
}

async function resolveNormalizedCurrentTaskId(
  cwd: string,
  options: TaskQueueQueryOptions,
): Promise<string | null> {
  const currentBranch = options.currentBranch ?? (await detectGitBranch(cwd));
  const currentTaskId =
    options.currentTaskId ??
    (currentBranch ? parseTaskIdFromBranch(currentBranch) : null);
  return currentTaskId ? taskKey(currentTaskId) : null;
}

/**
 * Queries the active task queue on disk, parses acceptance criteria progress,
 * and computes DAG dependency readiness (READY vs BLOCKED) per RULE-18.
 *
 * @param options Query and filtering options.
 */
export async function queryTaskQueue(
  options: TaskQueueQueryOptions = {},
): Promise<TaskQueueItem[]> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

  // 1. Discover active task files on disk and read markdown content
  const discovered =
    options.activeTasks ??
    (await scanActiveArtifacts(cwd, "TASK")).filter((a) => !a.isArchived);
  const rawTasks = await loadRawTaskFiles(discovered, cwd);

  // 2. Build active task ID lookup map for DAG evaluation
  const activeTaskMap = buildActiveTaskMap(rawTasks);

  // 3. Resolve current task ID from active git branch topology or options
  const normCurrentId = await resolveNormalizedCurrentTaskId(cwd, options);

  // 4. Compute DAG dependency readiness and criteria progress for each task
  const items = buildTaskQueueItems(rawTasks, activeTaskMap, normCurrentId);

  // 5. Sort tasks deterministically
  items.sort((a, b) => compareTaskIds(a.id, b.id));

  // 6. Apply filtering
  return filterTaskQueueItems(items, options);
}

/**
 * Resolves the active task for the currently checked-out git branch.
 * Returns null if not on a task branch or if the corresponding task file
 * does not exist on disk (unless `history: true` is specified).
 */
export async function resolveCurrentTask(
  options: {
    cwd?: string;
    branch?: string;
    history?: boolean;
    vcs?: IVcsAdapter;
    workspace?: WorkspaceContext;
  } = {},
): Promise<TaskStatusDetails | null> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const branch = options.branch ?? (await detectGitBranch(cwd, ctx.vcs));
  if (!branch) {
    return null;
  }

  const taskId = parseTaskIdFromBranch(branch);
  if (!taskId) {
    return null;
  }

  try {
    return await getTaskStatus(taskId, {
      cwd,
      history: options.history,
      vcs: ctx.vcs,
      workspace: ctx,
    });
  } catch {
    return null;
  }
}

/**
 * Queries detailed status and inspection details for a specific task.
 * By default, strictly searches active .md files on disk.
 * When `options.history` is true, also searches completed task history and branches in Git.
 *
 * @param taskIdentifier Task ID (e.g. "TASK-9", "9"), slug, or filepath.
 * @param options Query options including cwd and history flag.
 */
export async function getTaskStatus(
  taskIdentifier: string,
  options: TaskStatusQueryOptions = {},
): Promise<TaskStatusDetails> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

  try {
    const filepath = await resolveTaskFile(taskIdentifier, {
      cwd,
      vcs: ctx.vcs,
      workspace: ctx,
    });

    const queue = await queryTaskQueue({
      cwd,
      workspace: ctx,
    });
    const item = queue.find((t) => t.filepath === filepath);

    if (!item) {
      throw new Error(
        `Failed to locate task "${taskIdentifier}" in active task queue on disk.`,
      );
    }

    const incompleteCriteria = item.acceptanceCriteria
      .filter((c) => !c.completed)
      .map((c) => c.text);

    let branch = item.branch;
    let baseBranch: string | undefined;
    let targetBranch: string | undefined;

    if (await ctx.vcs.isInsideWorkTree(cwd)) {
      try {
        const topology = await computeTaskBranchTopology(item.id, {
          cwd,
          vcs: ctx.vcs,
          workspace: ctx,
        });
        const exists = await ctx.vcs.branchExists(topology.branchName, cwd);
        if (exists) {
          branch = topology.branchName;
        }
        if (topology.isSubtask) {
          const parent = topology.parentBranchName ?? topology.expectedBaseBranch;
          baseBranch = parent;
          targetBranch = parent;
        } else if (exists) {
          const origin = topology.recordedBaseBranch ?? topology.trunkBranch;
          baseBranch = origin;
          targetBranch = origin;
        } else {
          baseBranch = topology.expectedBaseBranch;
          targetBranch = topology.expectedBaseBranch;
        }
      } catch {
        // Graceful fallback if branch topology cannot be resolved
      }
    }

    return {
      ...item,
      branch,
      baseBranch,
      targetBranch,
      incompleteCriteria,
    };
  } catch (activeError: unknown) {
    if (!options.history) {
      throw activeError;
    }

    const trimmed = taskIdentifier.trim();
    const normalizedInput = taskKey(trimmed);
    const historyItems = await queryTaskHistory({ cwd, vcs: options.vcs });

    const matched =
      historyItems.find(
        (t) =>
          taskKey(t.id) === normalizedInput ||
          t.fullTaskId.toLowerCase() === trimmed.toLowerCase() ||
          t.slug.toLowerCase() === trimmed.toLowerCase(),
      ) ??
      historyItems.find((t) =>
        t.slug.toLowerCase().includes(trimmed.toLowerCase()),
      );

    if (!matched) {
      throw new Error(
        `Task "${trimmed}" was not found among active tasks on disk or in Git history and branches.`,
      );
    }

    const incompleteCriteria = matched.acceptanceCriteria
      .filter((c) => !c.completed)
      .map((c) => c.text);

    return {
      ...matched,
      incompleteCriteria,
    };
  }
}

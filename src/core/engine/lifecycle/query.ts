/**
 * Active task queue query service, DAG dependency readiness evaluation,
 * and explicit historical task work querying.
 * Implements ADR-6, ADR-9, RULE-18, RULE-21, RULE-22, and RULE-25.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  compareTaskIds,
  normalizeTaskId,
  parseTaskBranch,
  parseTaskIdFromBranch,
  parseTaskMarkdown,
  slugToTitle,
  sortTaskIds,
  sortTasksById,
  taskKey,
  type TaskAcceptanceCriteriaItem,
  type TaskReadiness,
  type DiscoveredArtifact,
} from "../../domain/index.ts";
import { scanActiveTasks } from "../traversal/active-scanner.ts";
import { detectGitBranch, listGitBranches } from "../traversal/git-inspector.ts";
import {
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifacts,
} from "../traversal/artifact-history.ts";
import type { DiscoveredTask } from "../traversal/types.ts";
import { resolveWorkspaceContext } from "../context/resolver.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import { resolveTaskFile } from "./completion.ts";
import {
  type CriteriaProgress,
  type TaskQueueItem,
  type ToTaskQueueItemParams,
  type RawTaskDataRecord,
  calculateCriteriaProgress,
  toTaskQueueItem,
  buildActiveTaskMap,
  resolveTaskBlockers,
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
  activeTasks?: DiscoveredTask[];

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
   * is not active on disk (ADR-6, RULE-21). Defaults to false.
   */
  history?: boolean;

  /**
   * Optional VCS adapter override.
   */
  vcs?: IVcsAdapter;
}

export interface TaskStatusDetails extends TaskQueueItem {
  incompleteCriteria: string[];
}

export interface HistoricalTaskEntry {
  id: string;
  slug: string;
  relativePath: string;
  isDeleted: boolean;
  branch?: string;
}

export type TaskBranchInfoMap = Map<
  string,
  { branch: string; id: string; slug: string }
>;

type RawTaskRecord = RawTaskDataRecord;

async function loadRawTaskFiles(
  discovered: DiscoveredTask[],
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
 * and computes DAG dependency readiness (READY vs BLOCKED) per ADR-6 and RULE-18.
 *
 * @param options Query and filtering options.
 */
export async function queryTaskQueue(
  options: TaskQueueQueryOptions = {},
): Promise<TaskQueueItem[]> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

  // 1. Discover active task files on disk and read markdown content
  const discovered = options.activeTasks ?? (await scanActiveTasks(cwd));
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
 * Builds a lookup map from normalized task ID to branch metadata.
 */
export function buildTaskBranchMap(branches: string[]): TaskBranchInfoMap {
  const branchMap = new Map<
    string,
    { branch: string; id: string; slug: string }
  >();
  for (const b of branches) {
    const parsed = parseTaskBranch(b);
    if (parsed && parsed.slug) {
      branchMap.set(taskKey(parsed.taskId), {
        branch: b,
        id: parsed.taskId,
        slug: parsed.slug,
      });
    }
  }
  return branchMap;
}

/**
 * Collects tasks active on other Git branches into the historical entries map.
 */
export function collectBranchTasks(
  branchArtifacts: DiscoveredArtifact[],
  activeDiskIds: Set<string>,
  branchMap: TaskBranchInfoMap,
  cwd: string,
  entriesById: Map<string, HistoricalTaskEntry>,
): void {
  for (const art of branchArtifacts) {
    const normId = taskKey(art.id);
    if (activeDiskIds.has(normId)) continue;
    const branchInfo = branchMap.get(normId);
    const relPath = isAbsolute(art.filepath)
      ? relative(cwd, art.filepath)
      : art.filepath;
    entriesById.set(normId, {
      id: art.id,
      slug: art.slug || branchInfo?.slug || `task-${art.id.toLowerCase()}`,
      relativePath: relPath,
      isDeleted: false,
      branch: branchInfo?.branch,
    });
  }
}

function resolveDeletedTaskRelativePath(
  filepath: string | undefined,
  cwd: string,
  fallbackFilename: string,
  existingRelPath?: string,
): string {
  if (filepath) {
    return isAbsolute(filepath) ? relative(cwd, filepath) : filepath;
  }
  return existingRelPath || `.modie/tasks/${fallbackFilename}`;
}

/**
 * Collects completed/deleted tasks from Git history into the historical entries map.
 */
export function collectDeletedTasks(
  deletedArtifacts: DiscoveredArtifact[],
  activeDiskIds: Set<string>,
  branchMap: TaskBranchInfoMap,
  cwd: string,
  entriesById: Map<string, HistoricalTaskEntry>,
): void {
  for (const del of deletedArtifacts) {
    const normId = taskKey(del.id);
    if (activeDiskIds.has(normId)) continue;
    const existing = entriesById.get(normId);
    const branchInfo = branchMap.get(normId);
    const slug =
      del.slug ||
      existing?.slug ||
      branchInfo?.slug ||
      `task-${del.id.toLowerCase()}`;
    const filename = del.filename || `${slug}.TASK-${del.id}.md`;
    const relPath = resolveDeletedTaskRelativePath(
      del.filepath,
      cwd,
      filename,
      existing?.relativePath,
    );

    entriesById.set(normId, {
      id: del.id,
      slug,
      relativePath: relPath,
      isDeleted: true,
      branch: branchInfo?.branch ?? existing?.branch,
    });
  }
}

/**
 * Collects any remaining task branches not yet represented into the historical entries map.
 */
export function collectBranchOnlyTasks(
  branchMap: TaskBranchInfoMap,
  activeDiskIds: Set<string>,
  entriesById: Map<string, HistoricalTaskEntry>,
): void {
  for (const [normId, info] of branchMap.entries()) {
    if (activeDiskIds.has(normId) || entriesById.has(normId)) continue;
    const filename = `${info.slug}.TASK-${info.id}.md`;
    entriesById.set(normId, {
      id: info.id,
      slug: info.slug,
      relativePath: `.modie/tasks/${filename}`,
      isDeleted: true,
      branch: info.branch,
    });
  }
}

async function readHistoricalTaskMarkdown(
  entry: HistoricalTaskEntry,
  cwd: string,
  vcs: IVcsAdapter,
): Promise<string | null> {
  if (!entry.isDeleted && entry.branch && entry.relativePath) {
    const fromBranch = await vcs.readFileAtRef(
      entry.branch,
      entry.relativePath,
      cwd,
    );
    if (fromBranch) {
      return fromBranch;
    }
  }

  if (entry.relativePath) {
    return await vcs.readDeletedFile(entry.relativePath, cwd);
  }

  return null;
}

/**
 * Queries completed tasks in Git deletion history and tasks on other Git branches per ADR-6.
 */
export async function queryTaskHistory(
  options: {
    cwd?: string;
    vcs?: IVcsAdapter;
    workspace?: WorkspaceContext;
  } = {},
): Promise<TaskQueueItem[]> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;

  const [
    activeOnDisk,
    deletedArtifacts,
    branchArtifacts,
    localBranches,
    currentBranch,
  ] = await Promise.all([
    scanActiveTasks(cwd),
    inspectGitDeletedArtifacts(cwd, "TASK", vcs),
    inspectMultiBranchActiveArtifacts(
      cwd,
      "TASK",
      { excludeCurrent: true },
      vcs,
    ),
    listGitBranches(cwd, vcs),
    detectGitBranch(cwd, vcs),
  ]);

  const activeDiskIds = new Set(activeOnDisk.map((t) => taskKey(t.id)));

  const currentTaskId = currentBranch
    ? parseTaskIdFromBranch(currentBranch)
    : null;
  const normCurrentId = currentTaskId ? taskKey(currentTaskId) : null;
  const branchMap = buildTaskBranchMap(localBranches);

  const entriesById = new Map<string, HistoricalTaskEntry>();
  collectBranchTasks(
    branchArtifacts,
    activeDiskIds,
    branchMap,
    cwd,
    entriesById,
  );
  collectDeletedTasks(
    deletedArtifacts,
    activeDiskIds,
    branchMap,
    cwd,
    entriesById,
  );
  collectBranchOnlyTasks(branchMap, activeDiskIds, entriesById);

  const items: TaskQueueItem[] = [];

  for (const [normId, entry] of entriesById.entries()) {
    const rawMarkdown = await readHistoricalTaskMarkdown(entry, cwd, vcs);
    const parsed = rawMarkdown
      ? parseTaskMarkdown(rawMarkdown, entry.relativePath)
      : undefined;

    items.push(
      toTaskQueueItem({
        id: entry.id,
        slug: entry.slug,
        filepath: resolve(cwd, entry.relativePath),
        relativePath: entry.relativePath,
        summary: parsed?.summary,
        context: parsed?.context,
        depends_on: parsed?.depends_on,
        links: parsed?.links,
        acceptanceCriteria: parsed?.acceptanceCriteria,
        readiness: entry.isDeleted ? "COMPLETED" : "READY",
        blockedBy: [],
        isCurrent: Boolean(normCurrentId && normId === normCurrentId),
        isHistorical: true,
        branch: entry.branch,
        isDeleted: entry.isDeleted,
      }),
    );
  }

  items.sort((a, b) => compareTaskIds(a.id, b.id));
  return items;
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
 * When `options.history` is true, also searches completed task history and branches in Git (ADR-6).
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

    return {
      ...item,
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

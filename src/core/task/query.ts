/**
 * Active task queue query service, DAG dependency readiness evaluation,
 * and explicit historical task work querying.
 * Implements ADR-6, ADR-9, RULE-18, RULE-21, RULE-22, and RULE-25.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  normalizeTaskId,
  parseTaskBranch,
  parseTaskIdFromBranch,
  slugToTitle,
  taskKey,
} from "../common/index.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";
import { detectGitBranch, listGitBranches } from "../resolver/git-inspector.ts";
import {
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifacts,
} from "../resolver/artifact-history.ts";
import type { DiscoveredArtifact, DiscoveredTask } from "../resolver/types.ts";
import { resolveWorkspaceContext } from "../context/resolver.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type { IVcsAdapter } from "../vcs/types.ts";
import { resolveTaskFile } from "./completion.ts";
import { parseTaskMarkdown } from "./parser.ts";
import type { TaskAcceptanceCriteriaItem, TaskReadiness } from "./types.ts";

export type { TaskReadiness };

export interface TaskQueueItem {
  id: string;
  fullTaskId: string;
  slug: string;
  title: string;
  filepath: string;
  relativePath: string;
  depends_on: string[];
  links: string[];
  readiness: TaskReadiness;
  blockedBy: string[];
  criteriaTotal: number;
  criteriaCompleted: number;
  criteriaProgress: string;
  acceptanceCriteria: TaskAcceptanceCriteriaItem[];
  allCriteriaSatisfied: boolean;
  summary?: string;
  context?: string;

  /**
   * Whether this task corresponds to the active checked-out git branch.
   */
  isCurrent?: boolean;

  /**
   * Whether this task was resolved from Git history or another branch (--history).
   */
  isHistorical?: boolean;

  /**
   * Associated Git task branch if present.
   */
  branch?: string;
}

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

export interface CriteriaProgress {
  criteriaTotal: number;
  criteriaCompleted: number;
  criteriaProgress: string;
  allCriteriaSatisfied: boolean;
}

export interface ToTaskQueueItemParams {
  id: string;
  slug: string;
  filepath: string;
  relativePath: string;
  summary?: string;
  context?: string;
  depends_on?: string[];
  links?: string[];
  acceptanceCriteria?: TaskAcceptanceCriteriaItem[];
  readiness: TaskReadiness;
  blockedBy?: string[];
  isCurrent?: boolean;
  isHistorical?: boolean;
  branch?: string;
  isDeleted?: boolean;
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

/**
 * Calculates criteria progress counts, ratio string, and satisfaction flag.
 */
export function calculateCriteriaProgress(
  criteria: TaskAcceptanceCriteriaItem[] = [],
  options: { isDeleted?: boolean } = {},
): CriteriaProgress {
  const criteriaTotal = criteria.length;
  const criteriaCompleted = criteria.filter((c) => c.completed).length;
  const allCriteriaSatisfied = options.isDeleted
    ? criteriaTotal === 0 || criteriaCompleted === criteriaTotal
    : criteriaTotal > 0 && criteriaCompleted === criteriaTotal;

  return {
    criteriaTotal,
    criteriaCompleted,
    criteriaProgress: `${criteriaCompleted}/${criteriaTotal}`,
    allCriteriaSatisfied,
  };
}

/**
 * Constructs a normalized TaskQueueItem record from parsed attributes and criteria progress.
 */
export function toTaskQueueItem(params: ToTaskQueueItemParams): TaskQueueItem {
  const criteria = params.acceptanceCriteria ?? [];
  const progress = calculateCriteriaProgress(criteria, {
    isDeleted: params.isDeleted,
  });

  return {
    id: params.id,
    fullTaskId: `TASK-${params.id}`,
    slug: params.slug,
    title: slugToTitle(params.slug),
    summary: params.summary,
    filepath: params.filepath,
    relativePath: params.relativePath,
    depends_on: params.depends_on ?? [],
    links: params.links ?? [],
    readiness: params.readiness,
    blockedBy: params.blockedBy ?? [],
    criteriaTotal: progress.criteriaTotal,
    criteriaCompleted: progress.criteriaCompleted,
    criteriaProgress: progress.criteriaProgress,
    acceptanceCriteria: criteria,
    allCriteriaSatisfied: progress.allCriteriaSatisfied,
    context: params.context,
    isCurrent: params.isCurrent,
    isHistorical: params.isHistorical,
    branch: params.branch,
  };
}

/**
 * Natural comparator for sorting task IDs (e.g. 1, 2, 9, 10, 11, 2-1, J101).
 */
export function compareTaskIds(aId: string, bId: string): number {
  const aNorm = normalizeTaskId(aId);
  const bNorm = normalizeTaskId(bId);

  // If both are simple integers: numeric sort
  const aNum = Number(aNorm);
  const bNum = Number(bNorm);
  if (Number.isInteger(aNum) && Number.isInteger(bNum)) {
    return aNum - bNum;
  }

  // If subtasks under parent (e.g. "2-1" vs "2-2")
  const aSub = aNorm.match(/^(\d+)-(\d+)$/);
  const bSub = bNorm.match(/^(\d+)-(\d+)$/);
  if (aSub && bSub && aSub[1] && aSub[2] && bSub[1] && bSub[2]) {
    const parentDiff = Number(aSub[1]) - Number(bSub[1]);
    if (parentDiff !== 0) return parentDiff;
    return Number(aSub[2]) - Number(bSub[2]);
  }

  return aNorm.localeCompare(bNorm, undefined, { numeric: true });
}

interface RawTaskRecord {
  discovered: DiscoveredTask;
  parsed: ReturnType<typeof parseTaskMarkdown>;
  relativePath: string;
}

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

function buildActiveTaskMap(rawTasks: RawTaskRecord[]): Map<string, string> {
  const activeTaskMap = new Map<string, string>();
  for (const item of rawTasks) {
    const normId = taskKey(item.discovered.id);
    const canonicalId = `TASK-${item.discovered.id}`;
    activeTaskMap.set(normId, canonicalId);
  }
  return activeTaskMap;
}

function resolveTaskBlockers(
  dependsOn: string[],
  activeTaskMap: Map<string, string>,
): string[] {
  const blockedBy: string[] = [];
  for (const dep of dependsOn) {
    const blockingCanonical = activeTaskMap.get(taskKey(dep));
    if (blockingCanonical && !blockedBy.includes(blockingCanonical)) {
      blockedBy.push(blockingCanonical);
    }
  }
  return blockedBy;
}

function filterTaskQueueItems(
  items: TaskQueueItem[],
  options: TaskQueueQueryOptions,
): TaskQueueItem[] {
  const isReadyOnly = options.readyOnly || options.filter === "ready";
  const isBlockedOnly = options.blockedOnly || options.filter === "blocked";

  return items.filter((item) => {
    if (isReadyOnly && item.readiness !== "READY") {
      return false;
    }
    if (isBlockedOnly && item.readiness !== "BLOCKED") {
      return false;
    }
    if (options.scope) {
      const normScope = options.scope.replace(/^\.\//, "").replace(/\/$/, "");
      const normRel = item.relativePath.replace(/^\.\//, "");
      if (!normRel.startsWith(normScope)) {
        return false;
      }
    }
    return true;
  });
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

function buildTaskQueueItems(
  rawTasks: RawTaskRecord[],
  activeTaskMap: Map<string, string>,
  normCurrentId: string | null,
): TaskQueueItem[] {
  const items: TaskQueueItem[] = [];

  for (const { discovered: disc, parsed, relativePath } of rawTasks) {
    const dependsOn = parsed.depends_on ?? [];
    const blockedBy = resolveTaskBlockers(dependsOn, activeTaskMap);
    const readiness: TaskReadiness =
      blockedBy.length === 0 ? "READY" : "BLOCKED";
    const isCurrent = Boolean(
      normCurrentId && taskKey(disc.id) === normCurrentId,
    );

    items.push(
      toTaskQueueItem({
        id: disc.id,
        slug: disc.slug,
        filepath: disc.filepath,
        relativePath,
        summary: parsed.summary,
        context: parsed.context,
        depends_on: dependsOn,
        links: parsed.links ?? [],
        acceptanceCriteria: parsed.acceptanceCriteria,
        readiness,
        blockedBy,
        isCurrent,
      }),
    );
  }

  return items;
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

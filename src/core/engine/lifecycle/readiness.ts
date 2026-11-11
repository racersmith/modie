/**
 * Modie Core: Task Readiness & State Machine (ADR-6, RULE-18, RULE-22).
 *
 * Evaluates DAG dependency readiness, criteria completion progress,
 * and lifecycle status state machine (READY, BLOCKED, COMPLETED).
 */

import {
  slugToTitle,
  taskKey,
  type TaskAcceptanceCriteriaItem,
  type TaskReadiness,
} from "../../domain/index.ts";

/**
 * Summary criteria progress statistics.
 */
export interface CriteriaProgress {
  criteriaTotal: number;
  criteriaCompleted: number;
  criteriaProgress: string;
  allCriteriaSatisfied: boolean;
}

/**
 * Canonical task item within the active task queue or historical query results.
 */
export interface TaskQueueItem {
  id: string;
  fullTaskId: string;
  slug: string;
  title: string;
  summary?: string;
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
  context?: string;
  isCurrent?: boolean;
  isHistorical?: boolean;
  branch?: string;
}

/**
 * Parameters for synthesizing a normalized TaskQueueItem.
 */
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

/**
 * Raw parsed task record before queue item construction.
 */
export interface RawTaskDataRecord {
  discovered: { id: string; slug: string; filepath: string };
  parsed: {
    summary?: string;
    contextSection?: string;
    context?: string;
    depends_on?: string[];
    links?: string[];
    acceptanceCriteria?: TaskAcceptanceCriteriaItem[];
  };
  relativePath: string;
}

/**
 * Filtering options for task queue items.
 */
export interface TaskQueueFilterOptions {
  scope?: string;
  filter?: "all" | "ready" | "blocked";
  readyOnly?: boolean;
  blockedOnly?: boolean;
}

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
 * Determines task readiness state (READY, BLOCKED, COMPLETED).
 */
export function determineTaskReadiness(options: {
  blockedBy?: string[];
  isDeleted?: boolean;
}): TaskReadiness {
  if (options.isDeleted) {
    return "COMPLETED";
  }
  return options.blockedBy && options.blockedBy.length > 0
    ? "BLOCKED"
    : "READY";
}

/**
 * State predicate: checks if task is ready to begin work.
 */
export function isTaskReady(readiness: TaskReadiness): boolean {
  return readiness === "READY";
}

/**
 * State predicate: checks if task is blocked by active dependencies.
 */
export function isTaskBlocked(readiness: TaskReadiness): boolean {
  return readiness === "BLOCKED";
}

/**
 * State predicate: checks if task has completed.
 */
export function isTaskCompleted(readiness: TaskReadiness): boolean {
  return readiness === "COMPLETED";
}

/**
 * Resolves active blocking task IDs from dependency declarations.
 */
export function resolveTaskBlockers(
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

/**
 * Builds active task ID lookup map for DAG evaluation.
 */
export function buildActiveTaskMap(
  rawTasks: Array<{ discovered: { id: string } }>,
): Map<string, string> {
  const activeTaskMap = new Map<string, string>();
  for (const item of rawTasks) {
    const normId = taskKey(item.discovered.id);
    const canonicalId = `TASK-${item.discovered.id}`;
    activeTaskMap.set(normId, canonicalId);
  }
  return activeTaskMap;
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
 * Builds task queue items from raw task files and DAG lookup map.
 */
export function buildTaskQueueItems(
  rawTasks: RawTaskDataRecord[],
  activeTaskMap: Map<string, string>,
  normCurrentId: string | null,
): TaskQueueItem[] {
  const items: TaskQueueItem[] = [];

  for (const { discovered: disc, parsed, relativePath } of rawTasks) {
    const dependsOn = parsed.depends_on ?? [];
    const blockedBy = resolveTaskBlockers(dependsOn, activeTaskMap);
    const readiness = determineTaskReadiness({ blockedBy });
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
        context: parsed.contextSection ?? parsed.context,
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
 * Filters task queue items based on scope and readiness filter options.
 */
export function filterTaskQueueItems(
  items: TaskQueueItem[],
  options: TaskQueueFilterOptions,
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

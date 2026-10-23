/**
 * Active task queue query service and DAG dependency readiness evaluation.
 * Implements ADR-6, RULE-18, RULE-22, and RULE-25.
 */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { detectGitBranch } from "../resolver/git-inspector.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";
import type { DiscoveredTask } from "../resolver/types.ts";
import { parseTaskIdFromBranch } from "../common/index.ts";
import { normalizeTaskId, resolveTaskFile } from "./completion.ts";
import { parseTaskMarkdown } from "./parser.ts";
import type { TaskAcceptanceCriteriaItem } from "./types.ts";

export { parseTaskIdFromBranch };

export type TaskReadiness = "READY" | "BLOCKED";

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
  context?: string;

  /**
   * Whether this task corresponds to the active checked-out git branch.
   */
  isCurrent?: boolean;
}

export interface TaskQueueQueryOptions {
  /**
   * Root directory for active task scanning (defaults to process.cwd()).
   */
  cwd?: string;

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

export interface TaskStatusDetails extends TaskQueueItem {
  incompleteCriteria: string[];
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

/**
 * Queries the active task queue on disk, parses acceptance criteria progress,
 * and computes DAG dependency readiness (READY vs BLOCKED) per ADR-6 and RULE-18.
 *
 * @param options Query and filtering options.
 */
export async function queryTaskQueue(
  options: TaskQueueQueryOptions = {},
): Promise<TaskQueueItem[]> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Discover active task files
  const discovered = options.activeTasks ?? (await scanActiveTasks(cwd));

  // 2. Read and parse markdown content for each task
  const rawTasks: Array<{
    discovered: DiscoveredTask;
    parsed: ReturnType<typeof parseTaskMarkdown>;
    relativePath: string;
  }> = [];

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

  // 3. Build active task ID lookup map for DAG evaluation
  // Map normalized ID -> canonical fullTaskId (e.g. "9" -> "TASK-9", "j101" -> "TASK-J101")
  const activeTaskMap = new Map<string, string>();
  for (const item of rawTasks) {
    const normId = normalizeTaskId(item.discovered.id).toLowerCase();
    const canonicalId = `TASK-${item.discovered.id}`;
    activeTaskMap.set(normId, canonicalId);
    activeTaskMap.set(canonicalId.toLowerCase(), canonicalId);
  }

  // 4. Resolve current task ID from active git branch topology or options
  const currentBranch =
    options.currentBranch ?? (await detectGitBranch(cwd));
  const currentTaskId =
    options.currentTaskId ??
    (currentBranch ? parseTaskIdFromBranch(currentBranch) : null);
  const normCurrentId = currentTaskId
    ? normalizeTaskId(currentTaskId).toLowerCase()
    : null;

  // 5. Compute DAG dependency readiness and checklist progress for each task
  const items: TaskQueueItem[] = [];

  for (const { discovered: disc, parsed, relativePath } of rawTasks) {
    const dependsOn = parsed.depends_on ?? [];
    const blockedBy: string[] = [];

    for (const dep of dependsOn) {
      const normDep = normalizeTaskId(dep).toLowerCase();
      const blockingCanonical =
        activeTaskMap.get(normDep) ?? activeTaskMap.get(`task-${normDep}`);

      if (blockingCanonical) {
        // Active on disk => prerequisite is still pending => blocks this task per ADR-6
        if (!blockedBy.includes(blockingCanonical)) {
          blockedBy.push(blockingCanonical);
        }
      }
      // If not active on disk => satisfied/completed per ADR-6 Section 3
    }

    const readiness: TaskReadiness =
      blockedBy.length === 0 ? "READY" : "BLOCKED";

    const criteria = parsed.acceptanceCriteria ?? [];
    const criteriaTotal = criteria.length;
    const criteriaCompleted = criteria.filter((c) => c.completed).length;
    const allCriteriaSatisfied =
      criteriaTotal > 0 && criteriaCompleted === criteriaTotal;

    const fullTaskId = `TASK-${disc.id}`;
    const title = disc.slug.replace(/-/g, " ");
    const isCurrent = Boolean(
      normCurrentId && normalizeTaskId(disc.id).toLowerCase() === normCurrentId,
    );

    items.push({
      id: disc.id,
      fullTaskId,
      slug: disc.slug,
      title,
      filepath: disc.filepath,
      relativePath,
      depends_on: dependsOn,
      links: parsed.links ?? [],
      readiness,
      blockedBy,
      criteriaTotal,
      criteriaCompleted,
      criteriaProgress: `${criteriaCompleted}/${criteriaTotal}`,
      acceptanceCriteria: criteria,
      allCriteriaSatisfied,
      context: parsed.context,
      isCurrent,
    });
  }

  // 6. Sort tasks deterministically
  items.sort((a, b) => compareTaskIds(a.id, b.id));

  // 7. Apply filtering
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


/**
 * Resolves the active task for the currently checked-out git branch.
 * Returns null if not on a task branch or if the corresponding task file
 * does not exist on disk.
 */
export async function resolveCurrentTask(
  options: { cwd?: string; branch?: string } = {},
): Promise<TaskStatusDetails | null> {
  const cwd = options.cwd ?? process.cwd();
  const branch = options.branch ?? (await detectGitBranch(cwd));
  if (!branch) {
    return null;
  }

  const taskId = parseTaskIdFromBranch(branch);
  if (!taskId) {
    return null;
  }

  try {
    return await getTaskStatus(taskId, { cwd });
  } catch {
    return null;
  }
}

/**
 * Queries detailed status and inspection details for a specific active task.
 *
 * @param taskIdentifier Task ID (e.g. "TASK-9", "9"), slug, or filepath.
 * @param options Query options including cwd.
 */
export async function getTaskStatus(
  taskIdentifier: string,
  options: { cwd?: string } = {},
): Promise<TaskStatusDetails> {
  const cwd = options.cwd ?? process.cwd();
  const filepath = await resolveTaskFile(taskIdentifier, { cwd });

  const queue = await queryTaskQueue({ cwd });
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
}

/**
 * Active task queue query service, DAG dependency readiness evaluation,
 * and explicit historical task work querying.
 * Implements ADR-6, ADR-9, RULE-18, RULE-21, RULE-22, and RULE-25.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parseTaskIdFromBranch } from "../common/index.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";
import {
  detectGitBranch,
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifacts,
  listGitBranches,
} from "../resolver/git-inspector.ts";
import type { DiscoveredTask } from "../resolver/types.ts";
import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type { IVcsAdapter } from "../vcs/types.ts";
import { normalizeTaskId, resolveTaskFile } from "./completion.ts";
import { parseTaskMarkdown } from "./parser.ts";
import type { TaskAcceptanceCriteriaItem } from "./types.ts";

export { parseTaskIdFromBranch };

export type TaskReadiness = "READY" | "BLOCKED" | "COMPLETED";

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

export interface TaskStatusQueryOptions {
  /**
   * Root directory for task resolution (defaults to process.cwd()).
   */
  cwd?: string;

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

  // 1. Discover active task files on disk
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
  const activeTaskMap = new Map<string, string>();
  for (const item of rawTasks) {
    const normId = normalizeTaskId(item.discovered.id).toLowerCase();
    const canonicalId = `TASK-${item.discovered.id}`;
    activeTaskMap.set(normId, canonicalId);
    activeTaskMap.set(canonicalId.toLowerCase(), canonicalId);
  }

  // 4. Resolve current task ID from active git branch topology or options
  const currentBranch = options.currentBranch ?? (await detectGitBranch(cwd));
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
        if (!blockedBy.includes(blockingCanonical)) {
          blockedBy.push(blockingCanonical);
        }
      }
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
 * Queries completed tasks in Git deletion history and tasks on other Git branches per ADR-6.
 */
export async function queryTaskHistory(
  options: { cwd?: string; vcs?: IVcsAdapter } = {},
): Promise<TaskQueueItem[]> {
  const cwd = options.cwd ?? process.cwd();
  const vcs = options.vcs ?? defaultVcsAdapter;

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

  const activeDiskIds = new Set(
    activeOnDisk.map((t) => normalizeTaskId(t.id).toLowerCase()),
  );

  const currentTaskId = currentBranch
    ? parseTaskIdFromBranch(currentBranch)
    : null;
  const normCurrentId = currentTaskId
    ? normalizeTaskId(currentTaskId).toLowerCase()
    : null;

  // Map normalized task ID -> branch metadata
  const branchMap = new Map<
    string,
    { branch: string; id: string; slug: string }
  >();
  for (const b of localBranches) {
    const match = b.match(/^task\/(?:TASK-)?([A-Za-z0-9]+(?:-[0-9]+)*)-(.+)$/i);
    if (match && match[1] && match[2]) {
      const id = match[1];
      const slug = match[2];
      branchMap.set(normalizeTaskId(id).toLowerCase(), { branch: b, id, slug });
    }
  }

  interface HistoricalEntry {
    id: string;
    slug: string;
    relativePath: string;
    isDeleted: boolean;
    branch?: string;
  }

  const entriesById = new Map<string, HistoricalEntry>();

  // 1. Add tasks active on other branches
  for (const art of branchArtifacts) {
    const normId = normalizeTaskId(art.id).toLowerCase();
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

  // 2. Add completed/deleted tasks from Git history
  for (const del of deletedArtifacts) {
    const normId = normalizeTaskId(del.id).toLowerCase();
    if (activeDiskIds.has(normId)) continue;
    const existing = entriesById.get(normId);
    const branchInfo = branchMap.get(normId);
    const slug =
      del.slug ||
      existing?.slug ||
      branchInfo?.slug ||
      `task-${del.id.toLowerCase()}`;
    const filename = del.filename || `${slug}.TASK-${del.id}.md`;
    const relPath = del.filepath
      ? isAbsolute(del.filepath)
        ? relative(cwd, del.filepath)
        : del.filepath
      : existing?.relativePath || `.modie/tasks/${filename}`;

    entriesById.set(normId, {
      id: del.id,
      slug,
      relativePath: relPath,
      isDeleted: true,
      branch: branchInfo?.branch ?? existing?.branch,
    });
  }

  // 3. Add any remaining task branches not yet represented
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

  const items: TaskQueueItem[] = [];

  for (const [normId, entry] of entriesById.entries()) {
    let rawMarkdown: string | null = null;

    if (!entry.isDeleted && entry.branch && entry.relativePath) {
      rawMarkdown = await vcs.run(
        ["show", `${entry.branch}:${entry.relativePath}`],
        cwd,
      );
    }

    if (!rawMarkdown && entry.relativePath) {
      const delCommit = await vcs.run(
        [
          "log",
          "-n",
          "1",
          "--all",
          "--diff-filter=D",
          "--format=%H",
          "--",
          entry.relativePath,
        ],
        cwd,
      );
      if (delCommit && delCommit.trim()) {
        rawMarkdown = await vcs.run(
          ["show", `${delCommit.trim()}~1:${entry.relativePath}`],
          cwd,
        );
      }
    }

    const parsed = rawMarkdown
      ? parseTaskMarkdown(rawMarkdown, entry.relativePath)
      : undefined;

    const criteria = parsed?.acceptanceCriteria ?? [];
    const criteriaTotal = criteria.length;
    const criteriaCompleted = criteria.filter((c) => c.completed).length;
    const allCriteriaSatisfied = entry.isDeleted
      ? criteriaTotal === 0 || criteriaCompleted === criteriaTotal
      : criteriaTotal > 0 && criteriaCompleted === criteriaTotal;

    const fullTaskId = `TASK-${entry.id}`;
    const title = entry.slug.replace(/-/g, " ");
    const isCurrent = Boolean(normCurrentId && normId === normCurrentId);

    items.push({
      id: entry.id,
      fullTaskId,
      slug: entry.slug,
      title,
      filepath: resolve(cwd, entry.relativePath),
      relativePath: entry.relativePath,
      depends_on: parsed?.depends_on ?? [],
      links: parsed?.links ?? [],
      readiness: entry.isDeleted ? "COMPLETED" : "READY",
      blockedBy: [],
      criteriaTotal,
      criteriaCompleted,
      criteriaProgress: `${criteriaCompleted}/${criteriaTotal}`,
      acceptanceCriteria: criteria,
      allCriteriaSatisfied,
      context: parsed?.context,
      isCurrent,
      isHistorical: true,
      branch: entry.branch,
    });
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
  } = {},
): Promise<TaskStatusDetails | null> {
  const cwd = options.cwd ?? process.cwd();
  const branch = options.branch ?? (await detectGitBranch(cwd, options.vcs));
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
      vcs: options.vcs,
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
  const cwd = options.cwd ?? process.cwd();

  try {
    const filepath = await resolveTaskFile(taskIdentifier, {
      cwd,
      vcs: options.vcs,
    });

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
  } catch (activeError: unknown) {
    if (!options.history) {
      throw activeError;
    }

    const trimmed = taskIdentifier.trim();
    const normalizedInput = normalizeTaskId(trimmed).toLowerCase();
    const historyItems = await queryTaskHistory({ cwd, vcs: options.vcs });

    const matched =
      historyItems.find(
        (t) =>
          normalizeTaskId(t.id).toLowerCase() === normalizedInput ||
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

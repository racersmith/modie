/**
 * Canonical task branch parsing, formatting, and glob patterns adhering to RULE-28.
 */

/**
 * Valid ID pattern: unpadded integer (1, 42) or branch/author-namespaced (2-1, J101, A102).
 */
export const TASK_BRANCH_REGEX =
  /^task\/(?:TASK-)?([A-Za-z0-9]+(?:-[0-9]+)*)(?:-(.+))?$/i;

/**
 * Normalizes a task identifier input to match against task IDs or slugs.
 * Examples: "TASK-7-1" -> "7-1", "7-1" -> "7-1", "task-7" -> "7".
 */
export function normalizeTaskId(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^task-([A-Za-z0-9_-]+)$/i);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Computes a normalized, lowercased lookup key for a task ID or identifier.
 */
export function taskKey(raw: string): string {
  return normalizeTaskId(raw).toLowerCase();
}

/**
 * Parses subtask parent ID and sequence from task ID token per RULE-28.
 * Subtasks are strictly single-level: `TASK-<parentId>-<sequence>` (e.g. `2-1`, `11-2`, `J101-1`).
 * Returns null for root task IDs or invalid multi-level IDs (e.g. `5-2-1`).
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
 * Returns true when a task ID contains more than one subtask nesting level (e.g. `5-2-1`).
 * Modie enforces a maximum subtask depth of 1 (root task -> subtask) per RULE-28.
 */
export function isMultiLevelSubtaskId(taskId: string): boolean {
  const normId = normalizeTaskId(taskId);
  return /^[A-Za-z0-9]+(?:-[0-9]+){2,}$/.test(normId);
}

/**
 * Asserts that a task ID does not exceed the maximum subtask nesting depth of 1 per RULE-28.
 */
export function assertValidTaskDepth(taskId: string): void {
  if (isMultiLevelSubtaskId(taskId)) {
    const normId = normalizeTaskId(taskId);
    throw new Error(
      `Task "TASK-${normId}" exceeds the maximum subtask depth of 1 per RULE-28. Subtasks may only be created under root tasks (e.g. TASK-<root>-<seq>), never nested under another subtask.`,
    );
  }
}

export interface ParsedTaskBranch {
  taskId: string;
  slug?: string;
}

/**
 * Parses a git branch name into its task ID and optional slug components.
 * Conforms to RULE-28 task branch grammar:
 * `task/<parent_id>-<slug>` or `task/<parent_id>-<sequence>-<slug>`
 * Returns null if the branch is not a task branch.
 */
export function parseTaskBranch(
  branchName?: string | null,
): ParsedTaskBranch | null {
  if (!branchName) {
    return null;
  }
  const trimmed = branchName.trim();
  const match = trimmed.match(TASK_BRANCH_REGEX);
  if (!match || !match[1]) {
    return null;
  }
  const taskId = match[1];
  const slug = match[2];
  return {
    taskId,
    slug,
  };
}

/**
 * Parses the canonical task ID from a git branch name per RULE-28.
 * Supports standard task branches (`task/22-slug`, `task/TASK-22-slug`),
 * subtask branches (`task/106-1-subtask-slug`), and prefixed tasks (`task/J101-slug`).
 * Returns null if the branch is not a task branch.
 */
export function parseTaskIdFromBranch(
  branchName?: string | null,
): string | null {
  return parseTaskBranch(branchName)?.taskId ?? null;
}

/**
 * Formats canonical task branch name per RULE-28: `task/<id>-<slug>` or `task/<id>`.
 */
export function formatTaskBranch(taskId: string, slug?: string): string {
  const normId = normalizeTaskId(taskId);
  return slug ? `task/${normId}-${slug}` : `task/${normId}`;
}

/**
 * Formats the local Git config key used to persist a task branch's recorded origin/base branch.
 */
export function taskBranchBaseConfigKey(branchName: string): string {
  return `branch.${branchName}.modieBase`;
}

/**
 * Generates git branch search glob for a task or all tasks per RULE-28.
 */
export function taskBranchGlob(taskId?: string): string {
  if (!taskId) {
    return "task/*";
  }
  const normId = normalizeTaskId(taskId);
  return `task/${normId}-*`;
}

/**
 * Modie Core Domain Layer: Task Ordering & Sorting Algorithms (RULE-18, RULE-38).
 *
 * Provides natural comparator and sorting functions for monotonic, hierarchical,
 * and alphanumeric task IDs (e.g. 1, 2, 9, 10, 2-1, 2-2, J101).
 */

import { normalizeTaskId } from "../common/task-branch.ts";

/**
 * Natural comparator for sorting task IDs (e.g. 1, 2, 9, 10, 11, 2-1, J101).
 *
 * Ordering rules:
 * 1. Simple numeric IDs are compared numerically (e.g. 2 < 10).
 * 2. Hierarchical subtask IDs (e.g. "2-1" vs "2-2") compare parent first, then subtask index.
 * 3. Mixed / alphanumeric IDs fallback to natural locale comparison with numeric collator.
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
 * Sorts an array of task items containing an `id` field in-place or copies.
 */
export function sortTasksById<T extends { id: string }>(tasks: T[]): T[] {
  return tasks.sort((a, b) => compareTaskIds(a.id, b.id));
}

/**
 * Sorts an array of task ID strings in natural order.
 */
export function sortTaskIds(taskIds: string[]): string[] {
  return taskIds.sort(compareTaskIds);
}


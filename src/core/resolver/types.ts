/**
 * Types and interfaces for the task ID watermark resolver.
 * Complies with RULE-1, ADR-1, ADR-6, and ADR-9.
 */

export interface DiscoveredTask {
  id: string;
  slug: string;
  filename: string;
  filepath: string;
  status: "active" | "deleted";
}

export type AllocationStrategy = "trunk" | "subtask" | "prefixed";

export interface WatermarkResolutionOptions {
  /**
   * Root directory of the repository/workspace to scan.
   * Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Git branch name override (useful for testing or explicit branch context).
   * If omitted, resolved automatically via git.
   */
  branch?: string;

  /**
   * Explicit task prefix tag (e.g. "J" for TASK-J1).
   * Overrides gitConfigPrefix if provided.
   */
  prefix?: string;

  /**
   * Git config prefix override (e.g. from `git config modie.prefix` or `git config modie.prefix`).
   */
  gitConfigPrefix?: string;

  /**
   * Force trunk monotonic allocation even when on a task or feature branch.
   */
  forceTrunk?: boolean;

  /**
   * Pre-provided active task IDs (used for isolated unit testing without filesystem access).
   */
  activeIds?: string[];

  /**
   * Pre-provided deleted task IDs (used for isolated unit testing without git execution).
   */
  deletedIds?: string[];
}

export interface WatermarkDetails {
  nextId: string;
  fullTaskId: string;
  strategy: AllocationStrategy;
  activeIds: string[];
  deletedIds: string[];
  branch?: string;
  parentId?: string;
  prefix?: string;
  sequence: number;
}

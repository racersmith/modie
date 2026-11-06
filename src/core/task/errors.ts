/**
 * Domain errors for TASK lifecycle and branch management.
 * Complies with RULE-21, RULE-22, RULE-28, and RULE-33.
 */

import type { ArtifactCollision } from "./types.ts";

export interface TaskIncompleteErrorDetails {
  taskId: string;
  reason?:
    | "incomplete_criteria"
    | "artifact_not_completed"
    | "no_completion_record";
  incompleteCriteriaCount?: number;
}

/**
 * Thrown when attempting to merge a task branch whose task artifact has not
 * satisfied acceptance criteria or completed the lifecycle deletion ceremony per RULE-21 & RULE-22.
 */
export class TaskIncompleteError extends Error {
  readonly taskId: string;
  readonly reason?:
    | "incomplete_criteria"
    | "artifact_not_completed"
    | "no_completion_record";
  readonly incompleteCriteriaCount?: number;

  constructor(message: string, details?: TaskIncompleteErrorDetails) {
    super(message);
    this.name = "TaskIncompleteError";
    this.taskId = details?.taskId ?? "";
    this.reason = details?.reason;
    this.incompleteCriteriaCount = details?.incompleteCriteriaCount;
  }
}

export interface ActiveSubtaskPendingErrorDetails {
  parentTaskId: string;
  activeSubtaskBranches: string[];
}

/**
 * Thrown when attempting to merge a parent task branch into trunk while child subtasks
 * remain unmerged per RULE-28.
 */
export class ActiveSubtaskPendingError extends Error {
  readonly parentTaskId: string;
  readonly activeSubtaskBranches: string[];

  constructor(message: string, details?: ActiveSubtaskPendingErrorDetails) {
    super(message);
    this.name = "ActiveSubtaskPendingError";
    this.parentTaskId = details?.parentTaskId ?? "";
    this.activeSubtaskBranches = details?.activeSubtaskBranches ?? [];
  }
}

export interface ArtifactCollisionErrorDetails {
  sourceBranch: string;
  targetBranch: string;
  collisions: ArtifactCollision[];
}

/**
 * Thrown when pre-merge artifact collision analysis discovers conflicting tags or filepaths
 * between the source task branch and the target merge branch per RULE-33.
 */
export class ArtifactCollisionError extends Error {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly collisions: ArtifactCollision[];

  constructor(message: string, details?: ArtifactCollisionErrorDetails) {
    super(message);
    this.name = "ArtifactCollisionError";
    this.sourceBranch = details?.sourceBranch ?? "";
    this.targetBranch = details?.targetBranch ?? "";
    this.collisions = details?.collisions ?? [];
  }
}

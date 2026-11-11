/**
 * Modie Core Domain Layer: Domain types and schemas for TASK primitive artifacts.
 * Complies with ADR-4, ADR-6, ADR-9, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-21, RULE-22, and RULE-38.
 */

import type { CreateArtifactResult, WatermarkDetails } from "../types.ts";
import type { IndexableSubtype } from "../common/types.ts";

export type TaskReadiness = "READY" | "BLOCKED" | "COMPLETED";

export interface TaskFrontmatter {
  summary?: string;
  depends_on?: string[];
  links?: string[];
}

export interface TaskAcceptanceCriteriaItem {
  text: string;
  completed: boolean;
}

export interface TaskArtifact {
  id: string;
  slug: string;
  title?: string;
  summary?: string;
  depends_on: string[];
  links: string[];
  contextSection?: string;
  context?: string;
  acceptanceCriteria: TaskAcceptanceCriteriaItem[];
  rawContent?: string;
  filePath?: string;
}

export interface TaskRenderOptions {
  id: string | number;
  slug?: string;
  title?: string;
  summary?: string;
  depends_on?: string[];
  links?: string[];
  contextSection?: string;
  context?: string;
  acceptanceCriteria?: Array<string | { text: string; completed?: boolean }>;
  skipValidation?: boolean;
  allowEmptyCriteria?: boolean;
}

export interface TaskBranchTopology {
  taskId: string;
  slug: string;
  branchName: string;
  isSubtask: boolean;
  parentId?: string;
  subtaskSequence?: string;
  parentBranchName?: string;
  expectedBaseBranch: string;
  currentBranch: string | null;
  isCurrentBranchProtected: boolean;
  trunkBranch: string;
  protectedBranches: string[];
}

export interface CreateTaskOptions {
  /**
   * Title of the task (human-readable string).
   * E.g. "Create Task CLI"
   */
  title: string;

  /**
   * Concise 1-2 sentence summary of task intent for triage queues and backlog scanning.
   */
  summary?: string;

  /**
   * Optional target scope directory where the task should reside.
   * Defaults to workspace root (cwd).
   */
  scopeDir?: string;

  /**
   * Context / user story / background explanation for the task.
   */
  contextSection?: string;

  /**
   * @deprecated Use `contextSection` instead. Backward-compatible alias.
   */
  context?: string;

  /**
   * Task dependencies (`depends_on`). Must only reference `TASK-` identifiers per RULE-18.
   */
  depends_on?: string[];

  /**
   * Artifact links (`links`). Must only reference `ADR-` and `RULE-` identifiers per RULE-15.
   */
  links?: string[];

  /**
   * Acceptance criteria checklist items per RULE-22.
   * Can be strings or { text, completed } items.
   */
  acceptanceCriteria?: Array<string | { text: string; completed?: boolean }>;

  /**
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: any;

  /**
   * Optional VCS adapter.
   */
  vcs?: any;

  /**
   * Explicit branch name override (passed to watermark resolver).
   */
  branch?: string;

  /**
   * Explicit task prefix tag override (e.g. "J" for TASK-J1).
   */
  prefix?: string;

  /**
   * Force trunk monotonic allocation even on task/feature branches.
   */
  forceTrunk?: boolean;

  /**
   * Target mutation paths that this task will affect.
   * Validated against downward blast radius (RULE-6) and least-scope placement (RULE-12).
   */
  targetPaths?: string[];

  /**
   * If true, bypasses strict least-scope common ancestor enforcement when targetPaths are provided.
   */
  allowBroadScope?: boolean;

  /**
   * Whether to automatically include a 'User Review' acceptance criterion.
   * Defaults to true unless explicitly set to false.
   */
  review?: boolean;
}

export type CreateTaskResult = CreateArtifactResult<TaskArtifact> & {
  watermark: WatermarkDetails;
};

export interface ArtifactCollision {
  tag: string;
  subtype: IndexableSubtype;
  id: string;
  sourceFilepath: string;
  targetFilepath: string;
  reason: "duplicate_tag" | "divergent_filepath" | "filepath_conflict";
}


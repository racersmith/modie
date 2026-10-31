/**
 * Domain types and schemas for TASK primitive artifacts.
 */

export interface TaskFrontmatter {
  depends_on?: string[];
  links?: string[];
}

export interface TaskAcceptanceCriteriaItem {
  text: string;
  completed: boolean;
}

export interface PlannedGovernanceItem {
  text: string;
  completed: boolean;
  tag?: string;
  slug?: string;
}

export interface PlannedGovernanceDeclaration {
  rules?: Array<
    string | (Omit<PlannedGovernanceItem, "completed"> & { completed?: boolean })
  >;
  adrs?: Array<
    string | (Omit<PlannedGovernanceItem, "completed"> & { completed?: boolean })
  >;
}

export interface ParsedPlannedGovernance {
  rules: PlannedGovernanceItem[];
  adrs: PlannedGovernanceItem[];
}

export interface TaskArtifact {
  id: string;
  slug: string;
  title?: string;
  depends_on: string[];
  links: string[];
  context?: string;
  plannedGovernance?: ParsedPlannedGovernance;
  acceptanceCriteria: TaskAcceptanceCriteriaItem[];
  rawContent?: string;
  filePath?: string;
}

export interface TaskRenderOptions {
  id: string | number;
  slug?: string;
  title?: string;
  depends_on?: string[];
  links?: string[];
  context?: string;
  plannedGovernance?: PlannedGovernanceDeclaration;
  acceptanceCriteria?: Array<
    string | { text: string; completed?: boolean }
  >;
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

import type { IVcsAdapter } from "../vcs/types.ts";

export interface StartTaskBranchOptions {
  base?: string;
  force?: boolean;
  cwd?: string;
  vcs?: IVcsAdapter;
}

export interface StartTaskBranchResult {
  taskId: string;
  slug: string;
  branchName: string;
  baseBranch: string;
  created: boolean;
  isSubtask: boolean;
  parentBranch?: string;
}

export interface MergeTaskBranchOptions {
  target?: string;
  keepBranch?: boolean;
  force?: boolean;
  cwd?: string;
  vcs?: IVcsAdapter;
}

export interface MergeTaskBranchResult {
  taskId: string;
  slug: string;
  sourceBranch: string;
  targetBranch: string;
  deletedSourceBranch: boolean;
  isSubtask: boolean;
  mergeCommitHash?: string;
}

export interface CreateTaskOptions {
  /**
   * Title of the task (human-readable string).
   * E.g. "Create Task CLI"
   */
  title: string;

  /**
   * Optional target scope directory where the task should reside.
   * Defaults to workspace root (cwd).
   */
  scopeDir?: string;

  /**
   * Context / user story / background explanation for the task.
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
   * Planned governance declarations (rules and ADRs to author during task execution).
   */
  plannedGovernance?: PlannedGovernanceDeclaration;

  /**
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;

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

export interface CreateTaskResult {
  artifact: TaskArtifact;
  filename: string;
  filepath: string;
  relativePath: string;
  markdown: string;
  watermark: import("../resolver/types.ts").WatermarkDetails;
}

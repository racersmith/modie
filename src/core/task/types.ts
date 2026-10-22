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

export interface TaskArtifact {
  id: string;
  slug: string;
  title?: string;
  depends_on: string[];
  links: string[];
  context?: string;
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
  acceptanceCriteria?: (string | TaskAcceptanceCriteriaItem)[];
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

export interface StartTaskBranchOptions {
  base?: string;
  force?: boolean;
  cwd?: string;
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

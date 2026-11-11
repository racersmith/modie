/**
 * Modie Core: Task engine types for branch topology, branch management, and collision detection.
 * (RULE-28, RULE-33).
 */

import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import type { WorkspaceContext } from "../context/types.ts";

export interface StartTaskBranchOptions {
  base?: string;
  force?: boolean;
  cwd?: string;
  vcs?: IVcsAdapter;
  workspace?: WorkspaceContext;
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
  workspace?: WorkspaceContext;
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


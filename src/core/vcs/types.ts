/**
 * Version Control System (VCS) adapter abstraction types.
 * Complies with RULE-25, RULE-28, and ADR-6.
 */

import type { DiscoveredArtifact, IndexableSubtype } from "../resolver/types.ts";

export interface MultiBranchOptions {
  excludeCurrent?: boolean;
  excludeBranch?: string;
  branches?: string[];
}

export interface StageFilesOptions {
  /**
   * If true, only updates tracked files (equivalent to git add -u).
   */
  updateOnly?: boolean;
}

/**
 * Universal interface for version control operations.
 * Decouples domain logic from direct process execution and enables hermetic unit testing.
 */
export interface IVcsAdapter {
  // Context & Capability
  isInsideWorkTree(cwd?: string): Promise<boolean>;

  // Branch Query & Detection
  detectCurrentBranch(cwd?: string): Promise<string | null>;
  listBranches(cwd?: string): Promise<string[]>;
  branchExists(branchName: string, cwd?: string): Promise<boolean>;

  // Branch Lifecycle
  checkout(branchName: string, cwd?: string): Promise<void>;
  checkoutNewBranch(
    branchName: string,
    baseBranch: string,
    cwd?: string,
  ): Promise<void>;
  deleteBranch(
    branchName: string,
    cwd?: string,
    force?: boolean,
  ): Promise<void>;

  // Staging & Commits
  getStatusPorcelain(cwd?: string): Promise<string>;
  hasWorkingTreeChanges(cwd?: string): Promise<boolean>;
  getStagedFiles(cwd?: string): Promise<string[]>;
  stageAll(cwd?: string): Promise<void>;
  stageFiles(
    files: string[],
    cwd?: string,
    options?: StageFilesOptions,
  ): Promise<void>;
  commit(
    message: string,
    cwd?: string,
    files?: string[],
  ): Promise<string>;
  getShortHash(ref?: string, cwd?: string): Promise<string>;

  // Merge
  mergeBase(
    branchA: string,
    branchB: string,
    cwd?: string,
  ): Promise<string | null>;
  merge(
    sourceBranch: string,
    targetBranch: string,
    message?: string,
    cwd?: string,
  ): Promise<string>;

  // Artifact Tree & History Inspection
  inspectTreeArtifacts(
    ref: string,
    cwd?: string,
    subtype?: IndexableSubtype,
  ): Promise<DiscoveredArtifact[]>;
  inspectDeletedArtifacts(
    cwd?: string,
    subtype?: IndexableSubtype,
  ): Promise<DiscoveredArtifact[]>;
  inspectMultiBranchActiveArtifacts(
    cwd?: string,
    subtype?: IndexableSubtype,
    options?: MultiBranchOptions,
  ): Promise<DiscoveredArtifact[]>;

  // Configuration & Raw Execution (Escape Hatch)
  getConfig(key: string, cwd?: string): Promise<string | null>;
  run(args: string[], cwd?: string): Promise<string | null>;
  runCommand(args: string[], cwd?: string): Promise<string>;
}

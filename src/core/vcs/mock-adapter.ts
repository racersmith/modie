/**
 * In-memory MockVcsAdapter for hermetic, high-speed unit testing.
 * Complies with RULE-25, RULE-28, and ADR-6.
 */

import type {
  DiscoveredArtifact,
  IndexableSubtype,
} from "../resolver/types.ts";
import type {
  GitGrepMatch,
  GitGrepOptions,
  IVcsAdapter,
  MultiBranchOptions,
  StageFilesOptions,
} from "./types.ts";

export interface MockVcsOptions {
  insideWorkTree?: boolean;
  currentBranch?: string | null;
  branches?: string[];
  treeArtifacts?: Record<string, DiscoveredArtifact[]>;
  deletedArtifacts?: DiscoveredArtifact[];
  config?: Record<string, string>;
  workingTreeChanged?: boolean;
  stagedFiles?: string[];
  shortHash?: string;
  mergeBaseResult?: string | null;
  grepResults?: Record<string, GitGrepMatch[]> | Map<string, GitGrepMatch[]>;
}

export class MockVcsAdapter implements IVcsAdapter {
  public insideWorkTree: boolean;
  public currentBranch: string | null;
  public branches: Set<string>;
  public treeArtifacts: Map<string, DiscoveredArtifact[]>;
  public deletedArtifacts: DiscoveredArtifact[];
  public config: Map<string, string>;
  public workingTreeChanged: boolean;
  public stagedFiles: string[];
  public shortHash: string;
  public mergeBaseResult: string | null;
  public grepResults: Map<string, GitGrepMatch[]> | null = null;

  // History tracking for test assertions
  public history: {
    checkouts: string[];
    checkoutNewBranches: Array<{ branch: string; base: string }>;
    deletedBranches: Array<{ branch: string; force?: boolean }>;
    commits: Array<{ message: string; files?: string[]; hash: string }>;
    merges: Array<{
      source: string;
      target: string;
      message?: string;
      hash: string;
    }>;
    stagedAllCount: number;
    stagedFileCalls: Array<{ files: string[]; updateOnly?: boolean }>;
    rawRuns: Array<{ args: string[]; cwd?: string }>;
    rawCommands: Array<{ args: string[]; cwd?: string }>;
  };

  private commitCounter = 1;

  constructor(options: MockVcsOptions = {}) {
    this.insideWorkTree = options.insideWorkTree ?? true;
    this.currentBranch = options.currentBranch ?? "main";
    this.branches = new Set(options.branches ?? ["main"]);
    this.treeArtifacts = new Map();
    if (options.treeArtifacts) {
      for (const [branch, artifacts] of Object.entries(options.treeArtifacts)) {
        this.treeArtifacts.set(branch, [...artifacts]);
      }
    }
    this.deletedArtifacts = [...(options.deletedArtifacts ?? [])];
    this.config = new Map(Object.entries(options.config ?? {}));
    this.workingTreeChanged = options.workingTreeChanged ?? false;
    this.stagedFiles = [...(options.stagedFiles ?? [])];
    this.shortHash = options.shortHash ?? "mock001";
    this.mergeBaseResult = options.mergeBaseResult ?? "base001";
    if (options.grepResults) {
      this.grepResults =
        options.grepResults instanceof Map
          ? new Map(options.grepResults)
          : new Map(Object.entries(options.grepResults));
    }

    this.history = {
      checkouts: [],
      checkoutNewBranches: [],
      deletedBranches: [],
      commits: [],
      merges: [],
      stagedAllCount: 0,
      stagedFileCalls: [],
      rawRuns: [],
      rawCommands: [],
    };
  }

  async isInsideWorkTree(_cwd?: string): Promise<boolean> {
    return this.insideWorkTree;
  }

  async detectCurrentBranch(_cwd?: string): Promise<string | null> {
    return this.currentBranch;
  }

  async listBranches(_cwd?: string): Promise<string[]> {
    return Array.from(this.branches);
  }

  async branchExists(branchName: string, _cwd?: string): Promise<boolean> {
    return this.branches.has(branchName);
  }

  async checkout(branchName: string, _cwd?: string): Promise<void> {
    if (!this.branches.has(branchName)) {
      throw new Error(`Git checkout failed: branch "${branchName}" not found`);
    }
    this.currentBranch = branchName;
    this.history.checkouts.push(branchName);
  }

  async checkoutNewBranch(
    branchName: string,
    baseBranch: string,
    _cwd?: string,
  ): Promise<void> {
    this.branches.add(branchName);
    this.currentBranch = branchName;
    this.history.checkoutNewBranches.push({
      branch: branchName,
      base: baseBranch,
    });
  }

  async deleteBranch(
    branchName: string,
    _cwd?: string,
    force?: boolean,
  ): Promise<void> {
    this.branches.delete(branchName);
    this.history.deletedBranches.push({ branch: branchName, force });
  }

  async getStatusPorcelain(_cwd?: string): Promise<string> {
    return this.workingTreeChanged ? " M modified-file.ts\n" : "";
  }

  async hasWorkingTreeChanges(_cwd?: string): Promise<boolean> {
    return this.workingTreeChanged;
  }

  async getStagedFiles(_cwd?: string): Promise<string[]> {
    return [...this.stagedFiles];
  }

  async stageAll(_cwd?: string): Promise<void> {
    this.history.stagedAllCount++;
    this.workingTreeChanged = false;
    if (!this.stagedFiles.includes("staged-all")) {
      this.stagedFiles.push("staged-all");
    }
  }

  async stageFiles(
    files: string[],
    _cwd?: string,
    options?: StageFilesOptions,
  ): Promise<void> {
    this.history.stagedFileCalls.push({
      files: [...files],
      updateOnly: options?.updateOnly,
    });
    for (const f of files) {
      if (!this.stagedFiles.includes(f)) {
        this.stagedFiles.push(f);
      }
    }
  }

  async commit(
    message: string,
    _cwd?: string,
    files?: string[],
  ): Promise<string> {
    const hash = `hash${this.commitCounter++}`;
    this.history.commits.push({
      message,
      files: files ? [...files] : undefined,
      hash,
    });
    this.shortHash = hash;
    this.stagedFiles = [];
    return hash;
  }

  async getShortHash(_ref: string = "HEAD", _cwd?: string): Promise<string> {
    return this.shortHash;
  }

  async mergeBase(
    _branchA: string,
    _branchB: string,
    _cwd?: string,
  ): Promise<string | null> {
    return this.mergeBaseResult;
  }

  async merge(
    sourceBranch: string,
    targetBranch: string,
    message?: string,
    _cwd?: string,
  ): Promise<string> {
    await this.checkout(targetBranch);
    const hash = `merge${this.commitCounter++}`;
    this.history.merges.push({
      source: sourceBranch,
      target: targetBranch,
      message,
      hash,
    });
    this.shortHash = hash;
    return hash;
  }

  async inspectTreeArtifacts(
    ref: string,
    _cwd?: string,
    subtype?: IndexableSubtype,
  ): Promise<DiscoveredArtifact[]> {
    const artifacts = this.treeArtifacts.get(ref) ?? [];
    if (!subtype) {
      return [...artifacts];
    }
    const targetSubtype = subtype.toUpperCase();
    return artifacts.filter((a) => a.subtype === targetSubtype);
  }

  async inspectDeletedArtifacts(
    _cwd?: string,
    subtype?: IndexableSubtype,
  ): Promise<DiscoveredArtifact[]> {
    if (!subtype) {
      return [...this.deletedArtifacts];
    }
    const targetSubtype = subtype.toUpperCase();
    return this.deletedArtifacts.filter((a) => a.subtype === targetSubtype);
  }

  async inspectMultiBranchActiveArtifacts(
    cwd?: string,
    subtype?: IndexableSubtype,
    options: MultiBranchOptions = {},
  ): Promise<DiscoveredArtifact[]> {
    const branches = options.branches ?? (await this.listBranches(cwd));
    const exclude = new Set<string>();
    if (options.excludeCurrent && this.currentBranch) {
      exclude.add(this.currentBranch);
    }
    if (options.excludeBranch) {
      exclude.add(options.excludeBranch);
    }

    const targetBranches = branches.filter((b) => !exclude.has(b));
    const results: DiscoveredArtifact[] = [];
    const seen = new Set<string>();

    for (const b of targetBranches) {
      const branchArtifacts = await this.inspectTreeArtifacts(b, cwd, subtype);
      for (const art of branchArtifacts) {
        const key = `${art.subtype}:${art.id.toLowerCase()}:${art.filepath}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(art);
        }
      }
    }

    return results;
  }

  async grep(
    query: string,
    _cwd?: string,
    _options?: GitGrepOptions,
  ): Promise<GitGrepMatch[] | null> {
    if (this.grepResults && this.grepResults.has(query)) {
      return [...this.grepResults.get(query)!];
    }
    return null;
  }

  async getConfig(key: string, _cwd?: string): Promise<string | null> {
    return this.config.get(key) ?? null;
  }

  async run(args: string[], cwd?: string): Promise<string | null> {
    this.history.rawRuns.push({ args: [...args], cwd });
    if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
      return this.insideWorkTree ? "true" : "false";
    }
    if (args[0] === "branch" && args[1] === "--show-current") {
      return this.currentBranch;
    }
    return null;
  }

  async runCommand(args: string[], cwd?: string): Promise<string> {
    this.history.rawCommands.push({ args: [...args], cwd });
    return "ok";
  }
}

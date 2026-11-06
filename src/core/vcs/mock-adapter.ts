/**
 * In-memory MockVcsAdapter for hermetic, high-speed unit testing.
 * Complies with RULE-25, RULE-28, and ADR-6.
 */

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
  treeFiles?: Record<string, string[]> | Map<string, string[]>;
  deletedFilesList?: string[];
  activeTrackedFiles?: string[];
  logGrepResults?: Record<string, string[]> | Map<string, string[]>;
  // Backwards compatibility for existing test setup objects:
  treeArtifacts?: Record<
    string,
    Array<{ filepath?: string; filename?: string; [k: string]: any }>
  >;
  deletedArtifacts?: Array<{
    filepath?: string;
    filename?: string;
    [k: string]: any;
  }>;
  config?: Record<string, string>;
  workingTreeChanged?: boolean;
  stagedFiles?: string[];
  shortHash?: string;
  mergeBaseResult?: string | null;
  grepResults?: Record<string, GitGrepMatch[]> | Map<string, GitGrepMatch[]>;
  fileContentsAtRef?: Record<string, string> | Map<string, string>;
  deletedFiles?: Record<string, string> | Map<string, string>;
}

export class MockVcsAdapter implements IVcsAdapter {
  public insideWorkTree: boolean;
  public currentBranch: string | null;
  public branches: Set<string>;
  public treeFiles: Map<string, string[]>;
  public treeArtifacts: Map<
    string,
    Array<{ filepath?: string; filename?: string; [k: string]: any }>
  >;
  public deletedFilesList: string[];
  public deletedArtifacts: Array<{
    filepath?: string;
    filename?: string;
    [k: string]: any;
  }>;
  public activeTrackedFiles: string[];
  public logGrepResults: Map<string, string[]>;
  public config: Map<string, string>;
  public workingTreeChanged: boolean;
  public stagedFiles: string[];
  public shortHash: string;
  public mergeBaseResult: string | null;
  public grepResults: Map<string, GitGrepMatch[]> | null = null;
  public fileContentsAtRef: Map<string, string>;
  public deletedFiles: Map<string, string>;

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
    readFileAtRefCalls: Array<{ ref: string; path: string; cwd?: string }>;
    readDeletedFileCalls: Array<{ path: string; cwd?: string }>;
    rawRuns: Array<{ args: string[]; cwd?: string }>;
    rawCommands: Array<{ args: string[]; cwd?: string }>;
  };

  private commitCounter = 1;

  constructor(options: MockVcsOptions = {}) {
    this.insideWorkTree = options.insideWorkTree ?? true;
    this.currentBranch = options.currentBranch ?? "main";
    this.branches = new Set(options.branches ?? ["main"]);
    this.treeFiles = new Map();
    if (options.treeFiles) {
      const entries =
        options.treeFiles instanceof Map
          ? options.treeFiles.entries()
          : Object.entries(options.treeFiles);
      for (const [branch, files] of entries) {
        this.treeFiles.set(branch, [...files]);
      }
    }
    this.treeArtifacts = new Map();
    if (options.treeArtifacts) {
      for (const [branch, artifacts] of Object.entries(options.treeArtifacts)) {
        this.treeArtifacts.set(branch, [...artifacts]);
        const existing = this.treeFiles.get(branch) ?? [];
        const paths = artifacts.map((a) => a.filepath ?? a.filename ?? "");
        this.treeFiles.set(branch, [...existing, ...paths]);
      }
    }
    this.deletedArtifacts = [...(options.deletedArtifacts ?? [])];
    this.deletedFilesList = [...(options.deletedFilesList ?? [])];
    if (options.deletedArtifacts) {
      const paths = options.deletedArtifacts.map(
        (a) => a.filepath ?? a.filename ?? "",
      );
      this.deletedFilesList.push(...paths);
    }
    this.activeTrackedFiles = [...(options.activeTrackedFiles ?? [])];
    this.logGrepResults = new Map();
    if (options.logGrepResults) {
      const entries =
        options.logGrepResults instanceof Map
          ? options.logGrepResults.entries()
          : Object.entries(options.logGrepResults);
      for (const [k, v] of entries) {
        this.logGrepResults.set(k, [...v]);
      }
    }

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
    this.fileContentsAtRef =
      options.fileContentsAtRef instanceof Map
        ? new Map(options.fileContentsAtRef)
        : new Map(Object.entries(options.fileContentsAtRef ?? {}));
    this.deletedFiles =
      options.deletedFiles instanceof Map
        ? new Map(options.deletedFiles)
        : new Map(Object.entries(options.deletedFiles ?? {}));

    this.history = {
      checkouts: [],
      checkoutNewBranches: [],
      deletedBranches: [],
      commits: [],
      merges: [],
      stagedAllCount: 0,
      stagedFileCalls: [],
      readFileAtRefCalls: [],
      readDeletedFileCalls: [],
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
    this.history.checkouts.push(branchName);
    this.currentBranch = branchName;
    this.branches.add(branchName);
  }

  async checkoutNewBranch(
    branchName: string,
    baseBranch: string,
    _cwd?: string,
  ): Promise<void> {
    this.history.checkoutNewBranches.push({ branch: branchName, base: baseBranch });
    this.branches.add(branchName);
    this.currentBranch = branchName;
  }

  async deleteBranch(
    branchName: string,
    _cwd?: string,
    force?: boolean,
  ): Promise<void> {
    this.history.deletedBranches.push({ branch: branchName, force });
    this.branches.delete(branchName);
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
  }

  async stageFiles(
    files: string[],
    _cwd?: string,
    options?: StageFilesOptions,
  ): Promise<void> {
    this.history.stagedFileCalls.push({ files: [...files], updateOnly: options?.updateOnly });
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
    this.history.commits.push({ message, files, hash });
    this.shortHash = hash;
    this.stagedFiles = [];
    this.workingTreeChanged = false;
    return hash;
  }

  async getShortHash(_ref?: string, _cwd?: string): Promise<string> {
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

  async listTreeFiles(ref: string, _cwd?: string): Promise<string[]> {
    const fromFiles = this.treeFiles.get(ref) ?? [];
    const fromArts = (this.treeArtifacts.get(ref) ?? []).map(
      (a) => a.filepath ?? a.filename ?? "",
    );
    return Array.from(new Set([...fromFiles, ...fromArts])).filter(Boolean);
  }

  async listDeletedFiles(_pattern?: string, _cwd?: string): Promise<string[]> {
    const fromArts = this.deletedArtifacts.map(
      (a) => a.filepath ?? a.filename ?? "",
    );
    return Array.from(new Set([...this.deletedFilesList, ...fromArts])).filter(Boolean);
  }

  async listActiveTrackedFiles(
    _pattern?: string,
    _cwd?: string,
  ): Promise<string[]> {
    return [...this.activeTrackedFiles];
  }

  async listLogGrep(pattern: string, _cwd?: string): Promise<string[]> {
    return [...(this.logGrepResults.get(pattern) ?? [])];
  }

  async grep(
    query: string,
    _cwd?: string,
    _options?: GitGrepOptions,
  ): Promise<GitGrepMatch[] | null> {
    if (!this.grepResults) {
      return [];
    }
    return this.grepResults.get(query) ?? [];
  }

  async readFileAtRef(
    ref: string,
    path: string,
    cwd?: string,
  ): Promise<string | null> {
    this.history.readFileAtRefCalls.push({ ref, path, cwd });
    const key = `${ref}:${path}`;
    return this.fileContentsAtRef.get(key) ?? null;
  }

  async readDeletedFile(
    path: string,
    cwd?: string,
  ): Promise<string | null> {
    this.history.readDeletedFileCalls.push({ path, cwd });
    return this.deletedFiles.get(path) ?? null;
  }

  async getConfig(
    key: string,
    _cwd?: string,
  ): Promise<string | null> {
    return this.config.get(key) ?? null;
  }

  async run(args: string[], cwd?: string): Promise<string | null> {
    this.history.rawRuns.push({ args: [...args], cwd });
    if (args[0] === "branch" && args[1] === "--list") {
      return Array.from(this.branches).join("\n");
    }
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
      return this.currentBranch;
    }
    return "";
  }

  async runCommand(args: string[], cwd?: string): Promise<string> {
    this.history.rawCommands.push({ args: [...args], cwd });
    const result = await this.run(args, cwd);
    return result ?? "";
  }
}

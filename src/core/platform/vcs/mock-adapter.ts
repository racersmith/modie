/**
 * In-memory MockVcsAdapter for hermetic, high-speed unit testing.
 * Complies with RULE-25 and RULE-28.
 */

import type {
  GitGrepMatch,
  GitGrepOptions,
  IVcsAdapter,
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
  config?: Record<string, string>;
  workingTreeChanged?: boolean;
  stagedFiles?: string[];
  shortHash?: string;
  mergeBaseResult?: string | null;
  grepResults?: Record<string, GitGrepMatch[]> | Map<string, GitGrepMatch[]>;
  fileContentsAtRef?: Record<string, string> | Map<string, string>;
  deletedFiles?: Record<string, string> | Map<string, string>;
}

function initStringMap<V>(
  input?: Map<string, V> | Record<string, V>,
): Map<string, V> {
  if (!input) return new Map();
  if (input instanceof Map) return new Map(input);
  return new Map(Object.entries(input));
}

function initArrayMap<V>(
  input?: Map<string, V[]> | Record<string, V[]>,
): Map<string, V[]> {
  const map = new Map<string, V[]>();
  if (!input) return map;
  const entries =
    input instanceof Map ? input.entries() : Object.entries(input);
  for (const [key, val] of entries) {
    map.set(key, [...val]);
  }
  return map;
}

export class MockVcsAdapter implements IVcsAdapter {
  public insideWorkTree: boolean;
  public currentBranch: string | null;
  public branches: Set<string>;
  public treeFiles: Map<string, string[]>;
  public deletedFilesList: string[];
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
    this.treeFiles = initArrayMap(options.treeFiles);
    this.deletedFilesList = [...(options.deletedFilesList ?? [])];
    this.activeTrackedFiles = [...(options.activeTrackedFiles ?? [])];
    this.logGrepResults = initArrayMap(options.logGrepResults);
    this.config = initStringMap(options.config);
    this.workingTreeChanged = Boolean(options.workingTreeChanged);
    this.stagedFiles = [...(options.stagedFiles ?? [])];
    this.shortHash = options.shortHash ?? "mock001";
    this.mergeBaseResult = options.mergeBaseResult ?? "base001";
    this.grepResults = initStringMap(options.grepResults);
    this.fileContentsAtRef = initStringMap(options.fileContentsAtRef);
    this.deletedFiles = initStringMap(options.deletedFiles);

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
    this.history.checkoutNewBranches.push({
      branch: branchName,
      base: baseBranch,
    });
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
    return [...(this.treeFiles.get(ref) ?? [])];
  }

  async listDeletedFiles(_pattern?: string, _cwd?: string): Promise<string[]> {
    return [...this.deletedFilesList];
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

  async readDeletedFile(path: string, cwd?: string): Promise<string | null> {
    this.history.readDeletedFileCalls.push({ path, cwd });
    return this.deletedFiles.get(path) ?? null;
  }

  async getConfig(key: string, _cwd?: string): Promise<string | null> {
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

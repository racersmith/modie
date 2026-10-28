/**
 * Git CLI implementation of IVcsAdapter.
 * Wraps local git binary execution with robust buffer management and error reporting.
 * Complies with RULE-25, RULE-28, and ADR-6.
 */

import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { parseArtifactFilename } from "../common/filename.ts";
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

const execFileAsync = promisify(execFile);

export class GitCliAdapter implements IVcsAdapter {
  /**
   * Safely executes a git command, returning stdout trimmed or null on error.
   */
  async run(
    args: string[],
    cwd: string = process.cwd(),
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Executes a git command and returns trimmed stdout.
   * Throws a descriptive Error containing git stderr/message if execution fails.
   */
  async runCommand(
    args: string[],
    cwd: string = process.cwd(),
  ): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout.trim();
    } catch (error: any) {
      const message = error.stderr?.trim() || error.message || String(error);
      throw new Error(`Git command failed "git ${args.join(" ")}": ${message}`);
    }
  }

  async isInsideWorkTree(cwd: string = process.cwd()): Promise<boolean> {
    const output = await this.run(["rev-parse", "--is-inside-work-tree"], cwd);
    return output === "true";
  }

  async detectCurrentBranch(cwd: string = process.cwd()): Promise<string | null> {
    const branch = await this.run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (branch && branch !== "HEAD") {
      return branch;
    }

    const showCurrent = await this.run(["branch", "--show-current"], cwd);
    if (showCurrent && showCurrent.length > 0) {
      return showCurrent;
    }

    // Fallback to CI environment variables if running in detached HEAD
    const envBranch =
      process.env.GITHUB_REF_NAME ||
      process.env.GIT_BRANCH ||
      process.env.CI_COMMIT_REF_NAME;
    if (envBranch && envBranch.length > 0) {
      return envBranch;
    }

    return null;
  }

  async listBranches(cwd: string = process.cwd()): Promise<string[]> {
    const output = await this.run(
      ["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
      cwd,
    );
    if (!output) {
      return [];
    }
    return output
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);
  }

  async branchExists(
    branchName: string,
    cwd: string = process.cwd(),
  ): Promise<boolean> {
    const output = await this.run(
      ["rev-parse", "--verify", `refs/heads/${branchName}`],
      cwd,
    );
    return output !== null;
  }

  async checkout(branchName: string, cwd: string = process.cwd()): Promise<void> {
    await this.runCommand(["checkout", branchName], cwd);
  }

  async checkoutNewBranch(
    branchName: string,
    baseBranch: string,
    cwd: string = process.cwd(),
  ): Promise<void> {
    await this.runCommand(["checkout", "-b", branchName, baseBranch], cwd);
  }

  async deleteBranch(
    branchName: string,
    cwd: string = process.cwd(),
    force: boolean = false,
  ): Promise<void> {
    await this.runCommand(["branch", force ? "-D" : "-d", branchName], cwd);
  }

  async getStatusPorcelain(cwd: string = process.cwd()): Promise<string> {
    const output = await this.run(["status", "--porcelain"], cwd);
    return output ?? "";
  }

  async hasWorkingTreeChanges(cwd: string = process.cwd()): Promise<boolean> {
    const status = await this.getStatusPorcelain(cwd);
    return status.trim().length > 0;
  }

  async getStagedFiles(cwd: string = process.cwd()): Promise<string[]> {
    const output = await this.run(["diff", "--cached", "--name-only"], cwd);
    if (!output) {
      return [];
    }
    return output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  async stageAll(cwd: string = process.cwd()): Promise<void> {
    await this.runCommand(["add", "-A"], cwd);
  }

  async stageFiles(
    files: string[],
    cwd: string = process.cwd(),
    options?: StageFilesOptions,
  ): Promise<void> {
    if (files.length === 0) return;
    const args = options?.updateOnly
      ? ["add", "-u", "--", ...files]
      : ["add", "--", ...files];
    await this.runCommand(args, cwd);
  }

  async commit(
    message: string,
    cwd: string = process.cwd(),
    files?: string[],
  ): Promise<string> {
    if (files && files.length > 0) {
      await this.runCommand(["commit", "-m", message, "--", ...files], cwd);
    } else {
      await this.runCommand(["commit", "-m", message], cwd);
    }
    return this.getShortHash("HEAD", cwd);
  }

  async getShortHash(
    ref: string = "HEAD",
    cwd: string = process.cwd(),
  ): Promise<string> {
    return this.runCommand(["rev-parse", "--short", ref], cwd);
  }

  async mergeBase(
    branchA: string,
    branchB: string,
    cwd: string = process.cwd(),
  ): Promise<string | null> {
    const output = await this.run(["merge-base", branchA, branchB], cwd);
    return output ? output.trim() : null;
  }

  async merge(
    sourceBranch: string,
    targetBranch: string,
    message?: string,
    cwd: string = process.cwd(),
  ): Promise<string> {
    const msg = message ?? `merge: ${sourceBranch} into ${targetBranch}`;
    await this.checkout(targetBranch, cwd);
    await this.runCommand(
      ["merge", "--no-ff", "-m", msg, sourceBranch],
      cwd,
    );
    return this.getShortHash("HEAD", cwd);
  }

  async inspectTreeArtifacts(
    ref: string,
    cwd: string = process.cwd(),
    subtype?: IndexableSubtype,
  ): Promise<DiscoveredArtifact[]> {
    const output = await this.run(["ls-tree", "-r", "--name-only", ref], cwd);
    if (!output) {
      return [];
    }

    const lines = output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const discovered: DiscoveredArtifact[] = [];
    const targetSubtype = subtype
      ? (subtype.toUpperCase() as IndexableSubtype)
      : undefined;

    for (const line of lines) {
      const filename = basename(line);
      const parsed = parseArtifactFilename(filename);
      if (parsed) {
        if (!targetSubtype || parsed.subtype === targetSubtype) {
          discovered.push({
            id: parsed.id,
            subtype: parsed.subtype,
            tag: parsed.tag,
            slug: parsed.slug,
            filename: parsed.filename,
            filepath: line,
            isArchived: parsed.isArchived,
            status: "active",
          });
        }
      }
    }

    return discovered;
  }

  async inspectDeletedArtifacts(
    cwd: string = process.cwd(),
    subtype?: IndexableSubtype,
  ): Promise<DiscoveredArtifact[]> {
    const pattern = subtype ? `*.${subtype.toUpperCase()}-*.md` : "*.*-*.md";

    // Multi-ref search
    let output = await this.run(
      [
        "log",
        "--all",
        "--diff-filter=D",
        "--format=",
        "--name-only",
        "--",
        pattern,
      ],
      cwd,
    );

    // Fall back to HEAD log if --all fails (shallow clone or branch without reflog)
    if (output === null) {
      output = await this.run(
        ["log", "--diff-filter=D", "--format=", "--name-only", "--", pattern],
        cwd,
      );
    }

    if (!output) {
      return [];
    }

    const lines = output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Collect currently active tracked artifact IDs in Git to distinguish renames from deletions
    const activeGitOutput = await this.run(["ls-files", "--", pattern], cwd);
    const activeGitIds = new Set<string>();
    if (activeGitOutput) {
      for (const activeLine of activeGitOutput.split("\n")) {
        const p = parseArtifactFilename(activeLine.trim());
        if (p) {
          activeGitIds.add(p.id.toLowerCase());
        }
      }
    }

    const discovered: DiscoveredArtifact[] = [];
    const seenPaths = new Set<string>();
    const targetSubtype = subtype
      ? (subtype.toUpperCase() as IndexableSubtype)
      : undefined;

    for (const line of lines) {
      if (seenPaths.has(line)) continue;
      seenPaths.add(line);

      const parsed = parseArtifactFilename(line);
      if (parsed) {
        if (!targetSubtype || parsed.subtype === targetSubtype) {
          if (activeGitIds.has(parsed.id.toLowerCase())) {
            continue;
          }

          discovered.push({
            id: parsed.id,
            subtype: parsed.subtype,
            tag: parsed.tag,
            slug: parsed.slug,
            filename: parsed.filename,
            filepath: line,
            isArchived: parsed.isArchived,
            status: "deleted",
          });
        }
      }
    }

    // Ensure any task explicitly completed via commit ceremony is permanently recorded as deleted (RULE-21)
    if (!targetSubtype || targetSubtype === "TASK") {
      const completedLog = await this.run(
        ["log", "--all", "--grep=delete completed TASK-", "--format=%s"],
        cwd,
      );
      if (completedLog) {
        for (const msg of completedLog.split("\n")) {
          const match = msg.match(/delete completed TASK-([A-Za-z0-9_-]+)/i);
          if (match && match[1]) {
            const compId = match[1];
            if (
              !discovered.some((d) => d.id.toLowerCase() === compId.toLowerCase())
            ) {
              discovered.push({
                id: compId,
                subtype: "TASK",
                tag: `TASK-${compId}`,
                slug: "",
                filename: "",
                filepath: "",
                isArchived: false,
                status: "deleted",
              });
            }
          }
        }
      }
    }

    return discovered;
  }

  async inspectMultiBranchActiveArtifacts(
    cwd: string = process.cwd(),
    subtype?: IndexableSubtype,
    options: MultiBranchOptions = {},
  ): Promise<DiscoveredArtifact[]> {
    let branches = options.branches;
    if (!branches) {
      branches = await this.listBranches(cwd);
    }

    const exclude = new Set<string>();
    if (options.excludeCurrent) {
      const currentBranch = await this.detectCurrentBranch(cwd);
      if (currentBranch) {
        exclude.add(currentBranch);
      }
    }
    if (options.excludeBranch) {
      exclude.add(options.excludeBranch);
    }

    const targetBranches = branches.filter((b) => !exclude.has(b));
    const discovered: DiscoveredArtifact[] = [];
    const seenKeys = new Set<string>();

    for (const branch of targetBranches) {
      const branchArtifacts = await this.inspectTreeArtifacts(
        branch,
        cwd,
        subtype,
      );
      for (const art of branchArtifacts) {
        const key = `${art.subtype}:${art.id.toLowerCase()}:${art.filepath}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          discovered.push(art);
        }
      }
    }

    return discovered;
  }

  async getConfig(
    key: string,
    cwd: string = process.cwd(),
  ): Promise<string | null> {
    const value = await this.run(["config", key], cwd);
    return value && value.length > 0 ? value : null;
  }

  async grep(
    query: string,
    cwd: string = process.cwd(),
    options: GitGrepOptions = {},
  ): Promise<GitGrepMatch[] | null> {
    const args = ["grep", "-n", "-I", "-z"];
    if (options.untracked !== false) {
      args.push("--untracked", "--exclude-standard");
    }
    if (options.caseSensitive === false) {
      args.push("-i");
    }
    if (options.fixedStrings !== false) {
      args.push("-F");
    }
    args.push(query);

    const ignored = options.ignoredDirectories ?? [];
    if (ignored.length > 0) {
      args.push("--");
      for (const dir of ignored) {
        args.push(`:!${dir}`);
      }
    }

    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
      return parseGitGrepZOutput(stdout);
    } catch (error: any) {
      // Exit code 1 means 0 matches found in git grep
      if (error && (error.code === 1 || error.status === 1)) {
        return [];
      }
      return null;
    }
  }
}

/**
 * Parses null-separated output produced by `git grep -n -I -z`.
 */
export function parseGitGrepZOutput(stdout: string): GitGrepMatch[] {
  if (!stdout || stdout.length === 0) {
    return [];
  }
  const lines = stdout.split("\n");
  const matches: GitGrepMatch[] = [];

  for (const line of lines) {
    if (!line) continue;
    const firstNull = line.indexOf("\0");
    if (firstNull === -1) continue;
    const secondNull = line.indexOf("\0", firstNull + 1);
    if (secondNull === -1) continue;

    const relativePath = line.slice(0, firstNull);
    const lineNumStr = line.slice(firstNull + 1, secondNull);
    const lineNum = parseInt(lineNumStr, 10);
    if (Number.isNaN(lineNum)) continue;

    const snippet = line.slice(secondNull + 1).replace(/\r$/, "");
    matches.push({
      relativePath,
      line: lineNum,
      snippet,
    });
  }

  return matches;
}

/**
 * Shared default singleton instance of GitCliAdapter.
 */
export const defaultVcsAdapter = new GitCliAdapter();

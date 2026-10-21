/**
 * Git history inspector for deleted tasks and branch context.
 * Complies with ADR-6, ADR-9, and RULE-21.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseTaskFilename } from "../primitives/task/filename.ts";
import type { DiscoveredTask } from "./types.ts";

const execFileAsync = promisify(execFile);

/**
 * Safely executes a git command, returning stdout trimmed or null on error.
 */
export async function runGit(args: string[], cwd: string = process.cwd()): Promise<string | null> {
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
 * Detects the current git branch name.
 * Returns null if not in a git repo or in detached HEAD without branch metadata.
 */
export async function detectGitBranch(cwd: string = process.cwd()): Promise<string | null> {
  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (branch && branch !== "HEAD") {
    return branch;
  }

  const showCurrent = await runGit(["branch", "--show-current"], cwd);
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

/**
 * Retrieves the optional git config `modie.prefix` (or `canon.prefix`) if set.
 */
export async function getGitConfigPrefix(cwd: string = process.cwd()): Promise<string | null> {
  const modiePrefix = await runGit(["config", "modie.prefix"], cwd);
  if (modiePrefix && modiePrefix.length > 0) {
    return modiePrefix;
  }
  const canonPrefix = await runGit(["config", "canon.prefix"], cwd);
  return canonPrefix && canonPrefix.length > 0 ? canonPrefix : null;
}

/**
 * Queries git commit history for deleted task files across reachable branches:
 * `git log --all --diff-filter=D --format= --name-only -- *.TASK-*.md`
 */
export async function inspectGitDeletedTasks(cwd: string = process.cwd()): Promise<DiscoveredTask[]> {
  // First attempt multi-ref global search
  let output = await runGit(
    ["log", "--all", "--diff-filter=D", "--format=", "--name-only", "--", "*.TASK-*.md"],
    cwd,
  );

  // If --all fails (e.g. shallow clone or fresh branch with no reflogs), fall back to HEAD log
  if (output === null) {
    output = await runGit(
      ["log", "--diff-filter=D", "--format=", "--name-only", "--", "*.TASK-*.md"],
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

  const discovered: DiscoveredTask[] = [];
  const seenPaths = new Set<string>();

  for (const line of lines) {
    if (seenPaths.has(line)) continue;
    seenPaths.add(line);

    const parsed = parseTaskFilename(line);
    if (parsed) {
      discovered.push({
        id: parsed.id,
        slug: parsed.slug,
        filename: parsed.filename,
        filepath: line,
        status: "deleted",
      });
    }
  }

  return discovered;
}

/**
 * Returns a deduplicated list of task IDs that were deleted in git history.
 */
export async function inspectGitDeletedTaskIds(cwd: string = process.cwd()): Promise<string[]> {
  const tasks = await inspectGitDeletedTasks(cwd);
  return Array.from(new Set(tasks.map((t) => t.id)));
}

/**
 * Git history inspector for deleted artifacts and branch context.
 * Complies with ADR-6, ADR-9, and RULE-21.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArtifactFilename } from "../primitives/common/filename.ts";
import type { DiscoveredArtifact, DiscoveredTask, IndexableSubtype } from "./types.ts";

const execFileAsync = promisify(execFile);

/**
 * Safely executes a git command, returning stdout trimmed or null on error.
 */
export async function runGit(
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
 * Detects the current git branch name.
 * Returns null if not in a git repo or in detached HEAD without branch metadata.
 */
export async function detectGitBranch(
  cwd: string = process.cwd(),
): Promise<string | null> {
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
 * Retrieves the optional git config `modie.prefix` if set.
 */
export async function getGitConfigPrefix(
  cwd: string = process.cwd(),
): Promise<string | null> {
  const prefix = await runGit(["config", "modie.prefix"], cwd);
  return prefix && prefix.length > 0 ? prefix : null;
}

/**
 * Queries git commit history for deleted artifact files across reachable branches:
 * `git log --all --diff-filter=D --format= --name-only -- *.<SUBTYPE>-*.md`
 */
export async function inspectGitDeletedArtifacts(
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
): Promise<DiscoveredArtifact[]> {
  const pattern = subtype ? `*.${subtype.toUpperCase()}-*.md` : "*.*-*.md";

  // First attempt multi-ref global search
  let output = await runGit(
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

  // If --all fails (e.g. shallow clone or fresh branch with no reflogs), fall back to HEAD log
  if (output === null) {
    output = await runGit(
      [
        "log",
        "--diff-filter=D",
        "--format=",
        "--name-only",
        "--",
        pattern,
      ],
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

  const discovered: DiscoveredArtifact[] = [];
  const seenPaths = new Set<string>();
  const targetSubtype = subtype ? (subtype.toUpperCase() as IndexableSubtype) : undefined;

  for (const line of lines) {
    if (seenPaths.has(line)) continue;
    seenPaths.add(line);

    const parsed = parseArtifactFilename(line);
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
          status: "deleted",
        });
      }
    }
  }

  return discovered;
}

/**
 * Returns a deduplicated list of artifact IDs that were deleted in git history for a given subtype.
 */
export async function inspectGitDeletedArtifactIds(
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
): Promise<string[]> {
  const artifacts = await inspectGitDeletedArtifacts(cwd, subtype);
  return Array.from(new Set(artifacts.map((a) => a.id)));
}

/**
 * Queries git commit history for deleted task files across reachable branches:
 * `git log --all --diff-filter=D --format= --name-only -- *.TASK-*.md`
 * Backward compatibility wrapper around inspectGitDeletedArtifacts.
 */
export async function inspectGitDeletedTasks(
  cwd: string = process.cwd(),
): Promise<DiscoveredTask[]> {
  const artifacts = await inspectGitDeletedArtifacts(cwd, "TASK");
  return artifacts.map((a) => ({
    id: a.id,
    slug: a.slug,
    filename: a.filename,
    filepath: a.filepath,
    status: "deleted",
  }));
}

/**
 * Returns a deduplicated list of task IDs that were deleted in git history.
 * Backward compatibility wrapper around inspectGitDeletedArtifactIds.
 */
export async function inspectGitDeletedTaskIds(
  cwd: string = process.cwd(),
): Promise<string[]> {
  return inspectGitDeletedArtifactIds(cwd, "TASK");
}

/**
 * Git history inspector for deleted artifacts and branch context.
 * Complies with ADR-6, ADR-9, RULE-21, and RULE-33.
 */

import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { parseArtifactFilename } from "../common/filename.ts";
import type {
  DiscoveredArtifact,
  DiscoveredTask,
  IndexableSubtype,
} from "./types.ts";

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
 * Executes a git command and returns trimmed stdout.
 * Throws a descriptive Error containing git stderr/message if execution fails.
 */
export async function runGitCommand(
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

  // Collect currently active tracked artifact IDs in Git to distinguish renames from true deletions
  const activeGitOutput = await runGit(["ls-files", "--", pattern], cwd);
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
        // If an artifact with this ID is currently tracked in Git, it was renamed/moved, not deleted
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
    const completedLog = await runGit(
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

/**
 * Lists all local branch names in the git repository.
 */
export async function listGitBranches(
  cwd: string = process.cwd(),
): Promise<string[]> {
  const output = await runGit(
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

/**
 * Inspects all active indexable artifact files tracked in a git tree ref.
 */
export async function inspectGitTreeArtifacts(
  ref: string,
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
): Promise<DiscoveredArtifact[]> {
  const output = await runGit(["ls-tree", "-r", "--name-only", ref], cwd);
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

/**
 * Discovers active artifacts across other git branches using git tree queries (RULE-33).
 */
export async function inspectMultiBranchActiveArtifacts(
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
  options: {
    excludeCurrent?: boolean;
    excludeBranch?: string;
    branches?: string[];
  } = {},
): Promise<DiscoveredArtifact[]> {
  let branches = options.branches;
  if (!branches) {
    branches = await listGitBranches(cwd);
  }

  const exclude = new Set<string>();
  if (options.excludeCurrent) {
    const currentBranch = await detectGitBranch(cwd);
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
    const branchArtifacts = await inspectGitTreeArtifacts(branch, cwd, subtype);
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

/**
 * Returns a deduplicated list of active artifact IDs across other git branches (RULE-33).
 */
export async function inspectMultiBranchActiveArtifactIds(
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
  options: {
    excludeCurrent?: boolean;
    excludeBranch?: string;
    branches?: string[];
  } = {},
): Promise<string[]> {
  const artifacts = await inspectMultiBranchActiveArtifacts(
    cwd,
    subtype,
    options,
  );
  return Array.from(new Set(artifacts.map((a) => a.id)));
}

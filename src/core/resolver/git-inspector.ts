/**
 * Git history inspector for deleted artifacts and branch context.
 * Complies with ADR-6, ADR-9, RULE-21, and RULE-33.
 * Delegates to IVcsAdapter to decouple process execution from domain logic.
 */

import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type { IVcsAdapter } from "../vcs/types.ts";
import type {
  DiscoveredArtifact,
  DiscoveredTask,
  IndexableSubtype,
} from "./types.ts";

/**
 * Safely executes a git command, returning stdout trimmed or null on error.
 */
export async function runGit(
  args: string[],
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string | null> {
  return vcs.run(args, cwd);
}

/**
 * Executes a git command and returns trimmed stdout.
 * Throws a descriptive Error containing git stderr/message if execution fails.
 */
export async function runGitCommand(
  args: string[],
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string> {
  return vcs.runCommand(args, cwd);
}

/**
 * Detects the current git branch name.
 * Returns null if not in a git repo or in detached HEAD without branch metadata.
 */
export async function detectGitBranch(
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string | null> {
  return vcs.detectCurrentBranch(cwd);
}

/**
 * Retrieves the optional git config `modie.prefix` if set.
 */
export async function getGitConfigPrefix(
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string | null> {
  return vcs.getConfig("modie.prefix", cwd);
}

/**
 * Queries git commit history for deleted artifact files across reachable branches:
 * `git log --all --diff-filter=D --format= --name-only -- *.<SUBTYPE>-*.md`
 */
export async function inspectGitDeletedArtifacts(
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<DiscoveredArtifact[]> {
  return vcs.inspectDeletedArtifacts(cwd, subtype);
}

/**
 * Returns a deduplicated list of artifact IDs that were deleted in git history for a given subtype.
 */
export async function inspectGitDeletedArtifactIds(
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string[]> {
  const artifacts = await inspectGitDeletedArtifacts(cwd, subtype, vcs);
  return Array.from(new Set(artifacts.map((a) => a.id)));
}

/**
 * Queries git commit history for deleted task files across reachable branches:
 * `git log --all --diff-filter=D --format= --name-only -- *.TASK-*.md`
 * Backward compatibility wrapper around inspectGitDeletedArtifacts.
 */
export async function inspectGitDeletedTasks(
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<DiscoveredTask[]> {
  const artifacts = await inspectGitDeletedArtifacts(cwd, "TASK", vcs);
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
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string[]> {
  return inspectGitDeletedArtifactIds(cwd, "TASK", vcs);
}

/**
 * Lists all local branch names in the git repository.
 */
export async function listGitBranches(
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string[]> {
  return vcs.listBranches(cwd);
}

/**
 * Inspects all active indexable artifact files tracked in a git tree ref.
 */
export async function inspectGitTreeArtifacts(
  ref: string,
  cwd: string = process.cwd(),
  subtype?: IndexableSubtype,
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<DiscoveredArtifact[]> {
  return vcs.inspectTreeArtifacts(ref, cwd, subtype);
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
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<DiscoveredArtifact[]> {
  return vcs.inspectMultiBranchActiveArtifacts(cwd, subtype, options);
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
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string[]> {
  const artifacts = await inspectMultiBranchActiveArtifacts(
    cwd,
    subtype,
    options,
    vcs,
  );
  return Array.from(new Set(artifacts.map((a) => a.id)));
}

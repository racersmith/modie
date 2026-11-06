/**
 * Git history inspector for deleted artifacts and branch context.
 * Complies with ADR-6, ADR-9, RULE-21, and RULE-33.
 * Delegates to IVcsAdapter to decouple process execution from domain logic.
 */

import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type { IVcsAdapter } from "../vcs/types.ts";


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
 * Lists all local branch names in the git repository.
 */
export async function listGitBranches(
  cwd: string = process.cwd(),
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string[]> {
  return vcs.listBranches(cwd);
}

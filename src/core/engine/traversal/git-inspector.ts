/**
 * Git history inspector for deleted artifacts and branch context.
 * Complies with RULE-21 and RULE-33.
 * Delegates to IVcsAdapter to decouple process execution from domain logic.
 */

import { resolveWorkspaceContext } from "../context/resolver.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";

/**
 * Safely executes a git command, returning stdout trimmed or null on error.
 */
export async function runGit(
  args: string[],
  cwdOrContext?: string | WorkspaceContext,
  vcs?: IVcsAdapter,
): Promise<string | null> {
  const ctx = resolveWorkspaceContext(cwdOrContext, vcs);
  return ctx.vcs.run(args, ctx.root);
}

/**
 * Executes a git command and returns trimmed stdout.
 * Throws a descriptive Error containing git stderr/message if execution fails.
 */
export async function runGitCommand(
  args: string[],
  cwdOrContext?: string | WorkspaceContext,
  vcs?: IVcsAdapter,
): Promise<string> {
  const ctx = resolveWorkspaceContext(cwdOrContext, vcs);
  return ctx.vcs.runCommand(args, ctx.root);
}

/**
 * Detects the current git branch name.
 * Returns null if not in a git repo or in detached HEAD without branch metadata.
 */
export async function detectGitBranch(
  cwdOrContext?: string | WorkspaceContext,
  vcs?: IVcsAdapter,
): Promise<string | null> {
  const ctx = resolveWorkspaceContext(cwdOrContext, vcs);
  return ctx.vcs.detectCurrentBranch(ctx.root);
}

/**
 * Retrieves the optional git config `modie.prefix` if set.
 */
export async function getGitConfigPrefix(
  cwdOrContext?: string | WorkspaceContext,
  vcs?: IVcsAdapter,
): Promise<string | null> {
  const ctx = resolveWorkspaceContext(cwdOrContext, vcs);
  return ctx.vcs.getConfig("modie.prefix", ctx.root);
}

/**
 * Lists all local branch names in the git repository.
 */
export async function listGitBranches(
  cwdOrContext?: string | WorkspaceContext,
  vcs?: IVcsAdapter,
): Promise<string[]> {
  const ctx = resolveWorkspaceContext(cwdOrContext, vcs);
  return ctx.vcs.listBranches(ctx.root);
}


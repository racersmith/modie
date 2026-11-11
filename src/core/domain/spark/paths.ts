/**
 * Filesystem path resolvers for Modie sparks and ideas.
 */

import { join, resolve } from "node:path";
import { extractCwd } from "../common/paths.ts";

export const IDEAS_CONTAINER = ".modie/ideas";
export const SPARKS_FILENAME = "SPARKS.md";
export const REJECTED_DIR = ".rejected";

/**
 * Resolves the root ideas container directory `<root>/.modie/ideas`.
 */
export function resolveIdeasDir(cwd?: string | { cwd?: string }): string {
  const root = extractCwd(cwd);
  return resolve(root, IDEAS_CONTAINER);
}

/**
 * Resolves the path to the active sparks ledger `<root>/.modie/ideas/SPARKS.md`.
 */
export function resolveSparksPath(cwd?: string | { cwd?: string }): string {
  return join(resolveIdeasDir(cwd), SPARKS_FILENAME);
}

/**
 * Resolves the path to the rejected sparks ledger `<root>/.modie/ideas/.rejected/SPARKS.md`.
 */
export function resolveRejectedSparksPath(
  cwd?: string | { cwd?: string },
): string {
  return join(resolveIdeasDir(cwd), REJECTED_DIR, SPARKS_FILENAME);
}

/**
 * Resolves the path to an active idea file `<root>/.modie/ideas/<slug>.IDEA.md`.
 */
export function resolveIdeaPath(
  slug: string,
  cwd?: string | { cwd?: string },
): string {
  return join(resolveIdeasDir(cwd), `${slug}.IDEA.md`);
}

/**
 * Resolves the path to a rejected idea file `<root>/.modie/ideas/.rejected/<slug>.IDEA.md`.
 */
export function resolveRejectedIdeaPath(
  slug: string,
  cwd?: string | { cwd?: string },
): string {
  return join(resolveIdeasDir(cwd), REJECTED_DIR, `${slug}.IDEA.md`);
}


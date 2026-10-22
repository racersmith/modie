/**
 * Subtype container and directory resolution utilities.
 * Complies with RULE-6, RULE-8, and RULE-12.
 */

import { basename, dirname, join, normalize, resolve } from "node:path";
import type { IndexableSubtype } from "./types.ts";

/**
 * Returns the standard dot-prefixed container directory name for an indexable subtype (RULE-8).
 * Convention: lowercase plural of subtype.
 */
export function getSubtypeContainerName(subtype: IndexableSubtype): string {
  switch (subtype.toUpperCase()) {
    case "RULE":
      return ".rules";
    case "ADR":
      return ".adrs";
    case "TASK":
      return ".tasks";
    default:
      return `.${subtype.toLowerCase()}s`;
  }
}

/**
 * Computes the deepest common ancestor directory from a list of paths (RULE-6, RULE-12).
 */
export function findDeepestCommonAncestor(
  paths: string[],
  cwd: string = process.cwd(),
): string | null {
  if (paths.length === 0) return null;

  const absolutePaths = paths.map((p) => resolve(cwd, p));
  const firstPath = absolutePaths[0];
  if (!firstPath) return null;
  if (absolutePaths.length === 1) {
    return firstPath;
  }

  const pathParts = absolutePaths.map((p) => p.split("/"));
  const firstParts = pathParts[0];
  if (!firstParts) return null;

  let commonIndex = 0;

  while (
    commonIndex < firstParts.length &&
    pathParts.every((parts) => parts[commonIndex] === firstParts[commonIndex])
  ) {
    commonIndex++;
  }

  const common = firstParts.slice(0, commonIndex).join("/");
  return common.length > 0 ? common : "/";
}

/**
 * Resolves normalized scope directory and target directory for an indexable artifact per RULE-8.
 *
 * Normalizes architectural scope by stripping any recognized subtype container segment:
 * - `<dir>/.rules/` -> Scope: `<dir>`, Target: `<dir>/.rules`
 * - `<dir>/.adrs/`  -> Scope: `<dir>`, Target: `<dir>/.adrs`
 * - `<dir>/.tasks/` -> Scope: `<dir>`, Target: `<dir>/.tasks`
 *
 * @param subtype Subtype of the artifact (RULE, ADR, TASK).
 * @param scopeDirInput Explicit directory passed by user or caller.
 * @param useSubtypeContainer Whether to place within recognized subtype container directory (default: true).
 * @param cwd Current working directory.
 */
export function resolveArtifactDirectories(
  subtype: IndexableSubtype,
  scopeDirInput: string | undefined,
  useSubtypeContainer: boolean = true,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  const resolvedPath = scopeDirInput ? resolve(cwd, scopeDirInput) : cwd;
  const normalized = normalize(resolvedPath);

  const containerName = getSubtypeContainerName(subtype);
  const base = basename(normalized);

  if (base === containerName) {
    return {
      normalizedScopeDir: dirname(normalized),
      targetDir: normalized,
    };
  }

  const targetDir = useSubtypeContainer
    ? join(normalized, containerName)
    : normalized;

  return {
    normalizedScopeDir: normalized,
    targetDir,
  };
}

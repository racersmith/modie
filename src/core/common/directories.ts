/**
 * Subtype container and directory resolution utilities.
 * Complies with RULE-6, RULE-8, RULE-12, and ADR-10.
 */

import { basename, dirname, join, normalize, resolve } from "node:path";
import type { IndexableSubtype } from "./types.ts";

/**
 * Returns the standard container subdirectory name for an indexable subtype (RULE-8, ADR-10).
 * Convention: lowercase plural of subtype.
 */
export function getSubtypeContainerName(subtype: IndexableSubtype): string {
  switch (subtype.toUpperCase()) {
    case "RULE":
      return "rules";
    case "ADR":
      return "adrs";
    case "TASK":
      return "tasks";
    default:
      return `${subtype.toLowerCase()}s`;
  }
}

/**
 * Returns the legacy dot-prefixed container directory name for an indexable subtype (ADR-3).
 */
export function getLegacySubtypeContainerName(
  subtype: IndexableSubtype,
): string {
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
 * Resolves normalized scope directory and target directory for an indexable artifact per RULE-8 and ADR-10.
 *
 * Normalizes architectural scope by stripping recognized container segments:
 * - `<dir>/.modie/rules/` -> Scope: `<dir>`, Target: `<dir>/.modie/rules`
 * - `<dir>/.modie/adrs/`  -> Scope: `<dir>`, Target: `<dir>/.modie/adrs`
 * - `<dir>/.modie/tasks/` -> Scope: `<dir>`, Target: `<dir>/.modie/tasks`
 * - `<dir>/.modie/`       -> Scope: `<dir>`, Target: `<dir>/.modie/<subtype>`
 * - `<dir>/.rules/`       -> Scope: `<dir>`, Target: `<dir>/.rules` (legacy ADR-3)
 * - `<dir>/.adrs/`        -> Scope: `<dir>`, Target: `<dir>/.adrs` (legacy ADR-3)
 * - `<dir>/.tasks/`       -> Scope: `<dir>`, Target: `<dir>/.tasks` (legacy ADR-3)
 * - `<dir>/`              -> Scope: `<dir>`, Target: `<dir>/.modie/<subtype>` (default)
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
  const legacyContainerName = getLegacySubtypeContainerName(subtype);
  const base = basename(normalized);
  const parent = dirname(normalized);
  const parentBase = basename(parent);

  // 1. Path is `<dir>/.modie/<subtype-dir>`
  if (parentBase === ".modie") {
    const scopeDir = dirname(parent);
    return {
      normalizedScopeDir: scopeDir,
      targetDir:
        base === containerName ? normalized : join(parent, containerName),
    };
  }

  // 2. Path is `<dir>/.modie`
  if (base === ".modie") {
    const scopeDir = parent;
    return {
      normalizedScopeDir: scopeDir,
      targetDir: join(normalized, containerName),
    };
  }

  // 3. Path is legacy dot-container `<dir>/.<subtype>s` (ADR-3)
  if (
    base === legacyContainerName ||
    base === ".rules" ||
    base === ".adrs" ||
    base === ".tasks"
  ) {
    return {
      normalizedScopeDir: parent,
      targetDir: normalized,
    };
  }

  // 4. Standard directory `<dir>`: place in `.modie/<subtype>` unless flat requested
  const targetDir = useSubtypeContainer
    ? join(normalized, ".modie", containerName)
    : normalized;

  return {
    normalizedScopeDir: normalized,
    targetDir,
  };
}

/**
 * Subtype container and directory resolution utilities.
 * Complies with RULE-6, RULE-8, RULE-12, and ADR-10.
 */

import { existsSync, statSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import { toPosixRelative } from "./paths.ts";
import type { IndexableSubtype } from "./types.ts";

export interface GoverningScope {
  /**
   * Absolute path to the governing scope directory.
   */
  scopeDir: string;

  /**
   * Relative path from workspace root (e.g. "." or "src/interfaces").
   */
  relativeScope: string;
}

/**
 * Resolves the governing architectural scope directory for an artifact file,
 * container directory, or arbitrary filesystem path (RULE-8, RULE-9, RULE-12, ADR-10).
 *
 * For paths inside a `.modie/` or legacy dot-container, normalizes to the enclosing directory `<dir>`.
 * For arbitrary files or directories, traverses upward to find the nearest ancestor directory containing `.modie`.
 * Falls back to the workspace root `cwd` if no nested `.modie` is found.
 */
export function resolveGoverningScope(
  pathInput: string,
  cwd: string = process.cwd(),
): GoverningScope {
  const normCwd = normalize(resolve(cwd));
  const resolved = isAbsolute(pathInput)
    ? normalize(pathInput)
    : resolve(normCwd, pathInput);

  const relInput = relative(normCwd, resolved).replace(/\\/g, "/");
  const isWithinCwd = !relInput.startsWith("..") && !isAbsolute(relInput);

  // Check if inside recognized .modie container segments
  const segments = resolved.split("/");
  const containerIdx = segments.indexOf(".modie");

  if (containerIdx !== -1) {
    const scopeDir = segments.slice(0, containerIdx).join("/") || "/";
    const rel = relative(normCwd, scopeDir).replace(/\\/g, "/");
    const relativeScope = rel === "" ? "." : rel;
    return { scopeDir, relativeScope };
  }

  if (!isWithinCwd) {
    return { scopeDir: resolved, relativeScope: relInput };
  }

  // Not inside a container segment - arbitrary file or directory path
  let currentDir = resolved;
  try {
    const st = statSync(resolved);
    if (st.isFile()) {
      currentDir = dirname(resolved);
    }
  } catch {
    // If not existing on disk, check if basename has a file extension
    if (basename(resolved).includes(".")) {
      currentDir = dirname(resolved);
    }
  }

  // Walk up from currentDir towards normCwd to find nearest directory with .modie
  let checkDir = currentDir;
  let foundScopeDir: string | null = null;

  while (checkDir.length >= normCwd.length) {
    const modiePath = join(checkDir, ".modie");

    if (existsSync(modiePath)) {
      foundScopeDir = checkDir;
      break;
    }

    if (
      checkDir === normCwd ||
      checkDir === "/" ||
      dirname(checkDir) === checkDir
    ) {
      break;
    }
    checkDir = dirname(checkDir);
  }

  const scopeDir = foundScopeDir ?? normCwd;
  const rel = relative(normCwd, scopeDir).replace(/\\/g, "/");
  const relativeScope = rel === "" ? "." : rel;

  return { scopeDir, relativeScope };
}

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
 * Resolves normalized scope directory and target directory for an indexable artifact per RULE-8, and ADR-10.
 *
 * Normalizes architectural scope by stripping recognized container segments:
 * - `<dir>/.modie/rules/` -> Scope: `<dir>`, Target: `<dir>/.modie/rules`
 * - `<dir>/.modie/adrs/`  -> Scope: `<dir>`, Target: `<dir>/.modie/adrs`
 * - `<dir>/.modie/tasks/` -> Scope: `<dir>`, Target: `<dir>/.modie/tasks`
 * - `<dir>/.modie/`       -> Scope: `<dir>`, Target: `<dir>/.modie/<subtype>`
 * - `<dir>/`              -> Scope: `<dir>`, Target: `<dir>/.modie/<subtype>` (default)
 *
 * @param subtype Subtype of the artifact (RULE, ADR, TASK).
 * @param scopeDirInput Explicit directory passed by user or caller.
 * @param cwd Current working directory.
 */
export function resolveArtifactDirectories(
  subtype: IndexableSubtype,
  scopeDirInput: string | undefined,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  const resolvedPath = scopeDirInput ? resolve(cwd, scopeDirInput) : cwd;
  const normalized = normalize(resolvedPath);

  const containerName = getSubtypeContainerName(subtype);
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

  // 3. Standard directory `<dir>`: place in `<dir>/.modie/<subtype>`
  return {
    normalizedScopeDir: normalized,
    targetDir: join(normalized, ".modie", containerName),
  };
}

/**
 * Computes all ancestral directory scopes from root down to `targetScope`.
 * Pure path segment decomposition with no disk I/O.
 * Example: "src/core" -> [".", "src", "src/core"]
 */
export function buildAncestralScopes(targetScope: string): string[] {
  const normalized = targetScope?.trim() || ".";
  if (normalized === ".") {
    return ["."];
  }
  const segments = normalized.split("/").filter(Boolean);
  const scopes: string[] = ["."];
  let accum = "";
  for (const seg of segments) {
    accum = accum ? `${accum}/${seg}` : seg;
    scopes.push(accum);
  }
  return scopes;
}

/**
 * Resolves the governing directory scope for a path or directory input,
 * stripping `.modie` segments and file basenames, and validating that the scope
 * resides within the workspace root `normCwd`.
 *
 * @param targetDirInput Raw directory or file path input.
 * @param normCwd Normalized absolute workspace root directory.
 * @param errorLabel Domain label for error messages (e.g. "MOTIVE", "context").
 */
export function resolveScopeDirectory(
  targetDirInput: string | undefined,
  normCwd: string,
  errorLabel: string = "scope",
): { scopeDir: string; scope: string; targetPath: string } {
  const trimmed = targetDirInput?.trim();
  const rawResolved =
    trimmed && trimmed !== "."
      ? isAbsolute(trimmed)
        ? normalize(trimmed)
        : normalize(resolve(normCwd, trimmed))
      : normCwd;

  const relTarget = toPosixRelative(normCwd, rawResolved);

  // 1. If path is inside a `.modie` segment, strip `.modie` and everything below it (RULE-8)
  const segments = rawResolved.split(/[\\/]/);
  const modieIdx = segments.indexOf(".modie");

  let scopeDir: string;
  if (modieIdx !== -1) {
    scopeDir = segments.slice(0, modieIdx).join("/") || "/";
  } else {
    scopeDir = rawResolved;
    try {
      const st = statSync(rawResolved);
      if (st.isFile()) {
        scopeDir = dirname(rawResolved);
      }
    } catch {
      if (basename(rawResolved).includes(".")) {
        scopeDir = dirname(rawResolved);
      }
    }
  }

  const relScope = toPosixRelative(normCwd, scopeDir);
  if (relScope.startsWith("..") || isAbsolute(relScope)) {
    throw new Error(
      `Invalid ${errorLabel} scope "${targetDirInput}": path must reside within the workspace root.`,
    );
  }

  return {
    scopeDir,
    scope: relScope,
    targetPath: relTarget,
  };
}

/**
 * Traverses directories from `startDir` upward toward `stopDir` (e.g. workspace root),
 * executing `finder` at each directory node and returning collected results in leaf-to-root order.
 */
export async function walkAncestorsForFile<T>(
  startDir: string,
  stopDir: string,
  finder: (
    currentDir: string,
  ) => Promise<T | null | undefined> | T | null | undefined,
): Promise<T[]> {
  const normStop = normalize(resolve(stopDir));
  let currentDir = normalize(resolve(startDir));
  const results: T[] = [];

  while (currentDir.length >= normStop.length) {
    const item = await finder(currentDir);
    if (item !== null && item !== undefined) {
      results.push(item);
    }

    if (
      currentDir === normStop ||
      currentDir === "/" ||
      dirname(currentDir) === currentDir
    ) {
      break;
    }
    currentDir = dirname(currentDir);
  }

  return results;
}

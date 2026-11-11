/**
 * Modie Core Domain Layer: Canonical MOTIVE path resolution and scope normalization utilities.
 * Enforces ADR-2, ADR-4, ADR-10, RULE-2, RULE-8, RULE-12, and RULE-38:
 * - Singleton containment: `<dir>/.modie/MOTIVE.md`
 */

import { join } from "node:path";
import {
  extractCwd,
  resolveScopeDirectory,
  toPosixRelative,
} from "../common/index.ts";
import type { MotivePaths, ResolveMotiveOptions } from "./types.ts";

export const MOTIVE_FILENAME = "MOTIVE.md";

/**
 * Resolves the canonical `MOTIVE.md` paths (`<dir>/.modie/MOTIVE.md`) for a target directory
 * or path inside `<dir>/.modie` per RULE-8 and ADR-10.
 *
 * Automatically strips `.modie` container segments if present, and normalizes file paths
 * to their enclosing directory.
 */
export function resolveMotivePaths(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveMotiveOptions,
): MotivePaths {
  const normCwd = extractCwd(cwdOrOptions);
  const { scopeDir, scope } = resolveScopeDirectory(
    targetDirInput,
    normCwd,
    "MOTIVE",
  );

  const modieDir = join(scopeDir, ".modie");
  const filepath = join(modieDir, MOTIVE_FILENAME);

  return {
    scopeDir,
    scope,
    modieDir,
    relativeModieDir: toPosixRelative(normCwd, modieDir),
    filename: MOTIVE_FILENAME,
    filepath,
    relativePath: toPosixRelative(normCwd, filepath),
  };
}

/**
 * Returns the absolute path to `<dir>/.modie/MOTIVE.md` for a target directory scope.
 */
export function resolveMotivePath(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveMotiveOptions,
): string {
  return resolveMotivePaths(targetDirInput, cwdOrOptions).filepath;
}

export const resolveMotiveFilepath = resolveMotivePath;


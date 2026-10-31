/**
 * Canonical MOTIVE path resolution and scope normalization utilities.
 * Enforces RULE-2, RULE-8, RULE-12, ADR-2, ADR-4, and ADR-10:
 * - Singleton containment: `<dir>/.modie/MOTIVE.md`
 */

import { statSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import type { MotivePaths, ResolveMotiveOptions } from "./types.ts";

export const MOTIVE_FILENAME = "MOTIVE.md";

function extractCwd(cwdOrOptions?: string | ResolveMotiveOptions): string {
  if (typeof cwdOrOptions === "string") {
    return normalize(resolve(cwdOrOptions));
  }
  return normalize(resolve(cwdOrOptions?.cwd ?? process.cwd()));
}

function toPosixRelative(from: string, to: string): string {
  const rel = relative(from, to).replace(/\\/g, "/");
  return rel === "" ? "." : rel;
}

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
  const trimmed = targetDirInput?.trim();
  const rawResolved =
    trimmed && trimmed !== "."
      ? isAbsolute(trimmed)
        ? normalize(trimmed)
        : normalize(resolve(normCwd, trimmed))
      : normCwd;

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
      // Path does not exist on disk; treat as directory path
    }
  }

  const relScope = toPosixRelative(normCwd, scopeDir);
  if (relScope.startsWith("..") || isAbsolute(relScope)) {
    throw new Error(
      `Invalid MOTIVE scope "${targetDirInput}": path must reside within the workspace root.`,
    );
  }

  const modieDir = join(scopeDir, ".modie");
  const filepath = join(modieDir, MOTIVE_FILENAME);

  return {
    scopeDir,
    scope: relScope,
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


/**
 * Shared path normalization and regex escaping utilities.
 */

import { normalize, relative, resolve } from "node:path";

/**
 * Resolves and normalizes a working directory from a string, an options object with `cwd`,
 * or falls back to `process.cwd()`.
 */
export function extractCwd(cwdOrOptions?: string | { cwd?: string }): string {
  if (typeof cwdOrOptions === "string") {
    return normalize(resolve(cwdOrOptions));
  }
  return normalize(resolve(cwdOrOptions?.cwd ?? process.cwd()));
}

/**
 * Normalizes a relative path from `from` to `to` with POSIX forward slashes,
 * returning "." if the relative path is empty.
 */
export function toPosixRelative(from: string, to: string): string {
  const rel = relative(from, to).replace(/\\/g, "/");
  return rel === "" ? "." : rel;
}

/**
 * Escapes special regex characters in dynamic strings.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

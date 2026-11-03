/**
 * Shared path normalization and regex escaping utilities.
 */

import { relative } from "node:path";

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


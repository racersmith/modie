/**
 * Canonical GIST path resolution and filename utilities.
 * Enforces RULE-8, RULE-20, ADR-2, ADR-10, and ADR-11:
 * - Directory GIST: `<dir>/.modie/gists/GIST.md`
 * - File GIST: `<dir>/.modie/gists/<filename>.GIST.md`
 * - Freshness Ledger: `<dir>/.modie/gists/.gists`
 */

import { statSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import type {
  FileGistPaths,
  GistPaths,
  ResolveGistOptions,
} from "./types.ts";

export const GISTS_CONTAINER_DIR = "gists";
export const DIRECTORY_GIST_FILENAME = "GIST.md";
export const FILE_GIST_SUFFIX = ".GIST.md";
export const GIST_LEDGER_FILENAME = ".gists";

function extractCwd(cwdOrOptions?: string | ResolveGistOptions): string {
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
 * Checks whether a filename is the canonical directory GIST filename (`GIST.md`).
 */
export function isDirectoryGistFilename(filename: string): boolean {
  return basename(filename) === DIRECTORY_GIST_FILENAME;
}

/**
 * Parses a file-level GIST filename (`<filename>.GIST.md`) and returns the underlying
 * source `<filename>`, or `null` if the filename is not a valid file-level GIST proxy.
 */
export function parseFileGistFilename(gistFilename: string): string | null {
  const base = basename(gistFilename);
  if (base === DIRECTORY_GIST_FILENAME || !base.endsWith(FILE_GIST_SUFFIX)) {
    return null;
  }
  const sourceFilename = base.slice(0, -FILE_GIST_SUFFIX.length).trim();
  if (!sourceFilename || sourceFilename === ".") {
    return null;
  }
  return sourceFilename;
}

/**
 * Checks whether a filename is a valid file-level GIST proxy (`<filename>.GIST.md`).
 */
export function isFileGistFilename(filename: string): boolean {
  return parseFileGistFilename(filename) !== null;
}

/**
 * Formats the canonical file-level GIST filename (`<filename>.GIST.md`) for a source file per RULE-20.
 */
export function formatFileGistFilename(sourceFilename: string): string {
  const trimmed = sourceFilename.trim();
  const base = basename(trimmed);
  if (!base || base === "." || base === "..") {
    throw new Error("Source filename for file GIST must be non-empty.");
  }
  if (base === DIRECTORY_GIST_FILENAME) {
    throw new Error(
      `Invalid source filename "${base}": "${DIRECTORY_GIST_FILENAME}" is reserved for directory GIST summaries (RULE-20).`,
    );
  }
  if (base.endsWith(FILE_GIST_SUFFIX)) {
    return base;
  }
  return `${base}${FILE_GIST_SUFFIX}`;
}

/**
 * Resolves the canonical GIST paths (`<dir>/.modie/gists/GIST.md` and `.gists` ledger)
 * for a target directory or path within `<dir>/.modie/gists` per RULE-8, RULE-20, and ADR-10.
 *
 * Automatically strips `.modie` and `.modie/gists` container segments if present,
 * and normalizes file paths to their enclosing directory.
 */
export function resolveGistPaths(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveGistOptions,
): GistPaths {
  const normCwd = extractCwd(cwdOrOptions);
  const trimmed = targetDirInput?.trim();
  const rawResolved =
    trimmed && trimmed !== "."
      ? isAbsolute(trimmed)
        ? normalize(trimmed)
        : normalize(resolve(normCwd, trimmed))
      : normCwd;

  // 1. If path is inside a `.modie` segment, strip `.modie` and everything below it
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
      `Invalid GIST scope "${targetDirInput}": path must reside within the workspace root.`,
    );
  }

  const gistsDir = join(scopeDir, ".modie", GISTS_CONTAINER_DIR);
  const directoryGistPath = join(gistsDir, DIRECTORY_GIST_FILENAME);
  const ledgerPath = join(gistsDir, GIST_LEDGER_FILENAME);

  return {
    scopeDir,
    scope: relScope,
    gistsDir,
    relativeGistsDir: toPosixRelative(normCwd, gistsDir),
    directoryGistPath,
    relativeDirectoryGistPath: toPosixRelative(normCwd, directoryGistPath),
    ledgerPath,
    relativeLedgerPath: toPosixRelative(normCwd, ledgerPath),
  };
}

/**
 * Returns the absolute path to `<dir>/.modie/gists/GIST.md` for a target directory.
 */
export function resolveDirectoryGistPath(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveGistOptions,
): string {
  return resolveGistPaths(targetDirInput, cwdOrOptions).directoryGistPath;
}

/**
 * Resolves the canonical file-level GIST path (`<dir>/.modie/gists/<filename>.GIST.md`)
 * and source file metadata per RULE-20 and ADR-10.
 *
 * Supports both:
 * - `resolveFileGistPath("src/core/index.ts", cwdOrOptions)`
 * - `resolveFileGistPath("src/core", "index.ts", cwdOrOptions)`
 */
export function resolveFileGistPath(
  sourcePathOrDir: string,
  filenameOrCwd?: string | ResolveGistOptions,
  maybeCwd?: string | ResolveGistOptions,
): FileGistPaths {
  const trimmedFirst = sourcePathOrDir?.trim();
  if (!trimmedFirst) {
    throw new Error("Source file path or directory is required.");
  }

  let dirInput: string;
  let filenameInput: string;
  let cwdArg: string | ResolveGistOptions | undefined;

  if (
    typeof filenameOrCwd === "string" &&
    maybeCwd === undefined &&
    !isAbsolute(filenameOrCwd) &&
    !filenameOrCwd.includes("/") &&
    !filenameOrCwd.includes("\\")
  ) {
    // 2-argument call `(dir, filename)`
    dirInput = trimmedFirst;
    filenameInput = filenameOrCwd.trim();
    cwdArg = undefined;
  } else if (typeof filenameOrCwd === "string" && maybeCwd !== undefined) {
    // 3-argument call `(dir, filename, cwd)`
    dirInput = trimmedFirst;
    filenameInput = filenameOrCwd.trim();
    cwdArg = maybeCwd;
  } else {
    // 1-path call `(sourceFilePath, cwdOrOptions?)`
    cwdArg = filenameOrCwd;
    const normCwd = extractCwd(cwdArg);
    const resolvedFull = isAbsolute(trimmedFirst)
      ? normalize(trimmedFirst)
      : normalize(resolve(normCwd, trimmedFirst));

    const base = basename(resolvedFull);
    const parsedFromGist = parseFileGistFilename(base);
    if (parsedFromGist) {
      dirInput = dirname(resolvedFull);
      filenameInput = parsedFromGist;
    } else {
      dirInput = dirname(resolvedFull);
      filenameInput = base;
    }
  }

  const parsedExistingGist = parseFileGistFilename(filenameInput);
  const sourceFilename = parsedExistingGist ?? basename(filenameInput);
  const gistFilename = formatFileGistFilename(sourceFilename);

  const normCwd = extractCwd(cwdArg);
  const gistPaths = resolveGistPaths(dirInput, normCwd);

  const sourceFilepath = join(gistPaths.scopeDir, sourceFilename);
  const gistFilepath = join(gistPaths.gistsDir, gistFilename);

  return {
    scopeDir: gistPaths.scopeDir,
    scope: gistPaths.scope,
    sourceFilename,
    sourceFilepath,
    sourceRelativePath: toPosixRelative(normCwd, sourceFilepath),
    gistFilename,
    gistFilepath,
    relativeGistFilepath: toPosixRelative(normCwd, gistFilepath),
  };
}


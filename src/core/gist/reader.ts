/**
 * Core GIST discovery, local reader, and shallow child signpost services.
 * Implements ADR-2, ADR-4, ADR-8, ADR-10, RULE-8, RULE-9, RULE-12, and RULE-20.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, normalize, relative, resolve } from "node:path";
import {
  DIRECTORY_GIST_FILENAME,
  parseFileGistFilename,
  resolveFileGistPath,
  resolveGistPaths,
} from "./paths.ts";
import type {
  DirectoryGist,
  FileGist,
  GistDiscoveryResult,
  GistSignpost,
  LocalGistsResult,
  ResolveGistOptions,
} from "./types.ts";

const IGNORED_CHILD_DIRECTORIES = new Set([
  ".modie",
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);

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
 * Reads the directory-level GIST summary (`<dir>/.modie/gists/GIST.md`) for a target path,
 * or returns `null` if no directory GIST exists on disk (RULE-20).
 */
export async function readDirectoryGist(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveGistOptions,
): Promise<DirectoryGist | null> {
  const paths = resolveGistPaths(targetDirInput, cwdOrOptions);

  try {
    const fileStat = await stat(paths.directoryGistPath);
    if (!fileStat.isFile()) {
      return null;
    }
    const rawContent = await readFile(paths.directoryGistPath, "utf8");
    return {
      type: "directory",
      scope: paths.scope,
      scopeDir: paths.scopeDir,
      filepath: paths.directoryGistPath,
      relativePath: paths.relativeDirectoryGistPath,
      content: rawContent.trim(),
      rawContent,
    };
  } catch {
    return null;
  }
}

/**
 * Reads a file-level implementation GIST proxy (`<dir>/.modie/gists/<filename>.GIST.md`),
 * or returns `null` if no file GIST exists on disk (RULE-20).
 */
export async function readFileGist(
  sourcePathOrDir: string,
  filenameOrCwd?: string | ResolveGistOptions,
  maybeCwd?: string | ResolveGistOptions,
): Promise<FileGist | null> {
  const paths = resolveFileGistPath(sourcePathOrDir, filenameOrCwd, maybeCwd);

  try {
    const fileStat = await stat(paths.gistFilepath);
    if (!fileStat.isFile()) {
      return null;
    }
    const rawContent = await readFile(paths.gistFilepath, "utf8");
    return {
      type: "file",
      scope: paths.scope,
      scopeDir: paths.scopeDir,
      sourceFilename: paths.sourceFilename,
      sourceFilepath: paths.sourceFilepath,
      sourceRelativePath: paths.sourceRelativePath,
      gistFilename: paths.gistFilename,
      filepath: paths.gistFilepath,
      relativePath: paths.relativeGistFilepath,
      content: rawContent.trim(),
      rawContent,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves and loads all local GISTs (directory summary `GIST.md` and file-level
 * proxies `<filename>.GIST.md`) strictly at the target directory scope `<dir>/.modie/gists/`,
 * omitting ancestor GISTs per RULE-9 and enforcing `.modie/gists/` containment per RULE-20.
 */
export async function readLocalGists(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveGistOptions,
): Promise<LocalGistsResult> {
  const normCwd = extractCwd(cwdOrOptions);
  const paths = resolveGistPaths(targetDirInput, normCwd);

  let entries;
  try {
    entries = await readdir(paths.gistsDir, { withFileTypes: true });
  } catch {
    return {
      scope: paths.scope,
      scopeDir: paths.scopeDir,
      gistsDir: paths.gistsDir,
      relativeGistsDir: paths.relativeGistsDir,
      directoryGist: null,
      fileGists: [],
    };
  }

  let directoryGist: DirectoryGist | null = null;
  const fileGists: FileGist[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    if (entry.name === DIRECTORY_GIST_FILENAME) {
      try {
        const rawContent = await readFile(paths.directoryGistPath, "utf8");
        directoryGist = {
          type: "directory",
          scope: paths.scope,
          scopeDir: paths.scopeDir,
          filepath: paths.directoryGistPath,
          relativePath: paths.relativeDirectoryGistPath,
          content: rawContent.trim(),
          rawContent,
        };
      } catch {
        // Ignore unreadable file
      }
      continue;
    }

    const sourceFilename = parseFileGistFilename(entry.name);
    if (!sourceFilename) {
      continue;
    }

    const gistFilepath = join(paths.gistsDir, entry.name);
    const sourceFilepath = join(paths.scopeDir, sourceFilename);

    try {
      const rawContent = await readFile(gistFilepath, "utf8");
      fileGists.push({
        type: "file",
        scope: paths.scope,
        scopeDir: paths.scopeDir,
        sourceFilename,
        sourceFilepath,
        sourceRelativePath: toPosixRelative(normCwd, sourceFilepath),
        gistFilename: entry.name,
        filepath: gistFilepath,
        relativePath: toPosixRelative(normCwd, gistFilepath),
        content: rawContent.trim(),
        rawContent,
      });
    } catch {
      // Ignore unreadable file
    }
  }

  fileGists.sort((a, b) =>
    a.sourceFilename < b.sourceFilename
      ? -1
      : a.sourceFilename > b.sourceFilename
        ? 1
        : 0,
  );

  return {
    scope: paths.scope,
    scopeDir: paths.scopeDir,
    gistsDir: paths.gistsDir,
    relativeGistsDir: paths.relativeGistsDir,
    directoryGist,
    fileGists,
  };
}

/**
 * Discovers immediate child directory GIST signposts (`<child>/.modie/gists/GIST.md`, depth=1)
 * for progressive on-demand territory exploration per ADR-8 and RULE-20.
 *
 * Does not descend past depth=1 and ignores dot-directories (`.modie`, `.git`) and build/dependency folders.
 */
export async function discoverChildSignposts(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveGistOptions,
): Promise<GistSignpost[]> {
  const normCwd = extractCwd(cwdOrOptions);
  const paths = resolveGistPaths(targetDirInput, normCwd);

  let entries;
  try {
    entries = await readdir(paths.scopeDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const signposts: GistSignpost[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || IGNORED_CHILD_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const childDir = join(paths.scopeDir, entry.name);
    const childGistPath = join(
      childDir,
      ".modie",
      "gists",
      DIRECTORY_GIST_FILENAME,
    );

    try {
      const st = await stat(childGistPath);
      if (!st.isFile()) continue;

      const rawContent = await readFile(childGistPath, "utf8");
      signposts.push({
        name: entry.name,
        scope: toPosixRelative(normCwd, childDir),
        scopeDir: childDir,
        filepath: childGistPath,
        relativePath: toPosixRelative(normCwd, childGistPath),
        content: rawContent.trim(),
      });
    } catch {
      // Child has no GIST.md signpost; skip
    }
  }

  signposts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return signposts;
}

/**
 * Resolves all local GISTs (directory summary and file proxies) at target scope `<dir>`
 * along with shallow downward child directory signposts (`depth=1`) per RULE-9, RULE-20, and ADR-8.
 */
export async function discoverGistsForScope(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveGistOptions,
): Promise<GistDiscoveryResult> {
  const [localGists, signposts] = await Promise.all([
    readLocalGists(targetDirInput, cwdOrOptions),
    discoverChildSignposts(targetDirInput, cwdOrOptions),
  ]);

  return {
    ...localGists,
    signposts,
  };
}


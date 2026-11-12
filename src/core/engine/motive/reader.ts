/**
 * Canonical MOTIVE reader and upward ancestral motive discovery services.
 * Enforces RULE-2, RULE-8, and RULE-10.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  extractCwd,
  resolveMotivePaths,
  validateMotiveContent,
  walkAncestorsForFile,
  type ChildMotive,
  type MotiveArtifact,
  type ResolveMotiveOptions,
} from "../../domain/index.ts";

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

/**
 * Reads the singleton `<dir>/.modie/MOTIVE.md` for a target directory scope.
 * Returns `null` if the file does not exist or is empty.
 */
export async function readMotive(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveMotiveOptions,
): Promise<MotiveArtifact | null> {
  const paths = resolveMotivePaths(targetDirInput, cwdOrOptions);
  try {
    const raw = await readFile(paths.filepath, "utf8");
    const content = raw.trim();
    if (!content) {
      return null;
    }
    validateMotiveContent(content);
    return {
      scope: paths.scope,
      scopeDir: paths.scopeDir,
      filename: paths.filename,
      filepath: paths.filepath,
      relativePath: paths.relativePath,
      content,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Traverses parent directory nodes from the target path upward to the repository root
 * to collect `MOTIVE.md` artifacts along the ancestry vector per RULE-2.
 * Sibling subtrees are never evaluated, and the resulting collection forms a
 * monotonically widening scope sequence terminating at root (`.`).
 */
export async function collectAncestralMotives(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveMotiveOptions,
): Promise<MotiveArtifact[]> {
  const normCwd = extractCwd(cwdOrOptions);
  const leafPaths = resolveMotivePaths(targetDirInput, normCwd);

  const motives = await walkAncestorsForFile(
    leafPaths.scopeDir,
    normCwd,
    (currentDir) => readMotive(currentDir, normCwd),
  );

  // Verify no sibling scopes leaked
  return motives.filter((m) =>
    m.scope === "."
      ? true
      : leafPaths.scope === m.scope ||
        leafPaths.scope.startsWith(`${m.scope}/`),
  );
}

/**
 * Discovers immediate child directory motives (`<child>/.modie/MOTIVE.md`, depth=1)
 * for progressive on-demand territory exploration per ADR-8.
 *
 * Does not descend past depth=1 and ignores dot-directories (`.modie`, `.git`) and build/dependency folders.
 */
export async function discoverChildMotives(
  targetDirInput?: string,
  cwdOrOptions?: string | ResolveMotiveOptions,
): Promise<ChildMotive[]> {
  const normCwd = extractCwd(cwdOrOptions);
  const paths = resolveMotivePaths(targetDirInput, normCwd);

  let entries;
  try {
    entries = await readdir(paths.scopeDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const childMotives: ChildMotive[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (
      entry.name.startsWith(".") ||
      IGNORED_CHILD_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const childDir = join(paths.scopeDir, entry.name);
    const childMotive = await readMotive(childDir, normCwd);
    if (childMotive && childMotive.content) {
      childMotives.push({
        name: entry.name,
        scope: childMotive.scope,
        scopeDir: childMotive.scopeDir,
        filepath: childMotive.filepath,
        relativePath: childMotive.relativePath,
        content: childMotive.content,
      });
    }
  }

  childMotives.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return childMotives;
}


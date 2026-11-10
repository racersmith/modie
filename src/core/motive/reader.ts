/**
 * Canonical MOTIVE reader and upward ancestral motive discovery services.
 * Enforces RULE-2, RULE-8, RULE-10, and ADR-10.
 */

import { readFile } from "node:fs/promises";
import {
  extractCwd,
  resolveMotivePaths,
  validateMotiveContent,
  walkAncestorsForFile,
  type MotiveArtifact,
  type ResolveMotiveOptions,
} from "../domain/index.ts";

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

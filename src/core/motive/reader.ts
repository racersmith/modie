/**
 * Canonical MOTIVE reader and upward ancestral motive discovery services.
 * Enforces RULE-2, RULE-8, RULE-10, and ADR-10.
 */

import { readFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { resolveMotivePaths } from "./paths.ts";
import { validateMotiveContent } from "./template.ts";
import type { MotiveArtifact, ResolveMotiveOptions } from "./types.ts";

function extractCwd(cwdOrOptions?: string | ResolveMotiveOptions): string {
  if (typeof cwdOrOptions === "string") {
    return normalize(resolve(cwdOrOptions));
  }
  return normalize(resolve(cwdOrOptions?.cwd ?? process.cwd()));
}

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

  const motives: MotiveArtifact[] = [];
  let currentDir = leafPaths.scopeDir;

  while (currentDir.length >= normCwd.length) {
    const motive = await readMotive(currentDir, normCwd);
    if (motive) {
      motives.push(motive);
    }

    if (
      currentDir === normCwd ||
      currentDir === "/" ||
      dirname(currentDir) === currentDir
    ) {
      break;
    }
    currentDir = dirname(currentDir);
  }

  // Verify no sibling scopes leaked
  return motives.filter((m) =>
    m.scope === "."
      ? true
      : leafPaths.scope === m.scope ||
        leafPaths.scope.startsWith(`${m.scope}/`),
  );
}


/**
 * Core MOTIVE Creation Service.
 * Enforces singleton containment at `<dir>/.modie/MOTIVE.md` (RULE-8, ADR-10),
 * collision protection against accidental overwrites, and RULE-10 reference prohibition.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolveMotivePaths } from "./paths.ts";
import { renderMotiveMarkdown } from "./template.ts";
import type {
  CreateMotiveOptions,
  CreateMotiveResult,
  MotiveArtifact,
} from "./types.ts";

/**
 * Creates or scaffolds a singleton `MOTIVE.md` artifact within `<dir>/.modie/MOTIVE.md`.
 *
 * - Normalizes target scope via `resolveMotivePaths` (RULE-8, ADR-10).
 * - Rejects creation if `MOTIVE.md` already exists unless `overwrite` / `force` is true.
 * - Validates content against RULE-10 before writing to disk.
 */
export async function createMotive(
  options: CreateMotiveOptions = {},
): Promise<CreateMotiveResult> {
  const cwd = options.cwd ?? process.cwd();
  const scopeInput = options.scopeDir ?? options.scope;
  const paths = resolveMotivePaths(scopeInput, cwd);

  const allowOverwrite = Boolean(options.overwrite || options.force);
  const alreadyExists = existsSync(paths.filepath);

  if (alreadyExists && !allowOverwrite) {
    throw new Error(
      `MOTIVE.md already exists at "${paths.relativePath}" (scope "${paths.scope}"). Use --overwrite to replace the existing motive.`,
    );
  }

  const rawContent = options.content ?? options.context;
  const { content, markdown, scaffolded } = renderMotiveMarkdown({
    content: rawContent,
    scope: paths.scope,
  });

  await mkdir(paths.modieDir, { recursive: true });
  await writeFile(paths.filepath, markdown, "utf8");

  const artifact: MotiveArtifact = {
    scope: paths.scope,
    scopeDir: paths.scopeDir,
    filename: paths.filename,
    filepath: paths.filepath,
    relativePath: paths.relativePath,
    content,
  };

  return {
    artifact,
    scope: paths.scope,
    scopeDir: paths.scopeDir,
    filename: paths.filename,
    filepath: paths.filepath,
    relativePath: paths.relativePath,
    content,
    markdown,
    overwritten: alreadyExists,
    scaffolded,
  };
}


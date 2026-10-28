/**
 * Core Task Creation Service.
 * Coordinates watermark resolution, template generation, filesystem scoping, and file writing.
 * Complies with ADR-4, ADR-6, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-22, and RULE-25.
 */

import { resolveArtifactDirectories } from "../common/index.ts";
import { createArtifact } from "../pipeline/create.ts";
import { taskDefinition, validateTaskScope } from "./definition.ts";
import type { CreateTaskOptions, CreateTaskResult } from "./types.ts";

export type { CreateTaskOptions, CreateTaskResult } from "./types.ts";
export { validateTaskScope } from "./definition.ts";
export { findDeepestCommonAncestor } from "../common/directories.ts";

/**
 * Normalizes scope directory and target directory per RULE-8.
 */
export function resolveTaskDirectories(
  scopeDirInput: string | undefined,
  useSubtypeContainer: boolean = true,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  return resolveArtifactDirectories(
    "TASK",
    scopeDirInput,
    useSubtypeContainer,
    cwd,
  );
}

/**
 * Orchestrating domain service to create a new TASK artifact.
 * Follows RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-22, RULE-25, and ADR-9.
 */
export async function createTask(
  options: CreateTaskOptions,
): Promise<CreateTaskResult> {
  const result = await createArtifact(taskDefinition, options);
  return {
    artifact: result.artifact,
    filename: result.filename,
    filepath: result.filepath,
    relativePath: result.relativePath,
    markdown: result.markdown,
    watermark: result.watermark!,
  };
}

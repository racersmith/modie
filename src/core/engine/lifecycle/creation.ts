/**
 * Core Task Creation Service.
 * Coordinates watermark resolution, template generation, filesystem scoping, and file writing.
 * Complies with ADR-4, ADR-6, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-22, and RULE-25.
 */

import {
  resolveArtifactDirectories,
  taskDefinition,
  validateTaskScope,
  type CreateTaskOptions,
  type CreateTaskResult,
  type TaskDefinition,
} from "../../domain/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context/index.ts";
import { createArtifact } from "../pipeline/create.ts";

export type { CreateTaskOptions, CreateTaskResult, TaskDefinition } from "../../domain/index.ts";

/**
 * Normalizes scope directory and target directory per RULE-8.
 */
export function resolveTaskDirectories(
  scopeDirInput: string | undefined,
  cwdOrContext?: string | WorkspaceContext,
): { normalizedScopeDir: string; targetDir: string } {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  return resolveArtifactDirectories("TASK", scopeDirInput, ctx.root);
}

/**
 * Orchestrating domain service to create a new TASK artifact.
 * Follows RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-22, RULE-25, and ADR-9.
 */
export async function createTask(
  options: CreateTaskOptions,
): Promise<CreateTaskResult> {
  const result = await createArtifact(taskDefinition, options);
  return result as CreateTaskResult;
}


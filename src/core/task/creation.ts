/**
 * Core Task Creation Service.
 * Coordinates watermark resolution, template generation, filesystem scoping, and file writing.
 * Complies with ADR-4, ADR-6, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-22, and RULE-25.
 */

import { isAbsolute, relative, resolve } from "node:path";
import {
  findDeepestCommonAncestor,
  resolveArtifactDirectories,
} from "../common/index.ts";
import type { WatermarkDetails } from "../resolver/types.ts";
import { createArtifact } from "../pipeline/create.ts";
import { taskDefinition } from "./definition.ts";
import type {
  TaskAcceptanceCriteriaItem,
  TaskArtifact,
} from "./types.ts";

export interface CreateTaskOptions {
  /**
   * Title of the task (human-readable string).
   * E.g. "Create Task CLI"
   */
  title: string;

  /**
   * Optional target scope directory where the task should reside.
   * Defaults to workspace root (cwd).
   */
  scopeDir?: string;

  /**
   * Context / user story / background explanation for the task.
   */
  context?: string;

  /**
   * Task dependencies (`depends_on`). Must only reference `TASK-` identifiers per RULE-18.
   */
  depends_on?: string[];

  /**
   * Artifact links (`links`). Must only reference `ADR-` and `RULE-` identifiers per RULE-15.
   */
  links?: string[];

  /**
   * Acceptance criteria checklist items per RULE-22.
   * Can be strings or { text, completed } items.
   */
  acceptanceCriteria?: Array<string | TaskAcceptanceCriteriaItem>;

  /**
   * Whether to place in a `.tasks/` subtype container directory (RULE-8).
   * Defaults to true.
   */
  useSubtypeContainer?: boolean;

  /**
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Explicit branch name override (passed to watermark resolver).
   */
  branch?: string;

  /**
   * Explicit task prefix tag override (e.g. "J" for TASK-J1).
   */
  prefix?: string;

  /**
   * Force trunk monotonic allocation even on task/feature branches.
   */
  forceTrunk?: boolean;

  /**
   * Target mutation paths that this task will affect.
   * Validated against downward blast radius (RULE-6) and least-scope placement (RULE-12).
   */
  targetPaths?: string[];

  /**
   * If true, bypasses strict least-scope common ancestor enforcement when targetPaths are provided.
   */
  allowBroadScope?: boolean;
}

export interface CreateTaskResult {
  artifact: TaskArtifact;
  filename: string;
  filepath: string;
  relativePath: string;
  markdown: string;
  watermark: WatermarkDetails;
}

export { findDeepestCommonAncestor } from "../common/directories.ts";

/**
 * Normalizes scope directory and target directory per RULE-8.
 */
export function resolveTaskDirectories(
  scopeDirInput: string | undefined,
  useSubtypeContainer: boolean = true,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  return resolveArtifactDirectories("TASK", scopeDirInput, useSubtypeContainer, cwd);
}

/**
 * Validates task placement constraints per RULE-6 and RULE-12.
 */
export function validateTaskScope(
  normalizedScopeDir: string,
  targetPaths: string[] = [],
  allowBroadScope: boolean = false,
  cwd: string = process.cwd(),
): void {
  if (targetPaths.length === 0) return;

  // 1. Downward blast radius check (RULE-6)
  for (const target of targetPaths) {
    const absTarget = resolve(cwd, target);
    const rel = relative(normalizedScopeDir, absTarget);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(
        `Downward blast radius violation: target path "${target}" escapes task scope directory "${normalizedScopeDir}" (RULE-6).`,
      );
    }
  }

  // 2. Least scope placement check (RULE-12)
  if (!allowBroadScope) {
    const commonAncestor = findDeepestCommonAncestor(targetPaths, cwd);
    if (commonAncestor && commonAncestor !== normalizedScopeDir) {
      const relToAncestor = relative(normalizedScopeDir, commonAncestor);
      if (relToAncestor.length > 0 && !relToAncestor.startsWith("..")) {
        throw new Error(
          `Least scope placement violation: target paths share a deeper common ancestor "${commonAncestor}", but task was scoped at higher ancestor "${normalizedScopeDir}" (RULE-12).`,
        );
      }
    }
  }
}

/**
 * Orchestrating domain service to create a new TASK artifact.
 * Follows RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-22, RULE-25, and ADR-9.
 */
export async function createTask(options: CreateTaskOptions): Promise<CreateTaskResult> {
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

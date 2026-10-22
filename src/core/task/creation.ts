/**
 * Core Task Creation Service.
 * Coordinates watermark resolution, template generation, filesystem scoping, and file writing.
 * Complies with ADR-4, ADR-6, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-22, and RULE-25.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  findDeepestCommonAncestor,
  formatArtifactFilename,
  generateSlug,
  resolveArtifactDirectories,
} from "../common/index.ts";
import type { WatermarkDetails } from "../resolver/types.ts";
import { inspectGitDeletedTaskIds } from "../resolver/git-inspector.ts";
import { resolveWatermark } from "../resolver/watermark.ts";
import { renderTaskMarkdown } from "./template.ts";
import type {
  TaskAcceptanceCriteriaItem,
  TaskArtifact,
  TaskRenderOptions,
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
  const cwd = options.cwd ?? process.cwd();

  if (!options.title || options.title.trim().length === 0) {
    throw new Error("Task title must be a non-empty string.");
  }

  // 1. Generate slug per RULE-1
  const slug = generateSlug(options.title);

  // 2. Resolve directory scope & target placement per RULE-8
  const { normalizedScopeDir, targetDir } = resolveTaskDirectories(
    options.scopeDir,
    options.useSubtypeContainer ?? true,
    cwd,
  );

  // 3. Validate task scope against downward blast radius (RULE-6) and least scope (RULE-12)
  if (options.targetPaths && options.targetPaths.length > 0) {
    validateTaskScope(normalizedScopeDir, options.targetPaths, options.allowBroadScope, cwd);
  }

  // 4. Resolve watermark and next task ID (TASK-4, ADR-9)
  const watermark = await resolveWatermark({
    cwd,
    branch: options.branch,
    prefix: options.prefix,
    forceTrunk: options.forceTrunk,
  });

  const nextId = watermark.nextId;

  // Guard against zombie task resurrection (ADR-6, RULE-21)
  const deletedIds = await inspectGitDeletedTaskIds(cwd);
  if (deletedIds.includes(nextId)) {
    throw new Error(
      `Zombie task resurrection violation: Task ID "TASK-${nextId}" was previously completed and deleted in Git history. Re-creating a completed task ID is prohibited (ADR-6, RULE-21).`,
    );
  }

  // 5. Format task filename per RULE-1
  const filename = formatArtifactFilename({
    slug,
    subtype: "TASK",
    id: nextId,
  });
  const filepath = join(targetDir, filename);

  // 6. Normalize acceptance criteria checklist per RULE-22
  const rawCriteria = options.acceptanceCriteria ?? [];
  const normalizedCriteria: TaskAcceptanceCriteriaItem[] = rawCriteria.map((item) => {
    if (typeof item === "string") {
      return { text: item, completed: false };
    }
    return { text: item.text, completed: item.completed ?? false };
  });

  // 7. Render Markdown template adhering to RULE-15, RULE-18, and RULE-22
  const renderOptions: TaskRenderOptions = {
    id: nextId,
    slug,
    title: options.title.trim(),
    context: options.context ?? "",
    depends_on: options.depends_on ?? [],
    links: options.links ?? [],
    acceptanceCriteria: normalizedCriteria,
  };

  const markdown = renderTaskMarkdown(renderOptions);

  // 8. Write task file to disk
  await mkdir(targetDir, { recursive: true });
  await writeFile(filepath, markdown, "utf8");

  // 9. Construct TaskArtifact representation
  const artifact: TaskArtifact = {
    id: nextId,
    slug,
    title: options.title.trim(),
    depends_on: options.depends_on ?? [],
    links: options.links ?? [],
    context: options.context ?? "",
    acceptanceCriteria: normalizedCriteria,
    rawContent: markdown,
    filePath: filepath,
  };

  return {
    artifact,
    filename,
    filepath,
    relativePath: relative(cwd, filepath),
    markdown,
    watermark,
  };
}

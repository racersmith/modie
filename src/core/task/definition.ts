/**
 * Declarative artifact definition for TASK artifacts.
 * Complies with ADR-4, ADR-6, ADR-9, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-21, and RULE-22.
 */

import { isAbsolute, relative, resolve } from "node:path";
import { findDeepestCommonAncestor } from "../common/index.ts";
import type { ArtifactDefinition } from "../pipeline/types.ts";
import { resolveWatermark } from "../resolver/watermark.ts";
import { assertNotZombieTask } from "./completion.ts";
import { parseTaskFromContext } from "./parser.ts";
import { renderTaskMarkdown } from "./template.ts";
import type {
  CreateTaskOptions,
  TaskAcceptanceCriteriaItem,
  TaskArtifact,
  TaskRenderOptions,
} from "./types.ts";

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

export const taskDefinition: ArtifactDefinition<
  CreateTaskOptions,
  TaskArtifact
> = {
  subtype: "TASK",
  containerName: "tasks",
  validate: ({ normalizedScopeDir, options, cwd }) => {
    if (options.targetPaths && options.targetPaths.length > 0) {
      validateTaskScope(
        normalizedScopeDir,
        options.targetPaths,
        options.allowBroadScope,
        cwd,
      );
    }
  },
  allocateId: async ({ options, cwd }) => {
    const watermark = await resolveWatermark({
      cwd,
      branch: options.branch,
      prefix: options.prefix,
      forceTrunk: options.forceTrunk,
    });
    const nextId = watermark.nextId;

    // Guard against zombie task resurrection (ADR-6, RULE-21)
    await assertNotZombieTask(nextId, cwd);

    return { id: nextId, watermark };
  },
  render: ({ id, slug, title, options, filepath }) => {
    const rawCriteria = options.acceptanceCriteria ?? [];
    const normalizedCriteria: TaskAcceptanceCriteriaItem[] = rawCriteria.map(
      (item) => {
        if (typeof item === "string") {
          return { text: item, completed: false };
        }
        return { text: item.text, completed: item.completed ?? false };
      },
    );

    // Human-in-the-loop review gate: default to appending "User Review" unless review is explicitly false
    // or already included in criteria.
    const shouldIncludeReview = options.review !== false;
    const hasUserReview = normalizedCriteria.some(
      (item) => item.text.trim().toLowerCase() === "user review",
    );
    if (shouldIncludeReview && !hasUserReview) {
      normalizedCriteria.push({ text: "User Review", completed: false });
    }

    const renderOptions: TaskRenderOptions = {
      id,
      slug,
      title,
      context: options.context ?? "",
      depends_on: options.depends_on ?? [],
      links: options.links ?? [],
      plannedGovernance: options.plannedGovernance,
      acceptanceCriteria: normalizedCriteria,
    };

    const markdown = renderTaskMarkdown(renderOptions);

    const artifact: TaskArtifact = {
      id,
      slug,
      title,
      depends_on: options.depends_on ?? [],
      links: options.links ?? [],
      context: options.context ?? "",
      plannedGovernance: options.plannedGovernance
        ? {
            rules: (options.plannedGovernance.rules ?? []).map((r) =>
              typeof r === "string"
                ? { text: r, completed: false }
                : { ...r, completed: r.completed ?? false },
            ),
            adrs: (options.plannedGovernance.adrs ?? []).map((a) =>
              typeof a === "string"
                ? { text: a, completed: false }
                : { ...a, completed: a.completed ?? false },
            ),
          }
        : undefined,
      acceptanceCriteria: normalizedCriteria,
      rawContent: markdown,
      filePath: filepath,
    };

    return { markdown, artifact };
  },
  parse: (context) => parseTaskFromContext(context),
};

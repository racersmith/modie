/**
 * Modie Core Domain Layer: Declarative artifact definition for TASK artifacts.
 * Pure domain model complying with ADR-4, ADR-6, ADR-9, ADR-13, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-21, RULE-22, and RULE-38.
 */

import { slugToTitle } from "../common/slug.ts";
import { LINK_POLICY } from "../graph/policy.ts";
import type { ArtifactDefinition } from "../types.ts";
import { validateTaskScope } from "./scope.ts";
import { parseTaskFromContext, renderTaskMarkdown } from "./template.ts";
import type {
  CreateTaskOptions,
  TaskAcceptanceCriteriaItem,
  TaskArtifact,
} from "./types.ts";

export { validateTaskScope };
export type TaskDefinition = ArtifactDefinition<CreateTaskOptions, TaskArtifact>;


export const taskDefinition: TaskDefinition = {
  subtype: "TASK",
  containerName: "tasks",
  linkPolicy: LINK_POLICY.TASK,
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
    const shouldAddReview =
      options.review !== false &&
      !normalizedCriteria.some((item) =>
        item.text.toLowerCase().includes("user review"),
      );

    if (shouldAddReview) {
      normalizedCriteria.push({ text: "User Review", completed: false });
    }

    const effectiveTitle = title?.trim() || slugToTitle(slug);
    const summary = options.summary?.trim() || undefined;

    const markdown = renderTaskMarkdown({
      id,
      slug,
      title: effectiveTitle,
      summary,
      contextSection: options.contextSection ?? options.context,
      context: options.contextSection ?? options.context,
      depends_on: options.depends_on ?? [],
      links: options.links ?? [],
      acceptanceCriteria: normalizedCriteria,
    });

    const artifact: TaskArtifact = {
      id,
      slug,
      title: effectiveTitle,
      summary,
      depends_on: options.depends_on ?? [],
      links: options.links ?? [],
      contextSection: options.contextSection ?? options.context,
      context: options.contextSection ?? options.context,
      acceptanceCriteria: normalizedCriteria,
      rawContent: markdown,
      filePath: filepath,
    };

    return { markdown, artifact };
  },
  parse: (context) => parseTaskFromContext(context),
};

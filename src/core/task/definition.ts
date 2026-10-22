/**
 * Declarative artifact definition for TASK artifacts.
 * Complies with ADR-4, ADR-6, ADR-9, RULE-1, RULE-6, RULE-8, RULE-12, RULE-15, RULE-18, RULE-21, and RULE-22.
 */

import type { ArtifactDefinition } from "../pipeline/types.ts";
import { resolveWatermark } from "../resolver/watermark.ts";
import { assertNotZombieTask } from "./completion.ts";
import { type CreateTaskOptions, validateTaskScope } from "./creation.ts";
import { renderTaskMarkdown } from "./template.ts";
import type {
  TaskAcceptanceCriteriaItem,
  TaskArtifact,
  TaskRenderOptions,
} from "./types.ts";

export const taskDefinition: ArtifactDefinition<CreateTaskOptions, TaskArtifact> = {
  subtype: "TASK",
  containerName: "tasks",
  validate: ({ normalizedScopeDir, options, cwd }) => {
    if (options.targetPaths && options.targetPaths.length > 0) {
      validateTaskScope(normalizedScopeDir, options.targetPaths, options.allowBroadScope, cwd);
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
      (item: string | TaskAcceptanceCriteriaItem) => {
      if (typeof item === "string") {
        return { text: item, completed: false };
      }
      return { text: item.text, completed: item.completed ?? false };
    });

    const renderOptions: TaskRenderOptions = {
      id,
      slug,
      title,
      context: options.context ?? "",
      depends_on: options.depends_on ?? [],
      links: options.links ?? [],
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
      acceptanceCriteria: normalizedCriteria,
      rawContent: markdown,
      filePath: filepath,
    };

    return { markdown, artifact };
  },
};

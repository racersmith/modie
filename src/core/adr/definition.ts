/**
 * Declarative artifact definition for ADR artifacts.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, and RULE-17.
 */

import type { ArtifactDefinition } from "../pipeline/types.ts";
import { renderAdrMarkdown } from "./template.ts";
import type { AdrArtifact } from "./types.ts";
import { type CreateAdrOptions, validateAdrScope } from "./creation.ts";

export const adrDefinition: ArtifactDefinition<CreateAdrOptions, AdrArtifact> = {
  subtype: "ADR",
  containerName: "adrs",
  validate: async ({ normalizedScopeDir, options, cwd }) => {
    const links = options.links ?? [];
    await validateAdrScope(normalizedScopeDir, links, cwd);
  },
  render: ({ id, slug, title, options, filepath }) => {
    const links = options.links ?? [];
    const markdown = renderAdrMarkdown({
      id,
      slug,
      title,
      links,
      context: options.context?.trim(),
      alternatives: options.alternatives?.trim(),
      decision: options.decision?.trim(),
    });

    const artifact: AdrArtifact = {
      id,
      slug,
      title,
      links,
      context: options.context?.trim(),
      alternatives: options.alternatives?.trim(),
      decision: options.decision?.trim(),
      filePath: filepath,
      rawContent: markdown,
    };

    return { markdown, artifact };
  },
};

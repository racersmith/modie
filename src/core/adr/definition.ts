/**
 * Declarative artifact definition for ADR artifacts.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, and RULE-17.
 */

import { LINK_POLICY } from "../linking/policy.ts";
import type { ArtifactDefinition } from "../pipeline/types.ts";
import { parseAdrFromContext, renderAdrMarkdown } from "./template.ts";
import type { AdrArtifact, CreateAdrOptions } from "./types.ts";

export type AdrDefinition = ArtifactDefinition<CreateAdrOptions, AdrArtifact>;

export const adrDefinition: AdrDefinition = {
  subtype: "ADR",
  containerName: "adrs",
  linkPolicy: LINK_POLICY.ADR,
  render: ({ id, slug, title, options, filepath }) => {
    const links = options.links ?? [];
    const summary = options.summary?.trim() || undefined;
    const supersedesRaw = options.supersedes
      ? Array.isArray(options.supersedes)
        ? options.supersedes
        : [options.supersedes]
      : [];
    const supersedes = supersedesRaw
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const contextContent = (options.contextSection ?? options.context)?.trim();

    const markdown = renderAdrMarkdown({
      id,
      slug,
      title,
      summary,
      links,
      supersedes: supersedes.length > 0 ? supersedes : undefined,
      contextSection: contextContent,
      context: contextContent,
      alternatives: options.alternatives?.trim(),
      decision: options.decision?.trim(),
      consequences: options.consequences?.trim(),
    });

    const artifact: AdrArtifact = {
      id,
      slug,
      title,
      summary,
      links,
      supersedes: supersedes.length > 0 ? supersedes : undefined,
      contextSection: contextContent,
      context: contextContent,
      alternatives: options.alternatives?.trim(),
      decision: options.decision?.trim(),
      consequences: options.consequences?.trim(),
      filePath: filepath,
      rawContent: markdown,
    };

    return { markdown, artifact };
  },
  parse: (context) => parseAdrFromContext(context),
};

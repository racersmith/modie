/**
 * Declarative artifact definition for ADR artifacts.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, and RULE-17.
 */

import { validateLinkTarget } from "../linking/validator.ts";
import type { ArtifactDefinition } from "../pipeline/types.ts";
import {
  parseAdrFromContext,
  renderAdrMarkdown,
} from "./template.ts";
import type { AdrArtifact, CreateAdrOptions } from "./types.ts";

/**
 * Validates frontmatter links per RULE-14, descendant rule scope per RULE-17,
 * and ancestor ADR scope per RULE-19.
 *
 * - An ADR's frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).
 * - An ADR artifact referencing a RULE must target a RULE residing in the ADR's
 *   directory or within its descendant subtree (RULE-17).
 * - An ADR artifact referencing an ADR must target an ancestor or self ADR (RULE-19).
 *
 * @throws Error if any link is not ADR/RULE (RULE-14) or violates spatial scope (RULE-17, RULE-19).
 */
export async function validateAdrScope(
  normalizedScopeDir: string,
  links: string[] = [],
  cwd: string = process.cwd(),
): Promise<void> {
  for (const link of links) {
    await validateLinkTarget("ADR", normalizedScopeDir, "links", link, {
      cwd,
      sourceTag: "ADR",
    });
  }
}

export type AdrDefinition = ArtifactDefinition<CreateAdrOptions, AdrArtifact>;

export const adrDefinition: AdrDefinition =
  {
    subtype: "ADR",
    containerName: "adrs",
    validate: async ({ normalizedScopeDir, options, cwd }) => {
      const links = options.links ?? [];
      await validateAdrScope(normalizedScopeDir, links, cwd);
    },
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

      const markdown = renderAdrMarkdown({
        id,
        slug,
        title,
        summary,
        links,
        supersedes: supersedes.length > 0 ? supersedes : undefined,
        context: options.context?.trim(),
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
        context: options.context?.trim(),
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

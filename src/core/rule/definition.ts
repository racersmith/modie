/**
 * Declarative artifact definition for RULE artifacts.
 * Complies with ADR-1, ADR-2, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, and RULE-16.
 */

import type { ArtifactDefinition } from "../pipeline/types.ts";
import { renderRuleMarkdown } from "./template.ts";
import type { RuleArtifact } from "./types.ts";
import { type CreateRuleOptions, validateRuleAncestry } from "./creation.ts";

export const ruleDefinition: ArtifactDefinition<CreateRuleOptions, RuleArtifact> = {
  subtype: "RULE",
  containerName: "rules",
  validate: async ({ normalizedScopeDir, options, cwd }) => {
    const links = options.links ?? [];
    await validateRuleAncestry(normalizedScopeDir, links, cwd);
  },
  render: ({ id, slug, title, options, filepath }) => {
    const links = options.links ?? [];
    const assertionText =
      options.assertion?.trim() ||
      options.context?.trim() ||
      `A discrete invariant assertion regarding ${title}.`;

    const markdown = renderRuleMarkdown({
      id,
      slug,
      title,
      links,
      assertion: assertionText,
    });

    const artifact: RuleArtifact = {
      id,
      slug,
      title,
      links,
      assertion: assertionText,
      filePath: filepath,
      rawContent: markdown,
    };

    return { markdown, artifact };
  },
};

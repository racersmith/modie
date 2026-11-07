/**
 * Declarative artifact definition for RULE artifacts.
 * Complies with ADR-1, ADR-2, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, and RULE-16.
 */

import { LINK_POLICY } from "../linking/policy.ts";
import type { ArtifactDefinition } from "../pipeline/types.ts";
import { parseRuleFromContext, renderRuleMarkdown } from "./template.ts";
import type { CreateRuleOptions, RuleArtifact } from "./types.ts";

export const ruleDefinition: ArtifactDefinition<
  CreateRuleOptions,
  RuleArtifact
> = {
  subtype: "RULE",
  containerName: "rules",
  linkPolicy: LINK_POLICY.RULE,
  render: ({ id, slug, title, options, filepath }) => {
    const links = options.links ?? [];
    const supersedes = options.supersedes
      ? Array.isArray(options.supersedes)
        ? options.supersedes.map((s) => s.trim().toUpperCase()).filter(Boolean)
        : [options.supersedes.trim().toUpperCase()].filter(Boolean)
      : undefined;

    const assertionText =
      options.assertion?.trim() ||
      options.contextSection?.trim() ||
      options.context?.trim() ||
      `A discrete invariant assertion regarding ${title}.`;

    const markdown = renderRuleMarkdown({
      id,
      slug,
      title,
      links,
      supersedes,
      assertion: assertionText,
    });

    const artifact: RuleArtifact = {
      id,
      slug,
      title,
      links,
      supersedes,
      assertion: assertionText,
      filePath: filepath,
      rawContent: markdown,
    };

    return { markdown, artifact };
  },
  parse: (context) => parseRuleFromContext(context),
};

/**
 * Modie Core Domain Layer: Declarative artifact definition for RULE artifacts.
 * Pure domain model complying with ADR-1, ADR-2, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, and RULE-38.
 */

import { LINK_POLICY } from "../graph/policy.ts";
import type { ArtifactDefinition } from "../types.ts";
import { parseRuleFromContext, renderRuleMarkdown } from "./template.ts";
import type { CreateRuleOptions, RuleArtifact } from "./types.ts";

export type RuleDefinition = ArtifactDefinition<CreateRuleOptions, RuleArtifact>;

export const ruleDefinition: RuleDefinition = {
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
      `A discrete invariant assertion regarding ${title}.`;

    const summary = options.summary?.trim() || undefined;

    const markdown = renderRuleMarkdown({
      id,
      slug,
      title,
      summary,
      links,
      supersedes,
      assertion: assertionText,
    });

    const artifact: RuleArtifact = {
      id,
      slug,
      title,
      ...(summary ? { summary } : {}),
      links,
      supersedes,
      assertion: assertionText,
      contextSection: assertionText,
      filePath: filepath,
      rawContent: markdown,
    };

    return { markdown, artifact };
  },
  parse: (context) => parseRuleFromContext(context),
};


/**
 * Declarative artifact definition for RULE artifacts.
 * Complies with ADR-1, ADR-2, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, and RULE-16.
 */

import { dirname, isAbsolute, relative } from "node:path";
import { resolveArtifactDirectories } from "../common/index.ts";
import type { ArtifactDefinition } from "../pipeline/types.ts";
import { resolveArtifactByTag } from "../query/index.ts";
import { renderRuleMarkdown, validateRuleLinks } from "./template.ts";
import type { CreateRuleOptions, RuleArtifact } from "./types.ts";

/**
 * Validates frontmatter links per RULE-13 and ancestor justification per RULE-16.
 *
 * A RULE artifact referencing an ADR must target an ADR residing in the rule's
 * directory or an ancestor directory up to the repository root (RULE-16).
 *
 * @throws Error if any link is non-ADR (RULE-13) or targets a descendant/sibling ADR (RULE-16).
 */
export async function validateRuleAncestry(
  normalizedScopeDir: string,
  links: string[] = [],
  cwd: string = process.cwd(),
): Promise<void> {
  // 1. Enforce RULE-13: only ADR targets allowed
  validateRuleLinks(links);

  if (links.length === 0) return;

  // 2. Enforce RULE-16: referenced ADRs must reside in rule directory or ancestor directory
  for (const link of links) {
    const adr = await resolveArtifactByTag(link, { cwd });

    const adrDir = dirname(adr.filepath);
    const { normalizedScopeDir: adrNormalizedScope } = resolveArtifactDirectories(
      "ADR",
      adrDir,
      true,
      cwd,
    );

    const relFromAdrToRule = relative(adrNormalizedScope, normalizedScopeDir);
    const isAncestorOrEqual =
      !relFromAdrToRule.startsWith("..") && !isAbsolute(relFromAdrToRule);

    if (!isAncestorOrEqual) {
      const ruleScopeDisplay = relative(cwd, normalizedScopeDir) || ".";
      throw new Error(
        `Rule justification ancestry violation: linked ADR "${link}" at "${adr.relativePath}" does not reside in rule directory "${ruleScopeDisplay}" or an ancestor directory (RULE-16).`,
      );
    }
  }
}

export const ruleDefinition: ArtifactDefinition<CreateRuleOptions, RuleArtifact> = {
  subtype: "RULE",
  containerName: "rules",
  validate: async ({ normalizedScopeDir, options, cwd }) => {
    const links = options.links ?? [];
    await validateRuleAncestry(normalizedScopeDir, links, cwd);
  },
  render: ({ id, slug, title, options, filepath }) => {
    const links = options.links ?? [];
    const supersedes = options.supersedes
      ? Array.isArray(options.supersedes)
        ? options.supersedes.map((s) => s.trim().toUpperCase()).filter(Boolean)
        : [options.supersedes.trim().toUpperCase()].filter(Boolean)
      : undefined;

    const assertionText =
      options.assertion?.trim() ||
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
};

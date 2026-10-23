/**
 * Declarative artifact definition for ADR artifacts.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, and RULE-17.
 */

import { dirname, isAbsolute, relative } from "node:path";
import { resolveArtifactDirectories } from "../common/index.ts";
import type { ArtifactDefinition } from "../pipeline/types.ts";
import { resolveArtifactByTag } from "../query/index.ts";
import { renderAdrMarkdown, validateAdrLinks } from "./template.ts";
import type { AdrArtifact, CreateAdrOptions } from "./types.ts";

/**
 * Validates frontmatter links per RULE-14 and descendant rule scope per RULE-17.
 *
 * - An ADR's frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).
 * - An ADR artifact referencing a RULE must target a RULE residing in the ADR's
 *   directory or within its descendant subtree (RULE-17).
 *
 * @throws Error if any link is not ADR/RULE (RULE-14) or targets an ancestor/sibling RULE (RULE-17).
 */
export async function validateAdrScope(
  normalizedScopeDir: string,
  links: string[] = [],
  cwd: string = process.cwd(),
): Promise<void> {
  // 1. Enforce RULE-14: only ADR or RULE targets allowed
  validateAdrLinks(links);

  if (links.length === 0) return;

  // 2. Enforce RULE-17: referenced RULEs must reside in ADR directory or descendant subtree
  for (const link of links) {
    if (!link.toUpperCase().startsWith("RULE-")) {
      // RULE-17 only applies to referenced RULE artifacts
      continue;
    }

    const rule = await resolveArtifactByTag(link, { cwd });

    const ruleDir = dirname(rule.filepath);
    const { normalizedScopeDir: ruleNormalizedScope } = resolveArtifactDirectories(
      "RULE",
      ruleDir,
      true,
      cwd,
    );

    const relFromAdrToRule = relative(normalizedScopeDir, ruleNormalizedScope);
    const isDescendantOrEqual =
      !relFromAdrToRule.startsWith("..") && !isAbsolute(relFromAdrToRule);

    if (!isDescendantOrEqual) {
      const adrScopeDisplay = relative(cwd, normalizedScopeDir) || ".";
      throw new Error(
        `ADR rule scope violation: linked RULE "${link}" at "${rule.relativePath}" does not reside in ADR directory "${adrScopeDisplay}" or a descendant subtree (RULE-17).`,
      );
    }
  }
}

export const adrDefinition: ArtifactDefinition<CreateAdrOptions, AdrArtifact> = {
  subtype: "ADR",
  containerName: "adrs",
  validate: async ({ normalizedScopeDir, options, cwd }) => {
    const links = options.links ?? [];
    await validateAdrScope(normalizedScopeDir, links, cwd);

    if (options.supersedes) {
      const supersedesRaw = Array.isArray(options.supersedes)
        ? options.supersedes
        : [options.supersedes];
      const supersedesList = supersedesRaw
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      for (const sup of supersedesList) {
        if (!/^ADR-[A-Za-z0-9_-]+$/i.test(sup)) {
          throw new Error(
            `Invalid supersedes target: "${sup}". An ADR can only supersede other ADR artifacts.`,
          );
        }
        await resolveArtifactByTag(sup, {
          cwd,
          subtype: "ADR",
          includeArchived: true,
        });
      }
    }
  },
  render: ({ id, slug, title, options, filepath }) => {
    const links = options.links ?? [];
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
      links,
      supersedes: supersedes.length > 0 ? supersedes : undefined,
      context: options.context?.trim(),
      alternatives: options.alternatives?.trim(),
      decision: options.decision?.trim(),
    });

    const artifact: AdrArtifact = {
      id,
      slug,
      title,
      links,
      supersedes: supersedes.length > 0 ? supersedes : undefined,
      context: options.context?.trim(),
      alternatives: options.alternatives?.trim(),
      decision: options.decision?.trim(),
      filePath: filepath,
      rawContent: markdown,
    };

    return { markdown, artifact };
  },
};

/**
 * Rule markdown template generator and renderer.
 * Enforces RULE-3, RULE-11, and RULE-13.
 */

import type { RuleRenderOptions } from "./types.ts";

export const ADR_LINK_REGEX = /^ADR-[A-Za-z0-9_-]+$/;

/**
 * Validates frontmatter links per RULE-13:
 * A RULE artifact's frontmatter links must exclusively reference ADR artifacts.
 */
export function validateRuleLinks(links: string[] = []): void {
  for (const link of links) {
    if (!ADR_LINK_REGEX.test(link)) {
      throw new Error(
        `Invalid rule link target: "${link}". A RULE artifact's frontmatter links must exclusively reference ADR artifacts (RULE-13).`,
      );
    }
  }
}

/**
 * Renders a canonical RULE markdown document with optional YAML frontmatter
 * and a single invariant assertion per RULE-3 and RULE-11.
 */
export function renderRuleMarkdown(options: RuleRenderOptions): string {
  const { title, slug, links = [], assertion } = options;

  // Validate frontmatter boundaries per RULE-13
  validateRuleLinks(links);

  const assertionText =
    assertion?.trim() ||
    (title
      ? `A discrete invariant assertion regarding ${title.trim()}.`
      : slug
        ? `A discrete invariant assertion regarding ${slug}.`
        : "A discrete invariant assertion.");

  if (links.length > 0) {
    const frontmatterLines: string[] = [
      "---",
      "links:",
      ...links.map((link) => `  - ${link}`),
      "---",
      "",
      assertionText,
      "",
    ];
    return frontmatterLines.join("\n");
  }

  return `${assertionText}\n`;
}

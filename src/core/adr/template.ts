/**
 * ADR markdown template generator and renderer.
 * Enforces ADR-4 and RULE-14.
 */

import type { AdrRenderOptions } from "./types.ts";

export const ADR_OR_RULE_LINK_REGEX = /^(?:ADR|RULE)-[A-Za-z0-9_-]+$/;

/**
 * Validates frontmatter links per RULE-14:
 * An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts.
 */
export function validateAdrLinks(links: string[] = []): void {
  for (const link of links) {
    if (!ADR_OR_RULE_LINK_REGEX.test(link)) {
      throw new Error(
        `Invalid ADR link target: "${link}". An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).`,
      );
    }
  }
}

/**
 * Renders a canonical ADR markdown document with YAML frontmatter and standard
 * sections (# Context, # Alternatives Considered, # Decision) per ADR-4.
 */
export function renderAdrMarkdown(options: AdrRenderOptions): string {
  const {
    title,
    links = [],
    context,
    alternatives,
    decision,
  } = options;

  // Validate frontmatter boundaries per RULE-14
  validateAdrLinks(links);

  const frontmatterLines: string[] = ["---"];

  if (links.length > 0) {
    frontmatterLines.push("links:");
    for (const link of links) {
      frontmatterLines.push(`  - ${link}`);
    }
  } else {
    frontmatterLines.push("links: []");
  }

  frontmatterLines.push("---");

  const contextContent =
    context?.trim() ||
    (title
      ? `Architecture decision context and motivation for ${title.trim()}.`
      : "Architecture decision context and problem statement.");

  const alternativesContent =
    alternatives?.trim() || "- None recorded.";

  const decisionContent =
    decision?.trim() ||
    (title
      ? `Adopted decision regarding ${title.trim()}.`
      : "Adopted architectural decision.");

  const sections: string[] = [
    frontmatterLines.join("\n"),
    "",
    "# Context",
    "",
    contextContent,
    "",
    "# Alternatives Considered",
    "",
    alternativesContent,
    "",
    "# Decision",
    "",
    decisionContent,
    "",
  ];

  return sections.join("\n");
}

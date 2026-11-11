/**
 * Modie Core Domain Layer: Rule markdown template generator, renderer, and parser.
 * Pure domain logic enforcing RULE-3, RULE-11, RULE-13, and RULE-38 with zero platform/engine dependencies.
 */

import { parseArtifactMarkdownDocument } from "../common/parser.ts";
import { slugToTitle } from "../common/slug.ts";
import { isValidAdrLinkTag } from "../graph/syntax.ts";
import type { ArtifactParseContext } from "../types.ts";
import type { RuleArtifact, RuleRenderOptions } from "./types.ts";

/**
 * Validates frontmatter links per RULE-13:
 * A RULE artifact's frontmatter links must exclusively reference ADR artifacts.
 */
export function validateRuleLinks(links: string[] = []): void {
  for (const link of links) {
    if (!isValidAdrLinkTag(link)) {
      throw new Error(
        `Invalid rule link target: "${link}". A RULE artifact's frontmatter links must exclusively reference ADR artifacts.`,
      );
    }
  }
}

/**
 * Extracts a concise summary from a RULE markdown document.
 * Prefers the explicit `summary:` YAML frontmatter field; falls back to the
 * single invariant assertion claim text or the human-readable title derived from `fallbackSlug`.
 */
export function extractRuleSummary(
  rawContent: string,
  fallbackSlug?: string,
): string {
  const frontmatterMatch = rawContent.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );
  if (frontmatterMatch && frontmatterMatch[1]) {
    const summaryMatch = frontmatterMatch[1].match(/^\s*summary:\s*(.+)$/m);
    if (summaryMatch && summaryMatch[1] && summaryMatch[1].trim()) {
      return summaryMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  const assertion = (
    frontmatterMatch
      ? rawContent.slice(frontmatterMatch[0].length).trim()
      : rawContent.trim()
  );

  if (assertion) {
    const sentenceMatch = assertion.match(/^.*?[.!?](?:\s|$)/);
    if (sentenceMatch && sentenceMatch[0]) {
      return sentenceMatch[0].trim();
    }
    return assertion.length > 140 ? `${assertion.slice(0, 137)}...` : assertion;
  }

  if (fallbackSlug) {
    return slugToTitle(fallbackSlug);
  }

  return "Architectural Governance Rule";
}

/**
 * Renders a canonical RULE markdown document with optional YAML frontmatter
 * and a single invariant assertion per RULE-3 and RULE-11.
 */
export function renderRuleMarkdown(options: RuleRenderOptions): string {
  const { title, slug, links = [], assertion, summary, skipValidation } = options;

  // Validate frontmatter boundaries per RULE-13
  if (!skipValidation) {
    validateRuleLinks(links);
  }

  const assertionText =
    assertion?.trim() ||
    (title
      ? `A discrete invariant assertion regarding ${title.trim()}.`
      : slug
        ? `A discrete invariant assertion regarding ${slug}.`
        : "A discrete invariant assertion.");

  const hasFrontmatter =
    links.length > 0 ||
    Boolean(summary?.trim()) ||
    (options.supersedes && options.supersedes.length > 0) ||
    (options.superseded_by && options.superseded_by.length > 0);

  if (hasFrontmatter) {
    const frontmatterLines: string[] = ["---"];

    if (summary?.trim()) {
      frontmatterLines.push(`summary: ${summary.trim()}`);
    }

    if (links.length > 0) {
      frontmatterLines.push("links:");
      for (const link of links) {
        frontmatterLines.push(`  - ${link}`);
      }
    } else {
      frontmatterLines.push("links: []");
    }

    if (options.supersedes && options.supersedes.length > 0) {
      frontmatterLines.push("supersedes:");
      for (const sup of options.supersedes) {
        frontmatterLines.push(`  - ${sup}`);
      }
    }

    if (options.superseded_by && options.superseded_by.length > 0) {
      frontmatterLines.push("superseded_by:");
      for (const sup of options.superseded_by) {
        frontmatterLines.push(`  - ${sup}`);
      }
    }

    frontmatterLines.push("---");
    frontmatterLines.push("");
    frontmatterLines.push(assertionText);
    frontmatterLines.push("");
    return frontmatterLines.join("\n");
  }

  return `${assertionText}\n`;
}

/**
 * Maps a parsed markdown document context into a typed RuleArtifact object.
 */
export function parseRuleFromContext(context: ArtifactParseContext): RuleArtifact {
  const assertion = context.body.trim();
  const summary = context.frontmatterFields.summary;


  const contextSection =
    context.sections["Context"] ??
    Object.entries(context.sections).find(
      ([k]) => k.toLowerCase() === "context",
    )?.[1];

  return {
    id: context.id,
    slug: context.slug,
    title: context.title,
    ...(summary ? { summary } : {}),
    links: context.frontmatterFields.links,
    ...(context.frontmatterFields.supersedes
      ? { supersedes: context.frontmatterFields.supersedes }
      : {}),
    ...(context.frontmatterFields.superseded_by
      ? { superseded_by: context.frontmatterFields.superseded_by }
      : {}),
    assertion,
    ...(contextSection !== undefined
      ? { contextSection, context: contextSection }
      : {}),
    filePath: context.filepath ?? "",
    rawContent: context.rawContent,
  };
}

/**
 * Parses a RULE markdown document into a structured RuleArtifact object (RULE-38).
 */
export function parseRuleMarkdown(
  content: string,
  filePathOrFilename?: string,
): RuleArtifact {
  return parseRuleFromContext(
    parseArtifactMarkdownDocument(content, filePathOrFilename),
  );
}

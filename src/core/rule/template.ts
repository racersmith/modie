/**
 * Rule markdown template generator, renderer, and parser.
 * Enforces RULE-3, RULE-11, and RULE-13.
 */

import { parseArtifactFilename } from "../common/filename.ts";
import type { ArtifactParseContext } from "../pipeline/types.ts";
import { parseMarkdownDocument } from "../query/markdown-parser.ts";
import type { RuleArtifact, RuleRenderOptions } from "./types.ts";

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
  const { title, slug, links = [], assertion, skipValidation } = options;

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
    (options.supersedes && options.supersedes.length > 0) ||
    (options.superseded_by && options.superseded_by.length > 0);

  if (hasFrontmatter) {
    const frontmatterLines: string[] = ["---"];

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
 * Reconstructs a strongly-typed RuleArtifact from a standardized ArtifactParseContext.
 */
export function parseRuleFromContext(
  context: ArtifactParseContext,
): RuleArtifact {
  return {
    id: context.id,
    slug: context.slug,
    title: context.title,
    links: context.frontmatterFields.links,
    ...(context.frontmatterFields.supersedes
      ? { supersedes: context.frontmatterFields.supersedes }
      : {}),
    ...(context.frontmatterFields.superseded_by
      ? { superseded_by: context.frontmatterFields.superseded_by }
      : {}),
    assertion: context.body.trim(),
    filePath: context.filepath ?? "",
    rawContent: context.rawContent,
  };
}

/**
 * Parses a RULE markdown document into a structured RuleArtifact object.
 */
export function parseRuleMarkdown(
  content: string,
  filePathOrFilename?: string,
): RuleArtifact {
  const doc = parseMarkdownDocument(content);
  let id = "";
  let slug = "";
  if (filePathOrFilename) {
    const parsed = parseArtifactFilename(filePathOrFilename);
    if (parsed && parsed.subtype === "RULE") {
      id = parsed.id;
      slug = parsed.slug;
    }
  }

  return parseRuleFromContext({
    id,
    slug,
    title: slug ? slug.replace(/-/g, " ") : "",
    filepath: filePathOrFilename,
    filename: filePathOrFilename,
    rawContent: content,
    frontmatter: doc.frontmatter,
    body: doc.body,
    frontmatterFields: doc.frontmatterFields,
    sections: doc.sections,
  });
}

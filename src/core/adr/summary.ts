/**
 * ADR summary extraction and resolution utilities.
 * Complies with ADR-4, ADR-8, and RULE-26.
 */

import { slugToTitle } from "../common/index.ts";
import {
  parseFrontmatterFields,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
} from "../markdown/index.ts";

/**
 * Extracts a concise summary from an ADR markdown document.
 * Prefers the explicit `summary:` YAML frontmatter field; falls back to the first
 * substantive paragraph of `# Decision`, `# Context`, or document body, and finally
 * the human-readable title derived from `fallbackSlug`.
 */
export function extractAdrSummary(
  rawContent: string,
  fallbackSlug?: string,
): string {
  const { frontmatter, body } = splitMarkdownFrontmatter(rawContent);
  const { summary } = parseFrontmatterFields(frontmatter);
  if (summary) {
    return summary;
  }

  const sections = parseMarkdownSections(body);
  const candidates = [sections["Decision"], sections["Context"], body];

  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    const paragraphs = candidate
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const para of paragraphs) {
      if (/^#+\s+/.test(para) && !para.includes("\n")) {
        continue;
      }
      if (/^(`{3,}|~{3,})/.test(para)) {
        continue;
      }
      const cleaned = para
        .split(/\r?\n/)
        .filter((l) => !/^#+\s+/.test(l.trim()))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned) {
        return cleaned;
      }
    }

    const headingCleaned = paragraphs[0]!
      .replace(/^#+\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (headingCleaned) {
      return headingCleaned;
    }
  }

  if (fallbackSlug) {
    return slugToTitle(fallbackSlug);
  }

  return "Architecture Decision Record";
}

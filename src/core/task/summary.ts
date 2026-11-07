/**
 * TASK summary extraction and resolution utilities.
 * Complies with ADR-4, ADR-8, and RULE-26.
 */

import { slugToTitle } from "../common/index.ts";
import {
  parseFrontmatterFields,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
} from "../markdown/index.ts";

/**
 * Extracts a concise summary from a TASK markdown document.
 * Prefers the explicit `summary:` YAML frontmatter field; falls back to the first
 * substantive paragraph of `# Context` or document body, and finally
 * the human-readable title derived from `fallbackSlug`.
 */
export function extractTaskSummary(
  rawContent: string,
  fallbackSlug?: string,
): string {
  const { frontmatter, body } = splitMarkdownFrontmatter(rawContent);
  const { summary } = parseFrontmatterFields(frontmatter);
  if (summary) {
    return summary;
  }

  const sections = parseMarkdownSections(body);
  const candidates = [sections["Context"], body];

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
      if (/^-\s*\[[ xX]\]/.test(para)) {
        // Skip checklist items
        continue;
      }
      const cleaned = para
        .split(/\r?\n/)
        .filter((l) => !/^#+\s+/.test(l.trim()))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned) {
        const sentenceMatch = cleaned.match(/^.*?[.!?](?:\s|$)/);
        if (sentenceMatch && sentenceMatch[0]) {
          return sentenceMatch[0].trim();
        }
        return cleaned.length > 140 ? `${cleaned.slice(0, 137)}...` : cleaned;
      }
    }
  }

  if (fallbackSlug) {
    return slugToTitle(fallbackSlug);
  }

  return "Task Execution Plan";
}

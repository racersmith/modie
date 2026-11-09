/**
 * Task markdown template generator and renderer.
 * Enforces RULE-15, RULE-18, and RULE-22.
 */

import { slugToTitle } from "../common/index.ts";
import {
  isValidGovernanceLinkTag,
  isValidTaskDependencyTag,
} from "../linking/syntax.ts";
import {
  parseFrontmatterFields,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
} from "../markdown/index.ts";
import { renderAcceptanceCriteria } from "./checklist.ts";
import type { TaskRenderOptions } from "./types.ts";

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

/**
 * Validates links per RULE-15: TASK links must only reference ADR and RULE artifacts.
 */
export function validateTaskLinks(links: string[] = []): void {
  for (const link of links) {
    if (!isValidGovernanceLinkTag(link)) {
      throw new Error(
        `Invalid task link target: "${link}". A TASK artifact's frontmatter links must exclusively reference ADR and RULE artifacts.`,
      );
    }
  }
}

/**
 * Validates depends_on per RULE-18: TASK depends_on must exclusively reference other TASK artifacts.
 */
export function validateTaskDependencies(dependsOn: string[] = []): void {
  for (const dep of dependsOn) {
    if (!isValidTaskDependencyTag(dep)) {
      throw new Error(
        `Invalid task dependency: "${dep}". A TASK artifact's frontmatter depends_on must exclusively reference other TASK artifacts.`,
      );
    }
  }
}

/**
 * Renders a canonical TASK markdown document with YAML frontmatter, Context, and Acceptance Criteria.
 */
export function renderTaskMarkdown(options: TaskRenderOptions): string {
  const {
    title,
    summary,
    contextSection,
    context,
    depends_on = [],
    links = [],
    acceptanceCriteria = [],
    skipValidation,
    allowEmptyCriteria,
  } = options;
  const effectiveContext = contextSection ?? context;

  // Validate frontmatter boundaries
  if (!skipValidation) {
    validateTaskLinks(links);
    validateTaskDependencies(depends_on);
  }

  const frontmatterLines: string[] = ["---"];

  const trimmedSummary = summary?.trim().replace(/\s*\r?\n\s*/g, " ");
  if (trimmedSummary) {
    frontmatterLines.push(`summary: ${trimmedSummary}`);
  }

  if (depends_on.length > 0) {
    frontmatterLines.push("depends_on:");
    for (const dep of depends_on) {
      frontmatterLines.push(`  - ${dep}`);
    }
  } else {
    frontmatterLines.push("depends_on: []");
  }

  frontmatterLines.push("");

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
    effectiveContext?.trim() ||
    (title ? `Implement ${title}.` : "Execution plan description.");

  const sections: string[] = [
    frontmatterLines.join("\n"),
    "",
    "# Context",
    "",
    contextContent,
    "",
    renderAcceptanceCriteria(acceptanceCriteria, {
      allowEmpty: allowEmptyCriteria,
    }).trim(),
    "",
  ];

  return sections.join("\n");
}

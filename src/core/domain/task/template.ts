/**
 * Modie Core Domain Layer: Task markdown template generator, renderer, and parser.
 * Pure domain logic enforcing ADR-13, RULE-15, RULE-18, RULE-22, and RULE-38 with zero platform/engine dependencies.
 */

import { parseArtifactMarkdownDocument } from "../common/parser.ts";
import { slugToTitle } from "../common/slug.ts";
import {
  isValidGovernanceLinkTag,
  isValidTaskDependencyTag,
} from "../graph/syntax.ts";
import type { ArtifactParseContext } from "../types.ts";
import {
  parseAcceptanceCriteria,
  renderAcceptanceCriteria,
} from "./checklist.ts";
import type { TaskArtifact, TaskRenderOptions } from "./types.ts";

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
  const frontmatterMatch = rawContent.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );
  if (frontmatterMatch && frontmatterMatch[1]) {
    const summaryMatch = frontmatterMatch[1].match(/^\s*summary:\s*(.+)$/m);
    if (summaryMatch && summaryMatch[1] && summaryMatch[1].trim()) {
      return summaryMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  const body = frontmatterMatch
    ? rawContent.slice(frontmatterMatch[0].length).trim()
    : rawContent.trim();

  const contextMatch = body.match(
    /^#+\s+Context\s*\r?\n([\s\S]*?)(?=^#+\s+|\s*$)/im,
  );
  const candidates = [contextMatch?.[1], body];

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

/**
 * Reconstructs a strongly-typed TaskArtifact from a standardized ArtifactParseContext.
 */
export function parseTaskFromContext(
  context: ArtifactParseContext,
): TaskArtifact {
  const contextSection =
    context.sections["Context"] ??
    Object.entries(context.sections).find(
      ([k]) => k.toLowerCase() === "context",
    )?.[1];
  const acceptanceCriteria = parseAcceptanceCriteria(context.body);
  const summary =
    context.frontmatterFields.summary ??
    extractTaskSummary(context.rawContent, context.slug);

  return {
    id: context.id,
    slug: context.slug,
    ...(context.title ? { title: context.title } : {}),
    ...(summary ? { summary } : {}),
    depends_on: context.frontmatterFields.depends_on ?? [],
    links: context.frontmatterFields.links,
    contextSection,
    context: contextSection,
    acceptanceCriteria,
    rawContent: context.rawContent,
    filePath: context.filepath,
  };
}

/**
 * Parses a TASK markdown document into a structured TaskArtifact object (ADR-13, RULE-38).
 */
export function parseTaskMarkdown(
  content: string,
  filePathOrFilename?: string,
): TaskArtifact {
  return parseTaskFromContext(
    parseArtifactMarkdownDocument(content, filePathOrFilename),
  );
}

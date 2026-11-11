/**
 * Modie Core Domain Layer: ADR markdown template generator, renderer, and parser.
 * Pure domain logic enforcing ADR-4, RULE-14, and RULE-38 with zero platform/engine dependencies.
 */

import { parseArtifactMarkdownDocument } from "../common/parser.ts";
import { slugToTitle } from "../common/slug.ts";
import { isValidGovernanceLinkTag } from "../graph/syntax.ts";
import type { ArtifactParseContext } from "../types.ts";
import type { AdrArtifact, AdrRenderOptions } from "./types.ts";

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

  const decisionMatch = body.match(
    /^#+\s+Decision\s*\r?\n([\s\S]*?)(?=^#+\s+|\s*$)/im,
  );
  const contextMatch = body.match(
    /^#+\s+Context\s*\r?\n([\s\S]*?)(?=^#+\s+|\s*$)/im,
  );

  const candidates = [decisionMatch?.[1], contextMatch?.[1], body];

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

  return "Architectural Decision Record";
}

/**
 * Validates frontmatter links per RULE-14:
 * An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts.
 */
export function validateAdrLinks(links: string[] = []): void {
  for (const link of links) {
    if (!isValidGovernanceLinkTag(link)) {
      throw new Error(
        `Invalid ADR link target: "${link}". An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts.`,
      );
    }
  }
}

/**
 * Renders a canonical ADR markdown document with YAML frontmatter and standard
 * sections (# Context, # Alternatives Considered, # Decision, # Consequences) per ADR-4.
 */
export function renderAdrMarkdown(options: AdrRenderOptions): string {
  const {
    title,
    summary,
    links = [],
    contextSection,
    context,
    alternatives,
    decision,
    consequences,
    skipValidation,
  } = options;
  const effectiveContext = contextSection ?? context;

  // Validate frontmatter boundaries per RULE-14
  if (!skipValidation) {
    validateAdrLinks(links);
  }

  const frontmatterLines: string[] = ["---"];

  const trimmedSummary = summary?.trim().replace(/\s*\r?\n\s*/g, " ");
  if (trimmedSummary) {
    frontmatterLines.push(`summary: ${trimmedSummary}`);
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

  const contextContent =
    effectiveContext?.trim() ||
    (title
      ? `Architecture decision context and motivation for ${title.trim()}.`
      : "Architecture decision context and problem statement.");

  const alternativesContent = alternatives?.trim() || "- None recorded.";

  const decisionContent =
    decision?.trim() ||
    (title
      ? `Adopted decision regarding ${title.trim()}.`
      : "Adopted architectural decision.");

  const consequencesContent = consequences?.trim() || "- None recorded.";

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
    "# Consequences",
    "",
    consequencesContent,
    "",
  ];

  return sections.join("\n");
}

/**
 * Maps a parsed markdown document context into a typed AdrArtifact object.
 */
export function parseAdrFromContext(context: ArtifactParseContext): AdrArtifact {
  const summary =
    context.frontmatterFields.summary ??
    (extractAdrSummary(context.rawContent, context.slug) || undefined);

  const contextSection =
    context.sections["Context"] ??
    Object.entries(context.sections).find(
      ([k]) => k.toLowerCase() === "context",
    )?.[1];
  const alternatives =
    context.sections["Alternatives Considered"] ??
    Object.entries(context.sections).find(([k]) =>
      k.toLowerCase().includes("alternative"),
    )?.[1];
  const decision =
    context.sections["Decision"] ??
    Object.entries(context.sections).find(
      ([k]) => k.toLowerCase() === "decision",
    )?.[1];
  const consequences =
    context.sections["Consequences"] ??
    Object.entries(context.sections).find(
      ([k]) => k.toLowerCase() === "consequence",
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
    ...(contextSection !== undefined
      ? {
          contextSection,
          context: contextSection,
        }
      : {}),
    ...(alternatives !== undefined ? { alternatives } : {}),
    ...(decision !== undefined ? { decision } : {}),
    ...(consequences !== undefined ? { consequences } : {}),
    filePath: context.filepath ?? "",
    rawContent: context.rawContent,
  };
}

/**
 * Parses an ADR markdown document into a structured AdrArtifact object (RULE-38).
 */
export function parseAdrMarkdown(
  content: string,
  filePathOrFilename?: string,
): AdrArtifact {
  return parseAdrFromContext(
    parseArtifactMarkdownDocument(content, filePathOrFilename),
  );
}

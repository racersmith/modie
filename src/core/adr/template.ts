/**
 * ADR markdown template generator, renderer, and parser.
 * Enforces ADR-4 and RULE-14.
 */

import { parseArtifactFilename } from "../common/filename.ts";
import { slugToTitle } from "../common/index.ts";
import { isValidGovernanceLinkTag } from "../linking/syntax.ts";
import {
  parseFrontmatterFields,
  parseMarkdownDocument,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
  type ArtifactParseContext,
} from "../markdown/index.ts";
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
 * Reconstructs a strongly-typed AdrArtifact from a standardized ArtifactParseContext.
 */
export function parseAdrFromContext(
  context: ArtifactParseContext,
): AdrArtifact {
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
    context.sections["Alternatives"] ??
    Object.entries(context.sections).find(([k]) =>
      k.toLowerCase().startsWith("alternative"),
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
 * Parses an ADR markdown document into a structured AdrArtifact object.
 */
export function parseAdrMarkdown(
  content: string,
  filePathOrFilename?: string,
): AdrArtifact {
  const doc = parseMarkdownDocument(content);
  let id = "";
  let slug = "";
  if (filePathOrFilename) {
    const parsed = parseArtifactFilename(filePathOrFilename);
    if (parsed && parsed.subtype === "ADR") {
      id = parsed.id;
      slug = parsed.slug;
    }
  }

  return parseAdrFromContext({
    id,
    slug,
    title: slugToTitle(slug),
    filepath: filePathOrFilename,
    filename: filePathOrFilename,
    rawContent: content,
    frontmatter: doc.frontmatter,
    body: doc.body,
    frontmatterFields: doc.frontmatterFields,
    sections: doc.sections,
  });
}

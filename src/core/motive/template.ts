/**
 * MOTIVE.md template scaffolding and RULE-10 reference prohibition validation.
 * Complies with RULE-10, ADR-2, ADR-4, and ADR-10.
 */

import type { RenderMotiveOptions } from "./types.ts";

/**
 * Matches uppercase artifact tags without false-positiving on lowercase English words
 * such as `rule-based` or `task-oriented`.
 */
const UPPERCASE_ARTIFACT_TAG_REGEX =
  /\b(?:RULE|ADR|TASK|MOTIVE|GIST)-[A-Z0-9]+(?:-[A-Z0-9]+)*(?:\.\d+)?\b/g;

/**
 * Matches lowercase or mixed-case numeric artifact tags.
 */
const NUMERIC_ARTIFACT_TAG_REGEX =
  /\b(?:rule|adr|task|motive|gist)-\d+(?:\.\d+)?\b/gi;

/**
 * Matches cross-document Modie artifact filenames or `.modie/` container paths.
 */
const CROSS_DOCUMENT_REFERENCE_REGEX =
  /(?:\bMOTIVE\.md\b|\bGIST\.md\b|\b[A-Za-z0-9._-]+\.(?:RULE|ADR|TASK)-[A-Za-z0-9.-]+\.md\b|\b[A-Za-z0-9._-]+\.GIST\.md\b|(?:^|[\s([`"'])\.modie\/(?:rules|adrs|tasks|gists|MOTIVE\.md))/g;

/**
 * Matches markdown links `[label](target)` referencing other documents or paths.
 */
const MARKDOWN_LINK_REGEX = /\[[^\]]+\]\(([^)]+)\)/g;

/**
 * Matches frontmatter link declarations (`links:`, `depends_on:`, `supersedes:`, `superseded_by:`).
 */
const FRONTMATTER_REFERENCE_KEY_REGEX =
  /^---\s*\r?\n[\s\S]*?\b(links|depends_on|supersedes|superseded_by)\s*:/m;

/**
 * Validates `MOTIVE.md` content against RULE-10, rejecting any artifact IDs,
 * cross-document citations, frontmatter link arrays, or markdown document links.
 *
 * @throws Error if any prohibited artifact tag or cross-document reference is detected.
 */
export function validateMotiveContent(content: string): void {
  const prohibited = new Set<string>();

  for (const match of content.matchAll(UPPERCASE_ARTIFACT_TAG_REGEX)) {
    if (match[0]) prohibited.add(match[0]);
  }

  for (const match of content.matchAll(NUMERIC_ARTIFACT_TAG_REGEX)) {
    if (match[0]) prohibited.add(match[0]);
  }

  for (const match of content.matchAll(CROSS_DOCUMENT_REFERENCE_REGEX)) {
    if (match[0]) prohibited.add(match[0].trim());
  }

  for (const match of content.matchAll(MARKDOWN_LINK_REGEX)) {
    const target = match[1]?.trim();
    if (target) {
      prohibited.add(match[0]);
    }
  }

  const fmMatch = content.match(FRONTMATTER_REFERENCE_KEY_REGEX);
  if (fmMatch?.[1]) {
    prohibited.add(`${fmMatch[1]}:`);
  }

  if (prohibited.size > 0) {
    const foundList = Array.from(prohibited).join(", ");
    throw new Error(
      `Invalid MOTIVE.md content: cross-document references and artifact citations are prohibited in MOTIVE.md per RULE-10 (found: ${foundList}).`,
    );
  }
}

/**
 * Scaffolds a default `MOTIVE.md` prose template for a target scope.
 */
export function renderMotiveTemplate(scope: string = "."): string {
  const normalizedScope = scope.trim() || ".";
  const scopeLabel =
    normalizedScope === "."
      ? "repository workspace"
      : `\`${normalizedScope}\` directory scope`;

  return [
    `Establish the core architectural purpose and domain responsibility of the ${scopeLabel}.`,
    "",
    "Define the long-term trajectory and guiding principles that shape implementation decisions within this boundary.",
    "",
  ].join("\n");
}

/**
 * Renders validated `MOTIVE.md` markdown content, scaffolding a default template
 * when explicit content is omitted.
 */
export function renderMotiveMarkdown(options: RenderMotiveOptions = {}): {
  content: string;
  markdown: string;
  scaffolded: boolean;
} {
  const rawContent = options.content?.trim();
  const scaffolded = !rawContent;

  const markdown = scaffolded
    ? renderMotiveTemplate(options.scope)
    : `${rawContent}\n`;

  validateMotiveContent(markdown);

  return {
    content: markdown.trim(),
    markdown,
    scaffolded,
  };
}

/**
 * Modie Core Domain Layer: MOTIVE.md template scaffolding and RULE-10 reference prohibition validation.
 * Complies with ADR-2, ADR-4, ADR-10, RULE-10, and RULE-38 with zero platform/engine dependencies.
 */

import { parseArtifactFilename } from "../common/filename.ts";
import { parseCanonicalTag } from "../common/tag.ts";
import type { RenderMotiveOptions } from "./types.ts";

/**
 * Validates `MOTIVE.md` content against RULE-10, rejecting any artifact IDs,
 * cross-document citations, frontmatter link arrays, or markdown document links.
 *
 * @throws Error if any prohibited artifact tag or cross-document reference is detected.
 */
export function validateMotiveContent(content: string): void {
  const prohibited = new Set<string>();

  // 1. Validate frontmatter using regex boundary matching
  const frontmatterMatch = content
    .trim()
    .match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (frontmatterMatch && frontmatterMatch[1]) {
    const fm = frontmatterMatch[1];
    if (/^\s*links\s*:/m.test(fm)) prohibited.add("links:");
    if (/^\s*depends_on\s*:/m.test(fm)) prohibited.add("depends_on:");
    if (/^\s*supersedes\s*:/m.test(fm)) prohibited.add("supersedes:");
    if (/^\s*superseded_by\s*:/m.test(fm)) prohibited.add("superseded_by:");
  }

  const body = frontmatterMatch
    ? content.trim().slice(frontmatterMatch[0].length)
    : content;

  // 2. Scan markdown links [label](target)
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1]?.trim();
    if (target) {
      prohibited.add(match[0]);
    }
  }

  // 3. Scan container paths and standalone Modie document filenames
  for (const match of body.matchAll(/(?:^|[\s([`"'])(\.modie\/[^\s)]+)/g)) {
    if (match[1]) {
      prohibited.add(match[1].trim());
    }
  }
  for (const match of body.matchAll(/\b(?:MOTIVE|GIST)\.md\b/g)) {
    if (match[0]) {
      prohibited.add(match[0]);
    }
  }

  // 4. Scan word tokens for canonical artifact tags, pseudo-tags, and artifact filenames
  for (const match of body.matchAll(/\b[A-Za-z0-9._-]+\b/g)) {
    const rawToken = match[0];
    const token = rawToken.replace(/[.,:;?!]+$/, "");
    if (!token) continue;

    if (parseArtifactFilename(token)) {
      prohibited.add(token);
      continue;
    }
    const parsedTag = parseCanonicalTag(token);
    if (parsedTag) {
      prohibited.add(token);
      continue;
    }
    if (
      /^(?:MOTIVE|GIST)-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\.\d+)?$/i.test(token)
    ) {
      prohibited.add(token);
      continue;
    }
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


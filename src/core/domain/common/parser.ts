/**
 * Modie Core Domain Layer: Pure markdown document and context parser.
 * Complies with ADR-13 and RULE-38 with zero platform or engine dependencies.
 */

import { parseArtifactFilename } from "./filename.ts";
import { slugToTitle } from "./slug.ts";
import type { ArtifactParseContext, ParsedFrontmatterFields } from "../types.ts";

export function splitMarkdownFrontmatterPure(content: string): {
  frontmatter: string;
  body: string;
} {
  const openMatch = content.match(/^---[ \t]*\r?\n/);
  if (!openMatch) {
    return { frontmatter: "", body: content };
  }

  const afterOpen = content.slice(openMatch[0].length);
  const closeRegex = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/;
  const closeMatch = closeRegex.exec(afterOpen);
  if (!closeMatch) {
    return { frontmatter: "", body: content };
  }

  const frontmatter = afterOpen.slice(0, closeMatch.index).trim();
  const body = afterOpen.slice(closeMatch.index + closeMatch[0].length).trim();
  return { frontmatter, body };
}

export function parseMarkdownSectionsPure(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split(/\r?\n/);

  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let activeFence: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track fenced code blocks (e.g. ```, ````, ~~~)
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch && fenceMatch[1]) {
      const fenceToken = fenceMatch[1];
      if (!activeFence) {
        activeFence = fenceToken;
      } else if (
        trimmed.startsWith(activeFence[0]!.repeat(activeFence.length)) &&
        new RegExp(`^${activeFence[0]}+\\s*$`).test(trimmed)
      ) {
        activeFence = null;
      }
    }

    if (!activeFence) {
      const headingMatch = line.match(/^#+\s+(.+)$/);
      if (headingMatch && headingMatch[1]) {
        if (currentHeading !== null) {
          sections[currentHeading] = currentLines.join("\n").trim();
        }
        currentHeading = headingMatch[1].trim();
        currentLines = [];
        continue;
      }
    }

    if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  if (currentHeading !== null) {
    sections[currentHeading] = currentLines.join("\n").trim();
  }

  return sections;
}

export function parseFrontmatterFieldsPure(frontmatter: string): ParsedFrontmatterFields {
  const parseList = (key: string): string[] => {
    // Flow style: key: [A, B]
    const flowMatch = frontmatter.match(new RegExp(`^[ \\t]*${key}:[ \\t]*\\[([^\\]]*)\\]`, "m"));
    if (flowMatch && flowMatch[1] !== undefined) {
      return flowMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    // Block list:
    // key:
    //   - A
    //   - B
    const blockMatch = frontmatter.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(?:\\r?\\n[ \\t]*-[^\\r\\n]*)+`, "m"));
    if (blockMatch) {
      const items: string[] = [];
      const itemMatches = blockMatch[0].matchAll(/^[ \t]*-[ \t]*(.+)$/gm);
      for (const m of itemMatches) {
        if (m[1]) {
          const item = m[1].trim().replace(/^["']|["']$/g, "");
          if (item) items.push(item);
        }
      }
      return items;
    }
    return [];
  };

  const links = parseList("links");
  const depends_on = parseList("depends_on");
  const supersedes = parseList("supersedes");
  const superseded_by = parseList("superseded_by");

  let summary: string | undefined;
  const summaryMatch = frontmatter.match(/^\s*summary:\s*(.+)$/m);
  if (summaryMatch && summaryMatch[1] && summaryMatch[1].trim()) {
    summary = summaryMatch[1].trim().replace(/^["']|["']$/g, "");
  }

  return {
    links,
    ...(depends_on.length > 0 ? { depends_on } : {}),
    ...(supersedes.length > 0 ? { supersedes } : {}),
    ...(superseded_by.length > 0 ? { superseded_by } : {}),
    ...(summary ? { summary } : {}),
  };
}

export function parseArtifactMarkdownDocument(
  content: string,
  filePathOrFilename?: string,
): ArtifactParseContext {
  const { frontmatter, body } = splitMarkdownFrontmatterPure(content);
  const frontmatterFields = parseFrontmatterFieldsPure(frontmatter);
  const sections = parseMarkdownSectionsPure(body);

  let id = "";
  let slug = "";
  if (filePathOrFilename) {
    const parsed = parseArtifactFilename(filePathOrFilename);
    if (parsed) {
      id = parsed.id;
      slug = parsed.slug;
    }
  }

  const title = slug ? slugToTitle(slug) : "";

  return {
    id,
    slug,
    title,
    filepath: filePathOrFilename,
    filename: filePathOrFilename,
    rawContent: content,
    frontmatter,
    body,
    frontmatterFields,
    sections,
  };
}

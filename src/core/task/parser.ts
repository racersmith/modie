/**
 * Markdown parser for TASK primitive artifacts.
 */

import { parseArtifactFilename } from "../common/index.ts";
import { parseAcceptanceCriteria } from "./checklist.ts";
import type { TaskArtifact } from "./types.ts";

/**
 * Parses YAML frontmatter string block into depends_on and links lists.
 */
function parseTaskFrontmatter(frontmatterStr: string): { depends_on: string[]; links: string[] } {
  const lines = frontmatterStr.split("\n");
  const depends_on: string[] = [];
  const links: string[] = [];

  let currentKey: "depends_on" | "links" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("depends_on:")) {
      currentKey = "depends_on";
      const inline = line.replace("depends_on:", "").trim();
      if (inline.startsWith("[") && inline.endsWith("]")) {
        const items = inline
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
        depends_on.push(...items);
        currentKey = null;
      }
      continue;
    }

    if (line.startsWith("links:")) {
      currentKey = "links";
      const inline = line.replace("links:", "").trim();
      if (inline.startsWith("[") && inline.endsWith("]")) {
        const items = inline
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
        links.push(...items);
        currentKey = null;
      }
      continue;
    }

    if (line.startsWith("- ")) {
      const value = line.slice(2).trim().replace(/^['"]|['"]$/g, "");
      if (currentKey === "depends_on") {
        depends_on.push(value);
      } else if (currentKey === "links") {
        links.push(value);
      }
      continue;
    }

    if (/^[a-zA-Z_]+:/.test(line)) {
      currentKey = null;
    }
  }

  return { depends_on, links };
}

/**
 * Extracts frontmatter string and markdown body from a document.
 */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: "", body: content };
  }

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) {
    return { frontmatter: "", body: content };
  }

  const frontmatter = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();

  return { frontmatter, body };
}

/**
 * Extracts the content under `# Context` section.
 */
function parseContextSection(body: string): string | undefined {
  const match = body.match(/^#\s+Context\b([\s\S]*?)(?=^#\s+|\Z)/im);
  if (!match || !match[1]) {
    return undefined;
  }
  return match[1].trim();
}

/**
 * Parses task markdown text into a strongly-typed TaskArtifact object.
 */
export function parseTaskMarkdown(content: string, filePathOrFilename?: string): TaskArtifact {
  const { frontmatter, body } = splitFrontmatter(content);
  const { depends_on, links } = parseTaskFrontmatter(frontmatter);
  const context = parseContextSection(body);
  const acceptanceCriteria = parseAcceptanceCriteria(body);

  let id = "";
  let slug = "";

  if (filePathOrFilename) {
    const parsedFilename = parseArtifactFilename(filePathOrFilename);
    if (parsedFilename && parsedFilename.subtype === "TASK") {
      id = parsedFilename.id;
      slug = parsedFilename.slug;
    }
  }

  return {
    id,
    slug,
    depends_on,
    links,
    context,
    acceptanceCriteria,
    rawContent: content,
    filePath: filePathOrFilename,
  };
}

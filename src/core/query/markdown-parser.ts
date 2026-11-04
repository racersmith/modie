/**
 * Markdown frontmatter and level-1 section parsing helpers for governance artifacts.
 * Complies with ADR-4, RULE-1, RULE-25, and RULE-26.
 */

import { YAML } from "bun";
import { slugToTitle } from "../common/index.ts";

export interface ParsedFrontmatterFields {
  links: string[];
  depends_on?: string[];
  supersedes?: string[];
  superseded_by?: string[];
  summary?: string;
}

export interface ParsedFrontmatterLinkLines {
  /** Map of 1-based line number to relationship name */
  linkLines: Map<number, string>;
  /** 1-based end line of the frontmatter block */
  frontmatterEndLine: number;
}

export interface ParsedMarkdownDocument {
  frontmatter: string;
  body: string;
  frontmatterFields: ParsedFrontmatterFields;
  sections: Record<string, string>;
}

/**
 * Splits markdown content into frontmatter and body string blocks.
 * Requires standalone `---` delimiter lines so mid-line `---` in comments or values
 * does not prematurely terminate frontmatter.
 */
export function splitMarkdownFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const trimmed = content.trim();
  const openMatch = trimmed.match(/^---[ \t]*\r?\n/);
  if (!openMatch) {
    return { frontmatter: "", body: content };
  }

  const afterOpen = trimmed.slice(openMatch[0].length);
  const closeRegex = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/;
  const closeMatch = closeRegex.exec(afterOpen);
  if (!closeMatch) {
    return { frontmatter: "", body: content };
  }

  const frontmatter = afterOpen.slice(0, closeMatch.index).trim();
  const body = afterOpen.slice(closeMatch.index + closeMatch[0].length).trim();
  return { frontmatter, body };
}

function safeYamlParse(str: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(str);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function toList(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map(String).map((s) => s.trim()).filter(Boolean);
  }
  return typeof val === "string" && val.trim() ? [val.trim()] : [];
}

function assignOptionalList(
  obj: ParsedFrontmatterFields,
  key: "depends_on" | "supersedes" | "superseded_by",
  val: unknown,
): void {
  const list = toList(val);
  if (list.length > 0) obj[key] = list;
}

/**
 * Parses links, depends_on, supersedes, superseded_by, and summary from frontmatter text.
 */
export function parseFrontmatterFields(
  frontmatterStr: string,
): ParsedFrontmatterFields {
  const data = safeYamlParse(frontmatterStr);
  const result: ParsedFrontmatterFields = { links: toList(data.links) };
  assignOptionalList(result, "depends_on", data.depends_on);
  assignOptionalList(result, "supersedes", data.supersedes);
  assignOptionalList(result, "superseded_by", data.superseded_by);
  if (typeof data.summary === "string" && data.summary.trim()) {
    result.summary = data.summary.trim();
  }
  return result;
}

const LINK_KEYS = new Set([
  "links",
  "depends_on",
  "supersedes",
  "superseded_by",
]);

function isIgnoredLine(trimmed: string): boolean {
  return !trimmed || trimmed.startsWith("#");
}

function scanLineRelation(
  trimmed: string,
  currentKey: string | null,
): [nextKey: string | null, emitKey: string | null] {
  if (isIgnoredLine(trimmed)) return [currentKey, null];
  const key = trimmed.match(/^([a-zA-Z0-9_-]+):/)?.[1];
  if (key) {
    const matched = LINK_KEYS.has(key) ? key : null;
    return [matched, matched];
  }
  const itemKey = trimmed.startsWith("- ") ? currentKey : null;
  return [itemKey, itemKey];
}

function findFrontmatterClosingLine(lines: string[]): number {
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") return i + 1;
  }
  return 0;
}

function hasValidFrontmatterBounds(lines: string[], endLine: number): boolean {
  return endLine > 0 && lines[0]?.trim() === "---";
}

/**
 * Parses frontmatter metadata lines to identify which 1-based line numbers
 * correspond to link relationship declarations (`links`, `depends_on`, `supersedes`, `superseded_by`).
 */
export function parseFrontmatterLineMap(
  lines: string[],
): ParsedFrontmatterLinkLines {
  const linkLines = new Map<number, string>();
  const frontmatterEndLine = findFrontmatterClosingLine(lines);
  if (!hasValidFrontmatterBounds(lines, frontmatterEndLine)) {
    return { linkLines, frontmatterEndLine: 0 };
  }

  let currentKey: string | null = null;
  for (let i = 1; i < frontmatterEndLine - 1; i++) {
    const trimmed = lines[i]!.trim();
    const [nextKey, emitKey] = scanLineRelation(trimmed, currentKey);
    currentKey = nextKey;
    if (emitKey) linkLines.set(i + 1, emitKey);
  }

  return { linkLines, frontmatterEndLine };
}

export { extractAdrSummary } from "../adr/summary.ts";

/**
 * Parses level-1 Markdown sections starting with `# <Heading>`, ignoring `#` lines
 * that appear inside fenced code blocks (` ``` ` or ` ~~~ `).
 */
export function parseMarkdownSections(body: string): Record<string, string> {
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
      const headingMatch = line.match(/^#\s+(.+)$/);
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

/**
 * Parses a markdown document into its frontmatter string, body string,
 * parsed frontmatter fields, and level-1 sections map in a single unified pass.
 */
export function parseMarkdownDocument(content: string): ParsedMarkdownDocument {
  const { frontmatter, body } = splitMarkdownFrontmatter(content);
  const frontmatterFields = parseFrontmatterFields(frontmatter);
  const sections = parseMarkdownSections(body);
  return {
    frontmatter,
    body,
    frontmatterFields,
    sections,
  };
}

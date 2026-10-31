/**
 * Markdown frontmatter and level-1 section parsing helpers for governance artifacts.
 * Complies with ADR-4, RULE-1, RULE-25, and RULE-26.
 */

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

function unquoteYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .trim();
  }
  return trimmed;
}

function parseInlineYamlListValue(inline: string): {
  items: string[];
  closed: boolean;
} {
  if (!inline) {
    return { items: [], closed: false };
  }
  if (inline.startsWith("[") && inline.endsWith("]")) {
    const items = inline
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
    return { items, closed: true };
  }
  const scalar = unquoteYamlScalar(inline);
  return { items: scalar ? [scalar] : [], closed: true };
}

/**
 * Parses links, depends_on, supersedes, superseded_by, and summary from frontmatter text.
 */
export function parseFrontmatterFields(
  frontmatterStr: string,
): ParsedFrontmatterFields {
  const lines = frontmatterStr.split(/\r?\n/);
  const links: string[] = [];
  const depends_on: string[] = [];
  const supersedes: string[] = [];
  const superseded_by: string[] = [];
  const summaryParts: string[] = [];
  let currentKey:
    | "links"
    | "depends_on"
    | "supersedes"
    | "superseded_by"
    | "summary"
    | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("summary:")) {
      summaryParts.length = 0;
      const inline = line.slice("summary:".length).trim();
      if (
        inline &&
        inline !== ">" &&
        inline !== "|" &&
        inline !== ">-" &&
        inline !== "|-"
      ) {
        const unquoted = unquoteYamlScalar(inline);
        if (unquoted) {
          summaryParts.push(unquoted);
        }
      }
      currentKey = "summary";
      continue;
    }

    if (line.startsWith("links:")) {
      const inline = line.slice("links:".length).trim();
      const { items, closed } = parseInlineYamlListValue(inline);
      links.push(...items);
      currentKey = closed ? null : "links";
      continue;
    }

    if (line.startsWith("depends_on:")) {
      const inline = line.slice("depends_on:".length).trim();
      const { items, closed } = parseInlineYamlListValue(inline);
      depends_on.push(...items);
      currentKey = closed ? null : "depends_on";
      continue;
    }

    if (line.startsWith("supersedes:")) {
      const inline = line.slice("supersedes:".length).trim();
      const { items, closed } = parseInlineYamlListValue(inline);
      supersedes.push(...items);
      currentKey = closed ? null : "supersedes";
      continue;
    }

    if (line.startsWith("superseded_by:")) {
      const inline = line.slice("superseded_by:".length).trim();
      const { items, closed } = parseInlineYamlListValue(inline);
      superseded_by.push(...items);
      currentKey = closed ? null : "superseded_by";
      continue;
    }

    if (line.startsWith("- ") || line === "-") {
      const val = line
        .slice(1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (val) {
        if (currentKey === "links") links.push(val);
        if (currentKey === "depends_on") depends_on.push(val);
        if (currentKey === "supersedes") supersedes.push(val);
        if (currentKey === "superseded_by") superseded_by.push(val);
      }
      continue;
    }

    if (/^[a-zA-Z0-9_-]+:/.test(rawLine.trimStart()) && !/^\s+/.test(rawLine)) {
      currentKey = null;
      continue;
    }

    if (currentKey === "summary" && /^\s+/.test(rawLine)) {
      summaryParts.push(unquoteYamlScalar(line));
      continue;
    }

    if (/^[a-zA-Z0-9_-]+:/.test(line)) {
      currentKey = null;
    }
  }

  const summary =
    summaryParts.length > 0 ? summaryParts.join(" ").trim() : undefined;

  return {
    links,
    depends_on: depends_on.length > 0 ? depends_on : undefined,
    ...(supersedes.length > 0 ? { supersedes } : {}),
    ...(superseded_by.length > 0 ? { superseded_by } : {}),
    ...(summary ? { summary } : {}),
  };
}

/**
 * Parses frontmatter metadata lines to identify which 1-based line numbers
 * correspond to link relationship declarations (`links`, `depends_on`, `supersedes`, `superseded_by`).
 */
export function parseFrontmatterLineMap(
  lines: string[],
): ParsedFrontmatterLinkLines {
  const linkLines = new Map<number, string>();
  let frontmatterEndLine = 0;

  if (lines.length === 0 || lines[0]!.trim() !== "---") {
    return { linkLines, frontmatterEndLine: 0 };
  }

  let currentKey: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1; // 1-based line index
    const line = lines[i]!;

    if (line.trim() === "---") {
      frontmatterEndLine = lineNum;
      break;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("links:")) {
      currentKey = "links";
      linkLines.set(lineNum, "links");
      continue;
    }

    if (trimmed.startsWith("depends_on:")) {
      currentKey = "depends_on";
      linkLines.set(lineNum, "depends_on");
      continue;
    }

    if (trimmed.startsWith("supersedes:")) {
      currentKey = "supersedes";
      linkLines.set(lineNum, "supersedes");
      continue;
    }

    if (trimmed.startsWith("superseded_by:")) {
      currentKey = "superseded_by";
      linkLines.set(lineNum, "superseded_by");
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (currentKey) {
        linkLines.set(lineNum, currentKey);
      }
      continue;
    }

    if (/^[a-zA-Z0-9_-]+:/.test(trimmed)) {
      currentKey = null;
    }
  }

  return { linkLines, frontmatterEndLine };
}

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

  return fallbackSlug ? fallbackSlug.replace(/-/g, " ").trim() : "";
}

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

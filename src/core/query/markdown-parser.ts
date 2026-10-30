/**
 * Markdown frontmatter and level-1 section parsing helpers for governance artifacts.
 * Complies with RULE-1, RULE-25, and RULE-26.
 */

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

/**
 * Parses links, depends_on, and summary from frontmatter text.
 */
export function parseFrontmatterFields(frontmatterStr: string): {
  links: string[];
  depends_on?: string[];
  summary?: string;
} {
  const lines = frontmatterStr.split(/\r?\n/);
  const links: string[] = [];
  const depends_on: string[] = [];
  const summaryParts: string[] = [];
  let currentKey: "links" | "depends_on" | "summary" | null = null;

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
      currentKey = "links";
      const inline = line.slice("links:".length).trim();
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

    if (line.startsWith("depends_on:")) {
      currentKey = "depends_on";
      const inline = line.slice("depends_on:".length).trim();
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

    if (line.startsWith("- ") || line === "-") {
      const val = line
        .slice(1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (val) {
        if (currentKey === "links") links.push(val);
        if (currentKey === "depends_on") depends_on.push(val);
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
    ...(summary ? { summary } : {}),
  };
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

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

/**
 * Parses links and depends_on from frontmatter text.
 */
export function parseFrontmatterFields(frontmatterStr: string): {
  links: string[];
  depends_on?: string[];
} {
  const lines = frontmatterStr.split(/\r?\n/);
  const links: string[] = [];
  const depends_on: string[] = [];
  let currentKey: "links" | "depends_on" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

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
      const val = line.slice(1).trim().replace(/^['"]|['"]$/g, "");
      if (val) {
        if (currentKey === "links") links.push(val);
        if (currentKey === "depends_on") depends_on.push(val);
      }
      continue;
    }

    if (/^[a-zA-Z0-9_-]+:/.test(line)) {
      currentKey = null;
    }
  }

  return {
    links,
    depends_on: depends_on.length > 0 ? depends_on : undefined,
  };
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

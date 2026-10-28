/**
 * Markdown frontmatter and level-1 section parsing helpers for governance artifacts.
 * Complies with RULE-1, RULE-25, and RULE-26.
 */

/**
 * Splits markdown content into frontmatter and body string blocks.
 */
export function splitMarkdownFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
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
 * Parses links and depends_on from frontmatter text.
 */
export function parseFrontmatterFields(frontmatterStr: string): {
  links: string[];
  depends_on?: string[];
} {
  const lines = frontmatterStr.split("\n");
  const links: string[] = [];
  const depends_on: string[] = [];
  let currentKey: "links" | "depends_on" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

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

    if (line.startsWith("- ")) {
      const val = line.slice(2).trim().replace(/^['"]|['"]$/g, "");
      if (currentKey === "links") links.push(val);
      if (currentKey === "depends_on") depends_on.push(val);
      continue;
    }

    if (/^[a-zA-Z_]+:/.test(line)) {
      currentKey = null;
    }
  }

  return {
    links,
    depends_on: depends_on.length > 0 ? depends_on : undefined,
  };
}

/**
 * Parses Markdown sections starting with `# <Heading>`.
 */
export function parseMarkdownSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = /^#\s+([^\n]+)/gm;
  let match: RegExpExecArray | null;
  const indices: Array<{ heading: string; index: number }> = [];

  while ((match = headingRegex.exec(body)) !== null) {
    if (match[1]) {
      indices.push({ heading: match[1].trim(), index: match.index });
    }
  }

  for (let i = 0; i < indices.length; i++) {
    const cur = indices[i]!;
    const next = indices[i + 1];
    const startIndex = cur.index + cur.heading.length + 2; // skip "# " and heading line
    const sectionText = next
      ? body.slice(startIndex, next.index).trim()
      : body.slice(startIndex).trim();
    sections[cur.heading] = sectionText;
  }

  return sections;
}

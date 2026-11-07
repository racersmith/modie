/**
 * Level-1 Markdown section parsing with code fence awareness.
 * Complies with ADR-4, RULE-1, and RULE-26.
 */

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

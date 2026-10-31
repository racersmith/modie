import { generateSlug, parseArtifactFilename } from "../common/index.ts";
import { parseAcceptanceCriteria } from "./checklist.ts";
import type {
  ParsedPlannedGovernance,
  PlannedGovernanceItem,
  TaskArtifact,
} from "./types.ts";

/**
 * Parses YAML frontmatter string block into depends_on and links lists.
 */
function parseTaskFrontmatter(frontmatterStr: string): {
  depends_on: string[];
  links: string[];
} {
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
      const value = line
        .slice(2)
        .trim()
        .replace(/^['"]|['"]$/g, "");
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
function splitFrontmatter(content: string): {
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
 * Extracts the content under `# Context` section.
 */
function parseContextSection(body: string): string | undefined {
  const match = body.match(/^#\s+Context\b([\s\S]*?)(?=^#\s+|$(?![\s\S]))/im);
  if (!match || !match[1]) {
    return undefined;
  }
  return match[1].trim();
}

/**
 * Extracts and parses `# Planned Governance` section into structured items.
 */
export function parsePlannedGovernanceSection(
  body: string,
): ParsedPlannedGovernance | undefined {
  const match = body.match(
    /^#\s+Planned Governance\b([\s\S]*?)(?=^#\s+|$(?![\s\S]))/im,
  );
  if (!match || !match[1]) {
    return undefined;
  }

  const sectionText = match[1];
  const rules: PlannedGovernanceItem[] = [];
  const adrs: PlannedGovernanceItem[] = [];

  let currentSubtype: "RULE" | "ADR" | null = null;
  const lines = sectionText.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^##+\s+ADRs?\b/i.test(line)) {
      currentSubtype = "ADR";
      continue;
    }
    if (/^##+\s+Rules?\b/i.test(line)) {
      currentSubtype = "RULE";
      continue;
    }

    // Check for checkbox line: - [ ] text or - [x] text
    const boxMatch = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    const bulletMatch = !boxMatch ? line.match(/^-\s*(.+)$/) : null;

    if (boxMatch || bulletMatch) {
      const completed = boxMatch ? boxMatch[1]?.toLowerCase() === "x" : false;
      const rawItemText = (
        boxMatch ? boxMatch[2] : bulletMatch ? bulletMatch[1] : ""
      )!.trim();

      let itemSubtype = currentSubtype;
      const text = rawItemText;

      if (!itemSubtype) {
        if (/^ADR(?:-\w+)?:?\s*/i.test(rawItemText)) {
          itemSubtype = "ADR";
        } else if (/^RULE(?:-\w+)?:?\s*/i.test(rawItemText)) {
          itemSubtype = "RULE";
        }
      }

      const tagMatch = text.match(/\b(RULE|ADR)-([A-Za-z0-9_-]+)\b/i);
      const tag =
        tagMatch && tagMatch[1] && tagMatch[2]
          ? `${tagMatch[1].toUpperCase()}-${tagMatch[2]}`
          : undefined;

      let slug: string | undefined;
      try {
        const cleanTitle = text
          .replace(/^(?:RULE|ADR)(?:-\w+)?:?\s*/i, "")
          .trim();
        if (cleanTitle) {
          slug = generateSlug(cleanTitle);
        }
      } catch {
        // ignore slug generation failure
      }

      const item: PlannedGovernanceItem = {
        text,
        completed,
        tag,
        slug,
      };

      if (itemSubtype === "ADR") {
        adrs.push(item);
      } else if (itemSubtype === "RULE") {
        rules.push(item);
      } else {
        // Default to rule if unspecified
        rules.push(item);
      }
    }
  }

  if (rules.length === 0 && adrs.length === 0) {
    return undefined;
  }

  return { rules, adrs };
}

/**
 * Parses task markdown text into a strongly-typed TaskArtifact object.
 */
export function parseTaskMarkdown(
  content: string,
  filePathOrFilename?: string,
): TaskArtifact {
  const { frontmatter, body } = splitFrontmatter(content);
  const { depends_on, links } = parseTaskFrontmatter(frontmatter);
  const context = parseContextSection(body);
  const plannedGovernance = parsePlannedGovernanceSection(body);
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
    plannedGovernance,
    acceptanceCriteria,
    rawContent: content,
    filePath: filePathOrFilename,
  };
}

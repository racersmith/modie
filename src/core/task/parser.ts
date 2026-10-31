import { generateSlug, parseArtifactFilename } from "../common/index.ts";
import type { ArtifactParseContext } from "../pipeline/types.ts";
import {
  parseMarkdownDocument,
  parseMarkdownSections,
} from "../query/markdown-parser.ts";
import { parseAcceptanceCriteria } from "./checklist.ts";
import type {
  ParsedPlannedGovernance,
  PlannedGovernanceItem,
  TaskArtifact,
} from "./types.ts";

/**
 * Extracts and parses `# Planned Governance` section into structured items.
 */
export function parsePlannedGovernanceSection(
  body: string,
): ParsedPlannedGovernance | undefined {
  const sections = parseMarkdownSections(body);
  const sectionText =
    sections["Planned Governance"] ??
    Object.entries(sections).find(
      ([k]) => k.toLowerCase() === "planned governance",
    )?.[1];
  if (!sectionText) {
    return undefined;
  }

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
 * Reconstructs a strongly-typed TaskArtifact from a standardized ArtifactParseContext.
 */
export function parseTaskFromContext(
  context: ArtifactParseContext,
): TaskArtifact {
  const contextSection =
    context.sections["Context"] ??
    Object.entries(context.sections).find(
      ([k]) => k.toLowerCase() === "context",
    )?.[1];
  const plannedGovernance = parsePlannedGovernanceSection(context.body);
  const acceptanceCriteria = parseAcceptanceCriteria(context.body);

  return {
    id: context.id,
    slug: context.slug,
    ...(context.title ? { title: context.title } : {}),
    depends_on: context.frontmatterFields.depends_on ?? [],
    links: context.frontmatterFields.links,
    context: contextSection,
    plannedGovernance,
    acceptanceCriteria,
    rawContent: context.rawContent,
    filePath: context.filepath,
  };
}

/**
 * Parses task markdown text into a strongly-typed TaskArtifact object.
 */
export function parseTaskMarkdown(
  content: string,
  filePathOrFilename?: string,
): TaskArtifact {
  const doc = parseMarkdownDocument(content);
  let id = "";
  let slug = "";

  if (filePathOrFilename) {
    const parsedFilename = parseArtifactFilename(filePathOrFilename);
    if (parsedFilename && parsedFilename.subtype === "TASK") {
      id = parsedFilename.id;
      slug = parsedFilename.slug;
    }
  }

  return parseTaskFromContext({
    id,
    slug,
    title: slug ? slug.replace(/-/g, " ") : "",
    filepath: filePathOrFilename,
    filename: filePathOrFilename,
    rawContent: content,
    frontmatter: doc.frontmatter,
    body: doc.body,
    frontmatterFields: doc.frontmatterFields,
    sections: doc.sections,
  });
}

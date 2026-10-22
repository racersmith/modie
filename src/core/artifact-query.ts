/**
 * Artifact resolution and inspection domain service.
 * Implements ADR-1, ADR-2, RULE-1, RULE-25, RULE-26, and RULE-29.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parseAcceptanceCriteria } from "./primitives/task/checklist.ts";
import type { TaskAcceptanceCriteriaItem } from "./primitives/task/types.ts";
import { parseArtifactFilename } from "./primitives/common/filename.ts";
import type { IndexableSubtype } from "./primitives/common/types.ts";
import { scanActiveArtifacts } from "./resolver/active-scanner.ts";

export interface ResolvedArtifact {
  /**
   * Canonical uppercase tag, e.g. "RULE-1", "ADR-6", "TASK-12".
   */
  tag: string;

  /**
   * Indexable subtype: "RULE", "ADR", or "TASK".
   */
  subtype: IndexableSubtype;

  /**
   * Monotonic unpadded integer or namespaced ID token.
   */
  id: string;

  /**
   * Kebab-case slug.
   */
  slug: string;

  /**
   * Basename of the file.
   */
  filename: string;

  /**
   * Absolute filepath on disk.
   */
  filepath: string;

  /**
   * Path relative to cwd.
   */
  relativePath: string;

  /**
   * Whether the artifact has a .ARCHIVED marker.
   */
  isArchived: boolean;
}

export interface ArtifactDetails extends ResolvedArtifact {
  /**
   * Frontmatter links list (target ADR or RULE tags).
   */
  links: string[];

  /**
   * Frontmatter depends_on list (target TASK tags, if present).
   */
  depends_on?: string[];

  /**
   * Document body content excluding frontmatter.
   */
  body: string;

  /**
   * Full unparsed raw content of the markdown file.
   */
  rawContent: string;

  /**
   * Content under # Context section, if present.
   */
  context?: string;

  /**
   * Map of level-1 section headings to their section content.
   */
  sections: Record<string, string>;

  /**
   * Parsed acceptance criteria items (for TASK artifacts).
   */
  acceptanceCriteria?: TaskAcceptanceCriteriaItem[];
}

export interface ResolveArtifactOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Explicit subtype filter.
   */
  subtype?: IndexableSubtype;

  /**
   * Whether to include archived artifacts (.ARCHIVED.md).
   * Defaults to true.
   */
  includeArchived?: boolean;
}

/**
 * Parses a raw tag string into its canonical subtype and ID components.
 * Examples: "RULE-29" -> { subtype: "RULE", id: "29", tag: "RULE-29" }
 *           "adr-6" -> { subtype: "ADR", id: "6", tag: "ADR-6" }
 *           "task-12" -> { subtype: "TASK", id: "12", tag: "TASK-12" }
 */
export function parseCanonicalTag(
  raw: string,
): { subtype: IndexableSubtype; id: string; tag: string } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(RULE|ADR|TASK)-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)$/i);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  const subtype = match[1].toUpperCase() as IndexableSubtype;
  const id = match[2];
  const tag = `${subtype}-${id}`;
  return { subtype, id, tag };
}

/**
 * Resolves an indexable artifact (RULE, ADR, or TASK) by its canonical tag,
 * filename, or filepath across the repository workspace.
 *
 * @throws Error if the artifact is not found or identifier is empty.
 */
export async function resolveArtifactByTag(
  tagOrIdentifier: string,
  options: ResolveArtifactOptions = {},
): Promise<ResolvedArtifact> {
  const cwd = options.cwd ?? process.cwd();
  const trimmed = tagOrIdentifier.trim();

  if (!trimmed) {
    throw new Error("Artifact identifier must not be empty.");
  }

  // 1. Direct path check (if user passed existing file path or relative path)
  const candidatePath = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  const parsedFromPath = parseArtifactFilename(candidatePath);
  if (parsedFromPath) {
    try {
      const rel = relative(cwd, candidatePath);
      return {
        tag: parsedFromPath.tag,
        subtype: parsedFromPath.subtype,
        id: parsedFromPath.id,
        slug: parsedFromPath.slug,
        filename: parsedFromPath.filename,
        filepath: candidatePath,
        relativePath: rel,
        isArchived: parsedFromPath.isArchived,
      };
    } catch {
      // Fall through to scanner if path does not exist
    }
  }

  // 2. Parse canonical tag or raw ID
  const tagInfo = parseCanonicalTag(trimmed);
  const targetTag = tagInfo?.tag.toUpperCase();

  // 3. Scan workspace for indexable artifacts
  const targetSubtype = tagInfo?.subtype ?? options.subtype;
  const artifacts = await scanActiveArtifacts(cwd, targetSubtype);

  // Match by canonical tag
  let matches = artifacts.filter((a) => {
    if (targetTag) {
      return a.tag.toUpperCase() === targetTag;
    }
    // Match by filename or slug if exact tag was not given
    return (
      a.filename.toLowerCase() === trimmed.toLowerCase() ||
      a.slug.toLowerCase() === trimmed.toLowerCase()
    );
  });

  if (matches.length === 0) {
    const subtypeLabel = targetSubtype ? ` ${targetSubtype}` : "";
    throw new Error(
      `Artifact "${trimmed}" was not found across active or archived${subtypeLabel} artifacts on disk.`,
    );
  }

  // Filter archived if requested (defaults to including archived)
  if (options.includeArchived === false) {
    const nonArchived = matches.filter((a) => !a.isArchived);
    if (nonArchived.length > 0) {
      matches = nonArchived;
    }
  }

  // If both active and archived exist for the same tag, prefer the active artifact
  const activeMatch = matches.find((a) => !a.isArchived);
  const selected = activeMatch ?? matches[0]!;

  return {
    tag: selected.tag,
    subtype: selected.subtype,
    id: selected.id,
    slug: selected.slug,
    filename: selected.filename,
    filepath: selected.filepath,
    relativePath: relative(cwd, selected.filepath),
    isArchived: selected.isArchived,
  };
}

/**
 * Splits markdown content into frontmatter and body string blocks.
 */
function splitMarkdownFrontmatter(content: string): { frontmatter: string; body: string } {
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
function parseFrontmatterFields(frontmatterStr: string): {
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
function parseMarkdownSections(body: string): Record<string, string> {
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

/**
 * Loads, parses, and inspects an indexable artifact by canonical tag, filename, or path.
 * Returns detailed structured metadata, links, depends_on, and section contents.
 */
export async function getArtifactDetails(
  tagOrIdentifier: string,
  options: ResolveArtifactOptions = {},
): Promise<ArtifactDetails> {
  const resolved = await resolveArtifactByTag(tagOrIdentifier, options);
  const rawContent = await readFile(resolved.filepath, "utf8");

  const { frontmatter, body } = splitMarkdownFrontmatter(rawContent);
  const { links, depends_on } = parseFrontmatterFields(frontmatter);
  const sections = parseMarkdownSections(body);

  const context = sections["Context"];
  let acceptanceCriteria: TaskAcceptanceCriteriaItem[] | undefined;

  if (resolved.subtype === "TASK") {
    acceptanceCriteria = parseAcceptanceCriteria(body);
  }

  return {
    ...resolved,
    links,
    depends_on,
    body,
    rawContent,
    context,
    sections,
    acceptanceCriteria,
  };
}

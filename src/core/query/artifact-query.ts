/**
 * Single-artifact resolution and deep inspection domain service.
 * Implements ADR-1, ADR-2, RULE-1, RULE-25, RULE-26, and RULE-29.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parseArtifactFilename } from "../common/filename.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { scanActiveArtifacts } from "../resolver/active-scanner.ts";
import { parseAcceptanceCriteria } from "../task/checklist.ts";
import type { TaskAcceptanceCriteriaItem } from "../task/types.ts";
import {
  parseFrontmatterFields,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
} from "./markdown-parser.ts";
import type {
  ArtifactDetails,
  ResolveArtifactOptions,
  ResolvedArtifact,
} from "./types.ts";

export type {
  ArtifactDetails,
  ResolveArtifactOptions,
  ResolvedArtifact,
} from "./types.ts";

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

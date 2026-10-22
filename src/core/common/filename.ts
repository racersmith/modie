/**
 * Filename formatting and parsing for indexable Modie artifacts (RULE, ADR, TASK).
 * Complies with RULE-1, ADR-1, ADR-2, ADR-6, and ADR-9.
 */

import { isValidSlug } from "./slug.ts";
import type {
  FormatArtifactFilenameOptions,
  IndexableSubtype,
  ParsedArtifactFilename,
} from "./types.ts";

/**
 * Valid ID pattern: unpadded integer (1, 42) or branch/author-namespaced (2-1, J101, A102).
 */
export const ARTIFACT_ID_REGEX = /^[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/;

export const DEFAULT_INDEXABLE_SUBTYPES = new Set<string>(["RULE", "ADR", "TASK"]);
const registeredSubtypes = new Set<string>(DEFAULT_INDEXABLE_SUBTYPES);

/**
 * Registers an artifact subtype (e.g. "SPEC", "GIST") so that filename parsing
 * and active scanners recognize it as a valid indexable artifact.
 */
export function registerArtifactSubtype(subtype: string): void {
  const upper = subtype.trim().toUpperCase();
  if (/^[A-Z0-9]+$/.test(upper)) {
    registeredSubtypes.add(upper);
  }
}

/**
 * Checks whether an artifact subtype is currently recognized as an indexable subtype.
 */
export function isRegisteredArtifactSubtype(subtype: string): boolean {
  return registeredSubtypes.has(subtype.trim().toUpperCase());
}

/**
 * Resets registered subtypes back to the default core set (RULE, ADR, TASK).
 */
export function resetRegisteredArtifactSubtypes(): void {
  registeredSubtypes.clear();
  for (const s of DEFAULT_INDEXABLE_SUBTYPES) {
    registeredSubtypes.add(s);
  }
}

/**
 * Regex matching any indexable artifact filename:
 * `[slug].[SUBTYPE]-[ID](.ARCHIVED)?.md`
 */
export const ARTIFACT_FILENAME_REGEX =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([A-Za-z0-9]+)-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)(?:\.(ARCHIVED))?\.md$/i;

/**
 * Validates whether an ID token conforms to Modie's unpadded / branch-namespaced grammar.
 */
export function isValidArtifactId(id: string | number): boolean {
  const strId = String(id).trim();
  return ARTIFACT_ID_REGEX.test(strId);
}

/**
 * Formats a canonical artifact filename: `[slug].[SUBTYPE]-[ID](.ARCHIVED)?.md`
 *
 * @throws Error if slug, subtype, or id do not conform to RULE-1 grammar.
 */
export function formatArtifactFilename(options: FormatArtifactFilenameOptions): string {
  const { slug, subtype, id, isArchived = false } = options;
  const strId = String(id).trim();

  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid slug for ${subtype} filename: "${slug}". Must be strict kebab-case (RULE-1).`,
    );
  }

  const upperSubtype = subtype.toUpperCase();
  if (!/^[A-Z0-9]+$/.test(upperSubtype)) {
    throw new Error(
      `Invalid artifact subtype "${subtype}". Expected uppercase alphanumeric token (RULE-1).`,
    );
  }

  if (!isValidArtifactId(strId)) {
    const subtypeDisplay = upperSubtype === "TASK" ? "task" : upperSubtype;
    throw new Error(
      `Invalid ${subtypeDisplay} ID: "${id}". Must be unpadded integer or branch-namespaced token (RULE-1, ADR-1, ADR-9).`,
    );
  }

  const archiveSuffix = isArchived ? ".ARCHIVED" : "";
  return `${slug}.${upperSubtype}-${strId}${archiveSuffix}.md`;
}

/**
 * Parses an artifact filename (or full filepath) into its components.
 * Returns null if the filename does not match the indexable artifact grammar.
 */
export function parseArtifactFilename(
  pathOrFilename: string,
): ParsedArtifactFilename | null {
  const filename = pathOrFilename.split("/").pop() ?? pathOrFilename;

  const isArchived = /\.archived\.md$/i.test(filename);
  const normalizedFilename = isArchived
    ? filename.replace(/\.archived\.md$/i, ".md")
    : filename;

  const match = normalizedFilename.match(
    /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([A-Za-z0-9]+)-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)\.md$/i,
  );

  if (!match || !match[1] || !match[2] || !match[3]) {
    return null;
  }

  const slug = match[1];
  const subtype = match[2].toUpperCase();
  if (!registeredSubtypes.has(subtype)) {
    return null;
  }

  const id = match[3];
  const tag = `${subtype}-${id}`;

  return {
    slug,
    subtype: subtype as IndexableSubtype,
    id,
    tag,
    isArchived,
    filename,
  };
}

/**
 * Returns true if the path or filename corresponds to a valid indexable artifact filename.
 * Optionally filters by specific subtype.
 */
export function isArtifactFilename(
  pathOrFilename: string,
  subtype?: IndexableSubtype,
): boolean {
  const parsed = parseArtifactFilename(pathOrFilename);
  if (!parsed) return false;
  if (subtype && parsed.subtype !== subtype.toUpperCase()) return false;
  return true;
}

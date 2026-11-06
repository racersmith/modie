/**
 * Filename formatting and parsing for indexable Modie artifacts (RULE, ADR, TASK).
 * Complies with RULE-1, ADR-1, ADR-2, ADR-6, and ADR-9.
 */

import { isValidSlug } from "./slug.ts";
import {
  asArtifactSubtype,
  formatArtifactTag,
  isRegisteredArtifactSubtype,
  isValidArtifactId,
  parseCanonicalTag,
  registerArtifactSubtype,
  resetRegisteredArtifactSubtypes,
  type SubtypeLookup,
} from "./tag.ts";
import type {
  ArtifactSubtype,
  ArtifactTag,
  FormatArtifactFilenameOptions,
  IndexableSubtype,
  ParsedArtifactFilename,
} from "./types.ts";

export {
  isValidArtifactId,
  registerArtifactSubtype,
  resetRegisteredArtifactSubtypes,
};

/**
 * Regex matching any indexable artifact filename:
 * `[slug].[SUBTYPE]-[ID](.ARCHIVED)?.md`
 */
export const ARTIFACT_FILENAME_REGEX =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([A-Za-z0-9]+-[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)(?:\.(ARCHIVED))?\.md$/i;

/**
 * Formats a canonical artifact filename: `[slug].[SUBTYPE]-[ID](.ARCHIVED)?.md`
 *
 * @throws Error if slug, subtype, or id do not conform to RULE-1 grammar.
 */
export function formatArtifactFilename(
  options: FormatArtifactFilenameOptions,
  registry?: SubtypeLookup,
): string {
  const { slug, subtype, id, isArchived = false } = options;
  const strId = String(id).trim();

  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid slug for ${subtype} filename: "${slug}". Must be strict kebab-case.`,
    );
  }

  const upperSubtype = asArtifactSubtype(subtype);
  if (!isRegisteredArtifactSubtype(upperSubtype, registry) && !/^[A-Z0-9]+$/.test(upperSubtype)) {
    throw new Error(
      `Invalid artifact subtype "${subtype}". Expected uppercase alphanumeric token.`,
    );
  }

  if (!isValidArtifactId(strId)) {
    const subtypeDisplay = upperSubtype === "TASK" ? "task" : upperSubtype;
    throw new Error(
      `Invalid ${subtypeDisplay} ID: "${id}". Must be unpadded integer or branch-namespaced token.`,
    );
  }

  const tag = formatArtifactTag(upperSubtype, strId);
  const archiveSuffix = isArchived ? ".ARCHIVED" : "";
  return `${slug}.${tag}${archiveSuffix}.md`;
}

/**
 * Parses an artifact filename (or full filepath) into its components.
 * Returns null if the filename does not match the indexable artifact grammar.
 */
export function parseArtifactFilename(
  pathOrFilename: string,
  registry?: SubtypeLookup,
): ParsedArtifactFilename | null {
  const filename = pathOrFilename.split("/").pop() ?? pathOrFilename;

  const isArchived = /\.archived\.md$/i.test(filename);
  const normalizedFilename = isArchived
    ? filename.replace(/\.archived\.md$/i, ".md")
    : filename;

  const match = normalizedFilename.match(
    /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([A-Za-z0-9]+-[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)\.md$/i,
  );

  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const slug = match[1];
  if (!isValidSlug(slug)) {
    return null;
  }

  const tagInfo = parseCanonicalTag(match[2], registry);
  if (!tagInfo) {
    return null;
  }

  return {
    slug,
    subtype: tagInfo.subtype,
    id: tagInfo.id,
    tag: tagInfo.tag,
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
  registry?: SubtypeLookup,
): boolean {
  const parsed = parseArtifactFilename(pathOrFilename, registry);
  if (!parsed) return false;
  if (subtype && parsed.subtype !== subtype.toUpperCase()) return false;
  return true;
}

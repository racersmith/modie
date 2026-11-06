/**
 * Canonical tag grammar, ID validation, and subtype normalization helpers (ADR-1, ADR-2, RULE-1, RULE-25).
 */

import type { ArtifactSubtype, ArtifactTag } from "./types.ts";

/**
 * Valid ID pattern: unpadded integer (1, 42) or branch/author-namespaced (2-1, J101, A102).
 */
export const ARTIFACT_ID_REGEX = /^[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/;

export const DEFAULT_INDEXABLE_SUBTYPES = new Set<string>([
  "RULE",
  "ADR",
  "TASK",
]);

const registeredSubtypes = new Set<string>(DEFAULT_INDEXABLE_SUBTYPES);

/**
 * Registers an artifact subtype (e.g. "SPEC", "GIST") so that canonical tag parsing,
 * filename parsing, and active scanners recognize it as a valid indexable artifact.
 */
export function registerArtifactSubtype(subtype: string): void {
  const upper = asArtifactSubtype(subtype);
  if (/^[A-Z0-9]+$/.test(upper)) {
    registeredSubtypes.add(upper);
  }
}

/**
 * Checks whether an artifact subtype is currently recognized as an indexable subtype.
 */
export function isRegisteredArtifactSubtype(subtype: string): boolean {
  return registeredSubtypes.has(asArtifactSubtype(subtype));
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
 * Validates whether an ID token conforms to Modie's unpadded / branch-namespaced grammar.
 */
export function isValidArtifactId(id: string | number): boolean {
  const strId = String(id).trim();
  return ARTIFACT_ID_REGEX.test(strId);
}

/**
 * Normalizes an arbitrary string into a branded uppercase ArtifactSubtype.
 */
export function asArtifactSubtype(raw: string): ArtifactSubtype {
  return raw.trim().toUpperCase() as ArtifactSubtype;
}

/**
 * Normalizes an arbitrary string into a branded canonical ArtifactTag.
 */
export function asArtifactTag(raw: string): ArtifactTag {
  return raw.trim().toUpperCase() as ArtifactTag;
}

/**
 * Formats a canonical artifact tag from subtype and ID components.
 */
export function formatArtifactTag(
  subtype: ArtifactSubtype | string,
  id: string | number,
): ArtifactTag {
  return `${subtype.toString().trim().toUpperCase()}-${id}` as ArtifactTag;
}

/**
 * Parses a raw tag string into its canonical subtype and ID components.
 * Examples: "RULE-29" -> { subtype: "RULE", id: "29", tag: "RULE-29" }
 *           "adr-6" -> { subtype: "ADR", id: "6", tag: "ADR-6" }
 *           "task-12" -> { subtype: "TASK", id: "12", tag: "TASK-12" }
 */
export function parseCanonicalTag(
  raw: string,
): { subtype: ArtifactSubtype; id: string; tag: ArtifactTag } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^([A-Za-z0-9]+)-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)$/,
  );
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  const rawSubtype = match[1];
  const subtype = asArtifactSubtype(rawSubtype);
  if (!isRegisteredArtifactSubtype(subtype)) {
    return null;
  }
  const id = match[2];
  if (!isValidArtifactId(id)) {
    return null;
  }
  // Prevent matching lowercase English words like "rule-based" or "task-oriented".
  // A lowercase tag must have a numeric component in its ID (e.g. "rule-1", "task-2-1").
  if (rawSubtype === rawSubtype.toLowerCase() && !/\d/.test(id)) {
    return null;
  }
  const tag = formatArtifactTag(subtype, id);
  return { subtype, id, tag };
}

/**
 * Checks whether a given raw string conforms to canonical tag grammar.
 */
export function isValidArtifactTag(raw: string): boolean {
  return parseCanonicalTag(raw) !== null;
}

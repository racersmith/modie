/**
 * Shared types for indexable Modie primitives (ADR-1, ADR-2, ADR-4, RULE-1).
 */

declare const SubtypeBrand: unique symbol;
export type StandardIndexableSubtype = "RULE" | "ADR" | "TASK";

/**
 * Branded uppercase subtype identifier (e.g. "RULE", "ADR", "TASK").
 */
export type ArtifactSubtype = (StandardIndexableSubtype | (string & {})) & {
  readonly [SubtypeBrand]?: true;
};

declare const TagBrand: unique symbol;

/**
 * Branded canonical artifact tag (e.g. "RULE-1", "ADR-6", "TASK-13").
 */
export type ArtifactTag = string & {
  readonly [TagBrand]?: true;
};

export type IndexableSubtype = ArtifactSubtype;

export interface ParsedArtifactFilename {
  /**
   * Kebab-case slug identifying the artifact.
   */
  slug: string;

  /**
   * Indexable subtype of the artifact (RULE, ADR, or TASK).
   */
  subtype: ArtifactSubtype;

  /**
   * Monotonic unpadded integer or branch/author-namespaced ID token.
   */
  id: string;

  /**
   * Full canonical tag, e.g. "RULE-1", "ADR-6", "TASK-13".
   */
  tag: ArtifactTag;

  /**
   * Whether the artifact is marked as archived via .ARCHIVED.
   */
  isArchived: boolean;

  /**
   * Complete basename of the file.
   */
  filename: string;
}

export interface FormatArtifactFilenameOptions {
  slug: string;
  subtype: ArtifactSubtype | string;
  id: string | number;
  isArchived?: boolean;
}

export interface DiscoveredArtifact {
  id: string;
  subtype: ArtifactSubtype;
  tag: ArtifactTag | string;
  slug: string;
  filename: string;
  filepath: string;
  isArchived: boolean;
  status: "active" | "deleted";
}

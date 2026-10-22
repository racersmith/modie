/**
 * Shared types for indexable Modie primitives (ADR-1, ADR-2, ADR-4, RULE-1).
 */

export type IndexableSubtype = "RULE" | "ADR" | "TASK";

export interface ParsedArtifactFilename {
  /**
   * Kebab-case slug identifying the artifact.
   */
  slug: string;

  /**
   * Indexable subtype of the artifact (RULE, ADR, or TASK).
   */
  subtype: IndexableSubtype;

  /**
   * Monotonic unpadded integer or branch/author-namespaced ID token.
   */
  id: string;

  /**
   * Full canonical tag, e.g. "RULE-1", "ADR-6", "TASK-13".
   */
  tag: string;

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
  subtype: IndexableSubtype;
  id: string | number;
  isArchived?: boolean;
}

export interface DiscoveredArtifact {
  id: string;
  subtype: IndexableSubtype;
  tag: string;
  slug: string;
  filename: string;
  filepath: string;
  isArchived: boolean;
  status: "active" | "deleted";
}

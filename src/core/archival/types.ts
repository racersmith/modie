/**
 * Domain types and options for guarded artifact archival.
 * Enforces RULE-25, RULE-27, and RULE-31.
 */

import type { IndexableSubtype } from "../common/types.ts";

export interface ArchiveArtifactOptions {
  /**
   * Target artifact identifier: tag (e.g. "ADR-3", "RULE-8"), slug, or file path.
   */
  tag: string;

  /**
   * Optional subtype filter to validate the target matches expected subtype (e.g. "ADR", "RULE").
   */
  subtype?: IndexableSubtype;

  /**
   * If true, bypasses blocking references checks (RULE-31 override).
   */
  force?: boolean;

  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;
}

export interface ArchiveArtifactResult {
  /**
   * Canonical uppercase tag, e.g. "ADR-3", "RULE-8".
   */
  tag: string;

  /**
   * Indexable subtype: "ADR", "RULE", "TASK", etc.
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
   * Original file path before archival renaming.
   */
  originalFilepath: string;

  /**
   * Original relative path from cwd.
   */
  originalRelativePath: string;

  /**
   * New file path after appending .ARCHIVED.md.
   */
  archivedFilepath: string;

  /**
   * New relative path from cwd.
   */
  archivedRelativePath: string;

  /**
   * New filename, e.g. "my-decision.ADR-3.ARCHIVED.md".
   */
  archivedFilename: string;

  /**
   * Whether references query evaluated that the artifact can be archived with zero active links.
   */
  canArchive: boolean;

  /**
   * Whether --force was used to override active references.
   */
  forced: boolean;

  /**
   * Blocking reference descriptions (if any).
   */
  blockingReasons: string[];
}

/**
 * Types and schema for artifact queries, references, and archival guard.
 * Complies with RULE-25, RULE-27, and RULE-31.
 */

import type { IndexableSubtype } from "../common/types.ts";
import type { ResolvedArtifact } from "./artifact-query.ts";

export type ReferenceCategory =
  | "governance-link"
  | "governance-prose"
  | "code"
  | "test"
  | "documentation";

export interface FoundInItem {
  /**
   * Reference category classification.
   */
  type: ReferenceCategory;

  /**
   * Absolute path to the file containing the citation.
   */
  filepath: string;

  /**
   * Relative path from workspace root.
   */
  relativePath: string;

  /**
   * 1-based line number where the citation occurs.
   */
  line: number;

  /**
   * Snippet or trimmed content of the matching line.
   */
  snippet: string;

  /**
   * If governance-link or governance-prose, the canonical tag of the citing artifact.
   */
  sourceTag?: string;

  /**
   * If governance-link, whether the citing artifact is archived.
   */
  isArchived?: boolean;

  /**
   * If governance-link, whether this is an active dependency that blocks archival per RULE-31.
   */
  isBlocking?: boolean;

  /**
   * Relationship type for governance links: "links", "depends_on", "supersedes", "superseded_by".
   */
  relationship?: string;
}

export interface ArtifactFoundIn {
  /**
   * Formal YAML frontmatter links (e.g. `links: [ADR-4]`, `depends_on: [TASK-20]`).
   */
  governanceLinks: FoundInItem[];

  /**
   * Citations in markdown body or problem statement of governance artifacts.
   */
  governanceProse: FoundInItem[];

  /**
   * Citations in source code (excluding test files).
   */
  code: FoundInItem[];

  /**
   * Citations in test files (*.test.ts, *.spec.ts).
   */
  tests: FoundInItem[];

  /**
   * Citations in general markdown documentation (e.g. README.md, docs/).
   */
  documentation: FoundInItem[];

  /**
   * Total count of all citations found.
   */
  total: number;
}

export interface ArtifactLinksTo {
  /**
   * ADR tags declared in frontmatter links.
   */
  adrs: string[];

  /**
   * RULE tags declared in frontmatter links.
   */
  rules: string[];

  /**
   * TASK tags declared in frontmatter depends_on.
   */
  tasks: string[];

  /**
   * Target ADR tags declared in frontmatter supersedes (if any).
   */
  supersedes: string[];

  /**
   * Successor ADR tags declared in frontmatter superseded_by (if any).
   */
  superseded_by?: string;

  /**
   * Total count of outbound links declared by this artifact.
   */
  total: number;
}

export interface ArchivalGuardResult {
  /**
   * Whether this artifact can be safely archived.
   * True only if zero active, non-archived governance artifacts cite this tag.
   */
  canArchive: boolean;

  /**
   * Explanatory reasons why archival is blocked (e.g. active rules or tasks).
   */
  blockingReasons: string[];

  /**
   * Count of active blocking governance links.
   */
  blockingCount: number;
}

export interface ArtifactReferencesResult {
  /**
   * Metadata of the target artifact being queried.
   */
  target: ResolvedArtifact;

  /**
   * Outbound links and dependencies declared by the target artifact ("Links To").
   */
  linksTo: ArtifactLinksTo;

  /**
   * Citations and occurrences of the target artifact found across the repo ("Found In").
   */
  foundIn: ArtifactFoundIn;

  /**
   * Subtype-agnostic archival safety assessment (RULE-31).
   */
  archivalGuard: ArchivalGuardResult;
}

export interface FindArtifactReferencesOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Custom directory ignore list.
   */
  ignoredDirectories?: string[];
}

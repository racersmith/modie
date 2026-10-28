/**
 * Types and schema for artifact queries, listing, references, and archival guard.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-9, RULE-25, RULE-27, and RULE-31.
 */

import type { IndexableSubtype } from "../common/types.ts";
import type { TaskAcceptanceCriteriaItem } from "../task/types.ts";
import type { IVcsAdapter } from "../vcs/types.ts";

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

  /**
   * Whether the artifact was resolved from Git history or another branch (--history).
   */
  isHistorical?: boolean;
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

  /**
   * Whether to query Git deletion history and branches when the artifact is not active on disk (ADR-6).
   * Defaults to false.
   */
  history?: boolean;

  /**
   * Optional VCS adapter override.
   */
  vcs?: IVcsAdapter;
}

export interface ListedArtifact {
  /**
   * Canonical uppercase tag, e.g. "RULE-9", "ADR-4".
   */
  tag: string;

  /**
   * Indexable subtype: "RULE" or "ADR" (or IndexableSubtype).
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
   * Human-readable title derived from slug.
   */
  title: string;

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
   * Normalized scope directory relative to cwd (e.g. "." or "src/interfaces/cli").
   */
  scope: string;

  /**
   * Frontmatter links list (target ADR or RULE tags).
   */
  links: string[];
}

export interface ListArtifactsOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Optional target directory or file scope for ancestral scope traversal (RULE-9).
   * When specified, returns only active artifacts residing in the ancestry path vector
   * A = [R, ..., P] walking from target scope P up to workspace root R.
   */
  scope?: string;
}

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

  /**
   * Optional VCS adapter for git operations (defaults to defaultVcsAdapter).
   */
  vcs?: IVcsAdapter;
}

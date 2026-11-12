/**
 * Types and schema for artifact queries, listing, references, and archival guard.
 * Complies with RULE-9 and RULE-31.
 */

import type {
  ChildMotive,
  IndexableSubtype,
  ResolvedArtifact,
  TaskAcceptanceCriteriaItem,
  TaskReadiness,
} from "../../domain/index.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";

export type { ResolvedArtifact };

export interface ArtifactDetails extends ResolvedArtifact {
  /**
   * Title of the artifact, if declared in document.
   */
  title?: string;

  /**
   * Concise summary of the artifact (for ADR artifacts, extracted from frontmatter with fallback).
   */
  summary?: string;

  /**
   * Frontmatter links list (target ADR or RULE tags).
   */
  links: string[];

  /**
   * Frontmatter depends_on list (target TASK tags, if present).
   */
  depends_on?: string[];

  /**
   * Frontmatter supersedes list (predecessor artifact tags, if present).
   */
  supersedes?: string[];

  /**
   * Frontmatter superseded_by list (successor artifact tags, if present).
   */
  superseded_by?: string[];

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

  /**
   * Single invariant assertion claim (for RULE artifacts).
   */
  assertion?: string;

  /**
   * Alternatives considered section content (for ADR artifacts).
   */
  alternatives?: string;

  /**
   * Decision section content (for ADR artifacts).
   */
  decision?: string;

  /**
   * Consequences section content (for ADR artifacts).
   */
  consequences?: string;
}

export interface ResolveArtifactOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;

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
   * Whether to query Git deletion history and branches when the artifact is not active on disk .
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

  /**
   * Concise summary of the artifact (extracted from frontmatter with fallback for ADRs).
   */
  summary?: string;
}

export interface ListArtifactsOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;

  /**
   * Optional target directory or file scope for ancestral scope traversal (RULE-9).
   * When specified, returns only active artifacts residing in the ancestry path vector
   * A = [R, ..., P] walking from target scope P up to workspace root R.
   */
  scope?: string;
}

export type ReferenceCategory =
  "governance-link" | "governance-prose" | "code" | "test" | "documentation";

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
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;

  /**
   * Custom directory ignore list.
   */
  ignoredDirectories?: string[];

  /**
   * Optional VCS adapter for git operations.
   */
  vcs?: IVcsAdapter;
}

export interface ScopeRuleItem {
  tag: string;
  id: string;
  slug: string;
  title: string;
  relativePath: string;
  scope: string;
}

export interface ScopeTaskItem {
  id: string;
  tag: string;
  title: string;
  slug: string;
  relativePath: string;
  scope: string;
  readiness: TaskReadiness;
  criteriaProgress: string;
}

export interface AncestralRuleChainNode {
  scope: string;
  rules: ScopeRuleItem[];
}

export interface ScopeResolutionResult {
  /**
   * Input target or artifact identifier.
   */
  target: string;

  /**
   * Resolution target type: "artifact" | "path".
   */
  type: "artifact" | "path";

  /**
   * Relative target path from workspace root (e.g. "." or "src/interfaces/cli").
   */
  targetPath: string;

  /**
   * Absolute target path on disk.
   */
  targetAbsolutePath: string;

  /**
   * Normalized relative governing scope directory (e.g. "." or "src/interfaces/cli").
   */
  scope: string;

  /**
   * Absolute path to the governing scope directory.
   */
  scopeDir: string;

  /**
   * Relative path to the enclosing .modie directory (e.g. ".modie" or "src/interfaces/cli/.modie").
   */
  enclosingModieDir: string;

  /**
   * Ancestral scopes along the upward path vector from root down to governing scope.
   */
  ancestralScopes: string[];

  /**
   * Ancestral rule chains grouped by scope node.
   */
  ancestralRuleChains: AncestralRuleChainNode[];

  /**
   * Applicable ancestral governance rules in accordance with RULE-9.
   */
  rules: ScopeRuleItem[];

  /**
   * Active tasks residing in this governing scope.
   */
  tasks: ScopeTaskItem[];

  /**
   * Metadata of the resolved artifact (if input is an artifact).
   */
  artifact?: ResolvedArtifact;
}

export interface ResolveScopeOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;
}

export interface CompileContextOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: WorkspaceContext;
}

export interface CompiledContextMotive {
  scope: string;
  relativePath: string;
  content: string;
}

export interface CompiledContextRule {
  tag: string;
  id: string;
  slug: string;
  title: string;
  scope: string;
  relativePath: string;
  links: string[];
  body: string;
}

export interface CompiledContextAdr {
  tag: string;
  id: string;
  slug: string;
  title: string;
  scope: string;
  relativePath: string;
  summary: string;
  links: string[];
}

export interface CompiledContextBlastRadius {
  scope: string;
  scopeDir: string;
  enclosingModieDir: string;
  constraint: string;
}

export interface CompiledContextTask {
  id: string;
  tag: string;
  fullTaskId: string;
  slug: string;
  title: string;
  relativePath: string;
  scope: string;
  scopeDir: string;
  readiness: TaskReadiness;
  blockedBy: string[];
  depends_on: string[];
  links: string[];
  context?: string;
  criteriaTotal: number;
  criteriaCompleted: number;
  criteriaProgress: string;
  acceptanceCriteria: TaskAcceptanceCriteriaItem[];
  incompleteCriteria: string[];
  blastRadius: CompiledContextBlastRadius;
}

export interface CompiledContextChildMotive extends ChildMotive {
  /**
   * Alias for `scope` (normalized relative path to the child directory).
   */
  childScope: string;
}

export interface CompiledContextResult {
  target: string;
  type: "path" | "task" | "artifact";
  targetPath: string;
  scope: string;
  scopeDir: string;
  ancestralScopes: string[];
  task?: CompiledContextTask;
  motives: CompiledContextMotive[];
  rules: CompiledContextRule[];
  adrs: CompiledContextAdr[];
  childMotives: CompiledContextChildMotive[];
}

export type ArtifactPlacementStatus =
  | "OPTIMAL"
  | "OVER_SCOPED"
  | "UNDER_SCOPED"
  | "INCHOATE";

export interface ArtifactPlacementSuggestion {
  tag: string;
  subtype: IndexableSubtype;
  id: string;
  slug: string;
  title: string;
  filename: string;
  filepath: string;
  relativePath: string;
  currentScope: string;
  currentScopeDir: string;
  recommendedScope: string;
  recommendedScopeDir: string;
  suggestedRelativePath: string;
  suggestedFilepath: string;
  status: ArtifactPlacementStatus;
  citationsCount: number;
  referencingPaths: string[];
  violations: string[];
  outOfScopePaths?: string[];
  outOfScopeCitationsCount?: number;
}

export interface AuditPlacementOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Optional pre-resolved workspace context container.
   */
  workspace?: WorkspaceContext;

  /**
   * Minimum citation threshold to justify least-scope demotion (default: 3).
   * Artifacts with fewer citations without out-of-scope violations are classified as INCHOATE.
   */
  minCitationsThreshold?: number;

  /**
   * Optional scope boundary filter (e.g. "src" or "src/interfaces").
   */
  scope?: string;

  /**
   * Subtypes to audit (defaults to ["RULE", "ADR"]).
   */
  subtypes?: IndexableSubtype[];
}

export interface ArtifactPlacementAuditReport {
  scope: string;
  totalAudited: number;
  optimalCount: number;
  overScopedCount: number;
  underScopedCount: number;
  inchoateCount: number;
  suggestions: ArtifactPlacementSuggestion[];
}

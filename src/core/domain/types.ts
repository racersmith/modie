/**
 * Modie Core Domain Layer: Core pipeline types and subtype contracts.
 * Pure domain schemas with zero dependencies on engine or platform services (ADR-13, RULE-38).
 */

import type { ArtifactSubtype, IndexableSubtype } from "./common/types.ts";
import type { SubtypeLinkPolicy } from "./graph/types.ts";

export interface ParsedFrontmatterFields {
  links: string[];
  depends_on?: string[];
  supersedes?: string[];
  superseded_by?: string[];
  summary?: string;
}

export interface ArtifactParseContext {
  id: string;
  slug: string;
  title: string;
  filepath?: string;
  filename?: string;
  rawContent: string;
  frontmatter: string;
  body: string;
  frontmatterFields: ParsedFrontmatterFields;
  sections: Record<string, string>;
}

export type AllocationStrategy = "trunk" | "subtask" | "prefixed";

export interface WatermarkDetails {
  nextId: string;
  tag: string;
  fullTaskId: string;
  subtype: IndexableSubtype;
  strategy: AllocationStrategy;
  activeIds: string[];
  otherBranchActiveIds?: string[];
  deletedIds: string[];
  branch?: string;
  parentId?: string;
  prefix?: string;
  sequence: number;
}

export interface BaseCreateArtifactOptions {
  /**
   * Title of the artifact (human-readable string).
   */
  title: string;

  /**
   * Optional target scope directory where the artifact should reside.
   * Defaults to workspace root (cwd).
   */
  scopeDir?: string;

  /**
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: any;

  /**
   * Optional target artifact tag(s) superseded by this artifact.
   */
  supersedes?: string | string[];

  /**
   * Optional frontmatter links.
   */
  links?: string[];

  /**
   * Optional task dependencies.
   */
  depends_on?: string[];
}

/**
 * Unified context for pre-write artifact planning operations (validation and ID allocation).
 */
export interface ArtifactPlanContext<TOptions = unknown> {
  title: string;
  slug: string;
  normalizedScopeDir: string;
  targetDir: string;
  options: TOptions;
  cwd: string;
}

export type ArtifactValidationContext<TOptions = unknown> =
  ArtifactPlanContext<TOptions>;
export type ArtifactAllocationContext<TOptions = unknown> =
  ArtifactPlanContext<TOptions>;

export interface ArtifactRenderContext<TOptions = unknown> {
  id: string;
  slug: string;
  title: string;
  normalizedScopeDir: string;
  targetDir: string;
  filepath: string;
  options: TOptions;
  cwd: string;
}

export interface ArtifactRenderResult<TArtifact = unknown> {
  markdown: string;
  artifact: TArtifact;
}

/**
 * Declarative definition of an artifact subtype, defining its lifecycle behaviors,
 * directory conventions, link validation rules, template generator, and markdown parser.
 */
export interface ArtifactDefinition<TOptions = any, TArtifact = any> {
  /**
   * The uppercase subtype identifier (e.g. "RULE", "ADR", "TASK").
   */
  subtype: ArtifactSubtype | IndexableSubtype | string;

  /**
   * Optional plural container directory name (e.g. "rules", "adrs", "tasks").
   * Defaults to `${subtype.toLowerCase()}s`.
   */
  containerName?: string;

  /**
   * Optional declarative link and dependency governance policy matrix.
   * Defines permitted relationships, target subtypes, and ancestry constraints per ADR-5.
   */
  linkPolicy?: SubtypeLinkPolicy;

  /**
   * Optional validation hook executed before ID allocation (e.g. link/scope validation).
   */
  validate?: (context: ArtifactPlanContext<TOptions>) => void | Promise<void>;

  /**
   * Optional ID allocator. Defaults to monotonic watermark resolution.
   */
  allocateId?: (
    context: ArtifactPlanContext<TOptions>,
  ) => Promise<{ id: string; watermark?: WatermarkDetails }> | Promise<string> | string | { id: string; watermark?: WatermarkDetails };

  /**
   * Template renderer that generates the markdown string and structured artifact object.
   */
  render: (
    context: ArtifactRenderContext<TOptions>,
  ) => ArtifactRenderResult<TArtifact>;

  /**
   * Bidirectional markdown parser that reconstructs the structured artifact object
   * from a parsed markdown document context.
   */
  parse?: (context: ArtifactParseContext) => TArtifact;
}

export interface CreateArtifactResult<TArtifact = unknown> {
  artifact: TArtifact;
  filename: string;
  filepath: string;
  relativePath: string;
  markdown: string;
  id: string;
  tag: string;
  watermark?: WatermarkDetails;
  supersedes?: string[];
}

/**
 * Types and interfaces for the generic declarative artifact pipeline.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-8, and RULE-25.
 */

import type { IndexableSubtype } from "../common/types.ts";
import type { ParsedFrontmatterFields } from "../query/markdown-parser.ts";
import type { WatermarkDetails } from "../resolver/types.ts";

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
   * Optional target artifact tag(s) superseded by this artifact.
   */
  supersedes?: string | string[];
}

export interface ArtifactValidationContext<TOptions = unknown> {
  title: string;
  slug: string;
  normalizedScopeDir: string;
  targetDir: string;
  options: TOptions;
  cwd: string;
}

export interface ArtifactAllocationContext<TOptions = unknown> {
  title: string;
  slug: string;
  normalizedScopeDir: string;
  targetDir: string;
  options: TOptions;
  cwd: string;
}

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

/**
 * Declarative definition of an artifact subtype, defining its lifecycle behaviors,
 * directory conventions, link validation rules, template generator, and markdown parser.
 */
export interface ArtifactDefinition<TOptions = any, TArtifact = any> {
  /**
   * The uppercase subtype identifier (e.g. "RULE", "ADR", "TASK").
   */
  subtype: IndexableSubtype | string;

  /**
   * Optional plural container directory name (e.g. "rules", "adrs", "tasks").
   * Defaults to `${subtype.toLowerCase()}s`.
   */
  containerName?: string;

  /**
   * Optional validation hook executed before ID allocation (e.g. link/scope validation).
   */
  validate?: (
    context: ArtifactValidationContext<TOptions>,
  ) => void | Promise<void>;

  /**
   * Optional ID allocator. Defaults to monotonic watermark resolution.
   */
  allocateId?: (
    context: ArtifactAllocationContext<TOptions>,
  ) => Promise<{ id: string; watermark?: WatermarkDetails }>;

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
}

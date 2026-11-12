/**
 * Modie Core Domain Layer: Domain types and schemas for ADR primitive artifacts.
 * Complies with RULE-1, RULE-4, RULE-14, RULE-17, and RULE-38.
 */

import type { CreateArtifactResult } from "../types.ts";

export interface AdrFrontmatter {
  summary?: string;
  links?: string[];
  supersedes?: string[];
  superseded_by?: string[] | string;
}

export interface AdrArtifact {
  /**
   * Monotonic unpadded integer ID (e.g. "1", "15").
   */
  id: string;

  /**
   * Kebab-case slug.
   */
  slug: string;

  /**
   * Human-readable title.
   */
  title: string;

  /**
   * Concise 1-2 sentence signpost summary of the decision for progressive disclosure.
   */
  summary?: string;

  /**
   * Frontmatter links (ADR or RULE tags) per RULE-14 and RULE-17.
   */
  links: string[];

  /**
   * Target predecessor ADR tags superseded by this ADR.
   */
  supersedes?: string[];

  /**
   * Successor ADR tags superseding this ADR.
   */
  superseded_by?: string[];

  /**
   * Context / problem statement.
   */
  contextSection?: string;

  /**
   * Alternatives considered.
   */
  alternatives?: string;

  /**
   * Architectural decision choice.
   */
  decision?: string;

  /**
   * Positive outcomes, new risks, and accepted trade-offs.
   */
  consequences?: string;

  /**
   * Absolute path to the ADR file on disk.
   */
  filePath: string;

  /**
   * Raw unparsed markdown content.
   */
  rawContent: string;
}

export interface AdrRenderOptions {
  /**
   * ADR ID token.
   */
  id?: string | number;

  /**
   * Kebab-case slug.
   */
  slug?: string;

  /**
   * Human-readable title.
   */
  title?: string;

  /**
   * Concise 1-2 sentence signpost summary of the decision for progressive disclosure.
   */
  summary?: string;

  /**
   * Frontmatter link targets (ADR or RULE) per RULE-14.
   */
  links?: string[];

  /**
   * Predecessor ADR tags superseded by this decision.
   */
  supersedes?: string[];

  /**
   * Successor ADR tags superseding this decision.
   */
  superseded_by?: string[];

  /**
   * Context / problem statement.
   */
  contextSection?: string;

  /**
   * Alternatives considered.
   */
  alternatives?: string;

  /**
   * Decision description.
   */
  decision?: string;

  /**
   * Positive outcomes, new risks, and accepted trade-offs.
   */
  consequences?: string;

  /**
   * When true, skips frontmatter link validation (used by test fixtures).
   */
  skipValidation?: boolean;
}

export interface CreateAdrOptions {
  /**
   * Title of the architectural decision record (human-readable string).
   * E.g. "Self-Indexing Filenames"
   */
  title: string;

  /**
   * Optional target scope directory where the ADR should reside.
   * Defaults to workspace root (cwd).
   */
  scopeDir?: string;

  /**
   * Concise 1-2 sentence signpost summary of the decision for progressive disclosure.
   */
  summary?: string;

  /**
   * Context / problem statement.
   */
  contextSection?: string;

  /**
   * Alternatives considered.
   */
  alternatives?: string;

  /**
   * Adopted decision description.
   */
  decision?: string;

  /**
   * Positive outcomes, new risks, and accepted trade-offs.
   */
  consequences?: string;

  /**
   * Artifact links (`links`). Must only reference `ADR-` and `RULE-` identifiers per RULE-14.
   * Any referenced `RULE` must reside in the ADR's directory or a descendant subtree per RULE-17.
   */
  links?: string[];

  /**
   * Target predecessor ADR tags superseded by this decision per RULE-4.
   * Writes bidirectional frontmatter links to both this ADR and the superseded ADR on disk.
   */
  supersedes?: string | string[];

  /**
   * When true, bypasses the tombstone ADR detection guardrail (e.g. titles containing sunset or cleanup keywords).
   */
  force?: boolean;

  /**
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  workspace?: any;
}

export type CreateAdrResult = CreateArtifactResult<AdrArtifact>;


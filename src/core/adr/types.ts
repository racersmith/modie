/**
 * Domain types and schemas for ADR primitive artifacts.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, RULE-14, and RULE-17.
 */

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
   * Concise 1-2 sentence signpost summary of the decision for progressive disclosure (ADR-8, RULE-26).
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
   * Context / problem statement (ADR-4).
   */
  context?: string;

  /**
   * Alternatives considered (ADR-4).
   */
  alternatives?: string;

  /**
   * Architectural decision choice (ADR-4).
   */
  decision?: string;

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
   * Concise 1-2 sentence signpost summary of the decision for progressive disclosure (ADR-8, RULE-26).
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
   * Context / problem statement (ADR-4).
   */
  context?: string;

  /**
   * Alternatives considered (ADR-4).
   */
  alternatives?: string;

  /**
   * Decision description (ADR-4).
   */
  decision?: string;
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
   * Concise 1-2 sentence signpost summary of the decision for progressive disclosure (ADR-8, RULE-26).
   */
  summary?: string;

  /**
   * Context / problem statement (ADR-4).
   */
  context?: string;

  /**
   * Alternatives considered (ADR-4).
   */
  alternatives?: string;

  /**
   * Adopted decision description (ADR-4).
   */
  decision?: string;

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
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;
}

export interface CreateAdrResult {
  artifact: AdrArtifact;
  filename: string;
  filepath: string;
  relativePath: string;
  markdown: string;
  id: string;
  tag: string;
}

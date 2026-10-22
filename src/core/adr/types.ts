/**
 * Domain types and schemas for ADR primitive artifacts.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, RULE-14, and RULE-17.
 */

export interface AdrFrontmatter {
  links?: string[];
  superseded_by?: string;
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
   * Frontmatter links (ADR or RULE tags) per RULE-14 and RULE-17.
   */
  links: string[];

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
   * Frontmatter link targets (ADR or RULE) per RULE-14.
   */
  links?: string[];

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

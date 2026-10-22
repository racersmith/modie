/**
 * Primitive domain types for RULE artifacts.
 * Complies with RULE-1, RULE-3, RULE-11, and RULE-13.
 */

export interface RuleArtifact {
  /**
   * Monotonic unpadded integer ID (e.g. "1", "14").
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
   * ADR artifact links per RULE-13.
   */
  links: string[];

  /**
   * Single invariant assertion claim per RULE-3 and RULE-11.
   */
  assertion: string;

  /**
   * Absolute path to the rule file on disk.
   */
  filePath: string;

  /**
   * Unparsed raw markdown content.
   */
  rawContent: string;
}

export interface RuleRenderOptions {
  /**
   * Rule ID token.
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
   * ADR links to include in frontmatter (RULE-13).
   */
  links?: string[];

  /**
   * Invariant assertion claim text (RULE-3, RULE-11).
   */
  assertion?: string;
}

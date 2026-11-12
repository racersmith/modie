/**
 * Modie Core Domain Layer: Primitive domain types for RULE artifacts.
 * Complies with RULE-1, RULE-3, RULE-11, RULE-13, and RULE-38.
 */

import type { CreateArtifactResult } from "../types.ts";

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
   * Concise summary of the rule (extracted from frontmatter or assertion claim).
   */
  summary?: string;

  /**
   * Context / description text (matches assertion or explicit context section).
   */
  contextSection?: string;

  /**
   * Target RULE tag(s) superseded by this rule.
   */
  supersedes?: string[];

  /**
   * Target RULE tag(s) that supersede this rule.
   */
  superseded_by?: string[];

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
   * Target RULE tag(s) superseded by this rule.
   */
  supersedes?: string[];

  /**
   * Target RULE tag(s) that supersede this rule.
   */
  superseded_by?: string[];

  /**
   * Invariant assertion claim text (RULE-3, RULE-11).
   */
  assertion?: string;

  /**
   * Concise summary of the rule.
   */
  summary?: string;

  /**
   * When true, skips frontmatter link validation (used by test fixtures).
   */
  skipValidation?: boolean;
}

export interface CreateRuleOptions {
  /**
   * Title of the rule (human-readable string).
   * E.g. "Rule Verification Tagging"
   */
  title: string;

  /**
   * Concise summary of the rule.
   */
  summary?: string;

  /**
   * Optional target scope directory where the rule should reside.
   * Defaults to workspace root (cwd).
   */
  scopeDir?: string;

  /**
   * Single invariant assertion claim text (RULE-3, RULE-11).
   */
  assertion?: string;

  /**
   * Context / description alias for assertion.
   */
  contextSection?: string;

  /**
   * ADR artifact links (`links`). Must only reference `ADR-` identifiers per RULE-13.
   * Each referenced ADR must reside in the rule's directory or an ancestor directory per RULE-16.
   */
  links?: string[];

  /**
   * Target RULE tag(s) superseded by this rule.
   */
  supersedes?: string | string[];

  /**
   * Optional force flag to bypass collision or advisory guardrails.
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

export type CreateRuleResult = CreateArtifactResult<RuleArtifact>;


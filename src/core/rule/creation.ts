/**
 * Core Rule Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-13 and RULE-16.
 * Complies with ADR-1, ADR-2, ADR-3, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, and RULE-25.
 */

import { dirname, isAbsolute, relative } from "node:path";
import { resolveArtifactDirectories } from "../common/index.ts";
import { resolveArtifactByTag } from "../query/index.ts";
import { createArtifact } from "../pipeline/create.ts";
import { ruleDefinition } from "./definition.ts";
import { validateRuleLinks } from "./template.ts";
import type { RuleArtifact } from "./types.ts";

export interface CreateRuleOptions {
  /**
   * Title of the rule (human-readable string).
   * E.g. "Rule Verification Tagging"
   */
  title: string;

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
  context?: string;

  /**
   * ADR artifact links (`links`). Must only reference `ADR-` identifiers per RULE-13.
   * Each referenced ADR must reside in the rule's directory or an ancestor directory per RULE-16.
   */
  links?: string[];

  /**
   * Whether to place in a `.rules/` subtype container directory (RULE-8).
   * Defaults to true. If false (e.g. --flat), placed flat in target directory.
   */
  useSubtypeContainer?: boolean;

  /**
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;
}

export interface CreateRuleResult {
  artifact: RuleArtifact;
  filename: string;
  filepath: string;
  relativePath: string;
  markdown: string;
  id: string;
  tag: string;
}

/**
 * Normalizes scope directory and target directory for a RULE per RULE-8.
 */
export function resolveRuleDirectories(
  scopeDirInput: string | undefined,
  useSubtypeContainer: boolean = true,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  return resolveArtifactDirectories("RULE", scopeDirInput, useSubtypeContainer, cwd);
}

/**
 * Validates frontmatter links per RULE-13 and ancestral ADR scope per RULE-16.
 *
 * A RULE artifact referencing an ADR must target an ADR residing in the rule's
 * directory or an ancestor directory up to the repository root (RULE-16).
 *
 * @throws Error if any link is non-ADR (RULE-13) or targets a descendant/sibling ADR (RULE-16).
 */
export async function validateRuleAncestry(
  normalizedScopeDir: string,
  links: string[] = [],
  cwd: string = process.cwd(),
): Promise<void> {
  // 1. Enforce RULE-13: only ADR targets allowed
  validateRuleLinks(links);

  if (links.length === 0) return;

  // 2. Enforce RULE-16: referenced ADRs must reside in rule directory or ancestor directory
  for (const link of links) {
    const adr = await resolveArtifactByTag(link, { cwd });

    const adrDir = dirname(adr.filepath);
    const { normalizedScopeDir: adrNormalizedScope } = resolveArtifactDirectories(
      "ADR",
      adrDir,
      true,
      cwd,
    );

    const relFromAdrToRule = relative(adrNormalizedScope, normalizedScopeDir);
    const isAncestorOrEqual =
      !relFromAdrToRule.startsWith("..") && !isAbsolute(relFromAdrToRule);

    if (!isAncestorOrEqual) {
      const ruleScopeDisplay = relative(cwd, normalizedScopeDir) || ".";
      throw new Error(
        `Rule justification ancestry violation: linked ADR "${link}" at "${adr.relativePath}" does not reside in rule directory "${ruleScopeDisplay}" or an ancestor directory (RULE-16).`,
      );
    }
  }
}

/**
 * Orchestrating domain service to create a new RULE artifact.
 * Follows RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, and RULE-25.
 */
export async function createRule(
  options: CreateRuleOptions,
): Promise<CreateRuleResult> {
  const result = await createArtifact(ruleDefinition, options);
  return {
    artifact: result.artifact,
    filename: result.filename,
    filepath: result.filepath,
    relativePath: result.relativePath,
    markdown: result.markdown,
    id: result.id,
    tag: result.tag,
  };
}

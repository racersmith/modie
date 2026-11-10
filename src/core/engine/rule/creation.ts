/**
 * Core Rule Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-13 and RULE-16.
 * Complies with ADR-1, ADR-2, ADR-3, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, and RULE-25.
 */

import {
  resolveArtifactDirectories,
  ruleDefinition,
  type CreateRuleOptions,
  type CreateRuleResult,
  type RuleDefinition,
} from "../../domain/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context/index.ts";
import { validateLinkTarget } from "../linking/validator.ts";
import { createArtifact } from "../pipeline/create.ts";

export type { CreateRuleOptions, CreateRuleResult, RuleDefinition } from "../../domain/index.ts";
export { ruleDefinition } from "../../domain/index.ts";

/**
 * Validates frontmatter links per RULE-13 and ancestor justification per RULE-16.
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
  for (const link of links) {
    await validateLinkTarget("RULE", normalizedScopeDir, "links", link, {
      cwd,
      sourceTag: "RULE",
    });
  }
}

/**
 * Normalizes scope directory and target directory for a RULE per RULE-8.
 */
export function resolveRuleDirectories(
  scopeDirInput: string | undefined,
  cwdOrContext?: string | WorkspaceContext,
): { normalizedScopeDir: string; targetDir: string } {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  return resolveArtifactDirectories("RULE", scopeDirInput, ctx.root);
}

/**
 * Orchestrating domain service to create a new RULE artifact.
 * Follows RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, and RULE-25.
 */
export async function createRule(
  options: CreateRuleOptions,
): Promise<CreateRuleResult> {
  return createArtifact(ruleDefinition, options);
}

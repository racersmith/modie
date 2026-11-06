/**
 * Core Rule Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-13 and RULE-16.
 * Complies with ADR-1, ADR-2, ADR-3, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, and RULE-25.
 */

import { resolveArtifactDirectories } from "../common/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context.ts";
import { createArtifact } from "../pipeline/create.ts";
import { ruleDefinition, validateRuleAncestry } from "./definition.ts";
import type { CreateRuleOptions, CreateRuleResult } from "./types.ts";

export type { CreateRuleOptions, CreateRuleResult } from "./types.ts";
export { validateRuleAncestry } from "./definition.ts";

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

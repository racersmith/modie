/**
 * Core Rule Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-13 and RULE-16.
 * Complies with ADR-1, ADR-2, ADR-3, RULE-1, RULE-3, RULE-8, RULE-11, RULE-13, RULE-16, and RULE-25.
 */

import { resolveArtifactDirectories } from "../common/index.ts";
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
  useSubtypeContainer: boolean = true,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  return resolveArtifactDirectories(
    "RULE",
    scopeDirInput,
    useSubtypeContainer,
    cwd,
  );
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
    supersedes: result.artifact.supersedes,
  };
}

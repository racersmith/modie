/**
 * Declarative artifact creation services for ADR and Rule workflows.
 * Coordinates pipeline execution, directory resolution, and frontmatter validation.
 * Complies with ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-3, RULE-4, RULE-8, RULE-11, RULE-13, RULE-14, RULE-16, RULE-17, RULE-25, and RULE-38.
 */

import {
  adrDefinition,
  resolveArtifactDirectories,
  ruleDefinition,
  type CreateAdrOptions,
  type CreateAdrResult,
  type CreateRuleOptions,
  type CreateRuleResult,
} from "../../domain/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context/index.ts";
import { validateLinkTarget } from "../linking/validator.ts";
import { createArtifact } from "./create.ts";
import { updateSupersededArtifactFrontmatter } from "./supersession.ts";

/**
 * Validates frontmatter links per RULE-14, descendant rule scope per RULE-17,
 * and ancestor ADR scope per RULE-19.
 *
 * - An ADR's frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).
 * - An ADR artifact referencing a RULE must target a RULE residing in the ADR's
 *   directory or within its descendant subtree (RULE-17).
 * - An ADR artifact referencing an ADR must target an ancestor or self ADR (RULE-19).
 *
 * @throws Error if any link is not ADR/RULE (RULE-14) or violates spatial scope (RULE-17, RULE-19).
 */
export async function validateAdrScope(
  normalizedScopeDir: string,
  links: string[] = [],
  cwd: string = process.cwd(),
): Promise<void> {
  for (const link of links) {
    await validateLinkTarget("ADR", normalizedScopeDir, "links", link, {
      cwd,
      sourceTag: "ADR",
    });
  }
}

/**
 * Updates a superseded ADR artifact file on disk to append superseded_by frontmatter link.
 * Delegates to the unified pipeline supersession service.
 */
export async function updateSupersededAdrFrontmatter(
  targetTag: string,
  newAdrTag: string,
  cwdOrContext?: string | WorkspaceContext,
): Promise<void> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  return updateSupersededArtifactFrontmatter(targetTag, newAdrTag, {
    cwd: ctx.root,
    workspace: ctx,
    expectedSubtype: "ADR",
  });
}

/**
 * Normalizes scope directory and target directory for an ADR per RULE-8.
 */
export function resolveAdrDirectories(
  scopeDirInput: string | undefined,
  cwdOrContext?: string | WorkspaceContext,
): { normalizedScopeDir: string; targetDir: string } {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  return resolveArtifactDirectories("ADR", scopeDirInput, ctx.root);
}

/**
 * Orchestrating domain service to create a new ADR artifact.
 * Follows ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */
export async function createAdr(
  options: CreateAdrOptions,
): Promise<CreateAdrResult> {
  return createArtifact(adrDefinition, options);
}

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


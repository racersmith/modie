/**
 * Core ADR Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-14 and RULE-17.
 * Complies with ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */

import { resolveArtifactDirectories } from "../common/index.ts";
import { createArtifact } from "../pipeline/create.ts";
import { updateSupersededArtifactFrontmatter } from "../pipeline/supersession.ts";
import {
  adrDefinition,
  validateAdrScope,
  type AdrDefinition,
} from "./definition.ts";
import type { CreateAdrOptions, CreateAdrResult } from "./types.ts";

export type { CreateAdrOptions, CreateAdrResult } from "./types.ts";
export {
  adrDefinition,
  validateAdrScope,
  type AdrDefinition,
} from "./definition.ts";

/**
 * Updates a superseded ADR artifact file on disk to append superseded_by frontmatter link.
 * Delegates to the unified pipeline supersession service.
 */
export async function updateSupersededAdrFrontmatter(
  targetTag: string,
  newAdrTag: string,
  cwd: string = process.cwd(),
): Promise<void> {
  return updateSupersededArtifactFrontmatter(targetTag, newAdrTag, {
    cwd,
    expectedSubtype: "ADR",
  });
}

/**
 * Normalizes scope directory and target directory for an ADR per RULE-8.
 */
export function resolveAdrDirectories(
  scopeDirInput: string | undefined,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  return resolveArtifactDirectories("ADR", scopeDirInput, cwd);
}

/**
 * Orchestrating domain service to create a new ADR artifact.
 * Follows ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */
export async function createAdr(
  options: CreateAdrOptions,
): Promise<CreateAdrResult> {
  const result = await createArtifact(adrDefinition, options);

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

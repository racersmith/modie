/**
 * Generic artifact supersession service.
 * Manages bidirectional supersession linking and frontmatter updates across
 * all indexable governance artifacts (ADR, RULE, etc.).
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, and RULE-25.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { IndexableSubtype } from "../common/types.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context.ts";
import { mutateFrontmatterListField } from "../linking/mutation.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";

export interface UpdateSupersededFrontmatterOptions {
  /**
   * Root working directory for workspace operations (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Explicit workspace context container.
   */
  context?: WorkspaceContext;

  /**
   * Expected artifact subtype constraint (e.g. "ADR", "RULE").
   * Supersession across differing subtypes is strictly prohibited.
   */
  expectedSubtype?: IndexableSubtype | string;
}

/**
 * Updates a superseded artifact file on disk to append `superseded_by` frontmatter link.
 * Automatically initializes frontmatter if absent, appends to existing frontmatter,
 * handles inline arrays, and ensures idempotent deduplication.
 *
 * @throws Error if target cannot be resolved or if a subtype mismatch occurs.
 */
export async function updateSupersededArtifactFrontmatter(
  targetTag: string,
  newTag: string,
  optionsOrCwd: UpdateSupersededFrontmatterOptions | string = {},
): Promise<void> {
  const options: UpdateSupersededFrontmatterOptions =
    typeof optionsOrCwd === "string" ? { cwd: optionsOrCwd } : optionsOrCwd;

  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

  const target = await resolveArtifactByTag(targetTag, {
    cwd,
    context: ctx,
    subtype: options.expectedSubtype as IndexableSubtype,
    includeArchived: true,
  });

  if (
    options.expectedSubtype &&
    target.subtype.toUpperCase() !== options.expectedSubtype.toUpperCase()
  ) {
    throw new Error(
      `Subtype mismatch: Cannot supersede "${target.tag}" (${target.subtype}) with "${newTag}" (${options.expectedSubtype.toUpperCase()}). Supersession is only permitted within the same artifact subtype.`,
    );
  }

  const content = await readFile(target.filepath, "utf8");
  const { updatedContent, changed } = mutateFrontmatterListField(
    content,
    "superseded_by",
    "add",
    newTag,
  );

  if (changed) {
    await writeFile(target.filepath, updatedContent, "utf8");
  }
}

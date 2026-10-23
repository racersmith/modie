/**
 * Generic artifact supersession service.
 * Manages bidirectional supersession linking and frontmatter updates across
 * all indexable governance artifacts (ADR, RULE, etc.).
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-4, and RULE-25.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { IndexableSubtype } from "../common/types.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";

export interface UpdateSupersededFrontmatterOptions {
  /**
   * Root working directory for workspace operations (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Expected artifact subtype constraint (e.g. "ADR", "RULE").
   * Supersession across differing subtypes is strictly prohibited.
   */
  expectedSubtype?: IndexableSubtype | string;
}

/**
 * Updates a superseded artifact file on disk to append `superseded_by` frontmatter link.
 * Automatically initializes frontmatter if absent, appends to existing frontmatter,
 * and ensures idempotent deduplication.
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

  const cwd = options.cwd ?? process.cwd();

  const target = await resolveArtifactByTag(targetTag, {
    cwd,
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
  const trimmed = content.trim();

  // If no frontmatter exists (e.g., bare RULE without links), prepend frontmatter block
  if (!trimmed.startsWith("---")) {
    const newContent = `---\nsuperseded_by:\n  - ${newTag}\n---\n\n${content}`;
    await writeFile(target.filepath, newContent, "utf8");
    return;
  }

  // Find end of frontmatter block
  const isCrlf = content.includes("\r\n");
  const newline = isCrlf ? "\r\n" : "\n";
  const closeMarker = `${newline}---`;
  const endIdx = content.indexOf(closeMarker, 3);
  if (endIdx === -1) {
    return;
  }

  const frontmatter = content.slice(0, endIdx);
  const rest = content.slice(endIdx);

  // Check if superseded_by is already present
  if (frontmatter.includes("superseded_by:")) {
    const regex = new RegExp(`(?<![A-Za-z0-9_-])${newTag}(?![A-Za-z0-9_-])`, "i");
    if (regex.test(frontmatter)) {
      return; // Already present, idempotent
    }

    const lines = frontmatter.split(/\r?\n/);
    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().startsWith("superseded_by:")) {
        insertIdx = i + 1;
        while (insertIdx < lines.length && lines[insertIdx]!.trim().startsWith("- ")) {
          insertIdx++;
        }
        break;
      }
    }

    if (insertIdx !== -1) {
      lines.splice(insertIdx, 0, `  - ${newTag}`);
      const updatedContent = lines.join(newline) + rest;
      await writeFile(target.filepath, updatedContent, "utf8");
      return;
    }
  }

  // Append superseded_by block before closing frontmatter delimiter
  const updatedFrontmatter = `${frontmatter}${newline}superseded_by:${newline}  - ${newTag}`;
  const updatedContent = updatedFrontmatter + rest;
  await writeFile(target.filepath, updatedContent, "utf8");
}

/**
 * Core ADR Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-14 and RULE-17.
 * Complies with ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolveArtifactDirectories } from "../common/index.ts";
import { createArtifact } from "../pipeline/create.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";
import { adrDefinition, validateAdrScope } from "./definition.ts";
import type { CreateAdrOptions, CreateAdrResult } from "./types.ts";

export type { CreateAdrOptions, CreateAdrResult } from "./types.ts";
export { validateAdrScope } from "./definition.ts";

/**
 * Updates a superseded ADR artifact file on disk to append superseded_by frontmatter link.
 */
export async function updateSupersededAdrFrontmatter(
  targetTag: string,
  newAdrTag: string,
  cwd: string = process.cwd(),
): Promise<void> {
  const target = await resolveArtifactByTag(targetTag, {
    cwd,
    subtype: "ADR",
    includeArchived: true,
  });

  const content = await readFile(target.filepath, "utf8");
  const trimmed = content.trim();

  if (!trimmed.startsWith("---")) {
    const newContent = `---\nsuperseded_by:\n  - ${newAdrTag}\n---\n\n${content}`;
    await writeFile(target.filepath, newContent, "utf8");
    return;
  }

  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) {
    return;
  }

  const frontmatter = content.slice(0, endIdx);
  const rest = content.slice(endIdx);

  // Check if superseded_by is already present
  if (frontmatter.includes("superseded_by:")) {
    const regex = new RegExp(`(?<![A-Za-z0-9_-])${newAdrTag}(?![A-Za-z0-9_-])`, "i");
    if (regex.test(frontmatter)) {
      return;
    }

    const lines = frontmatter.split("\n");
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
      lines.splice(insertIdx, 0, `  - ${newAdrTag}`);
      const updatedContent = lines.join("\n") + rest;
      await writeFile(target.filepath, updatedContent, "utf8");
      return;
    }
  }

  const updatedFrontmatter = `${frontmatter}\nsuperseded_by:\n  - ${newAdrTag}`;
  const updatedContent = updatedFrontmatter + rest;
  await writeFile(target.filepath, updatedContent, "utf8");
}

/**
 * Normalizes scope directory and target directory for an ADR per RULE-8.
 */
export function resolveAdrDirectories(
  scopeDirInput: string | undefined,
  useSubtypeContainer: boolean = true,
  cwd: string = process.cwd(),
): { normalizedScopeDir: string; targetDir: string } {
  return resolveArtifactDirectories("ADR", scopeDirInput, useSubtypeContainer, cwd);
}

/**
 * Orchestrating domain service to create a new ADR artifact.
 * Follows ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */
export async function createAdr(
  options: CreateAdrOptions,
): Promise<CreateAdrResult> {
  const cwd = options.cwd ?? process.cwd();
  const result = await createArtifact(adrDefinition, options);

  if (options.supersedes) {
    const supersedesRaw = Array.isArray(options.supersedes)
      ? options.supersedes
      : [options.supersedes];
    const supersedesList = supersedesRaw
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    for (const sup of supersedesList) {
      await updateSupersededAdrFrontmatter(sup, result.tag, cwd);
    }
  }

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

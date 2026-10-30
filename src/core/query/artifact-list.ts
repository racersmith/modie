/**
 * Active artifact collection listing and ancestral scope traversal service.
 * Implements ADR-4, RULE-8, RULE-9, RULE-25, and RULE-26.
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { resolveGoverningScope } from "../common/directories.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { scanActiveArtifacts } from "../resolver/active-scanner.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "./markdown-parser.ts";
import type { ListArtifactsOptions, ListedArtifact } from "./types.ts";

export type { ListArtifactsOptions, ListedArtifact } from "./types.ts";

/**
 * Natural comparator for sorting artifact IDs (e.g. 1, 2, 9, 10, TEST-1, TEST-2).
 */
export function compareArtifactIds(aId: string, bId: string): number {
  const aNum = Number(aId);
  const bNum = Number(bId);
  if (Number.isInteger(aNum) && Number.isInteger(bNum)) {
    return aNum - bNum;
  }
  return aId.localeCompare(bId, undefined, { numeric: true });
}

/**
 * Queries active (non-archived) artifacts of a given subtype (e.g. "RULE" or "ADR"),
 * extracting titles, tags, relative paths, normalized scope, and frontmatter links.
 *
 * When `options.scope` is provided, filters artifacts by ancestral scope traversal (RULE-9),
 * collecting artifacts across all nodes in the ancestry path vector A = [R, ..., P]
 * walking up from target scope P to workspace root R.
 */
export async function listActiveArtifacts(
  subtype: IndexableSubtype,
  options: ListArtifactsOptions = {},
): Promise<ListedArtifact[]> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const normalizedSubtype = subtype.toUpperCase() as IndexableSubtype;

  let targetScopeDir: string | undefined;
  const trimmedScope = options.scope?.trim();

  if (trimmedScope) {
    const rawTarget = resolve(cwd, trimmedScope);
    const { scopeDir: normalizedScopeDir } = resolveGoverningScope(rawTarget, cwd);

    const relFromRoot = relative(cwd, normalizedScopeDir);
    if (relFromRoot.startsWith("..") || isAbsolute(relFromRoot)) {
      throw new Error(
        `Invalid scope "${options.scope}": scope path must reside within the workspace root.`,
      );
    }

    targetScopeDir = normalizedScopeDir;
  }

  const discovered = await scanActiveArtifacts(cwd, normalizedSubtype);
  const activeItems = discovered.filter((a) => !a.isArchived);

  const listed: ListedArtifact[] = [];

  for (const disc of activeItems) {
    const { scopeDir: artifactScopeDir, relativeScope: scopeDisplay } =
      resolveGoverningScope(disc.filepath, cwd);

    if (targetScopeDir !== undefined) {
      // Enforce RULE-9 ancestral scope traversal: artifactScopeDir must be in A = [R, ..., P]
      const relFromRoot = relative(cwd, artifactScopeDir);
      const isWithinRoot =
        !relFromRoot.startsWith("..") && !isAbsolute(relFromRoot);

      const relToTarget = relative(artifactScopeDir, targetScopeDir);
      const isAncestorOrEqual =
        !relToTarget.startsWith("..") && !isAbsolute(relToTarget);

      if (!isWithinRoot || !isAncestorOrEqual) {
        continue;
      }
    }

    let links: string[] = [];
    try {
      const rawContent = await readFile(disc.filepath, "utf8");
      const { frontmatter } = splitMarkdownFrontmatter(rawContent);
      const parsedFields = parseFrontmatterFields(frontmatter);
      links = parsedFields.links;
    } catch {
      // Skip if file became unreadable
      continue;
    }

    const relPath = relative(cwd, disc.filepath).replace(/\\/g, "/");
    const title = disc.slug.replace(/-/g, " ");

    listed.push({
      tag: disc.tag,
      subtype: disc.subtype,
      id: disc.id,
      slug: disc.slug,
      title,
      filename: disc.filename,
      filepath: disc.filepath,
      relativePath: relPath,
      scope: scopeDisplay,
      links,
    });
  }

  listed.sort((a, b) => compareArtifactIds(a.id, b.id));
  return listed;
}

/**
 * Lists active RULE artifacts with titles, tags, relative paths, and links,
 * optionally filtered by ancestral scope traversal (RULE-9).
 */
export async function listRules(
  options: ListArtifactsOptions = {},
): Promise<ListedArtifact[]> {
  return listActiveArtifacts("RULE", options);
}

/**
 * Lists active ADR artifacts with titles, tags, relative paths, and links,
 * optionally filtered by ancestral scope traversal (RULE-9).
 */
export async function listAdrs(
  options: ListArtifactsOptions = {},
): Promise<ListedArtifact[]> {
  return listActiveArtifacts("ADR", options);
}

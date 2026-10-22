/**
 * Core ADR Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-14 and RULE-17.
 * Complies with ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  formatArtifactFilename,
  generateSlug,
  resolveArtifactDirectories,
} from "../common/index.ts";
import { resolveArtifactByTag } from "../query/index.ts";
import { resolveNextArtifactId } from "../resolver/watermark.ts";
import { renderAdrMarkdown, validateAdrLinks } from "./template.ts";
import type { AdrArtifact } from "./types.ts";

export interface CreateAdrOptions {
  /**
   * Title of the architectural decision record (human-readable string).
   * E.g. "Self-Indexing Filenames"
   */
  title: string;

  /**
   * Optional target scope directory where the ADR should reside.
   * Defaults to workspace root (cwd).
   */
  scopeDir?: string;

  /**
   * Context / problem statement (ADR-4).
   */
  context?: string;

  /**
   * Alternatives considered (ADR-4).
   */
  alternatives?: string;

  /**
   * Adopted decision description (ADR-4).
   */
  decision?: string;

  /**
   * Artifact links (`links`). Must only reference `ADR-` and `RULE-` identifiers per RULE-14.
   * Any referenced `RULE` must reside in the ADR's directory or a descendant subtree per RULE-17.
   */
  links?: string[];

  /**
   * Whether to place in a `.adrs/` subtype container directory (RULE-8).
   * Defaults to true. If false (e.g. --flat), placed flat in target directory.
   */
  useSubtypeContainer?: boolean;

  /**
   * Workspace root directory. Defaults to process.cwd().
   */
  cwd?: string;
}

export interface CreateAdrResult {
  artifact: AdrArtifact;
  filename: string;
  filepath: string;
  relativePath: string;
  markdown: string;
  id: string;
  tag: string;
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
 * Validates frontmatter links per RULE-14 and descendant rule scope per RULE-17.
 *
 * - An ADR's frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).
 * - An ADR artifact referencing a RULE must target a RULE residing in the ADR's
 *   directory or within its descendant subtree (RULE-17).
 *
 * @throws Error if any link is not ADR/RULE (RULE-14) or targets an ancestor/sibling RULE (RULE-17).
 */
export async function validateAdrScope(
  normalizedScopeDir: string,
  links: string[] = [],
  cwd: string = process.cwd(),
): Promise<void> {
  // 1. Enforce RULE-14: only ADR or RULE targets allowed
  validateAdrLinks(links);

  if (links.length === 0) return;

  // 2. Enforce RULE-17: referenced RULEs must reside in ADR directory or descendant subtree
  for (const link of links) {
    if (!link.toUpperCase().startsWith("RULE-")) {
      // RULE-17 only applies to referenced RULE artifacts
      continue;
    }

    const rule = await resolveArtifactByTag(link, { cwd });

    const ruleDir = dirname(rule.filepath);
    const { normalizedScopeDir: ruleNormalizedScope } = resolveArtifactDirectories(
      "RULE",
      ruleDir,
      true,
      cwd,
    );

    const relFromAdrToRule = relative(normalizedScopeDir, ruleNormalizedScope);
    const isDescendantOrEqual =
      !relFromAdrToRule.startsWith("..") && !isAbsolute(relFromAdrToRule);

    if (!isDescendantOrEqual) {
      const adrScopeDisplay = relative(cwd, normalizedScopeDir) || ".";
      throw new Error(
        `ADR rule scope violation: linked RULE "${link}" at "${rule.relativePath}" does not reside in ADR directory "${adrScopeDisplay}" or a descendant subtree (RULE-17).`,
      );
    }
  }
}

/**
 * Orchestrating domain service to create a new ADR artifact.
 * Follows ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */
export async function createAdr(
  options: CreateAdrOptions,
): Promise<CreateAdrResult> {
  const cwd = options.cwd ?? process.cwd();

  if (!options.title || options.title.trim().length === 0) {
    throw new Error("ADR title must be a non-empty string.");
  }

  // 1. Generate slug per RULE-1
  const slug = generateSlug(options.title);

  // 2. Resolve directory scope & target placement per RULE-8
  const { normalizedScopeDir, targetDir } = resolveAdrDirectories(
    options.scopeDir,
    options.useSubtypeContainer ?? true,
    cwd,
  );

  // 3. Validate links and rule scope per RULE-14 and RULE-17
  const links = options.links ?? [];
  await validateAdrScope(normalizedScopeDir, links, cwd);

  // 4. Resolve next monotonic ADR ID (ADR-2, RULE-1)
  const nextId = await resolveNextArtifactId("ADR", { cwd });
  const tag = `ADR-${nextId}`;

  // 5. Format canonical filename per RULE-1
  const filename = formatArtifactFilename({
    slug,
    subtype: "ADR",
    id: nextId,
  });
  const filepath = join(targetDir, filename);

  // 6. Render markdown template per ADR-4
  const markdown = renderAdrMarkdown({
    id: nextId,
    slug,
    title: options.title.trim(),
    links,
    context: options.context?.trim(),
    alternatives: options.alternatives?.trim(),
    decision: options.decision?.trim(),
  });

  // 7. Write ADR artifact to disk
  await mkdir(targetDir, { recursive: true });
  await writeFile(filepath, markdown, "utf8");

  // 8. Construct AdrArtifact representation
  const artifact: AdrArtifact = {
    id: nextId,
    slug,
    title: options.title.trim(),
    links,
    context: options.context?.trim(),
    alternatives: options.alternatives?.trim(),
    decision: options.decision?.trim(),
    filePath: filepath,
    rawContent: markdown,
  };

  return {
    artifact,
    filename,
    filepath,
    relativePath: relative(cwd, filepath),
    markdown,
    id: nextId,
    tag,
  };
}

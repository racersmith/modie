/**
 * Core ADR Creation Service.
 * Coordinates monotonic ID allocation, template rendering, scope normalization,
 * and frontmatter link validation enforcing RULE-14 and RULE-17.
 * Complies with ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-4, RULE-8, RULE-14, RULE-17, and RULE-25.
 */

import { dirname, isAbsolute, relative } from "node:path";
import { resolveArtifactDirectories } from "../common/index.ts";
import { resolveArtifactByTag } from "../query/index.ts";
import { createArtifact } from "../pipeline/create.ts";
import { adrDefinition } from "./definition.ts";
import { validateAdrLinks } from "./template.ts";
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

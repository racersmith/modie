/**
 * Core Graph & Link Invariant Validation Engine.
 * Enforces subtype compatibility, spatial ancestry/subtree scoping,
 * sideways sibling prohibition, and task dependency cycle detection.
 * Complies with ADR-5, RULE-7, RULE-8, RULE-13, RULE-14, RULE-15, RULE-16,
 * RULE-17, RULE-18, RULE-19, RULE-25, and RULE-36.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  resolveArtifactDirectories,
  resolveGoverningScope,
} from "../common/directories.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "../query/markdown-parser.ts";
import type { ResolvedArtifact } from "../query/types.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";
import type {
  ArtifactLinkRelationship,
  ValidateLinkOptions,
  ValidatedLinkContext,
} from "./types.ts";

/**
 * Automatically infers the frontmatter relationship field ("links" vs "depends_on")
 * from the source and target artifact subtypes per ADR-5, RULE-15, and RULE-18.
 *
 * - TASK -> TASK maps to "depends_on"
 * - All governance references map to "links"
 */
export function inferLinkRelationship(
  sourceSubtype: IndexableSubtype,
  targetSubtype: IndexableSubtype,
): ArtifactLinkRelationship {
  if (
    sourceSubtype.toUpperCase() === "TASK" &&
    targetSubtype.toUpperCase() === "TASK"
  ) {
    return "depends_on";
  }
  return "links";
}

/**
 * Checks whether adding a directed dependency edge `sourceTag -> targetTag`
 * (meaning `sourceTag` depends on `targetTag`) introduces a cycle in the active
 * task dependency graph (RULE-18).
 *
 * @returns The cycle path array if a cycle would be created, or `null` if the graph remains a valid DAG.
 */
export async function detectTaskDependencyCycle(
  sourceTag: string,
  targetTag: string,
  cwd: string = process.cwd(),
): Promise<string[] | null> {
  const normSource = sourceTag.trim().toUpperCase();
  const normTarget = targetTag.trim().toUpperCase();

  if (normSource === normTarget) {
    return [normSource, normTarget];
  }

  const activeTasks = await scanActiveTasks(cwd);
  const adjacency = new Map<string, string[]>();

  for (const task of activeTasks) {
    const taskTag = `TASK-${task.id}`.toUpperCase();
    try {
      const raw = await readFile(task.filepath, "utf8");
      const { frontmatter } = splitMarkdownFrontmatter(raw);
      const { depends_on } = parseFrontmatterFields(frontmatter);
      const normalizedDeps = (depends_on ?? [])
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean);
      adjacency.set(taskTag, normalizedDeps);
    } catch {
      adjacency.set(taskTag, []);
    }
  }

  // DFS from normTarget to see if normSource is reachable
  const visited = new Set<string>();
  const path: string[] = [normSource];

  function dfs(current: string): boolean {
    path.push(current);
    if (current === normSource) {
      return true;
    }
    visited.add(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      if (next === normSource) {
        path.push(normSource);
        return true;
      }
      if (!visited.has(next)) {
        if (dfs(next)) {
          return true;
        }
      }
    }

    path.pop();
    return false;
  }

  if (dfs(normTarget)) {
    return path;
  }

  return null;
}

/**
 * Checks whether `candidateAncestor` is an ancestor of or equal to `targetDir`.
 */
function isAncestorOrSelfDir(
  candidateAncestor: string,
  targetDir: string,
): boolean {
  const rel = relative(candidateAncestor, targetDir);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export const ADR_LINK_TAG_REGEX = /^ADR-[A-Za-z0-9_-]+$/i;
export const GOVERNANCE_LINK_TAG_REGEX = /^(?:ADR|RULE)-[A-Za-z0-9_-]+$/i;
export const TASK_DEPENDENCY_TAG_REGEX = /^TASK-[A-Za-z0-9_.-]+$/i;

/**
 * Returns true if `tag` matches canonical ADR tag syntax (ADR-5, RULE-13).
 */
export function isValidAdrLinkTag(tag: string): boolean {
  return ADR_LINK_TAG_REGEX.test(tag.trim());
}

/**
 * Returns true if `tag` matches canonical ADR or RULE governance tag syntax (ADR-5, RULE-14, RULE-15).
 */
export function isValidGovernanceLinkTag(tag: string): boolean {
  return GOVERNANCE_LINK_TAG_REGEX.test(tag.trim());
}

/**
 * Returns true if `tag` matches canonical TASK dependency tag syntax (RULE-18).
 */
export function isValidTaskDependencyTag(tag: string): boolean {
  return TASK_DEPENDENCY_TAG_REGEX.test(tag.trim());
}

export interface ValidateLinkTargetOptions {
  cwd?: string;
  /**
   * Canonical tag of the source artifact (e.g. "RULE-1", "TASK-5").
   * Optional because during artifact creation, the new artifact has not yet
   * been written to disk or assigned a tag. Provided during link/unlink operations
   * and task dependency validation to enforce self-reference prohibition and DAG acyclicity.
   */
  sourceTag?: string;
}

export interface ValidatedTargetResult {
  target: ResolvedArtifact;
  relationship: ArtifactLinkRelationship;
}

/**
 * Validates a single outgoing link or dependency edge from `sourceSubtype` (at `sourceScopeDir`)
 * to `targetTag`. Enforces:
 * - Subtype compatibility matrix and link syntax (ADR-5, RULE-13, RULE-14, RULE-15, RULE-18)
 * - Self-reference prohibition (ADR-5, RULE-18, RULE-36)
 * - Spatial ancestry / descendant subtree scoping and sideways sibling prohibition
 *   (ADR-5, RULE-7, RULE-8, RULE-16, RULE-17, RULE-19)
 * - Task dependency DAG acyclicity (RULE-18)
 *
 * @throws Error with descriptive invariant citation if any constraint is violated.
 */
export async function validateLinkTarget(
  sourceSubtype: IndexableSubtype | string,
  sourceScopeDir: string,
  fieldOrRelationship: ArtifactLinkRelationship | string | undefined,
  targetTag: string,
  options: ValidateLinkTargetOptions = {},
): Promise<ValidatedTargetResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const normSourceSubtype = sourceSubtype.toUpperCase();
  const trimmedTargetTag = targetTag.trim().toUpperCase();
  const sourceDisplayTag = options.sourceTag ?? normSourceSubtype;

  // 1. Prohibit self-referential links or dependencies (early check if sourceTag provided)
  if (
    options.sourceTag &&
    options.sourceTag.toUpperCase() === trimmedTargetTag
  ) {
    throw new Error(
      `Self-referential link violation: artifact "${options.sourceTag}" cannot link to or depend on itself (ADR-5, RULE-18, RULE-36).`,
    );
  }

  // 2. Determine relationship field (explicit or inferred)
  let relationship: ArtifactLinkRelationship;
  if (
    fieldOrRelationship === "links" ||
    fieldOrRelationship === "depends_on"
  ) {
    relationship = fieldOrRelationship;
  } else {
    relationship =
      normSourceSubtype === "TASK" && trimmedTargetTag.startsWith("TASK-")
        ? "depends_on"
        : "links";
  }

  // 3. Early syntax / subtype format checks before hitting filesystem
  if (relationship === "depends_on") {
    if (normSourceSubtype !== "TASK") {
      throw new Error(
        `Invalid dependency subtype: "depends_on" is strictly restricted to TASK -> TASK relationships, got "${sourceDisplayTag}" (${normSourceSubtype}) -> "${targetTag}" (ADR-5, RULE-18).`,
      );
    }
    if (!isValidTaskDependencyTag(trimmedTargetTag)) {
      throw new Error(
        `Invalid task dependency: "${targetTag}". A TASK artifact's frontmatter depends_on must exclusively reference other TASK artifacts (RULE-18).`,
      );
    }
  } else {
    // relationship === "links"
    if (normSourceSubtype === "RULE") {
      if (!isValidAdrLinkTag(trimmedTargetTag)) {
        throw new Error(
          `Invalid rule link target: "${targetTag}". A RULE artifact's frontmatter links must exclusively reference ADR artifacts (RULE-13).`,
        );
      }
    } else if (normSourceSubtype === "ADR") {
      if (!isValidGovernanceLinkTag(trimmedTargetTag)) {
        throw new Error(
          `Invalid ADR link target: "${targetTag}". An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).`,
        );
      }
    } else if (normSourceSubtype === "TASK") {
      if (!isValidGovernanceLinkTag(trimmedTargetTag)) {
        throw new Error(
          `Invalid task link target: "${targetTag}". A TASK artifact's frontmatter links must exclusively reference ADR and RULE artifacts (RULE-15).`,
        );
      }
    }
  }

  // 4. Resolve target artifact from index/disk
  const target = await resolveArtifactByTag(trimmedTargetTag, { cwd });

  // 5. Post-resolution validations
  if (
    options.sourceTag &&
    options.sourceTag.toUpperCase() === target.tag.toUpperCase()
  ) {
    throw new Error(
      `Self-referential link violation: artifact "${options.sourceTag}" cannot link to or depend on itself (ADR-5, RULE-18, RULE-36).`,
    );
  }
  if (relationship === "depends_on") {
    if (target.subtype.toUpperCase() !== "TASK") {
      throw new Error(
        `Invalid dependency subtype: "depends_on" is strictly restricted to TASK -> TASK relationships, got "${sourceDisplayTag}" (${normSourceSubtype}) -> "${target.tag}" (${target.subtype}) (ADR-5, RULE-18).`,
      );
    }

    if (
      options.sourceTag &&
      options.sourceTag.toUpperCase().startsWith("TASK-")
    ) {
      const cycle = await detectTaskDependencyCycle(
        options.sourceTag,
        target.tag,
        cwd,
      );
      if (cycle) {
        throw new Error(
          `Circular task dependency detected: adding dependency "${options.sourceTag} -> ${target.tag}" creates a cycle (${cycle.join(" -> ")}) (RULE-18).`,
        );
      }
    }

    return { target, relationship };
  }

  // Spatial ancestry checks for "links"
  const { normalizedScopeDir: effectiveSourceScopeDir } =
    resolveArtifactDirectories(
      normSourceSubtype as IndexableSubtype,
      sourceScopeDir,
      cwd,
    );
  const relSource = relative(cwd, effectiveSourceScopeDir).replace(/\\/g, "/");
  const sourceScopeDisplay = relSource === "" ? "." : relSource;
  const { scopeDir: targetScopeDir, relativeScope: targetScopeDisplay } =
    resolveGoverningScope(target.filepath, cwd);

  if (normSourceSubtype === "RULE") {
    if (target.subtype.toUpperCase() !== "ADR") {
      throw new Error(
        `Invalid rule link target: RULE "${sourceDisplayTag}" frontmatter links may only reference ADR artifacts, got "${target.tag}" (${target.subtype}) (ADR-5, RULE-13).`,
      );
    }
    if (!isAncestorOrSelfDir(targetScopeDir, effectiveSourceScopeDir)) {
      throw new Error(
        `Rule justification ancestry violation: RULE "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to ADR "${target.tag}" (scope "${targetScopeDisplay}") because the target ADR does not reside in the rule's directory or an ancestor directory (RULE-16, RULE-19).`,
      );
    }
  } else if (normSourceSubtype === "ADR") {
    if (
      target.subtype.toUpperCase() !== "ADR" &&
      target.subtype.toUpperCase() !== "RULE"
    ) {
      throw new Error(
        `Invalid ADR link target: ADR "${sourceDisplayTag}" frontmatter links may only reference ADR or RULE artifacts, got "${target.tag}" (${target.subtype}) (ADR-5, RULE-14).`,
      );
    }

    if (target.subtype.toUpperCase() === "RULE") {
      if (!isAncestorOrSelfDir(effectiveSourceScopeDir, targetScopeDir)) {
        throw new Error(
          `ADR rule scope violation: ADR "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to RULE "${target.tag}" (scope "${targetScopeDisplay}") because the target RULE does not reside in the ADR's directory or a descendant subtree (RULE-17, RULE-19).`,
        );
      }
    } else {
      if (!isAncestorOrSelfDir(targetScopeDir, effectiveSourceScopeDir)) {
        throw new Error(
          `ADR scope violation: ADR "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to ADR "${target.tag}" (scope "${targetScopeDisplay}") because the target ADR does not reside in the source ADR's directory or an ancestor directory (ADR-5, RULE-19).`,
        );
      }
    }
  } else if (normSourceSubtype === "TASK") {
    if (
      target.subtype.toUpperCase() !== "ADR" &&
      target.subtype.toUpperCase() !== "RULE"
    ) {
      throw new Error(
        `Invalid task governance link target: TASK "${sourceDisplayTag}" frontmatter "links" may only reference ADR or RULE governance artifacts, got "${target.tag}" (${target.subtype}). Use "depends_on" for TASK-to-TASK dependencies (ADR-5, RULE-15, RULE-18).`,
      );
    }

    if (!isAncestorOrSelfDir(targetScopeDir, effectiveSourceScopeDir)) {
      throw new Error(
        `Task governance scope violation: TASK "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to ${target.subtype} "${target.tag}" (scope "${targetScopeDisplay}") because the target governance artifact does not reside in the task's directory or an ancestor directory (RULE-7, RULE-19).`,
      );
    }
  }

  return { target, relationship };
}

/**
 * Validates whether linking `sourceInput` to `targetInput` satisfies all Modie
 * governance graph and task DAG invariants:
 * - Self-reference prohibition (ADR-5, RULE-18, RULE-36)
 * - Subtype compatibility matrix (ADR-5, RULE-13, RULE-14, RULE-15, RULE-18)
 * - Spatial ancestry / descendant subtree scoping and sideways link prohibition
 *   (ADR-5, RULE-7, RULE-8, RULE-16, RULE-17, RULE-19)
 * - Task dependency DAG acyclicity (RULE-18)
 *
 * @throws Error with descriptive invariant citation if any constraint is violated.
 */
export async function validateArtifactLink(
  sourceInput: string,
  targetInput: string,
  options: ValidateLinkOptions = {},
): Promise<ValidatedLinkContext> {
  const cwd = resolve(options.cwd ?? process.cwd());

  const source = await resolveArtifactByTag(sourceInput, { cwd });
  const target = await resolveArtifactByTag(targetInput, { cwd });
  const { scopeDir: sourceScopeDir } = resolveGoverningScope(
    source.filepath,
    cwd,
  );

  const { relationship } = await validateLinkTarget(
    source.subtype,
    sourceScopeDir,
    options.relationship,
    target.tag,
    {
      cwd,
      sourceTag: source.tag,
    },
  );

  const { scopeDir: targetScopeDir } = resolveGoverningScope(
    target.filepath,
    cwd,
  );

  return {
    source,
    target,
    relationship,
    sourceScopeDir,
    targetScopeDir,
  };
}

/**
 * Core Graph & Link Invariant Validation Engine.
 * Enforces subtype compatibility, spatial ancestry/subtree scoping,
 * sideways sibling prohibition, and task dependency cycle detection.
 * Complies with ADR-5, RULE-7, RULE-8, RULE-13, RULE-14, RULE-15, RULE-16,
 * RULE-17, RULE-18, RULE-19, RULE-25, and RULE-36.
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { resolveArtifactDirectories } from "../common/directories.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "../query/markdown-parser.ts";
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
 * Formats a normalized scope directory for human-readable error reporting relative to cwd.
 */
function formatScopeDisplay(scopeDir: string, cwd: string): string {
  const rel = relative(cwd, scopeDir).replace(/\\/g, "/");
  return rel === "" ? "." : rel;
}

/**
 * Checks whether `candidateAncestor` is an ancestor of or equal to `targetDir`.
 */
function isAncestorOrSelfDir(candidateAncestor: string, targetDir: string): boolean {
  const rel = relative(candidateAncestor, targetDir);
  return !rel.startsWith("..") && !isAbsolute(rel);
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

  // 1. Prohibit self-referential links or dependencies
  if (source.tag.toUpperCase() === target.tag.toUpperCase()) {
    throw new Error(
      `Self-referential link violation: artifact "${source.tag}" cannot link to or depend on itself (ADR-5, RULE-18, RULE-36).`,
    );
  }

  // 2. Determine relationship field (explicit override or automatic inference)
  const relationship: ArtifactLinkRelationship =
    options.relationship ?? inferLinkRelationship(source.subtype, target.subtype);

  if (relationship !== "links" && relationship !== "depends_on") {
    throw new Error(
      `Invalid relationship type "${String(relationship)}": expected "links" or "depends_on" (ADR-5, RULE-36).`,
    );
  }

  // 3. Normalize architectural scopes (RULE-8)
  const { normalizedScopeDir: sourceScopeDir } = resolveArtifactDirectories(
    source.subtype,
    dirname(source.filepath),
    true,
    cwd,
  );
  const { normalizedScopeDir: targetScopeDir } = resolveArtifactDirectories(
    target.subtype,
    dirname(target.filepath),
    true,
    cwd,
  );

  const sourceScopeDisplay = formatScopeDisplay(sourceScopeDir, cwd);
  const targetScopeDisplay = formatScopeDisplay(targetScopeDir, cwd);

  // 4. Validate `depends_on` relationship (RULE-18)
  if (relationship === "depends_on") {
    if (source.subtype !== "TASK" || target.subtype !== "TASK") {
      throw new Error(
        `Invalid dependency subtype: "depends_on" is strictly restricted to TASK -> TASK relationships, got "${source.tag}" (${source.subtype}) -> "${target.tag}" (${target.subtype}) (ADR-5, RULE-18).`,
      );
    }

    const cycle = await detectTaskDependencyCycle(source.tag, target.tag, cwd);
    if (cycle) {
      throw new Error(
        `Circular task dependency detected: adding dependency "${source.tag} -> ${target.tag}" creates a cycle (${cycle.join(" -> ")}) (RULE-18).`,
      );
    }

    return {
      source,
      target,
      relationship,
      sourceScopeDir,
      targetScopeDir,
    };
  }

  // 5. Validate `links` relationship across source subtypes
  if (source.subtype === "RULE") {
    // RULE-13: RULE frontmatter links may only target ADR artifacts
    if (target.subtype !== "ADR") {
      throw new Error(
        `Invalid rule link target: RULE "${source.tag}" frontmatter links may only reference ADR artifacts, got "${target.tag}" (${target.subtype}) (ADR-5, RULE-13).`,
      );
    }

    // RULE-16 & RULE-19: Target ADR must reside in the rule's directory or an ancestor directory
    if (!isAncestorOrSelfDir(targetScopeDir, sourceScopeDir)) {
      throw new Error(
        `Rule justification ancestry violation: RULE "${source.tag}" (scope "${sourceScopeDisplay}") cannot link to ADR "${target.tag}" (scope "${targetScopeDisplay}") because the target ADR does not reside in the rule's directory or an ancestor directory (RULE-16, RULE-19).`,
      );
    }
  } else if (source.subtype === "ADR") {
    // RULE-14: ADR frontmatter links may only target ADR or RULE artifacts
    if (target.subtype !== "ADR" && target.subtype !== "RULE") {
      throw new Error(
        `Invalid ADR link target: ADR "${source.tag}" frontmatter links may only reference ADR or RULE artifacts, got "${target.tag}" (${target.subtype}) (ADR-5, RULE-14).`,
      );
    }

    if (target.subtype === "RULE") {
      // RULE-17 & RULE-19: Target RULE must reside in the ADR's directory or a descendant subtree
      if (!isAncestorOrSelfDir(sourceScopeDir, targetScopeDir)) {
        throw new Error(
          `ADR rule scope violation: ADR "${source.tag}" (scope "${sourceScopeDisplay}") cannot link to RULE "${target.tag}" (scope "${targetScopeDisplay}") because the target RULE does not reside in the ADR's directory or a descendant subtree (RULE-17, RULE-19).`,
        );
      }
    } else {
      // ADR -> ADR: Target ADR must reside in the source ADR's directory or an ancestor directory (ADR-5, RULE-19)
      if (!isAncestorOrSelfDir(targetScopeDir, sourceScopeDir)) {
        throw new Error(
          `ADR scope violation: ADR "${source.tag}" (scope "${sourceScopeDisplay}") cannot link to ADR "${target.tag}" (scope "${targetScopeDisplay}") because the target ADR does not reside in the source ADR's directory or an ancestor directory (ADR-5, RULE-19).`,
        );
      }
    }
  } else if (source.subtype === "TASK") {
    // RULE-15: TASK frontmatter `links` may only target ADR or RULE governance artifacts
    if (target.subtype !== "ADR" && target.subtype !== "RULE") {
      throw new Error(
        `Invalid task governance link target: TASK "${source.tag}" frontmatter "links" may only reference ADR or RULE governance artifacts, got "${target.tag}" (${target.subtype}). Use "depends_on" for TASK-to-TASK dependencies (ADR-5, RULE-15, RULE-18).`,
      );
    }

    // RULE-7 & RULE-19: Target governance artifact must reside in the task's directory or an ancestor directory
    if (!isAncestorOrSelfDir(targetScopeDir, sourceScopeDir)) {
      throw new Error(
        `Task governance scope violation: TASK "${source.tag}" (scope "${sourceScopeDisplay}") cannot link to ${target.subtype} "${target.tag}" (scope "${targetScopeDisplay}") because the target governance artifact does not reside in the task's directory or an ancestor directory (RULE-7, RULE-19).`,
      );
    }
  }

  return {
    source,
    target,
    relationship,
    sourceScopeDir,
    targetScopeDir,
  };
}

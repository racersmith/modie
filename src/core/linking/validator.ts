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
import { parseCanonicalTag } from "../common/tag.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "../markdown/index.ts";
import type { ResolvedArtifact } from "../query/types.ts";
import { scanActiveTasks } from "../resolver/active-scanner.ts";
import { resolveWorkspaceContext } from "../context/resolver.ts";
import type { WorkspaceContext } from "../context/types.ts";
import { resolveSubtypeLinkPolicy } from "./policy.ts";
import type {
  ArtifactLinkRelationship,
  LinkAncestryScope,
  SubtypeLinkPolicy,
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
  cwdOrContext?: string | WorkspaceContext,
): Promise<string[] | null> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
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

import {
  ADR_LINK_TAG_REGEX,
  GOVERNANCE_LINK_TAG_REGEX,
  TASK_DEPENDENCY_TAG_REGEX,
  isValidAdrLinkTag,
  isValidGovernanceLinkTag,
  isValidTaskDependencyTag,
} from "./syntax.ts";
export {
  ADR_LINK_TAG_REGEX,
  GOVERNANCE_LINK_TAG_REGEX,
  TASK_DEPENDENCY_TAG_REGEX,
  isValidAdrLinkTag,
  isValidGovernanceLinkTag,
  isValidTaskDependencyTag,
} from "./syntax.ts";

export interface ValidateLinkTargetOptions {
  cwd?: string;
  workspace?: WorkspaceContext;
  /**
   * Canonical tag of the source artifact (e.g. "RULE-1", "TASK-5").
   * Optional because during artifact creation, the new artifact has not yet
   * been written to disk or assigned a tag. Provided during link/unlink operations
   * and task dependency validation to enforce self-reference prohibition and DAG acyclicity.
   */
  sourceTag?: string;
  /**
   * Optional declarative link policy override for the source artifact.
   */
  policy?: SubtypeLinkPolicy;
}

export interface ValidatedTargetResult {
  target: ResolvedArtifact;
  relationship: ArtifactLinkRelationship;
}

function assertNoSelfReference(
  sourceTag: string | undefined,
  targetTag: string,
): void {
  if (sourceTag && sourceTag.toUpperCase() === targetTag.trim().toUpperCase()) {
    throw new Error(
      `Self-referential link violation: artifact "${sourceTag}" cannot link to or depend on itself (ADR-5, RULE-18, RULE-36).`,
    );
  }
}

function resolveRelationship(
  normSourceSubtype: string,
  trimmedTargetTag: string,
  fieldOrRelationship?: string,
): ArtifactLinkRelationship {
  if (fieldOrRelationship === "links" || fieldOrRelationship === "depends_on") {
    return fieldOrRelationship;
  }
  return normSourceSubtype === "TASK" && trimmedTargetTag.startsWith("TASK-")
    ? "depends_on"
    : "links";
}

function assertEarlyGovernanceLinkSyntax(
  normSourceSubtype: string,
  trimmedTargetTag: string,
  targetTag: string,
): void {
  if (normSourceSubtype === "RULE" && !isValidAdrLinkTag(trimmedTargetTag)) {
    throw new Error(
      `Invalid rule link target: "${targetTag}". A RULE artifact's frontmatter links must exclusively reference ADR artifacts (RULE-13).`,
    );
  }
  if (
    normSourceSubtype === "ADR" &&
    !isValidGovernanceLinkTag(trimmedTargetTag)
  ) {
    throw new Error(
      `Invalid ADR link target: "${targetTag}". An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).`,
    );
  }
  if (
    normSourceSubtype === "TASK" &&
    !isValidGovernanceLinkTag(trimmedTargetTag)
  ) {
    throw new Error(
      `Invalid task link target: "${targetTag}". A TASK artifact's frontmatter links must exclusively reference ADR and RULE artifacts (RULE-15).`,
    );
  }
}

function assertEarlyTargetSyntax(
  normSourceSubtype: string,
  relationship: ArtifactLinkRelationship,
  trimmedTargetTag: string,
  sourceDisplayTag: string,
  targetTag: string,
): void {
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
    return;
  }

  assertEarlyGovernanceLinkSyntax(
    normSourceSubtype,
    trimmedTargetTag,
    targetTag,
  );
}

function assertSubtypeAllowed(
  normSourceSubtype: string,
  relationship: ArtifactLinkRelationship,
  target: ResolvedArtifact,
  sourceDisplayTag: string,
  allowedTargets?: Record<string, LinkAncestryScope>,
): LinkAncestryScope {
  const normTargetSubtype = target.subtype.toUpperCase();
  const constraint = allowedTargets?.[normTargetSubtype];
  if (constraint) {
    return constraint;
  }

  if (relationship === "depends_on") {
    throw new Error(
      `Invalid dependency subtype: "depends_on" is strictly restricted to TASK -> TASK relationships, got "${sourceDisplayTag}" (${normSourceSubtype}) -> "${target.tag}" (${target.subtype}) (ADR-5, RULE-18).`,
    );
  }

  if (normSourceSubtype === "RULE") {
    throw new Error(
      `Invalid rule link target: RULE "${sourceDisplayTag}" frontmatter links may only reference ADR artifacts, got "${target.tag}" (${target.subtype}) (ADR-5, RULE-13).`,
    );
  }

  if (normSourceSubtype === "ADR") {
    throw new Error(
      `Invalid ADR link target: ADR "${sourceDisplayTag}" frontmatter links may only reference ADR or RULE artifacts, got "${target.tag}" (${target.subtype}) (ADR-5, RULE-14).`,
    );
  }

  throw new Error(
    `Invalid task governance link target: TASK "${sourceDisplayTag}" frontmatter "links" may only reference ADR or RULE governance artifacts, got "${target.tag}" (${target.subtype}). Use "depends_on" for TASK-to-TASK dependencies (ADR-5, RULE-15, RULE-18).`,
  );
}

function assertAncestorScope(
  normSourceSubtype: string,
  target: ResolvedArtifact,
  sourceDisplayTag: string,
  sourceScopeDir: string,
  targetScopeDir: string,
  sourceScopeDisplay: string,
  targetScopeDisplay: string,
): void {
  if (isAncestorOrSelfDir(targetScopeDir, sourceScopeDir)) {
    return;
  }
  if (normSourceSubtype === "RULE") {
    throw new Error(
      `Rule justification ancestry violation: RULE "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to ADR "${target.tag}" (scope "${targetScopeDisplay}") because the target ADR does not reside in the rule's directory or an ancestor directory (RULE-16, RULE-19).`,
    );
  }
  if (normSourceSubtype === "ADR") {
    throw new Error(
      `ADR scope violation: ADR "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to ADR "${target.tag}" (scope "${targetScopeDisplay}") because the target ADR does not reside in the source ADR's directory or an ancestor directory (ADR-5, RULE-19).`,
    );
  }
  throw new Error(
    `Task governance scope violation: TASK "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to ${target.subtype} "${target.tag}" (scope "${targetScopeDisplay}") because the target governance artifact does not reside in the task's directory or an ancestor directory (RULE-7, RULE-19).`,
  );
}

function assertDescendantScope(
  sourceDisplayTag: string,
  target: ResolvedArtifact,
  sourceScopeDir: string,
  targetScopeDir: string,
  sourceScopeDisplay: string,
  targetScopeDisplay: string,
): void {
  if (isAncestorOrSelfDir(sourceScopeDir, targetScopeDir)) {
    return;
  }
  throw new Error(
    `ADR rule scope violation: ADR "${sourceDisplayTag}" (scope "${sourceScopeDisplay}") cannot link to RULE "${target.tag}" (scope "${targetScopeDisplay}") because the target RULE does not reside in the ADR's directory or a descendant subtree (RULE-17, RULE-19).`,
  );
}

function assertSpatialScopeConstraint(
  constraint: LinkAncestryScope,
  normSourceSubtype: string,
  sourceScopeDir: string,
  target: ResolvedArtifact,
  sourceDisplayTag: string,
  cwd: string,
): void {
  if (constraint === "acyclic" || constraint === "any") {
    return;
  }

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

  if (constraint === "descendant") {
    assertDescendantScope(
      sourceDisplayTag,
      target,
      effectiveSourceScopeDir,
      targetScopeDir,
      sourceScopeDisplay,
      targetScopeDisplay,
    );
  } else {
    assertAncestorScope(
      normSourceSubtype,
      target,
      sourceDisplayTag,
      effectiveSourceScopeDir,
      targetScopeDir,
      sourceScopeDisplay,
      targetScopeDisplay,
    );
  }
}

async function assertAcyclicConstraint(
  sourceTag: string | undefined,
  targetTag: string,
  cwd: string,
): Promise<void> {
  if (sourceTag && sourceTag.toUpperCase().startsWith("TASK-")) {
    const cycle = await detectTaskDependencyCycle(sourceTag, targetTag, cwd);
    if (cycle) {
      throw new Error(
        `Circular task dependency detected: adding dependency "${sourceTag} -> ${targetTag}" creates a cycle (${cycle.join(" -> ")}) (RULE-18).`,
      );
    }
  }
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
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const normSourceSubtype = sourceSubtype.toUpperCase();
  const trimmedTargetTag = targetTag.trim().toUpperCase();
  const sourceDisplayTag = options.sourceTag ?? normSourceSubtype;

  // 1. Prohibit self-referential links or dependencies
  assertNoSelfReference(options.sourceTag, trimmedTargetTag);

  // 2. Determine relationship field
  const relationship = resolveRelationship(
    normSourceSubtype,
    trimmedTargetTag,
    fieldOrRelationship,
  );

  // 3. Early syntax / subtype format checks before hitting filesystem
  assertEarlyTargetSyntax(
    normSourceSubtype,
    relationship,
    trimmedTargetTag,
    sourceDisplayTag,
    targetTag,
  );

  // 4. Resolve target artifact from index/disk
  const target = await resolveArtifactByTag(trimmedTargetTag, { cwd });

  // 5. Post-resolution self-reference check
  assertNoSelfReference(options.sourceTag, target.tag);

  // 6. Subtype compatibility via declarative link policy table
  const policy = resolveSubtypeLinkPolicy(normSourceSubtype, options.policy);
  const constraint = assertSubtypeAllowed(
    normSourceSubtype,
    relationship,
    target,
    sourceDisplayTag,
    policy?.[relationship],
  );

  // 7. Cycle check for acyclic dependencies
  if (constraint === "acyclic") {
    await assertAcyclicConstraint(options.sourceTag, target.tag, cwd);
    return { target, relationship };
  }

  // 8. Spatial ancestry / descendant subtree scoping
  assertSpatialScopeConstraint(
    constraint,
    normSourceSubtype,
    sourceScopeDir,
    target,
    sourceDisplayTag,
    cwd,
  );

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
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

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
      policy: options.policy,
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

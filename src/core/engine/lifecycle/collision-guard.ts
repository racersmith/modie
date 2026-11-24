/**
 * Modie Core: Pre-Merge Artifact Collision Detection Guard (RULE-1, RULE-33).
 *
 * Inspects source, target, and merge-base git trees to detect duplicate tags,
 * divergent filepaths, and filepath conflicts before task merges.
 */

import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import {
  type WorkspaceContext,
  resolveWorkspaceContext,
} from "../context/index.ts";
import { inspectGitTreeArtifacts } from "../traversal/artifact-history.ts";
import type {
  ArtifactCollision,
  DiscoveredArtifact,
} from "../../domain/index.ts";
import { ArtifactCollisionError } from "./errors.ts";

/**
 * Helper to check collisions for a single source artifact against target and base trees.
 */
function checkArtifactCollision(
  sourceArt: DiscoveredArtifact,
  targetMap: Map<string, DiscoveredArtifact>,
  baseMap: Map<string, DiscoveredArtifact>,
  targetPathMap: Map<string, DiscoveredArtifact>,
  seenCollisions: Set<string>,
): ArtifactCollision[] {
  const collisions: ArtifactCollision[] = [];
  const tagKey = sourceArt.tag.toUpperCase();
  const targetArt = targetMap.get(tagKey);
  const baseArt = baseMap.get(tagKey);

  if (targetArt) {
    if (!baseArt) {
      // Tag was created independently on both branches
      const key = `${tagKey}:${sourceArt.filepath}:${targetArt.filepath}:duplicate_tag`;
      if (!seenCollisions.has(key)) {
        seenCollisions.add(key);
        collisions.push({
          tag: sourceArt.tag,
          subtype: sourceArt.subtype,
          id: sourceArt.id,
          sourceFilepath: sourceArt.filepath,
          targetFilepath: targetArt.filepath,
          reason: "duplicate_tag",
        });
      }
    } else if (
      sourceArt.filepath !== targetArt.filepath &&
      sourceArt.filepath !== baseArt.filepath &&
      targetArt.filepath !== baseArt.filepath
    ) {
      // Artifact existed at base but filepaths diverged on both branches independently
      const key = `${tagKey}:${sourceArt.filepath}:${targetArt.filepath}:divergent_filepath`;
      if (!seenCollisions.has(key)) {
        seenCollisions.add(key);
        collisions.push({
          tag: sourceArt.tag,
          subtype: sourceArt.subtype,
          id: sourceArt.id,
          sourceFilepath: sourceArt.filepath,
          targetFilepath: targetArt.filepath,
          reason: "divergent_filepath",
        });
      }
    }
  }

  // Check for filepath collision with different tag
  const targetArtSamePath = targetPathMap.get(sourceArt.filepath);
  if (
    targetArtSamePath &&
    targetArtSamePath.tag.toUpperCase() !== sourceArt.tag.toUpperCase()
  ) {
    const key = `${sourceArt.filepath}:${sourceArt.tag}:${targetArtSamePath.tag}:filepath_conflict`;
    if (!seenCollisions.has(key)) {
      seenCollisions.add(key);
      collisions.push({
        tag: sourceArt.tag,
        subtype: sourceArt.subtype,
        id: sourceArt.id,
        sourceFilepath: sourceArt.filepath,
        targetFilepath: targetArtSamePath.filepath,
        reason: "filepath_conflict",
      });
    }
  }

  return collisions;
}

/**
 * Detects indexable artifact collisions between a source branch and a target branch prior to merge.
 * Complies with RULE-1 and RULE-33.
 */
export async function detectArtifactCollisions(
  sourceBranch: string,
  targetBranch: string,
  cwdOrContext?: string | WorkspaceContext,
  vcs?: IVcsAdapter,
): Promise<ArtifactCollision[]> {
  const ctx = resolveWorkspaceContext(cwdOrContext, vcs);
  const cwd = ctx.root;
  const effectiveVcs = ctx.vcs;

  const [sourceArtifacts, targetArtifacts] = await Promise.all([
    inspectGitTreeArtifacts(sourceBranch, ctx, undefined, effectiveVcs),
    inspectGitTreeArtifacts(targetBranch, ctx, undefined, effectiveVcs),
  ]);

  if (sourceArtifacts.length === 0 || targetArtifacts.length === 0) {
    return [];
  }

  // Find common ancestor commit between target and source branches
  const mergeBase = await effectiveVcs.mergeBase(
    targetBranch,
    sourceBranch,
    cwd,
  );

  const baseArtifacts = mergeBase
    ? await inspectGitTreeArtifacts(mergeBase, ctx, undefined, effectiveVcs)
    : [];

  const baseMap = new Map<string, DiscoveredArtifact>();
  for (const art of baseArtifacts) {
    baseMap.set(art.tag.toUpperCase(), art);
  }

  const targetMap = new Map<string, DiscoveredArtifact>();
  const targetPathMap = new Map<string, DiscoveredArtifact>();
  for (const art of targetArtifacts) {
    targetMap.set(art.tag.toUpperCase(), art);
    targetPathMap.set(art.filepath, art);
  }

  const collisions: ArtifactCollision[] = [];
  const seenCollisions = new Set<string>();

  for (const sourceArt of sourceArtifacts) {
    const artCollisions = checkArtifactCollision(
      sourceArt,
      targetMap,
      baseMap,
      targetPathMap,
      seenCollisions,
    );
    collisions.push(...artCollisions);
  }

  return collisions;
}

/**
 * Verifies that no newly introduced or renamed artifacts collide with artifacts
 * on the target branch per RULE-33.
 * Throws typed `ArtifactCollisionError` when collisions are detected unless forced.
 */
export async function assertNoCollisions(
  vcs: IVcsAdapter,
  sourceBranch: string,
  targetBranch: string,
  cwd: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (options.force) {
    return;
  }

  const collisions = await detectArtifactCollisions(
    sourceBranch,
    targetBranch,
    cwd,
    vcs,
  );

  if (collisions.length > 0) {
    const details = collisions
      .map(
        (c) =>
          `  - ${c.tag}: source "${c.sourceFilepath}" collides with target "${c.targetFilepath}" (${c.reason})`,
      )
      .join("\n");
    throw new ArtifactCollisionError(
      `Cannot merge task branch "${sourceBranch}" into "${targetBranch}": ${collisions.length} artifact collision(s) detected:\n${details}\nResolve collisions or pass --force to override.`,
      {
        sourceBranch,
        targetBranch,
        collisions,
      },
    );
  }
}

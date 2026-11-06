/**
 * Artifact history inspection across Git trees, deleted commit history, and branches.
 * Implements ADR-6, ADR-9, RULE-1, RULE-21, and RULE-33.
 */

import { basename } from "node:path";
import { parseArtifactFilename } from "../common/filename.ts";
import { asArtifactSubtype } from "../common/tag.ts";
import type { ArtifactSubtype } from "../common/types.ts";
import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type { IVcsAdapter, MultiBranchOptions } from "../vcs/types.ts";
import type { DiscoveredArtifact, IndexableSubtype } from "./types.ts";

/**
 * Inspects all active indexable artifact files tracked in a git tree ref.
 */
export async function inspectGitTreeArtifacts(
  ref: string,
  cwd: string = process.cwd(),
  subtype?: ArtifactSubtype | IndexableSubtype,
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<DiscoveredArtifact[]> {
  const lines = await vcs.listTreeFiles(ref, cwd);
  const discovered: DiscoveredArtifact[] = [];
  const targetSubtype = subtype ? asArtifactSubtype(subtype) : undefined;

  for (const line of lines) {
    const filename = basename(line);
    const parsed = parseArtifactFilename(filename);
    if (parsed) {
      if (!targetSubtype || parsed.subtype === targetSubtype) {
        discovered.push({
          id: parsed.id,
          subtype: parsed.subtype,
          tag: parsed.tag,
          slug: parsed.slug,
          filename: parsed.filename,
          filepath: line,
          isArchived: parsed.isArchived,
          status: "active",
        });
      }
    }
  }

  return discovered;
}

/**
 * Queries git commit history for deleted artifact files across reachable branches:
 * `git log --all --diff-filter=D --format= --name-only -- *.<SUBTYPE>-*.md`
 */
export async function inspectGitDeletedArtifacts(
  cwd: string = process.cwd(),
  subtype?: ArtifactSubtype | IndexableSubtype,
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<DiscoveredArtifact[]> {
  const pattern = subtype ? `*.${subtype.toString().toUpperCase()}-*.md` : "*.*-*.md";

  const lines = await vcs.listDeletedFiles(pattern, cwd);
  const activeGitLines = await vcs.listActiveTrackedFiles(pattern, cwd);
  const activeGitIds = new Set<string>();

  for (const activeLine of activeGitLines) {
    const p = parseArtifactFilename(activeLine.trim());
    if (p) {
      activeGitIds.add(p.id.toLowerCase());
    }
  }

  const discovered: DiscoveredArtifact[] = [];
  const seenPaths = new Set<string>();
  const targetSubtype = subtype ? asArtifactSubtype(subtype) : undefined;

  for (const line of lines) {
    if (seenPaths.has(line)) continue;
    seenPaths.add(line);

    const parsed = parseArtifactFilename(line);
    if (parsed) {
      if (!targetSubtype || parsed.subtype === targetSubtype) {
        if (activeGitIds.has(parsed.id.toLowerCase())) {
          continue;
        }

        discovered.push({
          id: parsed.id,
          subtype: parsed.subtype,
          tag: parsed.tag,
          slug: parsed.slug,
          filename: parsed.filename,
          filepath: line,
          isArchived: parsed.isArchived,
          status: "deleted",
        });
      }
    }
  }

  // Ensure any task explicitly completed via commit ceremony is permanently recorded as deleted (RULE-21)
  if (!targetSubtype || targetSubtype === "TASK") {
    const completedLogLines = await vcs.listLogGrep("delete completed TASK-", cwd);
    for (const msg of completedLogLines) {
      const match = msg.match(/delete completed TASK-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)/i);
      if (match && match[1]) {
        const id = match[1];
        if (!activeGitIds.has(id.toLowerCase())) {
          const tag = `TASK-${id}`;
          if (!discovered.some((d) => d.id.toLowerCase() === id.toLowerCase())) {
            discovered.push({
              id,
              subtype: "TASK" as ArtifactSubtype,
              tag,
              slug: "",
              filename: "",
              filepath: "",
              isArchived: false,
              status: "deleted",
            });
          }
        }
      }
    }
  }

  return discovered;
}

/**
 * Returns a deduplicated list of artifact IDs that were deleted in git history for a given subtype.
 */
export async function inspectGitDeletedArtifactIds(
  cwd: string = process.cwd(),
  subtype?: ArtifactSubtype | IndexableSubtype,
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string[]> {
  const artifacts = await inspectGitDeletedArtifacts(cwd, subtype, vcs);
  return Array.from(new Set(artifacts.map((a) => a.id)));
}

/**
 * Inspects active indexable artifacts across all reachable git branches.
 */
export async function inspectMultiBranchActiveArtifacts(
  cwd: string = process.cwd(),
  subtype?: ArtifactSubtype | IndexableSubtype,
  options: MultiBranchOptions = {},
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<DiscoveredArtifact[]> {
  const branches = options.branches ?? (await vcs.listBranches(cwd));
  const currentBranch = options.excludeCurrent ? await vcs.detectCurrentBranch(cwd) : null;
  const exclude = new Set<string>();
  if (options.excludeCurrent && currentBranch) {
    exclude.add(currentBranch);
  }
  if (options.excludeBranch) {
    exclude.add(options.excludeBranch);
  }

  const targetBranches = branches.filter((b) => !exclude.has(b));
  const results: DiscoveredArtifact[] = [];
  const seen = new Set<string>();

  for (const b of targetBranches) {
    const branchArtifacts = await inspectGitTreeArtifacts(b, cwd, subtype, vcs);
    for (const art of branchArtifacts) {
      const key = `${art.subtype}:${art.id.toLowerCase()}:${art.filepath}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(art);
      }
    }
  }

  return results;
}

/**
 * Returns a deduplicated list of active artifact IDs across other git branches.
 */
export async function inspectMultiBranchActiveArtifactIds(
  cwd: string = process.cwd(),
  subtype?: ArtifactSubtype | IndexableSubtype,
  options: MultiBranchOptions = {},
  vcs: IVcsAdapter = defaultVcsAdapter,
): Promise<string[]> {
  const artifacts = await inspectMultiBranchActiveArtifacts(
    cwd,
    subtype,
    options,
    vcs,
  );
  return Array.from(new Set(artifacts.map((a) => a.id)));
}


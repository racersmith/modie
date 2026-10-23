/**
 * Monotonic watermark calculation and branch-aware ID allocation.
 * Complies with RULE-1, RULE-33, ADR-1, ADR-2, ADR-6, and ADR-9.
 */

import { registerArtifactSubtype } from "../common/filename.ts";
import { scanActiveArtifactIds } from "./active-scanner.ts";
import {
  detectGitBranch,
  getGitConfigPrefix,
  inspectGitDeletedArtifactIds,
  inspectMultiBranchActiveArtifactIds,
} from "./git-inspector.ts";
import type {
  AllocationStrategy,
  IndexableSubtype,
  WatermarkDetails,
  WatermarkResolutionOptions,
} from "./types.ts";

/**
 * Regular expression matching task-specific branches:
 * `task/<parent_id>-<slug>` or `task/<parent_id>`
 * Example: `task/2-task-id-allocation-and-rule-alignment` -> parentId = "2", slug = "task-id-allocation-and-rule-alignment"
 * Example: `task/4-task-id-watermark-resolver` -> parentId = "4", slug = "task-id-watermark-resolver"
 * Example: `task/2-1-subtask` -> parentId = "2-1", slug = "subtask"
 * Example: `task/J101-auth` -> parentId = "J101", slug = "auth"
 */
const TASK_BRANCH_REGEX = /^task\/([0-9]+(?:-[0-9]+)*|[A-Za-z]+[0-9]+)(?:-(.+))?$/;

/**
 * Escapes regex special characters in dynamic strings.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses a branch name to extract the parent task ID if it is a task branch.
 */
export function parseTaskBranch(branch: string): { parentId: string; slug?: string } | null {
  const match = branch.match(TASK_BRANCH_REGEX);
  if (!match || !match[1]) {
    return null;
  }
  return {
    parentId: match[1],
    slug: match[2],
  };
}

/**
 * Resolves comprehensive watermark details and calculates the next unique, collision-free ID
 * for any indexable artifact subtype (RULE, ADR, TASK, or custom subtype).
 *
 * - For non-TASK subtypes (RULE, ADR, custom): Uses strict monotonic integer progression per RULE-1.
 * - For TASK: Follows the Hierarchical Branch & Author Namespaced Allocation Model defined in ADR-9.
 */
export async function resolveWatermark(
  options: WatermarkResolutionOptions = {},
): Promise<WatermarkDetails> {
  const cwd = options.cwd ?? process.cwd();
  const subtype: IndexableSubtype = (options.subtype?.toUpperCase() as IndexableSubtype) ?? "TASK";
  registerArtifactSubtype(subtype);

  // 1. Gather active IDs from disk (or use provided overrides for testing)
  const activeIds =
    options.activeIds !== undefined
      ? options.activeIds
      : await scanActiveArtifactIds(cwd, subtype);

  // 2. Gather active IDs from other git branches (RULE-33)
  const otherBranchActiveIds =
    options.otherBranchActiveIds !== undefined
      ? options.otherBranchActiveIds
      : (options.activeIds !== undefined
          ? []
          : await inspectMultiBranchActiveArtifactIds(cwd, subtype, { excludeCurrent: true }));

  // 3. Gather deleted IDs from Git history (or use provided overrides for testing)
  const deletedIds =
    options.deletedIds !== undefined
      ? options.deletedIds
      : await inspectGitDeletedArtifactIds(cwd, subtype);

  // 4. Aggregate all known historical and active IDs (including active on other branches)
  const allKnownIds = Array.from(new Set([...activeIds, ...otherBranchActiveIds, ...deletedIds]));
  const allKnownIdSet = new Set(allKnownIds);

  // 4. Resolve branch context
  const detectedBranch =
    options.branch !== undefined
      ? options.branch
      : (await detectGitBranch(cwd)) ?? "dev";

  // 5. Allocation Strategy: Non-TASK subtypes always follow pure monotonic progression (RULE-1)
  if (subtype !== "TASK") {
    const pureIntegerIds = allKnownIds
      .map((id) => (/^[0-9]+$/.test(id) ? parseInt(id, 10) : null))
      .filter((n): n is number => n !== null);

    const maxInt = pureIntegerIds.length > 0 ? Math.max(...pureIntegerIds) : 0;
    let candidateInt = maxInt + 1;

    while (allKnownIdSet.has(String(candidateInt))) {
      candidateInt++;
    }

    const nextId = String(candidateInt);
    const tag = `${subtype}-${nextId}`;

    return {
      nextId,
      tag,
      fullTaskId: tag,
      subtype,
      strategy: "trunk",
      activeIds,
      otherBranchActiveIds,
      deletedIds,
      branch: detectedBranch,
      sequence: candidateInt,
    };
  }

  // 6. TASK subtype branch-aware allocation strategy selection (ADR-9)
  let resolvedPrefix: string | undefined = options.prefix;
  if (!resolvedPrefix && options.gitConfigPrefix !== undefined) {
    resolvedPrefix = options.gitConfigPrefix;
  }
  if (!resolvedPrefix && !options.prefix) {
    const gitPrefix = await getGitConfigPrefix(cwd);
    if (gitPrefix) {
      resolvedPrefix = gitPrefix;
    }
  }

  let strategy: AllocationStrategy = "trunk";
  let nextId: string;
  let parentId: string | undefined;
  let sequence: number;

  const taskBranchInfo = !options.forceTrunk ? parseTaskBranch(detectedBranch) : null;

  if (!options.forceTrunk && resolvedPrefix) {
    // Strategy 3: Feature Branch & Agent/Author Namespacing (TASK-<prefix><sequence>)
    strategy = "prefixed";
    const prefixRegex = new RegExp(`^${escapeRegex(resolvedPrefix)}([0-9]+)$`, "i");

    const existingSeqs = allKnownIds
      .map((id) => {
        const match = id.match(prefixRegex);
        return match && match[1] ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null);

    const maxSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) : 0;
    let candidateSeq = maxSeq + 1;

    while (allKnownIdSet.has(`${resolvedPrefix}${candidateSeq}`)) {
      candidateSeq++;
    }

    sequence = candidateSeq;
    nextId = `${resolvedPrefix}${candidateSeq}`;
  } else if (taskBranchInfo) {
    // Strategy 2: Task Branch Sub-Task Namespacing (TASK-<parent_id>-<sequence>)
    strategy = "subtask";
    parentId = taskBranchInfo.parentId;

    const subtaskRegex = new RegExp(`^${escapeRegex(parentId)}-([0-9]+)$`);
    const existingSeqs = allKnownIds
      .map((id) => {
        const match = id.match(subtaskRegex);
        return match && match[1] ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null);

    const maxSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) : 0;
    let candidateSeq = maxSeq + 1;

    while (allKnownIdSet.has(`${parentId}-${candidateSeq}`)) {
      candidateSeq++;
    }

    sequence = candidateSeq;
    nextId = `${parentId}-${candidateSeq}`;
  } else {
    // Strategy 1: Trunk Monotonic Progression (TASK-1, TASK-2, TASK-3...)
    strategy = "trunk";

    const pureIntegerIds = allKnownIds
      .map((id) => (/^[0-9]+$/.test(id) ? parseInt(id, 10) : null))
      .filter((n): n is number => n !== null);

    const maxInt = pureIntegerIds.length > 0 ? Math.max(...pureIntegerIds) : 0;
    let candidateInt = maxInt + 1;

    while (allKnownIdSet.has(String(candidateInt))) {
      candidateInt++;
    }

    sequence = candidateInt;
    nextId = String(candidateInt);
  }

  const tag = `TASK-${nextId}`;

  return {
    nextId,
    tag,
    fullTaskId: tag,
    subtype: "TASK",
    strategy,
    activeIds,
    otherBranchActiveIds,
    deletedIds,
    branch: detectedBranch,
    parentId,
    prefix: resolvedPrefix,
    sequence,
  };
}

/**
 * Resolves the next unique ID string for a specific indexable artifact subtype.
 */
export async function resolveNextArtifactId(
  subtype: IndexableSubtype,
  options: WatermarkResolutionOptions = {},
): Promise<string> {
  const details = await resolveWatermark({ ...options, subtype });
  return details.nextId;
}

/**
 * Resolves the next unique task ID string according to the branch-aware watermark model.
 * Convenience wrapper returning strictly `nextId`.
 */
export async function resolveNextTaskId(
  options: WatermarkResolutionOptions = {},
): Promise<string> {
  return resolveNextArtifactId("TASK", options);
}

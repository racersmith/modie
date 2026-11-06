/**
 * Monotonic watermark calculation and branch-aware ID allocation.
 * Complies with RULE-1, RULE-33, ADR-1, ADR-2, ADR-6, and ADR-9.
 */

import { registerArtifactSubtype } from "../common/filename.ts";
import { scanActiveArtifactIds } from "./active-scanner.ts";
import {
  detectGitBranch,
  getGitConfigPrefix,
} from "./git-inspector.ts";
import {
  inspectGitDeletedArtifactIds,
  inspectMultiBranchActiveArtifactIds,
} from "./artifact-history.ts";
import { defaultVcsAdapter } from "../vcs/git-cli-adapter.ts";
import type {
  AllocationStrategy,
  IndexableSubtype,
  WatermarkDetails,
  WatermarkResolutionOptions,
} from "./types.ts";
import type { IVcsAdapter } from "../vcs/types.ts";
import { escapeRegex, parseTaskBranch } from "../common/index.ts";

export interface SequenceAllocationOptions {
  match: RegExp;
  format: (n: number) => string;
}

export class SequenceAllocation {
  constructor(
    public readonly sequence: number,
    public readonly id: string,
  ) {}

  toString(): string {
    return this.id;
  }
}

/**
 * Reusable sequence calculator that extracts matching sequence integers from known IDs,
 * finds the maximum existing sequence, computes max + 1, and advances past any ID collisions.
 */
export function nextSequence(
  knownIds: Iterable<string>,
  options: SequenceAllocationOptions,
): SequenceAllocation {
  const knownSet = knownIds instanceof Set ? knownIds : new Set(knownIds);
  const existingSeqs: number[] = [];

  for (const id of knownIds) {
    const match = id.match(options.match);
    if (match) {
      const captured = match[1] !== undefined ? match[1] : match[0];
      const parsed = parseInt(captured, 10);
      if (!Number.isNaN(parsed)) {
        existingSeqs.push(parsed);
      }
    }
  }

  const maxSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) : 0;
  let candidateSeq = maxSeq + 1;

  while (knownSet.has(options.format(candidateSeq))) {
    candidateSeq++;
  }

  return new SequenceAllocation(candidateSeq, options.format(candidateSeq));
}

export interface AllocationStrategyResult {
  strategy: AllocationStrategy;
  nextId: string;
  sequence: number;
  parentId?: string;
  prefix?: string;
}

export const trunkAllocationStrategy = {
  allocate(knownIds: Iterable<string>): AllocationStrategyResult {
    const alloc = nextSequence(knownIds, {
      match: /^[0-9]+$/,
      format: (n) => String(n),
    });
    return {
      strategy: "trunk",
      nextId: alloc.id,
      sequence: alloc.sequence,
    };
  },
};

export const subtaskAllocationStrategy = {
  allocate(
    knownIds: Iterable<string>,
    parentId: string,
  ): AllocationStrategyResult {
    const alloc = nextSequence(knownIds, {
      match: new RegExp(`^${escapeRegex(parentId)}-([0-9]+)$`),
      format: (n) => `${parentId}-${n}`,
    });
    return {
      strategy: "subtask",
      nextId: alloc.id,
      sequence: alloc.sequence,
      parentId,
    };
  },
};

export const prefixedAllocationStrategy = {
  allocate(
    knownIds: Iterable<string>,
    prefix: string,
  ): AllocationStrategyResult {
    const alloc = nextSequence(knownIds, {
      match: new RegExp(`^${escapeRegex(prefix)}([0-9]+)$`, "i"),
      format: (n) => `${prefix}${n}`,
    });
    return {
      strategy: "prefixed",
      nextId: alloc.id,
      sequence: alloc.sequence,
      prefix,
    };
  },
};

export function allocateTaskStrategy(
  knownIds: Iterable<string>,
  options: {
    forceTrunk?: boolean;
    prefix?: string;
    taskBranchInfo?: { parentId: string } | null;
  },
): AllocationStrategyResult {
  if (!options.forceTrunk && options.prefix) {
    return prefixedAllocationStrategy.allocate(knownIds, options.prefix);
  }
  if (!options.forceTrunk && options.taskBranchInfo) {
    return subtaskAllocationStrategy.allocate(
      knownIds,
      options.taskBranchInfo.parentId,
    );
  }
  return trunkAllocationStrategy.allocate(knownIds);
}

async function gatherKnownArtifactIds(
  cwd: string,
  subtype: IndexableSubtype,
  options: WatermarkResolutionOptions,
  vcs: IVcsAdapter,
) {
  const activeIds =
    options.activeIds !== undefined
      ? options.activeIds
      : await scanActiveArtifactIds(cwd, subtype);

  const otherBranchActiveIds =
    options.otherBranchActiveIds !== undefined
      ? options.otherBranchActiveIds
      : options.activeIds !== undefined
        ? []
        : await inspectMultiBranchActiveArtifactIds(
            cwd,
            subtype,
            { excludeCurrent: true },
            vcs,
          );

  const deletedIds =
    options.deletedIds !== undefined
      ? options.deletedIds
      : await inspectGitDeletedArtifactIds(cwd, subtype, vcs);

  const allKnownIds = Array.from(
    new Set([...activeIds, ...otherBranchActiveIds, ...deletedIds]),
  );

  return { activeIds, otherBranchActiveIds, deletedIds, allKnownIds };
}

async function resolveTaskPrefix(
  options: WatermarkResolutionOptions,
  cwd: string,
  vcs: IVcsAdapter,
): Promise<string | undefined> {
  if (options.prefix) {
    return options.prefix;
  }
  if (options.gitConfigPrefix !== undefined) {
    return options.gitConfigPrefix || undefined;
  }
  const gitPrefix = await getGitConfigPrefix(cwd, vcs);
  return gitPrefix || undefined;
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
  const vcs = options.vcs ?? defaultVcsAdapter;
  const subtype: IndexableSubtype =
    (options.subtype?.toUpperCase() as IndexableSubtype) ?? "TASK";
  registerArtifactSubtype(subtype);

  const { activeIds, otherBranchActiveIds, deletedIds, allKnownIds } =
    await gatherKnownArtifactIds(cwd, subtype, options, vcs);

  const branch =
    options.branch !== undefined
      ? options.branch
      : ((await detectGitBranch(cwd, vcs)) ?? "dev");

  if (subtype !== "TASK") {
    const alloc = trunkAllocationStrategy.allocate(allKnownIds);
    const tag = `${subtype}-${alloc.nextId}`;

    return {
      nextId: alloc.nextId,
      tag,
      fullTaskId: tag,
      subtype,
      strategy: "trunk",
      activeIds,
      otherBranchActiveIds,
      deletedIds,
      branch,
      sequence: alloc.sequence,
    };
  }

  const prefix = await resolveTaskPrefix(options, cwd, vcs);
  const taskBranchInfo = !options.forceTrunk ? parseTaskBranch(branch) : null;
  const alloc = allocateTaskStrategy(allKnownIds, {
    forceTrunk: options.forceTrunk,
    prefix,
    taskBranchInfo,
  });

  const tag = `TASK-${alloc.nextId}`;

  return {
    nextId: alloc.nextId,
    tag,
    fullTaskId: tag,
    subtype: "TASK",
    strategy: alloc.strategy,
    activeIds,
    otherBranchActiveIds,
    deletedIds,
    branch,
    parentId: alloc.parentId,
    prefix: alloc.prefix,
    sequence: alloc.sequence,
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

/**
 * Historical task reconstruction and multi-branch task queue querying.
 * Implements RULE-21 and RULE-28.
 */

import { isAbsolute, relative, resolve } from "node:path";
import {
  compareTaskIds,
  parseTaskBranch,
  parseTaskIdFromBranch,
  parseTaskMarkdown,
  taskKey,
  type DiscoveredArtifact,
} from "../../domain/index.ts";
import { scanActiveArtifacts } from "../traversal/active-scanner.ts";
import { detectGitBranch, listGitBranches } from "../traversal/git-inspector.ts";
import {
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifacts,
} from "../traversal/artifact-history.ts";
import { resolveWorkspaceContext } from "../context/resolver.ts";
import type { WorkspaceContext } from "../context/types.ts";
import type { IVcsAdapter } from "../../platform/vcs/types.ts";
import { toTaskQueueItem, type TaskQueueItem } from "./readiness.ts";

export interface HistoricalTaskEntry {
  id: string;
  slug: string;
  relativePath: string;
  isDeleted: boolean;
  branch?: string;
}

export type TaskBranchInfoMap = Map<
  string,
  { branch: string; id: string; slug: string }
>;

/**
 * Builds a lookup map from normalized task ID to branch metadata.
 */
export function buildTaskBranchMap(branches: string[]): TaskBranchInfoMap {
  const branchMap = new Map<
    string,
    { branch: string; id: string; slug: string }
  >();
  for (const b of branches) {
    const parsed = parseTaskBranch(b);
    if (parsed && parsed.slug) {
      branchMap.set(taskKey(parsed.taskId), {
        branch: b,
        id: parsed.taskId,
        slug: parsed.slug,
      });
    }
  }
  return branchMap;
}

/**
 * Collects tasks active on other Git branches into the historical entries map.
 */
export function collectBranchTasks(
  branchArtifacts: DiscoveredArtifact[],
  activeDiskIds: Set<string>,
  branchMap: TaskBranchInfoMap,
  cwd: string,
  entriesById: Map<string, HistoricalTaskEntry>,
): void {
  for (const art of branchArtifacts) {
    const normId = taskKey(art.id);
    if (activeDiskIds.has(normId)) continue;
    const branchInfo = branchMap.get(normId);
    const relPath = isAbsolute(art.filepath)
      ? relative(cwd, art.filepath)
      : art.filepath;
    entriesById.set(normId, {
      id: art.id,
      slug: art.slug || branchInfo?.slug || `task-${art.id.toLowerCase()}`,
      relativePath: relPath,
      isDeleted: false,
      branch: branchInfo?.branch,
    });
  }
}

function resolveDeletedTaskRelativePath(
  filepath: string | undefined,
  cwd: string,
  fallbackFilename: string,
  existingRelPath?: string,
): string {
  if (filepath) {
    return isAbsolute(filepath) ? relative(cwd, filepath) : filepath;
  }
  return existingRelPath || `.modie/tasks/${fallbackFilename}`;
}

/**
 * Collects completed/deleted tasks from Git history into the historical entries map.
 */
export function collectDeletedTasks(
  deletedArtifacts: DiscoveredArtifact[],
  activeDiskIds: Set<string>,
  branchMap: TaskBranchInfoMap,
  cwd: string,
  entriesById: Map<string, HistoricalTaskEntry>,
): void {
  for (const del of deletedArtifacts) {
    const normId = taskKey(del.id);
    if (activeDiskIds.has(normId)) continue;
    const existing = entriesById.get(normId);
    const branchInfo = branchMap.get(normId);
    const slug =
      del.slug ||
      existing?.slug ||
      branchInfo?.slug ||
      `task-${del.id.toLowerCase()}`;
    const filename = del.filename || `${slug}.TASK-${del.id}.md`;
    const relPath = resolveDeletedTaskRelativePath(
      del.filepath,
      cwd,
      filename,
      existing?.relativePath,
    );

    entriesById.set(normId, {
      id: del.id,
      slug,
      relativePath: relPath,
      isDeleted: true,
      branch: branchInfo?.branch ?? existing?.branch,
    });
  }
}

/**
 * Collects any remaining task branches not yet represented into the historical entries map.
 */
export function collectBranchOnlyTasks(
  branchMap: TaskBranchInfoMap,
  activeDiskIds: Set<string>,
  entriesById: Map<string, HistoricalTaskEntry>,
): void {
  for (const [normId, info] of branchMap.entries()) {
    if (activeDiskIds.has(normId) || entriesById.has(normId)) continue;
    const filename = `${info.slug}.TASK-${info.id}.md`;
    entriesById.set(normId, {
      id: info.id,
      slug: info.slug,
      relativePath: `.modie/tasks/${filename}`,
      isDeleted: true,
      branch: info.branch,
    });
  }
}

async function readHistoricalTaskMarkdown(
  entry: HistoricalTaskEntry,
  cwd: string,
  vcs: IVcsAdapter,
): Promise<string | null> {
  if (!entry.isDeleted && entry.branch && entry.relativePath) {
    const fromBranch = await vcs.readFileAtRef(
      entry.branch,
      entry.relativePath,
      cwd,
    );
    if (fromBranch) {
      return fromBranch;
    }
  }

  if (entry.relativePath) {
    return await vcs.readDeletedFile(entry.relativePath, cwd);
  }

  return null;
}

/**
 * Queries completed tasks in Git deletion history and tasks on other Git branches per RULE-21.
 */
export async function queryTaskHistory(
  options: {
    cwd?: string;
    vcs?: IVcsAdapter;
    workspace?: WorkspaceContext;
  } = {},
): Promise<TaskQueueItem[]> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;

  const [
    activeOnDisk,
    deletedArtifacts,
    branchArtifacts,
    localBranches,
    currentBranch,
  ] = await Promise.all([
    scanActiveArtifacts(cwd, "TASK").then((arts) =>
      arts.filter((a) => !a.isArchived),
    ),
    inspectGitDeletedArtifacts(cwd, "TASK", vcs),
    inspectMultiBranchActiveArtifacts(
      cwd,
      "TASK",
      { excludeCurrent: true },
      vcs,
    ),
    listGitBranches(cwd, vcs),
    detectGitBranch(cwd, vcs),
  ]);

  const activeDiskIds = new Set(activeOnDisk.map((t) => taskKey(t.id)));

  const currentTaskId = currentBranch
    ? parseTaskIdFromBranch(currentBranch)
    : null;
  const normCurrentId = currentTaskId ? taskKey(currentTaskId) : null;
  const branchMap = buildTaskBranchMap(localBranches);

  const entriesById = new Map<string, HistoricalTaskEntry>();
  collectBranchTasks(
    branchArtifacts,
    activeDiskIds,
    branchMap,
    cwd,
    entriesById,
  );
  collectDeletedTasks(
    deletedArtifacts,
    activeDiskIds,
    branchMap,
    cwd,
    entriesById,
  );
  collectBranchOnlyTasks(branchMap, activeDiskIds, entriesById);

  const items: TaskQueueItem[] = [];

  for (const [normId, entry] of entriesById.entries()) {
    const rawMarkdown = await readHistoricalTaskMarkdown(entry, cwd, vcs);
    const parsed = rawMarkdown
      ? parseTaskMarkdown(rawMarkdown, entry.relativePath)
      : undefined;

    items.push(
      toTaskQueueItem({
        id: entry.id,
        slug: entry.slug,
        filepath: resolve(cwd, entry.relativePath),
        relativePath: entry.relativePath,
        summary: parsed?.summary,
        context: parsed?.contextSection,
        depends_on: parsed?.depends_on,
        links: parsed?.links,
        acceptanceCriteria: parsed?.acceptanceCriteria,
        readiness: entry.isDeleted ? "COMPLETED" : "READY",
        blockedBy: [],
        isCurrent: Boolean(normCurrentId && normId === normCurrentId),
        isHistorical: true,
        branch: entry.branch,
        isDeleted: entry.isDeleted,
      }),
    );
  }

  items.sort((a, b) => compareTaskIds(a.id, b.id));
  return items;
}

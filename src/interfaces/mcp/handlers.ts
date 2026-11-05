/**
 * Domain handlers for the 11 singular Modie MCP tools.
 * Exclusively consumes pure domain logic from src/core/ public API (RULE-25).
 * Implements token economy and progressive disclosure (RULE-26).
 */

import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  archiveArtifact,
  checkTaskItem,
  completeTask,
  createAdr,
  createRule,
  createTask,
  detectGitBranch,
  findArtifactReferences,
  getArtifactDetails,
  getTaskStatus,
  linkArtifact,
  mergeTaskBranch,
  normalizeTaskId,
  parseTaskIdFromBranch,
  readDirectoryGist,
  readFileGist,
  startTaskBranch,
  toPosixRelative,
  type ArtifactDetails,
  type ArtifactReferencesResult,
  type TaskStatusDetails,
} from "../../core/index.ts";
import { McpToolError } from "./errors.ts";
import {
  extractGistSummary,
  renderArtifactMarkdown,
  renderDirectoryListing,
  renderTaskMissionBrief,
} from "./renderers.ts";
import type {
  ArchiveArtifactInput,
  ArchiveArtifactOutput,
  CheckCriteriaInput,
  CheckCriteriaOutput,
  CompleteTaskInput,
  CompleteTaskOutput,
  CreateAdrInput,
  CreateArtifactOutput,
  CreateRuleInput,
  CreateTaskInput,
  LinkArtifactsInput,
  LinkArtifactsOutput,
  LsBetterInput,
  ReadArtifactInput,
  StartTaskInput,
  TaskContextInput,
} from "./schemas.ts";

/**
 * Resolves the active task ID from an explicit argument or falls back to the current Git branch.
 */
export async function resolveActiveTaskId(
  explicitId: string | undefined,
  cwd: string,
): Promise<string> {
  if (explicitId && explicitId.trim().length > 0) {
    return normalizeTaskId(explicitId.trim());
  }
  const branch = await detectGitBranch(cwd);
  if (branch) {
    const fromBranch = parseTaskIdFromBranch(branch);
    if (fromBranch) {
      return normalizeTaskId(fromBranch);
    }
  }
  throw McpToolError.invalidParameter({
    message: `No task_id specified and active Git branch "${branch ?? "unknown"}" is not a task branch.`,
    parameter: "task_id",
    tool: "start_task",
    suggestedParameters: { task_id: "<TASK_ID>" },
  });
}

// ============================================================================
// Cluster 1: Spatial & Artifact Exploration Handlers
// ============================================================================

/**
 * 1. ls_better handler
 * Plaintext tab-separated directory listing (<file|dir/>\t<gist>\n) with GISTs.
 */
export async function handleLsBetter(
  args: LsBetterInput,
  cwd: string,
): Promise<string> {
  let targetPath = args.path?.trim();
  if (!targetPath) {
    try {
      const branch = await detectGitBranch(cwd);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, { cwd });
          targetPath = status.relativePath
            ? dirname(status.relativePath).replace(/\/\.modie\/tasks$/, "") ||
              "."
            : ".";
        }
      }
    } catch {}
  }
  targetPath = targetPath || ".";

  const resolvedDir = resolve(cwd, targetPath);
  let dirEntries;
  try {
    dirEntries = await readdir(resolvedDir, { withFileTypes: true });
  } catch (err: any) {
    throw McpToolError.invalidParameter({
      message: `Failed to inspect path "${targetPath}": ${err?.message ?? "Directory not found"}`,
      parameter: "path",
      tool: "ls_better",
    });
  }

  // Filter out hidden / internal directories (.git, .modie)
  const visibleEntries = dirEntries.filter((e) => !e.name.startsWith("."));
  visibleEntries.sort((a, b) => a.name.localeCompare(b.name));

  const entriesWithGists: Array<{
    name: string;
    isDirectory: boolean;
    gist?: string | null;
  }> = [];

  for (const entry of visibleEntries) {
    const isDir = entry.isDirectory();
    let gist: string | null = null;
    if (isDir) {
      try {
        const childPath =
          targetPath === "." ? entry.name : join(targetPath, entry.name);
        const dirGist = await readDirectoryGist(childPath, cwd);
        if (dirGist?.content) {
          gist = extractGistSummary(dirGist.content);
        }
      } catch {}
    } else if (entry.isFile()) {
      try {
        const fileGist = await readFileGist(targetPath, entry.name, cwd);
        if (fileGist?.content) {
          gist = extractGistSummary(fileGist.content);
        }
      } catch {}
    }

    entriesWithGists.push({
      name: entry.name,
      isDirectory: isDir,
      gist,
    });
  }

  const relDisplayPath = toPosixRelative(cwd, resolvedDir);
  const displayHeader = relDisplayPath === "" ? "." : relDisplayPath;

  return renderDirectoryListing(displayHeader, entriesWithGists);
}

/**
 * 2. read_artifact handler
 * Inspects any governance artifact tag and returns unescaped Markdown with an appendix.
 */
export async function handleReadArtifact(
  args: ReadArtifactInput,
  cwd: string,
): Promise<string> {
  const tag = args.tag.trim();
  let details: ArtifactDetails;
  try {
    details = await getArtifactDetails(tag, { cwd });
  } catch (err: any) {
    throw McpToolError.artifactNotFound({
      message: err?.message ?? `Artifact "${tag}" was not found.`,
      identifier: tag,
    });
  }

  let references: ArtifactReferencesResult | null = null;
  try {
    references = await findArtifactReferences(details.tag, { cwd });
  } catch {
    // Graceful fallback if reference discovery fails
  }

  return renderArtifactMarkdown(details, references, cwd);
}

/**
 * 3. task_context handler
 * Returns the actionable Markdown Mission Brief for the active or requested task.
 */
export async function handleTaskContext(
  args: TaskContextInput,
  cwd: string,
): Promise<string> {
  const taskId = await resolveActiveTaskId(args.task_id, cwd);
  let status: TaskStatusDetails;
  try {
    status = await getTaskStatus(taskId, { cwd });
  } catch (err: any) {
    throw McpToolError.artifactNotFound({
      message: err?.message ?? `Task "${taskId}" was not found.`,
      identifier: taskId,
    });
  }

  const activeBranch = await detectGitBranch(cwd);
  return renderTaskMissionBrief(status, activeBranch, cwd);
}

// ============================================================================
// Cluster 2: Task Lifecycle State Machine Handlers
// ============================================================================

/**
 * 4. start_task handler
 * Checks out or creates hierarchical task branch and returns the Markdown Mission Brief.
 */
export async function handleStartTask(
  args: StartTaskInput,
  cwd: string,
): Promise<string> {
  const taskId = await resolveActiveTaskId(args.task_id, cwd);
  try {
    await startTaskBranch(taskId, { cwd });
  } catch (err: any) {
    throw McpToolError.invalidParameter({
      message: `Failed to start task "${taskId}": ${err?.message}`,
      parameter: "task_id",
      tool: "start_task",
    });
  }

  let status: TaskStatusDetails;
  try {
    status = await getTaskStatus(taskId, { cwd });
  } catch (err: any) {
    throw McpToolError.artifactNotFound({
      message: err?.message ?? `Task "${taskId}" was not found.`,
      identifier: taskId,
    });
  }

  const activeBranch = await detectGitBranch(cwd);
  return renderTaskMissionBrief(status, activeBranch, cwd);
}

/**
 * 5. check_criteria handler
 * Atomically marks one or more acceptance criteria complete or incomplete.
 */
export async function handleCheckCriteria(
  args: CheckCriteriaInput,
  cwd: string,
): Promise<CheckCriteriaOutput> {
  const taskId = await resolveActiveTaskId(args.task_id, cwd);

  for (const itemIndex of args.items) {
    try {
      await checkTaskItem(taskId, itemIndex, {
        completed: !args.uncheck,
        cwd,
      });
    } catch (err: any) {
      throw McpToolError.invalidParameter({
        message: `Failed to check criteria item ${itemIndex} on task "${taskId}": ${err?.message}`,
        parameter: "items",
        tool: "check_criteria",
      });
    }
  }

  const status = await getTaskStatus(taskId, { cwd });
  const acceptanceCriteria = (status.acceptanceCriteria ?? []).map((c, i) => ({
    item: i + 1,
    text: c.text,
    completed: c.completed,
  }));

  return {
    taskId: status.fullTaskId || `TASK-${status.id}`,
    checkedItems: args.items,
    progress: status.criteriaProgress,
    allCriteriaSatisfied: status.allCriteriaSatisfied,
    acceptanceCriteria,
  };
}

/**
 * 6. complete_task handler
 * Verifies criteria, executes two-phase commit ceremony, merges to trunk, and deletes task branch.
 */
export async function handleCompleteTask(
  args: CompleteTaskInput,
  cwd: string,
): Promise<CompleteTaskOutput> {
  const taskId = await resolveActiveTaskId(args.task_id, cwd);

  // 1. Complete task (verifies criteria, two-phase commit, deletes task artifact)
  const completeResult = await completeTask(taskId, {
    commit: true,
    cwd,
  });

  // 2. Merge task branch to trunk and delete task branch
  const mergeResult = await mergeTaskBranch(taskId, {
    cwd,
  });

  return {
    taskId: `TASK-${completeResult.taskId}`,
    merged: true,
    targetBranch: mergeResult.targetBranch,
    deletedBranch: mergeResult.sourceBranch,
    message: `Completed TASK-${completeResult.taskId} and merged ${mergeResult.sourceBranch} into ${mergeResult.targetBranch}.`,
  };
}

// ============================================================================
// Cluster 3: Dedicated Artifact Authoring Handlers
// ============================================================================

/**
 * 7. create_rule handler
 */
export async function handleCreateRule(
  args: CreateRuleInput,
  cwd: string,
): Promise<CreateArtifactOutput> {
  let resolvedScopeDir = args.scope_dir;
  if (!resolvedScopeDir || resolvedScopeDir === ".") {
    try {
      const branch = await detectGitBranch(cwd);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, { cwd });
          resolvedScopeDir = status.relativePath
            ? dirname(status.relativePath).replace(/\/\.modie\/tasks$/, "") ||
              "."
            : ".";
        }
      }
    } catch {}
  }
  resolvedScopeDir = resolvedScopeDir || ".";

  const res = await createRule({
    title: args.title,
    assertion: args.invariant,
    links: args.links,
    scopeDir: resolvedScopeDir,
    supersedes: args.supersedes,
    cwd,
  });

  const artifactObj = (res as any).artifact ?? {};
  return {
    tag: res.tag,
    kind: "RULE",
    filepath: res.filepath,
    relativePath: res.relativePath,
    scope: resolvedScopeDir,
    validatedLinks: artifactObj.links ?? args.links ?? [],
  };
}

/**
 * 8. create_adr handler
 */
export async function handleCreateAdr(
  args: CreateAdrInput,
  cwd: string,
): Promise<CreateArtifactOutput> {
  let resolvedScopeDir = args.scope_dir;
  if (!resolvedScopeDir || resolvedScopeDir === ".") {
    try {
      const branch = await detectGitBranch(cwd);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, { cwd });
          resolvedScopeDir = status.relativePath
            ? dirname(status.relativePath).replace(/\/\.modie\/tasks$/, "") ||
              "."
            : ".";
        }
      }
    } catch {}
  }
  resolvedScopeDir = resolvedScopeDir || ".";

  const res = await createAdr({
    title: args.title,
    decision: args.decision,
    context: args.context,
    consequences: args.consequences,
    summary: args.title,
    links: args.links,
    scopeDir: resolvedScopeDir,
    supersedes: args.supersedes,
    cwd,
  });

  const artifactObj = (res as any).artifact ?? {};
  return {
    tag: res.tag,
    kind: "ADR",
    filepath: res.filepath,
    relativePath: res.relativePath,
    scope: resolvedScopeDir,
    validatedLinks: artifactObj.links ?? args.links ?? [],
  };
}

/**
 * 9. create_task handler
 */
export async function handleCreateTask(
  args: CreateTaskInput,
  cwd: string,
): Promise<CreateArtifactOutput> {
  const criteria = [...args.acceptance_criteria];
  if (!criteria.some((c) => /user review/i.test(c))) {
    criteria.push("User Review");
  }

  const res = await createTask({
    title: args.title,
    context: args.context,
    acceptanceCriteria: criteria,
    depends_on: args.depends_on,
    links: args.links,
    scopeDir: args.scope_dir || ".",
    cwd,
  });

  return {
    tag: res.tag,
    kind: "TASK",
    filepath: res.filepath,
    relativePath: res.relativePath,
    scope: args.scope_dir || ".",
    validatedLinks: args.links ?? [],
  };
}

// ============================================================================
// Cluster 4: Graph Mutation Handlers
// ============================================================================

/**
 * 10. link_artifacts handler
 */
export async function handleLinkArtifacts(
  args: LinkArtifactsInput,
  cwd: string,
): Promise<LinkArtifactsOutput> {
  let sourceTag = args.source?.trim();
  if (!sourceTag) {
    const taskId = await resolveActiveTaskId(undefined, cwd);
    sourceTag = taskId.startsWith("TASK-") ? taskId : `TASK-${taskId}`;
  }

  const added: string[] = [];
  let relationship = "links";

  for (const target of args.targets) {
    const result = await linkArtifact({
      source: sourceTag,
      target,
      cwd,
    });
    relationship = result.relationship;
    if (result.changed) {
      added.push(result.target.tag);
    }
  }

  return {
    source: sourceTag,
    targets: args.targets,
    relationship,
    added,
  };
}

/**
 * 11. archive_artifact handler
 */
export async function handleArchiveArtifact(
  args: ArchiveArtifactInput,
  cwd: string,
): Promise<ArchiveArtifactOutput> {
  const result = await archiveArtifact({
    tag: args.tag,
    cwd,
  });

  return {
    tag: result.tag,
    archivedPath: result.archivedRelativePath || result.archivedFilepath,
    reason: args.reason,
  };
}

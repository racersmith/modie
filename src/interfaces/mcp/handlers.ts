/**
 * Domain handlers for the 12 singular Modie MCP tools.
 * Exclusively consumes pure domain logic from src/core/ public API (RULE-25).
 * Implements token economy and progressive disclosure (RULE-26).
 */

import { dirname } from "node:path";
import {
  archiveArtifact,
  checkTaskItem,
  completeTask,
  compileContext,
  createAdr,
  createMotive,
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
  resolveWorkspaceContext,
  sparkAdd,
  startTaskBranch,
  toPosixRelative,
  type ArtifactDetails,
  type ArtifactReferencesResult,
  type CompiledContextResult,
  type TaskStatusDetails,
  type WorkspaceContext,
} from "../../core/index.ts";
import { McpToolError } from "./errors.ts";
import {
  renderArtifactMarkdown,
  renderDirectoryContext,
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
  CreateMotiveInput,
  CreateMotiveOutput,
  CreateRuleInput,
  CreateTaskInput,
  DirectoryContextInput,
  LinkArtifactsInput,
  LinkArtifactsOutput,
  ReadArtifactInput,
  SparkAddMcpInput,
  SparkAddOutput,
  StartTaskInput,
  TaskContextInput,
} from "./schemas.ts";

/**
 * Resolves the active task ID from an explicit argument or falls back to the current Git branch.
 */
export async function resolveActiveTaskId(
  explicitId: string | undefined,
  cwdOrContext?: string | WorkspaceContext,
): Promise<string> {
  if (explicitId && explicitId.trim().length > 0) {
    return normalizeTaskId(explicitId.trim());
  }
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const branch = await detectGitBranch(ctx);
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
 * 1. directory_context handler
 * On-demand architectural context for directory exploration with child directory motives.
 */
export async function handleDirectoryContext(
  args: DirectoryContextInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<string> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  let targetPath = args.path?.trim();
  if (!targetPath) {
    try {
      const branch = await detectGitBranch(ctx);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, {
            cwd,
            workspace: ctx,
          });
          targetPath = status.relativePath
            ? dirname(status.relativePath).replace(/\/\.modie\/tasks$/, "") ||
              "."
            : ".";
        }
      }
    } catch {}
  }
  targetPath = targetPath || ".";

  const mode = args.mode ?? "summary";

  let compiled: CompiledContextResult;
  try {
    compiled = await compileContext(targetPath, {
      cwd,
      workspace: ctx,
    });
  } catch (err: any) {
    throw McpToolError.invalidParameter({
      message: `Failed to inspect directory context for "${targetPath}": ${err?.message ?? "Invalid path"}`,
      parameter: "path",
      tool: "directory_context",
    });
  }

  return renderDirectoryContext(compiled, mode);
}

/**
 * 2. read_artifact handler
 * Inspects any governance artifact tag and returns unescaped Markdown with an appendix.
 */
export async function handleReadArtifact(
  args: ReadArtifactInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<string> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const tag = args.tag.trim();
  let details: ArtifactDetails;
  try {
    details = await getArtifactDetails(tag, {
      cwd,
      workspace: ctx,
    });
  } catch (err: any) {
    throw McpToolError.artifactNotFound({
      message: err?.message ?? `Artifact "${tag}" was not found.`,
      identifier: tag,
    });
  }

  let references: ArtifactReferencesResult | null = null;
  try {
    references = await findArtifactReferences(details.tag, {
      cwd,
      workspace: ctx,
    });
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
  cwdOrContext?: string | WorkspaceContext,
): Promise<string> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const taskId = await resolveActiveTaskId(args.task_id, ctx);
  let status: TaskStatusDetails;
  try {
    status = await getTaskStatus(taskId, {
      cwd,
      workspace: ctx,
    });
  } catch (err: any) {
    throw McpToolError.artifactNotFound({
      message: err?.message ?? `Task "${taskId}" was not found.`,
      identifier: taskId,
    });
  }

  const activeBranch = await detectGitBranch(ctx);
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
  cwdOrContext?: string | WorkspaceContext,
): Promise<string> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const taskId = await resolveActiveTaskId(args.task_id, ctx);
  try {
    await startTaskBranch(taskId, {
      cwd,
      workspace: ctx,
    });
  } catch (err: any) {
    throw McpToolError.invalidParameter({
      message: `Failed to start task "${taskId}": ${err?.message}`,
      parameter: "task_id",
      tool: "start_task",
    });
  }

  let status: TaskStatusDetails;
  try {
    status = await getTaskStatus(taskId, {
      cwd,
      workspace: ctx,
    });
  } catch (err: any) {
    throw McpToolError.artifactNotFound({
      message: err?.message ?? `Task "${taskId}" was not found.`,
      identifier: taskId,
    });
  }

  const activeBranch = await detectGitBranch(ctx);
  return renderTaskMissionBrief(status, activeBranch, cwd);
}

/**
 * 5. check_criteria handler
 * Atomically marks one or more acceptance criteria complete or incomplete.
 */
export async function handleCheckCriteria(
  args: CheckCriteriaInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<CheckCriteriaOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const taskId = await resolveActiveTaskId(args.task_id, ctx);

  for (const itemIndex of args.items) {
    try {
      await checkTaskItem(taskId, itemIndex, {
        completed: !args.uncheck,
        cwd,
        workspace: ctx,
      });
    } catch (err: any) {
      throw McpToolError.invalidParameter({
        message: `Failed to check criteria item ${itemIndex} on task "${taskId}": ${err?.message}`,
        parameter: "items",
        tool: "check_criteria",
      });
    }
  }

  const status = await getTaskStatus(taskId, {
    cwd,
    workspace: ctx,
  });
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
  cwdOrContext?: string | WorkspaceContext,
): Promise<CompleteTaskOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const taskId = await resolveActiveTaskId(args.task_id, ctx);

  // 1. Complete task (verifies criteria, two-phase commit, deletes task artifact)
  const completeResult = await completeTask(taskId, {
    commit: true,
    cwd,
    workspace: ctx,
  });

  // 2. Merge task branch to trunk and delete task branch
  const mergeResult = await mergeTaskBranch(taskId, {
    cwd,
    workspace: ctx,
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
  cwdOrContext?: string | WorkspaceContext,
): Promise<CreateArtifactOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  let resolvedScopeDir = args.scope_dir;
  if (!resolvedScopeDir || resolvedScopeDir === ".") {
    try {
      const branch = await detectGitBranch(ctx);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, {
            cwd,
            workspace: ctx,
          });
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
    workspace: ctx,
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
  cwdOrContext?: string | WorkspaceContext,
): Promise<CreateArtifactOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  let resolvedScopeDir = args.scope_dir;
  if (!resolvedScopeDir || resolvedScopeDir === ".") {
    try {
      const branch = await detectGitBranch(ctx);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, {
            cwd,
            workspace: ctx,
          });
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
    contextSection: args.context,
    consequences: args.consequences,
    summary: args.title,
    links: args.links,
    scopeDir: resolvedScopeDir,
    supersedes: args.supersedes,
    cwd,
    workspace: ctx,
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
  cwdOrContext?: string | WorkspaceContext,
): Promise<CreateArtifactOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const criteria = [...args.acceptance_criteria];
  if (!criteria.some((c) => /user review/i.test(c))) {
    criteria.push("User Review");
  }

  const res = await createTask({
    title: args.title,
    summary: args.summary,
    contextSection: args.context,
    acceptanceCriteria: criteria,
    depends_on: args.depends_on,
    links: args.links,
    scopeDir: args.scope_dir || ".",
    cwd,
    workspace: ctx,
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

/**
 * 10. create_motive handler
 */
export async function handleCreateMotive(
  args: CreateMotiveInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<CreateMotiveOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  let resolvedScopeDir = (args.scope_dir ?? args.scope)?.trim();
  if (!resolvedScopeDir || resolvedScopeDir === ".") {
    try {
      const branch = await detectGitBranch(ctx);
      if (branch) {
        const fromBranch = parseTaskIdFromBranch(branch);
        if (fromBranch) {
          const status = await getTaskStatus(fromBranch, {
            cwd,
            workspace: ctx,
          });
          resolvedScopeDir = status.relativePath
            ? dirname(status.relativePath).replace(/\/\.modie\/tasks$/, "") ||
              "."
            : ".";
        }
      }
    } catch {}
  }
  resolvedScopeDir = resolvedScopeDir || ".";

  const res = await createMotive({
    scopeDir: resolvedScopeDir,
    content: args.content ?? args.context,
    overwrite: args.overwrite,
    cwd,
    workspace: ctx,
  });

  return {
    kind: "MOTIVE",
    scope: res.scope,
    filename: res.filename,
    filepath: res.filepath,
    relativePath: res.relativePath,
    overwritten: res.overwritten,
    scaffolded: res.scaffolded,
  };
}

// ============================================================================
// Cluster 4: Graph Mutation Handlers
// ============================================================================

/**
 * 11. link_artifacts handler
 */
export async function handleLinkArtifacts(
  args: LinkArtifactsInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<LinkArtifactsOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  let sourceTag = args.source?.trim();
  if (!sourceTag) {
    const taskId = await resolveActiveTaskId(undefined, ctx);
    sourceTag = taskId.startsWith("TASK-") ? taskId : `TASK-${taskId}`;
  }

  const added: string[] = [];
  let relationship = "links";

  for (const target of args.targets) {
    const result = await linkArtifact({
      source: sourceTag,
      target,
      cwd,
      workspace: ctx,
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
 * 12. archive_artifact handler
 */
export async function handleArchiveArtifact(
  args: ArchiveArtifactInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<ArchiveArtifactOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const result = await archiveArtifact({
    tag: args.tag,
    cwd,
    workspace: ctx,
  });

  return {
    tag: result.tag,
    archivedPath: result.archivedRelativePath || result.archivedFilepath,
    reason: args.reason,
  };
}

/**
 * 13. spark_add handler
 */
export async function handleSparkAdd(
  args: SparkAddMcpInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<SparkAddOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;

  const result = await sparkAdd({
    title: args.title,
    body: args.body,
    handle: args.handle,
    cwd,
  });

  return {
    handle: result.spark.handle!,
    title: result.spark.title,
    relativePath: toPosixRelative(cwd, result.filepath),
  };
}

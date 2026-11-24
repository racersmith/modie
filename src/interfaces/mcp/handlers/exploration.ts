/**
 * Cluster 1: Spatial & Artifact Exploration MCP Tool Handlers.
 * Implements RULE-25 and RULE-26.
 */

import {
  compileContext,
  detectGitBranch,
  findArtifactReferences,
  getArtifactDetails,
  getTaskStatus,
  resolveWorkspaceContext,
  type ArtifactDetails,
  type ArtifactReferencesResult,
  type CompiledContextResult,
  type TaskStatusDetails,
  type WorkspaceContext,
} from "../../../core/index.ts";
import { McpToolError } from "../errors.ts";
import {
  renderArtifactMarkdown,
  renderDirectoryContext,
  renderTaskMissionBrief,
} from "../renderers/index.ts";
import type {
  DirectoryContextInput,
  ReadArtifactInput,
  TaskContextInput,
} from "../schemas.ts";
import { resolveActiveTaskId, resolveDefaultScopeDir } from "./shared.ts";

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
  const targetPath = await resolveDefaultScopeDir(args.path, ctx, {
    inferWhenDot: false,
  });
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

/**
 * Cluster 4: Graph Mutation & Spark Incubation MCP Tool Handlers.
 * Implements RULE-25 and RULE-26.
 */

import {
  archiveArtifact,
  linkArtifact,
  resolveWorkspaceContext,
  sparkAdd,
  toPosixRelative,
  type WorkspaceContext,
} from "../../../core/index.ts";
import type {
  ArchiveArtifactInput,
  ArchiveArtifactOutput,
  LinkArtifactsInput,
  LinkArtifactsOutput,
  SparkAddMcpInput,
  SparkAddOutput,
} from "../schemas.ts";
import { resolveActiveTaskId } from "./shared.ts";

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

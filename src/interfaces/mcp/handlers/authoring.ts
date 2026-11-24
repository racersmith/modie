/**
 * Cluster 3: Dedicated Artifact Authoring MCP Tool Handlers.
 * Implements RULE-25 and RULE-26.
 */

import {
  createAdr,
  createMotive,
  createRule,
  createTask,
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "../../../core/index.ts";
import type {
  CreateAdrInput,
  CreateArtifactOutput,
  CreateMotiveInput,
  CreateMotiveOutput,
  CreateRuleInput,
  CreateTaskInput,
} from "../schemas.ts";
import { resolveDefaultScopeDir } from "./shared.ts";

/**
 * 7. create_rule handler
 */
export async function handleCreateRule(
  args: CreateRuleInput,
  cwdOrContext?: string | WorkspaceContext,
): Promise<CreateArtifactOutput> {
  const ctx = resolveWorkspaceContext(cwdOrContext);
  const cwd = ctx.root;
  const resolvedScopeDir = await resolveDefaultScopeDir(args.scope_dir, ctx, {
    inferWhenDot: true,
  });

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
  const resolvedScopeDir = await resolveDefaultScopeDir(args.scope_dir, ctx, {
    inferWhenDot: true,
  });

  const res = await createAdr({
    title: args.title,
    decision: args.decision,
    contextSection: args.context,
    consequences: args.consequences,
    summary: args.title,
    links: args.links,
    scopeDir: resolvedScopeDir,
    supersedes: args.supersedes,
    force: args.force,
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
  const resolvedScopeDir = await resolveDefaultScopeDir(
    args.scope_dir ?? args.scope,
    ctx,
    { inferWhenDot: true },
  );

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

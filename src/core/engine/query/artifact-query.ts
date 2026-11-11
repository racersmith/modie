/**
 * Single-artifact resolution and deep inspection domain service.
 * Implements RULE-1, RULE-21, RULE-25, RULE-26, and RULE-29.
 */

import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  parseArtifactFilename,
  parseCanonicalTag,
  parseTaskBranch,
  resolveGoverningScope,
  slugToTitle,
  toPosixRelative,
  type IndexableSubtype,
  type TaskAcceptanceCriteriaItem,
} from "../../domain/index.ts";
import { buildArtifactParseContext } from "../../platform/markdown/index.ts";
import { resolveWorkspaceContext } from "../context/resolver.ts";
import { scanActiveArtifacts } from "../traversal/active-scanner.ts";
import { listGitBranches } from "../traversal/git-inspector.ts";
import {
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifacts,
} from "../traversal/artifact-history.ts";
import type {
  ArtifactDetails,
  ResolveArtifactOptions,
  ResolvedArtifact,
} from "./types.ts";

export type {
  ArtifactDetails,
  ResolveArtifactOptions,
  ResolvedArtifact,
} from "./types.ts";

interface ArtifactLookupContext {
  cwd: string;
  options: ResolveArtifactOptions;
}

interface ArtifactHit {
  tag: string;
  subtype: IndexableSubtype;
  id: string;
  slug: string;
  filename: string;
  filepath: string;
  relativePath?: string;
  isArchived: boolean;
  isHistorical?: boolean;
}

type ArtifactLookupStrategy = (
  ident: string,
  ctx: ArtifactLookupContext,
) => Promise<ArtifactHit | null>;

async function resolveArtifactHitSummary(
  hit: ArtifactHit,
  ctx: ArtifactLookupContext,
): Promise<string | undefined> {
  if (hit.isHistorical) {
    return undefined;
  }
  const workspaceCtx = resolveWorkspaceContext(ctx.options);
  const definition = workspaceCtx.registry.get(hit.subtype);
  if (!definition?.parse) {
    return undefined;
  }
  try {
    const rawContent = await readFile(hit.filepath, "utf8");
    const parseContext = buildArtifactParseContext(rawContent, {
      id: hit.id,
      slug: hit.slug,
      filepath: hit.filepath,
      filename: hit.filename,
    });
    const parsed = definition.parse(parseContext);
    return parsed?.summary;
  } catch {
    return slugToTitle(hit.slug);
  }
}

async function byExistingPath(
  ident: string,
  ctx: ArtifactLookupContext,
): Promise<ArtifactHit | null> {
  const candidatePath = isAbsolute(ident) ? ident : resolve(ctx.cwd, ident);
  const workspaceCtx = resolveWorkspaceContext(ctx.options);
  const parsedFromPath = parseArtifactFilename(
    candidatePath,
    workspaceCtx.registry,
  );
  if (!parsedFromPath) {
    return null;
  }
  try {
    const fileStat = await stat(candidatePath);
    if (!fileStat.isFile()) {
      return null;
    }
    return {
      tag: parsedFromPath.tag,
      subtype: parsedFromPath.subtype,
      id: parsedFromPath.id,
      slug: parsedFromPath.slug,
      filename: parsedFromPath.filename,
      filepath: candidatePath,
      relativePath: toPosixRelative(ctx.cwd, candidatePath),
      isArchived: parsedFromPath.isArchived,
      isHistorical: false,
    };
  } catch {
    return null;
  }
}

async function byWorkspaceScan(
  ident: string,
  ctx: ArtifactLookupContext,
): Promise<ArtifactHit | null> {
  const workspaceCtx = resolveWorkspaceContext(ctx.options);
  const tagInfo = parseCanonicalTag(ident, workspaceCtx.registry);
  const targetTag = tagInfo?.tag.toUpperCase();
  const targetSubtype = tagInfo?.subtype ?? ctx.options.subtype;
  const artifacts = await scanActiveArtifacts(workspaceCtx, targetSubtype);

  let matches = artifacts.filter((a) => {
    if (targetTag) {
      return a.tag.toUpperCase() === targetTag;
    }
    return (
      a.filename.toLowerCase() === ident.toLowerCase() ||
      a.slug.toLowerCase() === ident.toLowerCase()
    );
  });

  if (matches.length === 0) {
    return null;
  }

  if (ctx.options.includeArchived === false) {
    const nonArchived = matches.filter((a) => !a.isArchived);
    if (nonArchived.length > 0) {
      matches = nonArchived;
    }
  }

  const activeMatch = matches.find((a) => !a.isArchived);
  const selected = activeMatch ?? matches[0]!;

  return {
    tag: selected.tag,
    subtype: selected.subtype,
    id: selected.id,
    slug: selected.slug,
    filename: selected.filename,
    filepath: selected.filepath,
    relativePath: toPosixRelative(ctx.cwd, selected.filepath),
    isArchived: selected.isArchived,
    isHistorical: false,
  };
}

async function byHistory(
  ident: string,
  ctx: ArtifactLookupContext,
): Promise<ArtifactHit | null> {
  const tagInfo = parseCanonicalTag(ident);
  const targetTag = tagInfo?.tag.toUpperCase();
  const targetSubtype = tagInfo?.subtype ?? ctx.options.subtype;

  const [deletedArtifacts, branchArtifacts] = await Promise.all([
    inspectGitDeletedArtifacts(ctx.cwd, targetSubtype, ctx.options.vcs),
    inspectMultiBranchActiveArtifacts(
      ctx.cwd,
      targetSubtype,
      { excludeCurrent: true },
      ctx.options.vcs,
    ),
  ]);

  const historicalCandidates = [...branchArtifacts, ...deletedArtifacts];

  if (!targetSubtype || targetSubtype === "TASK") {
    const branches = await listGitBranches(ctx.cwd, ctx.options.vcs);
    for (const b of branches) {
      const branchMatch = parseTaskBranch(b);
      if (branchMatch?.slug) {
        const bId = branchMatch.taskId;
        const bSlug = branchMatch.slug;
        const bTag = `TASK-${bId}`;
        if (
          !historicalCandidates.some(
            (c) => c.tag.toUpperCase() === bTag.toUpperCase() && c.filepath,
          )
        ) {
          const bFilename = `${bSlug}.${bTag}.md`;
          historicalCandidates.push({
            id: bId,
            subtype: "TASK",
            tag: bTag,
            slug: bSlug,
            filename: bFilename,
            filepath: `.modie/tasks/${bFilename}`,
            isArchived: false,
            status: "deleted",
          });
        }
      }
    }
  }

  const histMatches = historicalCandidates.filter((a) => {
    if (targetTag) {
      return a.tag.toUpperCase() === targetTag;
    }
    return (
      (a.filename && a.filename.toLowerCase() === ident.toLowerCase()) ||
      (a.slug && a.slug.toLowerCase() === ident.toLowerCase())
    );
  });

  const withPath = histMatches.find((a) => Boolean(a.filepath));
  const selectedHist = withPath ?? histMatches[0];
  if (!selectedHist) {
    return null;
  }

  const slug = selectedHist.slug || `task-${selectedHist.id.toLowerCase()}`;
  const filename = selectedHist.filename || `${slug}.${selectedHist.tag}.md`;
  const relPath = selectedHist.filepath
    ? isAbsolute(selectedHist.filepath)
      ? toPosixRelative(ctx.cwd, selectedHist.filepath)
      : selectedHist.filepath
    : `.modie/${selectedHist.subtype.toLowerCase()}s/${filename}`;
  const absPath = isAbsolute(selectedHist.filepath)
    ? selectedHist.filepath
    : resolve(ctx.cwd, relPath);

  return {
    tag: selectedHist.tag,
    subtype: selectedHist.subtype,
    id: selectedHist.id,
    slug,
    filename,
    filepath: absPath,
    relativePath: relPath.replace(/\\/g, "/"),
    isArchived: selectedHist.isArchived,
    isHistorical: true,
  };
}

async function toResolvedArtifact(
  hit: ArtifactHit,
  ctx: ArtifactLookupContext,
): Promise<ResolvedArtifact> {
  const scope = resolveGoverningScope(hit.filepath, ctx.cwd).relativeScope;
  const relativePath =
    hit.relativePath ?? toPosixRelative(ctx.cwd, hit.filepath);
  const summary = await resolveArtifactHitSummary(hit, ctx);

  return {
    tag: hit.tag,
    subtype: hit.subtype,
    id: hit.id,
    slug: hit.slug,
    filename: hit.filename,
    filepath: hit.filepath,
    relativePath,
    scope,
    isArchived: hit.isArchived,
    ...(hit.isHistorical ? { isHistorical: true } : {}),
    ...(summary ? { summary } : {}),
  };
}

/**
 * Resolves an indexable artifact (RULE, ADR, or TASK) by its canonical tag,
 * filename, or filepath across the repository workspace.
 *
 * Uses an extensible strategy chain:
 * 1. Direct path lookup on disk (`byExistingPath`)
 * 2. Active/archived workspace file scan (`byWorkspaceScan`)
 * 3. Git deletion logs and branches (`byHistory` when `options.history` is true)
 *
 * @throws Error if the artifact is not found or identifier is empty.
 */
export async function resolveArtifactByTag(
  tagOrIdentifier: string,
  options: ResolveArtifactOptions = {},
): Promise<ResolvedArtifact> {
  const workspaceCtx = resolveWorkspaceContext(options);
  const cwd = workspaceCtx.root;
  const trimmed = tagOrIdentifier.trim();

  if (!trimmed) {
    throw new Error("Artifact identifier must not be empty.");
  }

  const ctx: ArtifactLookupContext = { cwd, options };
  const strategies: ArtifactLookupStrategy[] = [
    byExistingPath,
    byWorkspaceScan,
    ...(options.history ? [byHistory] : []),
  ];

  for (const strategy of strategies) {
    const hit = await strategy(trimmed, ctx);
    if (hit) {
      return toResolvedArtifact(hit, ctx);
    }
  }

  const tagInfo = parseCanonicalTag(trimmed, workspaceCtx.registry);
  const targetSubtype = tagInfo?.subtype ?? options.subtype;
  const subtypeLabel = targetSubtype ? ` ${targetSubtype}` : "";
  throw new Error(
    `Artifact "${trimmed}" was not found across active or archived${subtypeLabel} artifacts on disk.`,
  );
}

/**
 * Loads, parses, and inspects an indexable artifact by canonical tag, filename, or path.
 * Returns detailed structured metadata, links, depends_on, and section contents.
 */
export async function getArtifactDetails(
  tagOrIdentifier: string,
  options: ResolveArtifactOptions = {},
): Promise<ArtifactDetails> {
  const ctx = resolveWorkspaceContext(options);
  const resolved = await resolveArtifactByTag(tagOrIdentifier, options);
  const rawContent = await readFile(resolved.filepath, "utf8");

  const context = buildArtifactParseContext(rawContent, {
    id: resolved.id,
    slug: resolved.slug,
    filepath: resolved.filepath,
    filename: resolved.filename,
  });

  const {
    links,
    depends_on,
    supersedes,
    superseded_by,
    summary: fmSummary,
  } = context.frontmatterFields;
  const sections = context.sections;

  const definition = ctx.registry.get(resolved.subtype);
  const parsedSubtypeArtifact = definition?.parse
    ? definition.parse(context)
    : undefined;

  const summary =
    parsedSubtypeArtifact?.summary ?? fmSummary ?? resolved.summary;
  const contextSection =
    parsedSubtypeArtifact?.contextSection ??
    sections["Context"];
  const acceptanceCriteria: TaskAcceptanceCriteriaItem[] | undefined =
    parsedSubtypeArtifact?.acceptanceCriteria;

  return {
    ...resolved,
    ...(parsedSubtypeArtifact?.title
      ? { title: parsedSubtypeArtifact.title }
      : context.title
        ? { title: context.title }
        : {}),
    ...(summary ? { summary } : {}),
    links: parsedSubtypeArtifact?.links ?? links,
    depends_on: parsedSubtypeArtifact?.depends_on ?? depends_on,
    ...(parsedSubtypeArtifact?.supersedes || supersedes
      ? { supersedes: parsedSubtypeArtifact?.supersedes ?? supersedes }
      : {}),
    ...(parsedSubtypeArtifact?.superseded_by || superseded_by
      ? { superseded_by: parsedSubtypeArtifact?.superseded_by ?? superseded_by }
      : {}),
    body: context.body,
    rawContent,
    context: contextSection,
    sections,
    acceptanceCriteria,
    ...(parsedSubtypeArtifact?.assertion
      ? { assertion: parsedSubtypeArtifact.assertion }
      : {}),
    ...(parsedSubtypeArtifact?.alternatives
      ? { alternatives: parsedSubtypeArtifact.alternatives }
      : {}),
    ...(parsedSubtypeArtifact?.decision
      ? { decision: parsedSubtypeArtifact.decision }
      : {}),
    ...(parsedSubtypeArtifact?.consequences
      ? { consequences: parsedSubtypeArtifact.consequences }
      : {}),
  };
}

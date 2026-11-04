/**
 * Single-artifact resolution and deep inspection domain service.
 * Implements ADR-1, ADR-2, ADR-6, RULE-1, RULE-21, RULE-25, RULE-26, and RULE-29.
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { extractAdrSummary } from "../adr/summary.ts";
import { resolveGoverningScope } from "../common/directories.ts";
import { parseArtifactFilename } from "../common/filename.ts";
import {
  parseTaskBranch,
  slugToTitle,
  toPosixRelative,
} from "../common/index.ts";
import type { IndexableSubtype } from "../common/types.ts";
import {
  buildArtifactParseContext,
  getArtifactDefinition,
} from "../pipeline/create.ts";
import { scanActiveArtifacts } from "../resolver/active-scanner.ts";
import {
  inspectGitDeletedArtifacts,
  inspectMultiBranchActiveArtifacts,
  listGitBranches,
} from "../resolver/git-inspector.ts";
import type { TaskAcceptanceCriteriaItem } from "../task/types.ts";
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

/**
 * Parses a raw tag string into its canonical subtype and ID components.
 * Examples: "RULE-29" -> { subtype: "RULE", id: "29", tag: "RULE-29" }
 *           "adr-6" -> { subtype: "ADR", id: "6", tag: "ADR-6" }
 *           "task-12" -> { subtype: "TASK", id: "12", tag: "TASK-12" }
 */
export function parseCanonicalTag(
  raw: string,
): { subtype: IndexableSubtype; id: string; tag: string } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(RULE|ADR|TASK)-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)$/i,
  );
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  const subtype = match[1].toUpperCase() as IndexableSubtype;
  const id = match[2];
  const tag = `${subtype}-${id}`;
  return { subtype, id, tag };
}

/**
 * Resolves the governing codebase directory scope relative to cwd (RULE-8, RULE-12).
 * Returns the directory containing the artifact's .modie container relative to workspace root.
 */
function computeArtifactScope(
  filepath: string,
  _subtype: IndexableSubtype,
  cwd: string,
): string {
  return resolveGoverningScope(filepath, cwd).relativeScope;
}

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

async function resolveAdrSummary(
  filepath: string,
  slug: string,
): Promise<string> {
  try {
    const rawContent = await readFile(filepath, "utf8");
    return extractAdrSummary(rawContent, slug);
  } catch {
    return slugToTitle(slug);
  }
}

async function byExistingPath(
  ident: string,
  ctx: ArtifactLookupContext,
): Promise<ArtifactHit | null> {
  const candidatePath = isAbsolute(ident) ? ident : resolve(ctx.cwd, ident);
  const parsedFromPath = parseArtifactFilename(candidatePath);
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
  const tagInfo = parseCanonicalTag(ident);
  const targetTag = tagInfo?.tag.toUpperCase();
  const targetSubtype = tagInfo?.subtype ?? ctx.options.subtype;
  const artifacts = await scanActiveArtifacts(ctx.cwd, targetSubtype);

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
  const scope = computeArtifactScope(hit.filepath, hit.subtype, ctx.cwd);
  const relativePath =
    hit.relativePath ?? toPosixRelative(ctx.cwd, hit.filepath);
  let summary: string | undefined;

  if (hit.subtype === "ADR" && !hit.isHistorical) {
    summary = await resolveAdrSummary(hit.filepath, hit.slug);
  }

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
  const cwd = options.cwd ?? process.cwd();
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

  const tagInfo = parseCanonicalTag(trimmed);
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

  const definition = getArtifactDefinition(resolved.subtype);
  const parsedSubtypeArtifact = definition?.parse
    ? definition.parse(context)
    : undefined;

  const summary =
    resolved.subtype === "ADR"
      ? (parsedSubtypeArtifact?.summary ??
          extractAdrSummary(rawContent, resolved.slug))
      : fmSummary;
  const contextSection = parsedSubtypeArtifact?.context ?? sections["Context"];
  const acceptanceCriteria: TaskAcceptanceCriteriaItem[] | undefined =
    resolved.subtype === "TASK"
      ? parsedSubtypeArtifact?.acceptanceCriteria
      : undefined;
  const plannedGovernance =
    resolved.subtype === "TASK"
      ? parsedSubtypeArtifact?.plannedGovernance
      : undefined;

  return {
    ...resolved,
    ...(summary ? { summary } : {}),
    links,
    depends_on,
    ...(supersedes ? { supersedes } : {}),
    ...(superseded_by ? { superseded_by } : {}),
    body: context.body,
    rawContent,
    context: contextSection,
    sections,
    acceptanceCriteria,
    ...(plannedGovernance ? { plannedGovernance } : {}),
  };
}

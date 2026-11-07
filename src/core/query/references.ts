/**
 * Artifact reference discovery and subtype-agnostic archival guard pipeline orchestrator.
 * Implements ADR-4, ADR-5, RULE-13, RULE-14, RULE-15, RULE-25, RULE-27, and RULE-31.
 */

import { basename, resolve } from "node:path";
import { parseArtifactFilename } from "../common/filename.ts";
import { resolveWorkspaceContext } from "../context.ts";
import { getArtifactDetails } from "./artifact-query.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
} from "../markdown/index.ts";
import {
  type CitationMatch,
  type CitationSource,
  type CitationSourceOptions,
  DEFAULT_IGNORED_DIRECTORIES,
  FsWalkSource,
  GitGrepSource,
} from "./citation-source.ts";
import {
  classifyCitation,
  getGovernanceArtifactData,
  type GovernanceArtifactCache,
} from "./citation-classifier.ts";
import type {
  ArchivalGuardResult,
  ArtifactDetails,
  ArtifactFoundIn,
  ArtifactLinksTo,
  ArtifactReferencesResult,
  FindArtifactReferencesOptions,
  FoundInItem,
  ResolvedArtifact,
} from "./types.ts";

export * from "./citation-source.ts";
export * from "./citation-classifier.ts";

/**
 * Pure function that extracts and normalizes all outbound declared links,
 * dependencies, and supersession relationships from an artifact.
 */
export function buildLinksTo(
  details: Pick<ArtifactDetails, "links"> & Partial<ArtifactDetails>,
): ArtifactLinksTo {
  const adrs: string[] = [];
  const rules: string[] = [];
  const tasks: string[] = [];
  const supersedes: string[] = [];
  let superseded_by: string | undefined;

  for (const link of details.links ?? []) {
    const upper = link.toUpperCase().trim();
    if (upper.startsWith("ADR-")) {
      adrs.push(upper);
    } else if (upper.startsWith("RULE-")) {
      rules.push(upper);
    } else if (upper.startsWith("TASK-")) {
      tasks.push(upper);
    }
  }

  if (details.depends_on) {
    for (const dep of details.depends_on) {
      const upper = dep.toUpperCase().trim();
      const normalized = upper.startsWith("TASK-") ? upper : `TASK-${upper}`;
      if (!tasks.includes(normalized)) {
        tasks.push(normalized);
      }
    }
  }

  // Parse supersedes / superseded_by from raw content if not directly provided
  let parsedTargetFm: Record<string, any> = {};
  if (details.rawContent) {
    const { frontmatter: targetFrontmatter } = splitMarkdownFrontmatter(
      details.rawContent,
    );
    parsedTargetFm = parseFrontmatterFields(targetFrontmatter);
  }

  const supersedesItems = details.supersedes ?? parsedTargetFm.supersedes ?? [];
  supersedes.push(...supersedesItems);

  const supersededByItems =
    details.superseded_by ?? parsedTargetFm.superseded_by ?? [];
  if (supersededByItems.length > 0) {
    superseded_by = supersededByItems[0];
  }

  const uniqueAdrs = Array.from(new Set(adrs));
  const uniqueRules = Array.from(new Set(rules));
  const uniqueTasks = Array.from(new Set(tasks));
  const uniqueSupersedes = Array.from(new Set(supersedes));

  return {
    adrs: uniqueAdrs,
    rules: uniqueRules,
    tasks: uniqueTasks,
    supersedes: uniqueSupersedes,
    superseded_by,
    total:
      uniqueAdrs.length +
      uniqueRules.length +
      uniqueTasks.length +
      uniqueSupersedes.length +
      (superseded_by ? 1 : 0),
  };
}

/**
 * Pure function evaluating archival safety per RULE-31.
 * An artifact can be safely archived only when zero active, non-archived governance
 * artifacts maintain active links to its tag.
 */
export function evaluateArchivalGuard(
  governanceLinks: FoundInItem[],
  targetTag: string,
): ArchivalGuardResult {
  const blockingLinks = governanceLinks.filter((item) => item.isBlocking);
  const blockingReasons: string[] = blockingLinks.map((item) => {
    const tagDisplay = item.sourceTag ?? "Artifact";
    const rel = item.relationship ? ` (${item.relationship})` : "";
    return `Active artifact ${tagDisplay}${rel} maintains link to ${targetTag} at ${item.relativePath}:${item.line}`;
  });

  return {
    canArchive: blockingLinks.length === 0,
    blockingReasons,
    blockingCount: blockingLinks.length,
  };
}

function extractTargetArtifact(details: ArtifactDetails): ResolvedArtifact {
  return {
    tag: details.tag,
    subtype: details.subtype,
    id: details.id,
    slug: details.slug,
    filename: details.filename,
    filepath: details.filepath,
    relativePath: details.relativePath,
    scope: details.scope,
    isArchived: details.isArchived,
  };
}

/**
 * Discovers and classifies all citations of an artifact tag across the workspace ("Found In")
 * and extracts all declared outbound links ("Links To").
 *
 * Implements subtype-agnostic archival safety evaluation per RULE-31.
 */
export async function findArtifactReferences(
  tagOrIdentifier: string,
  options: FindArtifactReferencesOptions = {},
): Promise<ArtifactReferencesResult> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const vcs = ctx.vcs;
  const ignoredDirs = options.ignoredDirectories
    ? new Set(options.ignoredDirectories)
    : DEFAULT_IGNORED_DIRECTORIES;

  // 1. Resolve target artifact details & outbound declared links
  const details = await getArtifactDetails(tagOrIdentifier, {
    cwd,
    workspace: ctx,
  });
  const targetTag = details.tag.toUpperCase();
  const targetFilepath = resolve(cwd, details.filepath);
  const linksTo = buildLinksTo(details);

  // 2. Select citation discovery source and collect match tokens
  const sourceOptions: CitationSourceOptions = {
    cwd,
    targetFilepath,
    ignoredDirectories: ignoredDirs,
  };

  const gitSource = new GitGrepSource(vcs);
  const source: CitationSource = (await gitSource.isAvailable(cwd))
    ? gitSource
    : new FsWalkSource();

  let matches: CitationMatch[];
  try {
    matches = await source.scan(targetTag, sourceOptions);
  } catch {
    matches = await new FsWalkSource().scan(targetTag, sourceOptions);
  }

  // 3. Classify matches into categorized collections
  const govCache: GovernanceArtifactCache = new Map();
  const governanceLinks: FoundInItem[] = [];
  const governanceProse: FoundInItem[] = [];
  const code: FoundInItem[] = [];
  const tests: FoundInItem[] = [];
  const documentation: FoundInItem[] = [];

  for (const match of matches) {
    const fullPath = match.filepath ?? resolve(cwd, match.relPath);
    const fileName = basename(match.relPath);
    if (parseArtifactFilename(fileName)) {
      await getGovernanceArtifactData(fullPath, fileName, targetTag, govCache);
    }

    const item = classifyCitation(match, targetTag, govCache);
    if (!item) continue;

    if (item.type === "governance-link") governanceLinks.push(item);
    else if (item.type === "governance-prose") governanceProse.push(item);
    else if (item.type === "code") code.push(item);
    else if (item.type === "test") tests.push(item);
    else if (item.type === "documentation") documentation.push(item);
  }

  const foundIn: ArtifactFoundIn = {
    governanceLinks,
    governanceProse,
    code,
    tests,
    documentation,
    total:
      governanceLinks.length +
      governanceProse.length +
      code.length +
      tests.length +
      documentation.length,
  };

  // 4. Evaluate subtype-agnostic archival guard (RULE-31)
  const archivalGuard = evaluateArchivalGuard(governanceLinks, targetTag);

  return {
    target: extractTargetArtifact(details),
    linksTo,
    foundIn,
    archivalGuard,
  };
}

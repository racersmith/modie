/**
/**
 * Artifact Least-Scope Placement and Relocation Auditing Engine Service.
 * Implements RULE-6, RULE-8, RULE-12, RULE-16, RULE-17, and ADR-10.
 */

import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  findDeepestCommonAncestor,
  getSubtypeContainerName,
  parseArtifactFilename,
  parseCanonicalTag,
  resolveGoverningScope,
  toPosixRelative,
} from "../../domain/index.ts";
import { resolveWorkspaceContext } from "../context/index.ts";
import { scanActiveArtifacts } from "../traversal/active-scanner.ts";
import { resolveArtifactByTag } from "./artifact-query.ts";
import { findArtifactReferences } from "./references.ts";
import type {
  ArtifactPlacementAuditReport,
  ArtifactPlacementStatus,
  ArtifactPlacementSuggestion,
  AuditPlacementOptions,
  ResolvedArtifact,
} from "./types.ts";

/**
 * Extracts distinct referencing file paths for an artifact from its references graph.
 * For RULE artifacts: extracts source code, test suites, and active linking tasks.
 * For ADR artifacts: extracts active rules linking to the ADR (per RULE-16/17),
 * with fallbacks to other active governance links and citations.
 */
export function extractReferencingFilepaths(
  artifact: Pick<ResolvedArtifact, "subtype">,
  references: Awaited<ReturnType<typeof findArtifactReferences>>,
): string[] {
  const filepaths = new Set<string>();

  if (artifact.subtype.toUpperCase() === "RULE") {
    // 1. Source code citing the rule
    for (const item of references.foundIn.code) {
      if (item.filepath) filepaths.add(item.filepath);
    }
    // 2. Test suites verifying the rule
    for (const item of references.foundIn.tests) {
      if (item.filepath) filepaths.add(item.filepath);
    }
    // 3. Active governance links (tasks linking to the rule)
    for (const item of references.foundIn.governanceLinks) {
      if (
        item.filepath &&
        !item.isArchived &&
        item.sourceTag?.toUpperCase().startsWith("TASK-")
      ) {
        filepaths.add(item.filepath);
      }
    }
  } else if (artifact.subtype.toUpperCase() === "ADR") {
    // 1. Active rules citing the ADR (per RULE-16 & RULE-17)
    for (const item of references.foundIn.governanceLinks) {
      if (
        item.filepath &&
        !item.isArchived &&
        item.sourceTag?.toUpperCase().startsWith("RULE-")
      ) {
        filepaths.add(item.filepath);
      }
    }

    // 2. Other active ADRs linking to this ADR
    for (const item of references.foundIn.governanceLinks) {
      if (
        item.filepath &&
        !item.isArchived &&
        item.sourceTag?.toUpperCase().startsWith("ADR-")
      ) {
        filepaths.add(item.filepath);
      }
    }

    // 3. Fallback: if no active rules or ADRs link to it, check tasks and code
    if (filepaths.size === 0) {
      for (const item of references.foundIn.governanceLinks) {
        if (item.filepath && !item.isArchived) {
          filepaths.add(item.filepath);
        }
      }
      for (const item of references.foundIn.code) {
        if (item.filepath) filepaths.add(item.filepath);
      }
      for (const item of references.foundIn.tests) {
        if (item.filepath) filepaths.add(item.filepath);
      }
    }
  }

  return Array.from(filepaths);
}

/**
 * Normalizes a referencing file path to its architectural directory.
 * If the file is inside a .modie container, normalizes to the enclosing directory <dir>.
 * For arbitrary code/test files, returns dirname(absPath).
 */
export function normalizeReferencingDir(filepath: string, cwd: string): string {
  const abs = resolve(cwd, filepath);
  const segments = abs.split("/");
  const containerIdx = segments.indexOf(".modie");
  if (containerIdx !== -1) {
    return segments.slice(0, containerIdx).join("/") || "/";
  }
  return dirname(abs);
}

/**
 * Pure evaluation function computing placement status and recommended scope for an artifact.
 */
export function evaluateArtifactPlacement(
  artifact: ResolvedArtifact,
  referencingFilepaths: string[],
  options: {
    cwd: string;
    minCitationsThreshold?: number;
  },
): ArtifactPlacementSuggestion {
  const cwd = options.cwd;
  const minThreshold = options.minCitationsThreshold ?? 3;
  const citationsCount = referencingFilepaths.length;

  const currentGov = resolveGoverningScope(artifact.filepath, cwd);
  const currentScope = currentGov.relativeScope;
  const currentScopeDir = currentGov.scopeDir;

  const violations: string[] = [];

  // Check for citation targets escaping currentScopeDir (out-of-bounds citations)
  for (const fp of referencingFilepaths) {
    const absFp = resolve(cwd, fp);
    const rel = relative(currentScopeDir, absFp);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      violations.push(toPosixRelative(cwd, absFp));
    }
  }

  let recommendedScopeDir: string;
  let recommendedScope: string;

  if (referencingFilepaths.length === 0) {
    recommendedScopeDir = currentScopeDir;
    recommendedScope = currentScope;
  } else {
    // Normalize each referencing file to its architectural containing directory
    const referencingDirs = referencingFilepaths.map((fp) =>
      normalizeReferencingDir(fp, cwd),
    );

    let rawDca = findDeepestCommonAncestor(referencingDirs, cwd) ?? cwd;

    // If citations escaped currentScopeDir, common ancestor must also enclose currentScopeDir
    if (violations.length > 0) {
      rawDca =
        findDeepestCommonAncestor([rawDca, currentScopeDir], cwd) ?? cwd;
    }

    const relDca = toPosixRelative(cwd, rawDca);
    recommendedScope = relDca === "" ? "." : relDca;
    recommendedScopeDir = resolve(cwd, recommendedScope);
  }

  let status: ArtifactPlacementStatus;

  if (violations.length > 0) {
    status = "UNDER_SCOPED";
  } else if (citationsCount < minThreshold && recommendedScope !== currentScope) {
    // Insufficient citation evidence to justify demotion; retain at current scope
    status = "INCHOATE";
  } else if (recommendedScope !== currentScope) {
    const relToRecommended = relative(currentScopeDir, recommendedScopeDir);
    const isStrictlyBelow =
      relToRecommended.length > 0 && !relToRecommended.startsWith("..");

    if (isStrictlyBelow) {
      status = "OVER_SCOPED";
    } else {
      status = "OPTIMAL";
    }
  } else {
    status = "OPTIMAL";
  }

  const containerName = getSubtypeContainerName(artifact.subtype);
  const suggestedDir =
    recommendedScope === "."
      ? join(cwd, ".modie", containerName)
      : join(cwd, recommendedScope, ".modie", containerName);
  const suggestedFilepath = join(suggestedDir, artifact.filename);
  const suggestedRelativePath = toPosixRelative(cwd, suggestedFilepath);

  return {
    tag: artifact.tag,
    subtype: artifact.subtype,
    id: artifact.id,
    slug: artifact.slug,
    title: artifact.slug,
    filename: artifact.filename,
    filepath: artifact.filepath,
    relativePath: artifact.relativePath,
    currentScope,
    currentScopeDir,
    recommendedScope,
    recommendedScopeDir,
    suggestedRelativePath,
    suggestedFilepath,
    status,
    citationsCount,
    referencingPaths: referencingFilepaths.map((fp) =>
      toPosixRelative(cwd, fp),
    ),
    violations,
    outOfScopePaths: violations,
    outOfScopeCitationsCount: violations.length,
  };
}

/**
 * Audits artifact directory scoping across the workspace or a specified scope/tag.
 * Calculates mathematical Deepest Common Ancestor (DCA) and identifies
 * OVER_SCOPED (context bloat) and UNDER_SCOPED (authority violation) artifacts.
 */
export async function auditArtifactPlacement(
  targetOrScope?: string,
  options: AuditPlacementOptions = {},
): Promise<ArtifactPlacementAuditReport> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const minThreshold = options.minCitationsThreshold ?? 3;
  const trimmed = targetOrScope?.trim();

  const subtypes = options.subtypes ?? ["RULE", "ADR"];

  // 1. Check if input is a specific artifact tag, slug, or artifact file
  let singleArtifact: ResolvedArtifact | null = null;

  if (trimmed) {
    const canonicalTag = parseCanonicalTag(trimmed);
    const parsedFilename = parseArtifactFilename(trimmed);

    if (canonicalTag || parsedFilename) {
      try {
        singleArtifact = await resolveArtifactByTag(trimmed, {
          cwd,
          workspace: ctx,
          includeArchived: false,
        });
      } catch {
        singleArtifact = null;
      }
    } else if (
      !trimmed.includes("/") &&
      !trimmed.includes("\\") &&
      trimmed !== "."
    ) {
      try {
        singleArtifact = await resolveArtifactByTag(trimmed, {
          cwd,
          workspace: ctx,
          includeArchived: false,
        });
      } catch {
        singleArtifact = null;
      }
    }
  }

  const artifactsToAudit: ResolvedArtifact[] = [];

  if (singleArtifact) {
    artifactsToAudit.push(singleArtifact);
  } else {
    // Scope-based audit
    const filterScope = trimmed || options.scope || ".";
    const normFilterScope =
      filterScope === "." ? "." : toPosixRelative(cwd, resolve(cwd, filterScope));

    for (const subtype of subtypes) {
      const activeArtifacts = await scanActiveArtifacts(cwd, subtype);
      for (const art of activeArtifacts) {
        if (art.isArchived) continue;
        const gov = resolveGoverningScope(art.filepath, cwd);

        // If filterScope specified, check if artifact is within or at filterScope
        if (normFilterScope !== ".") {
          const filterScopeDir = resolve(cwd, normFilterScope);
          const rel = relative(filterScopeDir, gov.scopeDir);
          if (rel.startsWith("..") && rel !== "") {
            continue;
          }
        }
        artifactsToAudit.push({
          ...art,
          relativePath: toPosixRelative(cwd, art.filepath),
          scope: gov.relativeScope,
        });
      }
    }
  }

  const suggestions: ArtifactPlacementSuggestion[] = [];

  for (const artifact of artifactsToAudit) {
    const references = await findArtifactReferences(artifact.tag, {
      cwd,
      workspace: ctx,
    });
    const referencingFilepaths = extractReferencingFilepaths(
      artifact,
      references,
    );
    const suggestion = evaluateArtifactPlacement(
      artifact,
      referencingFilepaths,
      {
        cwd,
        minCitationsThreshold: minThreshold,
      },
    );
    suggestions.push(suggestion);
  }

  let optimalCount = 0;
  let overScopedCount = 0;
  let underScopedCount = 0;
  let inchoateCount = 0;

  for (const s of suggestions) {
    switch (s.status) {
      case "OPTIMAL":
        optimalCount++;
        break;
      case "OVER_SCOPED":
        overScopedCount++;
        break;
      case "UNDER_SCOPED":
        underScopedCount++;
        break;
      case "INCHOATE":
        inchoateCount++;
        break;
    }
  }

  return {
    scope: trimmed || options.scope || ".",
    totalAudited: suggestions.length,
    optimalCount,
    overScopedCount,
    underScopedCount,
    inchoateCount,
    suggestions,
  };
}

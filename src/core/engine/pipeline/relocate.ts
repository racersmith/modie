/**
 * Artifact Relocation Pipeline Service.
 * Implements least-scope demotion, upward elevation, motive scaffolding,
 * and link invariant validation (RULE-16, RULE-17, RULE-19).
 */

import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  getSubtypeContainerName,
  resolveArtifactDirectories,
  resolveGoverningScope,
  slugToTitle,
  toPosixRelative,
  type IndexableSubtype,
} from "../../domain/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context/index.ts";
import {
  getArtifactDetails,
  resolveArtifactByTag,
} from "../query/artifact-query.ts";
import { auditArtifactPlacement } from "../query/placement.ts";

export interface RelocateArtifactOptions {
  /**
   * Workspace root directory (defaults to process.cwd()).
   */
  cwd?: string;

  /**
   * Pre-resolved workspace context container.
   */
  workspace?: WorkspaceContext;

  /**
   * If true, validates and computes new destination paths without mutating disk.
   */
  dryRun?: boolean;

  /**
   * Whether to automatically scaffold a skeleton MOTIVE.md if target scope lacks one (default: true).
   */
  scaffoldMotive?: boolean;
}

export interface RelocateArtifactResult {
  tag: string;
  subtype: IndexableSubtype;
  filename: string;
  previousScope: string;
  previousScopeDir: string;
  previousFilepath: string;
  previousRelativePath: string;
  newScope: string;
  newScopeDir: string;
  newFilepath: string;
  newRelativePath: string;
  scaffoldedMotive: boolean;
}

/**
 * Validates that relocating an artifact to newScopeDir preserves graph invariants per RULE-16, RULE-17, and RULE-19.
 */
async function validateRelocationInvariants(
  artifactTag: string,
  subtype: IndexableSubtype,
  newScopeDir: string,
  cwd: string,
  ctx: WorkspaceContext,
): Promise<void> {
  const details = await getArtifactDetails(artifactTag, {
    cwd,
    workspace: ctx,
    includeArchived: false,
  });

  if (subtype === "RULE") {
    // RULE-16: A rule referencing an ADR must target an ADR at or above it.
    for (const link of details.links) {
      if (link.toUpperCase().startsWith("ADR-")) {
        try {
          const adr = await resolveArtifactByTag(link, {
            cwd,
            workspace: ctx,
            includeArchived: false,
          });
          const adrGov = resolveGoverningScope(adr.filepath, cwd);
          // newScopeDir must be a descendant of or equal to adrGov.scopeDir
          const rel = relative(adrGov.scopeDir, newScopeDir);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(
              `Relocation invariant violation (RULE-16): rule ${artifactTag} targets ${link} at "${adrGov.relativeScope}", which is not an ancestor of proposed new scope "${toPosixRelative(cwd, newScopeDir)}".`,
            );
          }
        } catch (err: any) {
          if (err.message?.includes("RULE-16")) throw err;
        }
      }
    }
  } else if (subtype === "ADR") {
    // RULE-17: An ADR referencing a RULE must target a RULE at or below it.
    for (const link of details.links) {
      if (link.toUpperCase().startsWith("RULE-")) {
        try {
          const rule = await resolveArtifactByTag(link, {
            cwd,
            workspace: ctx,
            includeArchived: false,
          });
          const ruleGov = resolveGoverningScope(rule.filepath, cwd);
          // ruleGov.scopeDir must be a descendant of or equal to newScopeDir
          const rel = relative(newScopeDir, ruleGov.scopeDir);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(
              `Relocation invariant violation (RULE-17): ADR ${artifactTag} targets ${link} at "${ruleGov.relativeScope}", which would escape proposed new scope "${toPosixRelative(cwd, newScopeDir)}".`,
            );
          }
        } catch (err: any) {
          if (err.message?.includes("RULE-17")) throw err;
        }
      }
    }
  }
}

/**
 * Relocates an artifact to an explicit target directory scope or to its auto-calculated optimal scope.
 * Scaffolds missing motives and validates graph invariants.
 */
export async function relocateArtifact(
  tagOrIdentifier: string,
  targetScopeInput?: string,
  options: RelocateArtifactOptions = {},
): Promise<RelocateArtifactResult> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;
  const scaffoldMotive = options.scaffoldMotive ?? true;
  const dryRun = options.dryRun ?? false;

  // 1. Resolve artifact
  const artifact = await resolveArtifactByTag(tagOrIdentifier, {
    cwd,
    workspace: ctx,
    includeArchived: false,
  });

  const previousGov = resolveGoverningScope(artifact.filepath, cwd);
  const previousScope = previousGov.relativeScope;
  const previousScopeDir = previousGov.scopeDir;
  const previousFilepath = resolve(cwd, artifact.filepath);
  const previousRelativePath = toPosixRelative(cwd, previousFilepath);

  // 2. Resolve target scope
  let newScope: string;
  let newScopeDir: string;

  if (targetScopeInput !== undefined && targetScopeInput.trim().length > 0) {
    const { normalizedScopeDir } = resolveArtifactDirectories(
      artifact.subtype,
      targetScopeInput.trim(),
      cwd,
    );
    newScopeDir = normalizedScopeDir;
    const rel = toPosixRelative(cwd, newScopeDir);
    newScope = rel === "" ? "." : rel;
  } else {
    // Auto-calculate optimal placement via placement query service
    const audit = await auditArtifactPlacement(artifact.tag, {
      cwd,
      workspace: ctx,
    });
    if (audit.suggestions.length === 0) {
      throw new Error(`Failed to audit placement for artifact ${artifact.tag}.`);
    }
    const suggestion = audit.suggestions[0];
    if (!suggestion) {
      throw new Error(`Failed to audit placement for artifact ${artifact.tag}.`);
    }
    newScope = suggestion.recommendedScope;
    newScopeDir = suggestion.recommendedScopeDir;
  }

  // 3. Resolve destination paths
  const containerName = getSubtypeContainerName(artifact.subtype);
  const newContainerDir =
    newScope === "."
      ? join(cwd, ".modie", containerName)
      : join(cwd, newScope, ".modie", containerName);
  const newFilepath = join(newContainerDir, artifact.filename);
  const newRelativePath = toPosixRelative(cwd, newFilepath);

  if (previousFilepath === newFilepath) {
    return {
      tag: artifact.tag,
      subtype: artifact.subtype,
      filename: artifact.filename,
      previousScope,
      previousScopeDir,
      previousFilepath,
      previousRelativePath,
      newScope,
      newScopeDir,
      newFilepath,
      newRelativePath,
      scaffoldedMotive: false,
    };
  }

  // 4. Invariant validation
  await validateRelocationInvariants(
    artifact.tag,
    artifact.subtype,
    newScopeDir,
    cwd,
    ctx,
  );

  if (dryRun) {
    return {
      tag: artifact.tag,
      subtype: artifact.subtype,
      filename: artifact.filename,
      previousScope,
      previousScopeDir,
      previousFilepath,
      previousRelativePath,
      newScope,
      newScopeDir,
      newFilepath,
      newRelativePath,
      scaffoldedMotive: false,
    };
  }

  // 5. Ensure target container directory exists
  await mkdir(newContainerDir, { recursive: true });

  // 6. Scaffold motive if target scope has no MOTIVE.md
  let scaffoldedMotive = false;
  if (scaffoldMotive) {
    const motivePath =
      newScope === "."
        ? join(cwd, ".modie", "MOTIVE.md")
        : join(cwd, newScope, ".modie", "MOTIVE.md");

    if (!existsSync(motivePath)) {
      const scopeTitle =
        newScope === "." ? "Root Workspace" : slugToTitle(basename(newScopeDir));
      const motiveContent = `# Motive: ${scopeTitle}\n\nArchitectural scope boundary and domain invariants for this directory node in the system DAG.\n`;
      await mkdir(dirname(motivePath), { recursive: true });
      await writeFile(motivePath, motiveContent, "utf8");
      scaffoldedMotive = true;
    }
  }

  // 7. Move file atomically
  await rename(previousFilepath, newFilepath);

  return {
    tag: artifact.tag,
    subtype: artifact.subtype,
    filename: artifact.filename,
    previousScope,
    previousScopeDir,
    previousFilepath,
    previousRelativePath,
    newScope,
    newScopeDir,
    newFilepath,
    newRelativePath,
    scaffoldedMotive,
  };
}

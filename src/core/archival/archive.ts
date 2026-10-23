/**
 * Guarded artifact archival core service.
 * Enforces RULE-4, RULE-25, and RULE-31.
 */

import { rename } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { formatArtifactFilename } from "../common/filename.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";
import { findArtifactReferences } from "../query/references.ts";
import type { ArchiveArtifactOptions, ArchiveArtifactResult } from "./types.ts";

/**
 * Executes guarded archival for an indexable artifact (ADR, RULE, etc.).
 *
 * Verifies that zero active dependent references exist prior to renaming to *.ARCHIVED.md per RULE-31.
 * Strict rejection is enforced unless options.force is set to true.
 *
 * @throws Error if the artifact is already archived, does not match requested subtype,
 *               or possesses active incoming references without --force.
 */
export async function archiveArtifact(
  options: ArchiveArtifactOptions,
): Promise<ArchiveArtifactResult> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  if (!options.tag || options.tag.trim().length === 0) {
    throw new Error("Target artifact identifier must be a non-empty string.");
  }

  // 1. Resolve artifact on disk across active and archived records
  const artifact = await resolveArtifactByTag(options.tag.trim(), {
    cwd,
    subtype: options.subtype,
    includeArchived: true,
  });

  // 2. Reject if artifact is already archived
  if (artifact.isArchived) {
    throw new Error(
      `Artifact "${artifact.tag}" is already archived at "${artifact.relativePath}".`,
    );
  }

  // 3. Validate subtype if caller provided subtype constraint
  if (
    options.subtype &&
    artifact.subtype.toUpperCase() !== options.subtype.toUpperCase()
  ) {
    throw new Error(
      `Artifact "${artifact.tag}" is of subtype "${artifact.subtype}", expected "${options.subtype}".`,
    );
  }

  // 4. Query citations across the workspace to evaluate archival safety (RULE-31)
  const refResult = await findArtifactReferences(artifact.tag, { cwd });
  const { canArchive, blockingReasons, blockingCount } =
    refResult.archivalGuard;

  // 5. Strict rejection if active references exist and --force is omitted
  if (!canArchive && !options.force) {
    const reasonsList = blockingReasons.map((r) => `  - ${r}`).join("\n");
    throw new Error(
      `Cannot archive ${artifact.tag}: ${blockingCount} active incoming reference(s) exist.\n${reasonsList}\nUse --force to bypass this guard.`,
    );
  }

  // 6. Generate canonical *.ARCHIVED.md filename per RULE-1
  const archivedFilename = formatArtifactFilename({
    slug: artifact.slug,
    subtype: artifact.subtype,
    id: artifact.id,
    isArchived: true,
  });

  const originalDir = dirname(artifact.filepath);
  const archivedFilepath = join(originalDir, archivedFilename);

  // 7. Atomically rename the file
  await rename(artifact.filepath, archivedFilepath);

  return {
    tag: artifact.tag,
    subtype: artifact.subtype,
    id: artifact.id,
    slug: artifact.slug,
    originalFilepath: artifact.filepath,
    originalRelativePath: artifact.relativePath,
    archivedFilepath,
    archivedRelativePath: relative(cwd, archivedFilepath),
    archivedFilename,
    canArchive,
    forced: Boolean(!canArchive && options.force),
    blockingReasons,
  };
}

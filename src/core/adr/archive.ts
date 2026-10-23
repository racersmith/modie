/**
 * Domain-specific archival service for ADR artifacts.
 * Enforces RULE-4, RULE-25, and RULE-31.
 */

import { archiveArtifact } from "../archival/archive.ts";
import type { ArchiveArtifactOptions, ArchiveArtifactResult } from "../archival/types.ts";

export type ArchiveAdrOptions = Omit<ArchiveArtifactOptions, "subtype">;

/**
 * Archives an ADR artifact after verifying zero active incoming references (RULE-31).
 */
export async function archiveAdr(
  tagOrOptions: string | ArchiveAdrOptions,
  options: Omit<ArchiveAdrOptions, "tag"> = {},
): Promise<ArchiveArtifactResult> {
  const finalOptions: ArchiveArtifactOptions =
    typeof tagOrOptions === "string"
      ? { ...options, tag: tagOrOptions, subtype: "ADR" }
      : { ...tagOrOptions, subtype: "ADR" };

  return archiveArtifact(finalOptions);
}

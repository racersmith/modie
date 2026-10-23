/**
 * Domain-specific archival service for RULE artifacts.
 * Enforces RULE-4, RULE-25, and RULE-31.
 */

import { archiveArtifact } from "../archival/archive.ts";
import type { ArchiveArtifactOptions, ArchiveArtifactResult } from "../archival/types.ts";

export type ArchiveRuleOptions = Omit<ArchiveArtifactOptions, "subtype">;

/**
 * Archives a RULE artifact after verifying zero active incoming references (RULE-31).
 */
export async function archiveRule(
  tagOrOptions: string | ArchiveRuleOptions,
  options: Omit<ArchiveRuleOptions, "tag"> = {},
): Promise<ArchiveArtifactResult> {
  const finalOptions: ArchiveArtifactOptions =
    typeof tagOrOptions === "string"
      ? { ...options, tag: tagOrOptions, subtype: "RULE" }
      : { ...tagOrOptions, subtype: "RULE" };

  return archiveArtifact(finalOptions);
}

/**
 * Modie Core: Guarded Artifact Archival domain module.
 * Complies with RULE-4, RULE-25, and RULE-31.
 */

export * from "./types.ts";
export { archiveArtifact } from "./archive.ts";
export { archiveAdr, type ArchiveAdrOptions } from "../adr/archive.ts";
export { archiveRule, type ArchiveRuleOptions } from "../rule/archive.ts";

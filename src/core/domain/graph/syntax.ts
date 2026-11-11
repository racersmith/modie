/**
 * Pure tag and link syntax predicates for Modie artifacts.
 * Enforces subtype syntax grammar for document linking and task dependencies.
 * Complies with ADR-5, RULE-13, RULE-14, RULE-15, RULE-18, and RULE-38.
 */

import { parseCanonicalTag } from "../common/tag.ts";

export const ADR_LINK_TAG_REGEX = /^ADR-[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/i;
export const GOVERNANCE_LINK_TAG_REGEX =
  /^(?:ADR|RULE)-[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/i;
export const TASK_DEPENDENCY_TAG_REGEX =
  /^TASK-[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/i;

/**
 * Returns true if `tag` matches canonical ADR tag syntax (ADR-5, RULE-13).
 */
export function isValidAdrLinkTag(tag: string): boolean {
  return parseCanonicalTag(tag)?.subtype === "ADR";
}

/**
 * Returns true if `tag` matches canonical ADR or RULE governance tag syntax (ADR-5, RULE-14, RULE-15).
 */
export function isValidGovernanceLinkTag(tag: string): boolean {
  const subtype = parseCanonicalTag(tag)?.subtype;
  return subtype === "ADR" || subtype === "RULE";
}

/**
 * Returns true if `tag` matches canonical TASK dependency tag syntax (RULE-18).
 */
export function isValidTaskDependencyTag(tag: string): boolean {
  return parseCanonicalTag(tag)?.subtype === "TASK";
}


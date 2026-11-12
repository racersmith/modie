/**
 * Modie Core Domain Layer: Validation rules for ADR primitive artifacts.
 * Pure domain model complying with RULE-1, RULE-4, and RULE-38.
 */

export const TOMBSTONE_ADR_KEYWORDS = [
  "sunset",
  "sunsets",
  "sunsetting",
  "retire",
  "retires",
  "retired",
  "retiring",
  "deprecate",
  "deprecates",
  "deprecated",
  "deprecating",
  "delete",
  "deletes",
  "deleted",
  "deleting",
  "deletion",
  "deletions",
  "remove",
  "removes",
  "removed",
  "removing",
  "removal",
  "removals",
  "cleanup",
  "cleanups",
] as const;

export const TOMBSTONE_ADR_REGEX = new RegExp(
  `\\b(${TOMBSTONE_ADR_KEYWORDS.join("|")})\\b`,
  "i",
);

/**
 * Validates that a proposed ADR title does not represent a tombstone ADR
 * (recording a past deletion, retirement, or deprecation rather than constraining future code).
 *
 * @throws Error if the title contains tombstone keywords and force is not true.
 */
export function validateAdrTitle(title: string, force?: boolean): void {
  if (force) {
    return;
  }
  const match = title.match(TOMBSTONE_ADR_REGEX);
  if (match) {
    throw new Error(
      `Tombstone ADR detected: Proposed title "${title}" contains sunset/deletion keyword "${match[0]}".\n` +
        `ADRs must constrain future code, not record past deletions or retirements.\n` +
        `• To retire an existing decision or rule: use archive_artifact (or \`modie archive <tag>\`)\n` +
        `• To clean up dead code: author an ephemeral TASK\n` +
        `• If this decision genuinely constrains future code: rephrase title (or pass --force)`,
    );
  }
}


/**
 * Acceptance criteria checklist parser and validator for TASK artifacts (RULE-22).
 */

import type { TaskAcceptanceCriteriaItem } from "./types.ts";

const ACCEPTANCE_CRITERIA_HEADER_REGEX = /^#\s+Acceptance Criteria\b/im;
const CHECKLIST_ITEM_REGEX = /^\s*-\s*\[([ xX])\]\s*(.+)$/;

/**
 * Parses markdown text to extract all checklist items under the `# Acceptance Criteria` section.
 */
export function parseAcceptanceCriteria(markdown: string): TaskAcceptanceCriteriaItem[] {
  const lines = markdown.split("\n");
  const items: TaskAcceptanceCriteriaItem[] = [];

  let inSection = false;

  for (const line of lines) {
    if (ACCEPTANCE_CRITERIA_HEADER_REGEX.test(line)) {
      inSection = true;
      continue;
    }

    // Stop if a new top-level heading begins
    if (inSection && /^#\s+/.test(line)) {
      break;
    }

    if (inSection) {
      const match = line.match(CHECKLIST_ITEM_REGEX);
      if (match && match[1] !== undefined && match[2] !== undefined) {
        const isChecked = match[1].toLowerCase() === "x";
        items.push({
          text: match[2].trim(),
          completed: isChecked,
        });
      }
    }
  }

  return items;
}

/**
 * Checks whether all acceptance criteria items are completed.
 * Returns false if items list is empty or any item is incomplete (RULE-22).
 */
export function areAllAcceptanceCriteriaCompleted(items: TaskAcceptanceCriteriaItem[]): boolean {
  if (items.length === 0) {
    return false;
  }
  return items.every((item) => item.completed);
}

/**
 * Formats acceptance criteria items into a Markdown checklist section.
 */
export function renderAcceptanceCriteria(
  items: (string | TaskAcceptanceCriteriaItem)[] = [],
): string {
  if (items.length === 0) {
    return "# Acceptance Criteria\n\n- [ ] Deliverable defined\n";
  }

  const lines = items.map((item) => {
    if (typeof item === "string") {
      return `- [ ] ${item.trim()}`;
    }
    const box = item.completed ? "[x]" : "[ ]";
    return `- ${box} ${item.text.trim()}`;
  });

  return `# Acceptance Criteria\n\n${lines.join("\n")}\n`;
}

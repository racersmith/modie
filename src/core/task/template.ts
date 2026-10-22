/**
 * Task markdown template generator and renderer.
 * Enforces RULE-15, RULE-18, and RULE-22.
 */

import { renderAcceptanceCriteria } from "./checklist.ts";
import type { TaskRenderOptions } from "./types.ts";

const ADR_RULE_LINK_REGEX = /^(?:ADR|RULE)-[A-Za-z0-9_-]+$/;
const TASK_DEPENDENCY_REGEX = /^TASK-[A-Za-z0-9_.-]+$/;

/**
 * Validates links per RULE-15: TASK links must only reference ADR and RULE artifacts.
 */
export function validateTaskLinks(links: string[] = []): void {
  for (const link of links) {
    if (!ADR_RULE_LINK_REGEX.test(link)) {
      throw new Error(
        `Invalid task link target: "${link}". A TASK artifact's frontmatter links must exclusively reference ADR and RULE artifacts (RULE-15).`,
      );
    }
  }
}

/**
 * Validates depends_on per RULE-18: TASK depends_on must exclusively reference other TASK artifacts.
 */
export function validateTaskDependencies(dependsOn: string[] = []): void {
  for (const dep of dependsOn) {
    if (!TASK_DEPENDENCY_REGEX.test(dep)) {
      throw new Error(
        `Invalid task dependency: "${dep}". A TASK artifact's frontmatter depends_on must exclusively reference other TASK artifacts (RULE-18).`,
      );
    }
  }
}

/**
 * Renders a canonical TASK markdown document with YAML frontmatter, Context, and Acceptance Criteria.
 */
export function renderTaskMarkdown(options: TaskRenderOptions): string {
  const {
    title,
    context,
    depends_on = [],
    links = [],
    acceptanceCriteria = [],
  } = options;

  // Validate frontmatter boundaries
  validateTaskLinks(links);
  validateTaskDependencies(depends_on);

  const frontmatterLines: string[] = ["---"];

  if (depends_on.length > 0) {
    frontmatterLines.push("depends_on:");
    for (const dep of depends_on) {
      frontmatterLines.push(`  - ${dep}`);
    }
  } else {
    frontmatterLines.push("depends_on: []");
  }

  frontmatterLines.push("");

  if (links.length > 0) {
    frontmatterLines.push("links:");
    for (const link of links) {
      frontmatterLines.push(`  - ${link}`);
    }
  } else {
    frontmatterLines.push("links: []");
  }

  frontmatterLines.push("---");

  const contextContent = context?.trim() || (title ? `Implement ${title}.` : "Execution plan description.");

  const sections: string[] = [
    frontmatterLines.join("\n"),
    "",
    "# Context",
    "",
    contextContent,
    "",
    renderAcceptanceCriteria(acceptanceCriteria).trim(),
    "",
  ];

  return sections.join("\n");
}

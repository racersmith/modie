/**
 * Unit tests for TASK primitive models, filename parsing, and template rendering.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../platform/testing/index.ts";
import { formatArtifactTag } from "../common/tag.ts";
import {
  areAllAcceptanceCriteriaCompleted,
  extractTaskSummary,
  parseAcceptanceCriteria,
  parseTaskMarkdown,
  renderAcceptanceCriteria,
  renderTaskMarkdown,
  validateTaskDependencies,
  validateTaskLinks,
} from "./index.ts";

describe("TASK Primitive - Acceptance Criteria Checklist (RULE-22)", () => {
  // @verifies RULE-22
  it("[RULE-22] should parse completed and incomplete checklist items", () => {
    const markdown = `
# Context
Some context.

# Acceptance Criteria

- [ ] First deliverable pending
- [x] Second deliverable done
- [X] Third deliverable also done

# Other Section
- [ ] This list item is outside acceptance criteria and should be ignored
`;

    const items = parseAcceptanceCriteria(markdown);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      text: "First deliverable pending",
      completed: false,
    });
    expect(items[1]).toEqual({
      text: "Second deliverable done",
      completed: true,
    });
    expect(items[2]).toEqual({
      text: "Third deliverable also done",
      completed: true,
    });
  });

  // @verifies RULE-22
  it("[RULE-22] should verify completion status across all items", () => {
    expect(
      areAllAcceptanceCriteriaCompleted([
        { text: "Item 1", completed: true },
        { text: "Item 2", completed: true },
      ]),
    ).toBe(true);

    expect(
      areAllAcceptanceCriteriaCompleted([
        { text: "Item 1", completed: true },
        { text: "Item 2", completed: false },
      ]),
    ).toBe(false);

    expect(areAllAcceptanceCriteriaCompleted([])).toBe(false);
  });

  // @verifies RULE-22
  it("[RULE-22] should render checklist items into markdown", () => {
    const rendered = renderAcceptanceCriteria([
      "Task 1",
      { text: "Task 2", completed: true },
    ]);
    expect(rendered).toContain("- [ ] Task 1");
    expect(rendered).toContain("- [x] Task 2");
  });
});

describe("TASK Primitive - Frontmatter Links & Dependencies (RULE-15, RULE-18)", () => {
  // @verifies RULE-15, RULE-35
  it("[RULE-15][RULE-35] should allow ADR and RULE links and reject TASK links in links", () => {
    const validAdr = formatArtifactTag("ADR", 101);
    const validRule = formatArtifactTag("RULE", 201);
    const invalidTask = formatArtifactTag("TASK", 301);
    const invalidCustom = formatArtifactTag("INVALID", 1);
    expect(() => validateTaskLinks([validAdr, validRule])).not.toThrow();
    expect(() => validateTaskLinks([invalidTask])).toThrow(
      "Invalid task link target",
    );
    expect(() => validateTaskLinks([invalidCustom])).toThrow(
      "Invalid task link target",
    );
  });

  // @verifies RULE-18, RULE-35
  it("[RULE-18][RULE-35] should allow TASK dependencies and reject non-TASK references in depends_on", () => {
    const taskDep1 = formatArtifactTag("TASK", 301);
    const taskDep2 = formatArtifactTag("TASK", "302-1");
    const invalidRule = formatArtifactTag("RULE", 201);
    const invalidAdr = formatArtifactTag("ADR", 101);

    expect(() => validateTaskDependencies([taskDep1, taskDep2])).not.toThrow();
    expect(() => validateTaskDependencies([invalidRule])).toThrow(
      "Invalid task dependency",
    );
    expect(() => validateTaskDependencies([invalidAdr])).toThrow(
      "Invalid task dependency",
    );
  });
});

describe("TASK Primitive - Template Rendering and Parser Roundtrip (RULE-1, RULE-15, RULE-18, RULE-22, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("task-primitive-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-1, RULE-15, RULE-18, RULE-22, RULE-34, RULE-35
  it("[RULE-1][RULE-15][RULE-18][RULE-22][RULE-34][RULE-35] should render and parse a complete task markdown document", async () => {
    const taskId = "3";
    const depTaskTag = formatArtifactTag("TASK", 2);
    const linkAdrTag = formatArtifactTag("ADR", 101);
    const linkRuleTag = formatArtifactTag("RULE", 201);
    const taskTag = formatArtifactTag("TASK", taskId);
    const filename = `task-primitive-model.${taskTag}.md`;

    const rendered = renderTaskMarkdown({
      id: taskId,
      title: "Task Primitive Model",
      depends_on: [depTaskTag],
      links: [linkAdrTag, linkRuleTag],
      contextSection: "Implement domain models for TASK primitive.",
      acceptanceCriteria: [
        "Define TaskArtifact",
        { text: "Add unit tests", completed: true },
      ],
    });

    expect(rendered).toContain(`depends_on:\n  - ${depTaskTag}`);
    expect(rendered).toContain(`links:\n  - ${linkAdrTag}\n  - ${linkRuleTag}`);
    expect(rendered).toContain(
      "# Context\n\nImplement domain models for TASK primitive.",
    );
    expect(rendered).toContain("- [ ] Define TaskArtifact");
    expect(rendered).toContain("- [x] Add unit tests");

    const filePath = await workspace.writeFile(filename, rendered);
    const fileContent = await workspace.readFile(filePath);

    const parsed = parseTaskMarkdown(fileContent, filePath);
    expect(parsed.id).toBe(taskId);
    expect(parsed.slug).toBe("task-primitive-model");
    expect(parsed.depends_on).toEqual([depTaskTag]);
    expect(parsed.links).toEqual([linkAdrTag, linkRuleTag]);
    expect(parsed.contextSection).toBe("Implement domain models for TASK primitive.");
    expect(parsed.acceptanceCriteria).toHaveLength(2);
    expect(parsed.acceptanceCriteria[0]).toEqual({
      text: "Define TaskArtifact",
      completed: false,
    });
    expect(parsed.acceptanceCriteria[1]).toEqual({
      text: "Add unit tests",
      completed: true,
    });
  });
});

describe("TASK Primitive - Summary Extraction (RULE-26)", () => {
  // @verifies RULE-26
  it("[RULE-26] should prefer explicit frontmatter summary and fallback to Context sentence or slug", () => {
    const withExplicit = `---
summary: Explicit task summary
---

# Context
Context description paragraph.
`;
    expect(extractTaskSummary(withExplicit, "test-task")).toBe(
      "Explicit task summary",
    );

    const withContextOnly = `
# Context
First substantive sentence of the task context. Second sentence here.

# Acceptance Criteria
- [ ] Checklist item
`;
    expect(extractTaskSummary(withContextOnly, "test-task")).toBe(
      "First substantive sentence of the task context.",
    );

    const emptyDoc = ``;
    expect(extractTaskSummary(emptyDoc, "fallback-slug-title")).toBe(
      "fallback slug title",
    );
  });
});

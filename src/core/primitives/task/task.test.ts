/**
 * Unit tests for TASK primitive models, filename parsing, and template rendering.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import {
  generateSlug,
  isValidSlug,
  formatTaskFilename,
  parseTaskFilename,
  isTaskFilename,
  isValidTaskId,
  parseAcceptanceCriteria,
  areAllAcceptanceCriteriaCompleted,
  renderAcceptanceCriteria,
  renderTaskMarkdown,
  validateTaskLinks,
  validateTaskDependencies,
  parseTaskMarkdown,
} from "./index.ts";

describe("TASK Primitive - Slug Generation & Validation", () => {
  // @verifies RULE-1
  it("[RULE-1] should generate valid kebab-case slugs from human titles", () => {
    expect(generateSlug("Create Task CLI")).toBe("create-task-cli");
    expect(generateSlug("Task Primitive Model (Core)")).toBe("task-primitive-model-core");
    expect(generateSlug("   Multiple   Spaces   ")).toBe("multiple-spaces");
    expect(generateSlug("Mixed_Case_With-Punctuation! & Symbols?")).toBe("mixed-case-with-punctuation-symbols");
    expect(generateSlug("---Leading and Trailing Hyphens---")).toBe("leading-and-trailing-hyphens");
  });

  // @verifies RULE-1
  it("[RULE-1] should validate strict kebab-case slugs", () => {
    expect(isValidSlug("create-task-cli")).toBe(true);
    expect(isValidSlug("task-123")).toBe(true);
    expect(isValidSlug("simple")).toBe(true);

    expect(isValidSlug("Create-task-cli")).toBe(false);
    expect(isValidSlug("create_task")).toBe(false);
    expect(isValidSlug("create--task")).toBe(false);
    expect(isValidSlug("-create-task")).toBe(false);
    expect(isValidSlug("create-task-")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("should throw an error when generating slug from empty or invalid strings", () => {
    expect(() => generateSlug("")).toThrow();
    expect(() => generateSlug("   ")).toThrow();
    expect(() => generateSlug("!@#$%^&*()")).toThrow();
  });
});

describe("TASK Primitive - Filename Formatting & Parsing", () => {
  // @verifies RULE-1
  it("[RULE-1] should format valid task filenames with unpadded monotonic integers", () => {
    expect(formatTaskFilename("create-task-cli", 1)).toBe("create-task-cli.TASK-1.md");
    expect(formatTaskFilename("task-primitive-model", "42")).toBe("task-primitive-model.TASK-42.md");
  });

  // @verifies RULE-1
  it("[RULE-1] should format valid task filenames with branch-namespaced IDs", () => {
    expect(formatTaskFilename("sub-feature", "2-1")).toBe("sub-feature.TASK-2-1.md");
    expect(formatTaskFilename("agent-task", "J101")).toBe("agent-task.TASK-J101.md");
    expect(formatTaskFilename("agent-subtask", "A102.1")).toBe("agent-subtask.TASK-A102.1.md");
  });

  // @verifies RULE-1
  it("[RULE-1] should reject invalid slugs or IDs when formatting filenames", () => {
    expect(() => formatTaskFilename("Invalid_Slug", 1)).toThrow(/Invalid slug/);
    expect(() => formatTaskFilename("valid-slug", "")).toThrow(/Invalid task ID/);
    expect(() => formatTaskFilename("valid-slug", "ID with spaces")).toThrow(/Invalid task ID/);
  });

  // @verifies RULE-1
  it("[RULE-1] should parse valid task filenames and file paths", () => {
    const parsed1 = parseTaskFilename("create-task-cli.TASK-1.md");
    expect(parsed1).toEqual({
      slug: "create-task-cli",
      id: "1",
      filename: "create-task-cli.TASK-1.md",
    });

    const parsed2 = parseTaskFilename("src/core/primitives/task/.tasks/sub-feature.TASK-2-1.md");
    expect(parsed2).toEqual({
      slug: "sub-feature",
      id: "2-1",
      filename: "sub-feature.TASK-2-1.md",
    });

    expect(isTaskFilename("create-task-cli.TASK-1.md")).toBe(true);
    expect(isTaskFilename("not-a-task.RULE-1.md")).toBe(false);
    expect(isTaskFilename("random-notes.md")).toBe(false);
  });

  it("should validate allowed task ID formats", () => {
    expect(isValidTaskId(1)).toBe(true);
    expect(isValidTaskId("42")).toBe(true);
    expect(isValidTaskId("2-1")).toBe(true);
    expect(isValidTaskId("J101")).toBe(true);
    expect(isValidTaskId("")).toBe(false);
    expect(isValidTaskId("foo bar")).toBe(false);
  });
});

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
    expect(items[0]).toEqual({ text: "First deliverable pending", completed: false });
    expect(items[1]).toEqual({ text: "Second deliverable done", completed: true });
    expect(items[2]).toEqual({ text: "Third deliverable also done", completed: true });
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
    const rendered = renderAcceptanceCriteria(["Task 1", { text: "Task 2", completed: true }]);
    expect(rendered).toContain("- [ ] Task 1");
    expect(rendered).toContain("- [x] Task 2");
  });
});

describe("TASK Primitive - Frontmatter Links & Dependencies", () => {
  // @verifies RULE-15
  it("[RULE-15] should allow ADR and RULE links and reject TASK links in links", () => {
    expect(() => validateTaskLinks(["ADR-1", "RULE-22"])).not.toThrow();
    expect(() => validateTaskLinks(["TASK-1"])).toThrow(/RULE-15/);
    expect(() => validateTaskLinks(["INVALID-1"])).toThrow(/RULE-15/);
  });

  // @verifies RULE-18
  it("[RULE-18] should allow TASK dependencies and reject non-TASK references in depends_on", () => {
    expect(() => validateTaskDependencies(["TASK-1", "TASK-2-1"])).not.toThrow();
    expect(() => validateTaskDependencies(["RULE-1"])).toThrow(/RULE-18/);
    expect(() => validateTaskDependencies(["ADR-1"])).toThrow(/RULE-18/);
  });
});

describe("TASK Primitive - Template Rendering and Parser Roundtrip", () => {
  // @verifies RULE-1
  // @verifies RULE-15
  // @verifies RULE-18
  // @verifies RULE-22
  it("[RULE-1][RULE-22] should render and parse a complete task markdown document", () => {
    const rendered = renderTaskMarkdown({
      id: "3",
      title: "Task Primitive Model",
      depends_on: ["TASK-2"],
      links: ["ADR-1", "RULE-22"],
      context: "Implement domain models for TASK primitive.",
      acceptanceCriteria: ["Define TaskArtifact", { text: "Add unit tests", completed: true }],
    });

    expect(rendered).toContain("depends_on:\n  - TASK-2");
    expect(rendered).toContain("links:\n  - ADR-1\n  - RULE-22");
    expect(rendered).toContain("# Context\n\nImplement domain models for TASK primitive.");
    expect(rendered).toContain("- [ ] Define TaskArtifact");
    expect(rendered).toContain("- [x] Add unit tests");

    const parsed = parseTaskMarkdown(rendered, "task-primitive-model.TASK-3.md");
    expect(parsed.id).toBe("3");
    expect(parsed.slug).toBe("task-primitive-model");
    expect(parsed.depends_on).toEqual(["TASK-2"]);
    expect(parsed.links).toEqual(["ADR-1", "RULE-22"]);
    expect(parsed.context).toBe("Implement domain models for TASK primitive.");
    expect(parsed.acceptanceCriteria).toHaveLength(2);
    expect(parsed.acceptanceCriteria[0]).toEqual({ text: "Define TaskArtifact", completed: false });
    expect(parsed.acceptanceCriteria[1]).toEqual({ text: "Add unit tests", completed: true });
  });
});

/**
 * Unit tests for TASK primitive models, filename parsing, and template rendering.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import {
  parseAcceptanceCriteria,
  areAllAcceptanceCriteriaCompleted,
  renderAcceptanceCriteria,
  renderTaskMarkdown,
  validateTaskLinks,
  validateTaskDependencies,
  parseTaskMarkdown,
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

  // @verifies RULE-22
  it("[RULE-22] should render and parse optional Planned Governance section", () => {
    const rendered = renderTaskMarkdown({
      id: "35",
      title: "Planned Governance Test",
      context: "Context with planned governance.",
      plannedGovernance: {
        rules: ["Multi-branch collision guard", { text: "Ephemeral Task Decoupling", completed: true, tag: "RULE-33" }],
        adrs: ["Branch aware task allocation"],
      },
      acceptanceCriteria: ["Deliverable 1"],
    });

    expect(rendered).toContain("# Planned Governance");
    expect(rendered).toContain("## ADRs\n- [ ] Branch aware task allocation");
    expect(rendered).toContain("## Rules\n- [ ] Multi-branch collision guard\n- [x] RULE-33: Ephemeral Task Decoupling");

    const parsed = parseTaskMarkdown(rendered, "planned-gov.TASK-35.md");
    expect(parsed.plannedGovernance).toBeDefined();
    expect(parsed.plannedGovernance?.adrs).toHaveLength(1);
    expect(parsed.plannedGovernance?.adrs[0]?.text).toBe("Branch aware task allocation");
    expect(parsed.plannedGovernance?.adrs[0]?.completed).toBe(false);

    expect(parsed.plannedGovernance?.rules).toHaveLength(2);
    expect(parsed.plannedGovernance?.rules[0]?.text).toBe("Multi-branch collision guard");
    expect(parsed.plannedGovernance?.rules[0]?.completed).toBe(false);
    expect(parsed.plannedGovernance?.rules[1]?.text).toBe("RULE-33: Ephemeral Task Decoupling");
    expect(parsed.plannedGovernance?.rules[1]?.completed).toBe(true);
    expect(parsed.plannedGovernance?.rules[1]?.tag).toBe("RULE-33");
  });
});

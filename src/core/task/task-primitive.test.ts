/**
 * Unit tests for TASK primitive models, filename parsing, and template rendering.
 * Complies with ADR-7, RULE-1, RULE-15, RULE-18, RULE-22, RULE-23, RULE-34, and RULE-35.
 * @verifies ADR-7, RULE-1, RULE-15, RULE-18, RULE-22, RULE-23, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createFixtureWorkspace, makeTestTag, type FixtureWorkspace } from "../testing/index.ts";
import {
  areAllAcceptanceCriteriaCompleted,
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

describe("TASK Primitive - Frontmatter Links & Dependencies (RULE-15, RULE-18)", () => {
  // @verifies RULE-15, RULE-35
  it("[RULE-15][RULE-35] should allow ADR and RULE links and reject TASK links in links", () => {
    const validAdr = makeTestTag("ADR", 101);
    const validRule = makeTestTag("RULE", 201);
    const invalidTask = makeTestTag("TASK", 301);
    const invalidCustom = makeTestTag("INVALID", 1);
    const rule15 = makeTestTag("RULE", 15);

    expect(() => validateTaskLinks([validAdr, validRule])).not.toThrow();
    expect(() => validateTaskLinks([invalidTask])).toThrow(new RegExp(rule15));
    expect(() => validateTaskLinks([invalidCustom])).toThrow(new RegExp(rule15));
  });

  // @verifies RULE-18, RULE-35
  it("[RULE-18][RULE-35] should allow TASK dependencies and reject non-TASK references in depends_on", () => {
    const taskDep1 = makeTestTag("TASK", 301);
    const taskDep2 = makeTestTag("TASK", "302-1");
    const invalidRule = makeTestTag("RULE", 201);
    const invalidAdr = makeTestTag("ADR", 101);
    const rule18 = makeTestTag("RULE", 18);

    expect(() => validateTaskDependencies([taskDep1, taskDep2])).not.toThrow();
    expect(() => validateTaskDependencies([invalidRule])).toThrow(new RegExp(rule18));
    expect(() => validateTaskDependencies([invalidAdr])).toThrow(new RegExp(rule18));
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
    const depTaskTag = makeTestTag("TASK", 2);
    const linkAdrTag = makeTestTag("ADR", 101);
    const linkRuleTag = makeTestTag("RULE", 201);
    const taskTag = makeTestTag("TASK", taskId);
    const filename = `task-primitive-model.${taskTag}.md`;

    const rendered = renderTaskMarkdown({
      id: taskId,
      title: "Task Primitive Model",
      depends_on: [depTaskTag],
      links: [linkAdrTag, linkRuleTag],
      context: "Implement domain models for TASK primitive.",
      acceptanceCriteria: ["Define TaskArtifact", { text: "Add unit tests", completed: true }],
    });

    expect(rendered).toContain(`depends_on:\n  - ${depTaskTag}`);
    expect(rendered).toContain(`links:\n  - ${linkAdrTag}\n  - ${linkRuleTag}`);
    expect(rendered).toContain("# Context\n\nImplement domain models for TASK primitive.");
    expect(rendered).toContain("- [ ] Define TaskArtifact");
    expect(rendered).toContain("- [x] Add unit tests");

    const filePath = await workspace.writeFile(filename, rendered);
    const fileContent = await workspace.readFile(filePath);

    const parsed = parseTaskMarkdown(fileContent, filePath);
    expect(parsed.id).toBe(taskId);
    expect(parsed.slug).toBe("task-primitive-model");
    expect(parsed.depends_on).toEqual([depTaskTag]);
    expect(parsed.links).toEqual([linkAdrTag, linkRuleTag]);
    expect(parsed.context).toBe("Implement domain models for TASK primitive.");
    expect(parsed.acceptanceCriteria).toHaveLength(2);
    expect(parsed.acceptanceCriteria[0]).toEqual({ text: "Define TaskArtifact", completed: false });
    expect(parsed.acceptanceCriteria[1]).toEqual({ text: "Add unit tests", completed: true });
  });

  // @verifies RULE-22, RULE-34, RULE-35
  it("[RULE-22][RULE-34][RULE-35] should render and parse optional Planned Governance section", async () => {
    const taskId = "35";
    const plannedRuleTag = makeTestTag("RULE", 303);
    const taskTag = makeTestTag("TASK", taskId);
    const filename = `planned-gov.${taskTag}.md`;

    const rendered = renderTaskMarkdown({
      id: taskId,
      title: "Planned Governance Test",
      context: "Context with planned governance.",
      plannedGovernance: {
        rules: ["Multi-branch collision guard", { text: "Ephemeral Task Decoupling", completed: true, tag: plannedRuleTag }],
        adrs: ["Branch aware task allocation"],
      },
      acceptanceCriteria: ["Deliverable 1"],
    });

    expect(rendered).toContain("# Planned Governance");
    expect(rendered).toContain("## ADRs\n- [ ] Branch aware task allocation");
    expect(rendered).toContain(`## Rules\n- [ ] Multi-branch collision guard\n- [x] ${plannedRuleTag}: Ephemeral Task Decoupling`);

    const filePath = await workspace.writeFile(filename, rendered);
    const fileContent = await workspace.readFile(filePath);

    const parsed = parseTaskMarkdown(fileContent, filePath);
    expect(parsed.plannedGovernance).toBeDefined();
    expect(parsed.plannedGovernance?.adrs).toHaveLength(1);
    expect(parsed.plannedGovernance?.adrs[0]?.text).toBe("Branch aware task allocation");
    expect(parsed.plannedGovernance?.adrs[0]?.completed).toBe(false);

    expect(parsed.plannedGovernance?.rules).toHaveLength(2);
    expect(parsed.plannedGovernance?.rules[0]?.text).toBe("Multi-branch collision guard");
    expect(parsed.plannedGovernance?.rules[0]?.completed).toBe(false);
    expect(parsed.plannedGovernance?.rules[1]?.text).toBe(`${plannedRuleTag}: Ephemeral Task Decoupling`);
    expect(parsed.plannedGovernance?.rules[1]?.completed).toBe(true);
    expect(parsed.plannedGovernance?.rules[1]?.tag).toBe(plannedRuleTag);
  });
});

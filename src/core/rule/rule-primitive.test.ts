/**
 * Unit tests for RULE primitives and template rendering.
 * Complies with ADR-7, RULE-3, RULE-11, RULE-13, RULE-23, RULE-34, and RULE-35.
 * @verifies ADR-7, RULE-3, RULE-11, RULE-13, RULE-23, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createFixtureWorkspace, makeTestTag, type FixtureWorkspace } from "../testing/index.ts";
import { renderRuleMarkdown, validateRuleLinks } from "./template.ts";

describe("RULE Primitive - Frontmatter Links Validation (RULE-13, RULE-35)", () => {
  // @verifies RULE-13, RULE-35
  it("[RULE-13][RULE-35] should accept valid ADR link targets", () => {
    const adr1 = makeTestTag("ADR", 101);
    const adr5 = makeTestTag("ADR", 105);
    const adr123 = makeTestTag("ADR", 123);

    expect(() => validateRuleLinks([adr1])).not.toThrow();
    expect(() => validateRuleLinks([adr1, adr5, adr123])).not.toThrow();
  });

  // @verifies RULE-13
  it("[RULE-13] should accept empty links array", () => {
    expect(() => validateRuleLinks([])).not.toThrow();
  });

  // @verifies RULE-13, RULE-35
  it("[RULE-13][RULE-35] should reject non-ADR link targets with RULE-13 error", () => {
    const invalidRule = makeTestTag("RULE", 201);
    const invalidTask = makeTestTag("TASK", 310);
    const validAdr = makeTestTag("ADR", 101);
    const invalidRule2 = makeTestTag("RULE", 202);
    const invalidNonTag = "GIST";
    const rule13 = makeTestTag("RULE", 13);

    expect(() => validateRuleLinks([invalidRule])).toThrow(
      `Invalid rule link target: "${invalidRule}". A RULE artifact's frontmatter links must exclusively reference ADR artifacts (${rule13}).`,
    );
    expect(() => validateRuleLinks([invalidTask])).toThrow(new RegExp(rule13));
    expect(() => validateRuleLinks([validAdr, invalidRule2])).toThrow(new RegExp(rule13));
    expect(() => validateRuleLinks([invalidNonTag])).toThrow(new RegExp(rule13));
  });
});

describe("RULE Primitive - Template Rendering & Disk Roundtrip (RULE-3, RULE-11, RULE-13, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("rule-primitive-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-3, RULE-11, RULE-34
  it("[RULE-3][RULE-11][RULE-34] should render rule markdown with assertion and no frontmatter when links are empty", async () => {
    const ruleTag = makeTestTag("RULE", 101);
    const filename = `universal-governance.${ruleTag}.md`;

    const rendered = renderRuleMarkdown({
      title: "Universal Governance",
      assertion: "All indexable Modie artifacts must follow canonical grammar.",
    });

    expect(rendered.startsWith("---")).toBe(false);
    expect(rendered.trim()).toBe(
      "All indexable Modie artifacts must follow canonical grammar.",
    );

    const filePath = await workspace.writeFile(filename, rendered);
    const diskContent = await workspace.readFile(filePath);
    expect(diskContent).toBe(rendered);
  });

  // @verifies RULE-13, RULE-34, RULE-35
  it("[RULE-13][RULE-34][RULE-35] should render YAML frontmatter when links are present", async () => {
    const linkAdr = makeTestTag("ADR", 105);
    const ruleTag = makeTestTag("RULE", 102);
    const filename = `rule-justification-ancestry.${ruleTag}.md`;

    const rendered = renderRuleMarkdown({
      title: "Rule Justification Ancestry",
      links: [linkAdr],
      assertion:
        "A RULE artifact referencing an ADR must target an ADR residing in the rule's directory or an ancestor directory.",
    });

    expect(rendered.startsWith(`---\nlinks:\n  - ${linkAdr}\n---`)).toBe(true);
    expect(rendered).toContain(
      "A RULE artifact referencing an ADR must target an ADR residing in the rule's directory or an ancestor directory.",
    );

    const filePath = await workspace.writeFile(filename, rendered);
    const diskContent = await workspace.readFile(filePath);
    expect(diskContent).toBe(rendered);
  });

  // @verifies RULE-3, RULE-11, RULE-34
  it("[RULE-3][RULE-11][RULE-34] should generate default assertion statement if none provided", async () => {
    const ruleTag = makeTestTag("RULE", 103);
    const filename = `language-agnostic-rules.${ruleTag}.md`;

    const rendered = renderRuleMarkdown({
      title: "Language Agnostic Rules",
    });

    expect(rendered.trim()).toBe(
      "A discrete invariant assertion regarding Language Agnostic Rules.",
    );

    const filePath = await workspace.writeFile(filename, rendered);
    const diskContent = await workspace.readFile(filePath);
    expect(diskContent).toBe(rendered);
  });
});

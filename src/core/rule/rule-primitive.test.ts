/**
 * Unit tests for RULE primitives and template rendering.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { renderRuleMarkdown, validateRuleLinks } from "./template.ts";

describe("RULE Primitive - Frontmatter Links Validation (RULE-13)", () => {
  // @verifies RULE-13
  it("[RULE-13] should accept valid ADR link targets", () => {
    expect(() => validateRuleLinks(["ADR-1"])).not.toThrow();
    expect(() => validateRuleLinks(["ADR-1", "ADR-5", "ADR-123"])).not.toThrow();
  });

  // @verifies RULE-13
  it("[RULE-13] should accept empty links array", () => {
    expect(() => validateRuleLinks([])).not.toThrow();
  });

  // @verifies RULE-13
  it("[RULE-13] should reject non-ADR link targets with RULE-13 error", () => {
    expect(() => validateRuleLinks(["RULE-1"])).toThrow(
      'Invalid rule link target: "RULE-1". A RULE artifact\'s frontmatter links must exclusively reference ADR artifacts (RULE-13).',
    );
    expect(() => validateRuleLinks(["TASK-10"])).toThrow("RULE-13");
    expect(() => validateRuleLinks(["ADR-1", "RULE-2"])).toThrow("RULE-13");
    expect(() => validateRuleLinks(["GIST"])).toThrow("RULE-13");
  });
});

describe("RULE Primitive - Template Rendering (RULE-3, RULE-11, RULE-13)", () => {
  // @verifies RULE-3, RULE-11
  it("[RULE-3][RULE-11] should render rule markdown with assertion and no frontmatter when links are empty", () => {
    const rendered = renderRuleMarkdown({
      title: "Universal Governance",
      assertion: "All indexable Modie artifacts must follow canonical grammar.",
    });

    expect(rendered.startsWith("---")).toBe(false);
    expect(rendered.trim()).toBe(
      "All indexable Modie artifacts must follow canonical grammar.",
    );
  });

  // @verifies RULE-13
  it("[RULE-13] should render YAML frontmatter when links are present", () => {
    const rendered = renderRuleMarkdown({
      title: "Rule Justification Ancestry",
      links: ["ADR-5"],
      assertion:
        "A RULE artifact referencing an ADR must target an ADR residing in the rule's directory or an ancestor directory.",
    });

    expect(rendered.startsWith("---\nlinks:\n  - ADR-5\n---")).toBe(true);
    expect(rendered).toContain(
      "A RULE artifact referencing an ADR must target an ADR residing in the rule's directory or an ancestor directory.",
    );
  });

  // @verifies RULE-3, RULE-11
  it("[RULE-3][RULE-11] should generate default assertion statement if none provided", () => {
    const rendered = renderRuleMarkdown({
      title: "Language Agnostic Rules",
    });

    expect(rendered.trim()).toBe(
      "A discrete invariant assertion regarding Language Agnostic Rules.",
    );
  });
});

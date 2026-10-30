/**
 * Unit tests for ADR primitives and template rendering.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { renderAdrMarkdown, validateAdrLinks } from "./template.ts";

describe("ADR Primitive - Frontmatter Links Validation (RULE-14)", () => {
  // @verifies RULE-14
  it("[RULE-14] should accept valid ADR and RULE link targets", () => {
    expect(() => validateAdrLinks(["ADR-1"])).not.toThrow();
    expect(() => validateAdrLinks(["RULE-8"])).not.toThrow();
    expect(() => validateAdrLinks(["ADR-1", "RULE-8", "ADR-4"])).not.toThrow();
  });

  // @verifies RULE-14
  it("[RULE-14] should accept empty links array", () => {
    expect(() => validateAdrLinks([])).not.toThrow();
  });

  // @verifies RULE-14
  it("[RULE-14] should reject TASK, MOTIVE, GIST and invalid link targets with RULE-14 error", () => {
    expect(() => validateAdrLinks(["TASK-1"])).toThrow(
      'Invalid ADR link target: "TASK-1". An ADR artifact\'s frontmatter links must exclusively reference ADR or RULE artifacts (RULE-14).',
    );
    expect(() => validateAdrLinks(["MOTIVE-1"])).toThrow("RULE-14");
    expect(() => validateAdrLinks(["GIST-1"])).toThrow("RULE-14");
    expect(() => validateAdrLinks(["INVALID"])).toThrow("RULE-14");
  });
});

describe("ADR Primitive - Template Rendering (ADR-4, RULE-14)", () => {
  // @verifies ADR-4, RULE-14
  it("[ADR-4][RULE-14] should render standard ADR sections with frontmatter links", () => {
    const rendered = renderAdrMarkdown({
      title: "Subtype Directory Partitioning",
      links: ["RULE-8", "ADR-2"],
      context:
        "Enforcing strict dedicated folders creates unnecessary directory sprawl.",
      alternatives: "- Strict Mandatory Folders\n- Strict Flat Colocation",
      decision: "We adopt a permissive containment model.",
    });

    expect(rendered).toContain("links:\n  - RULE-8\n  - ADR-2");
    expect(rendered).toContain(
      "# Context\n\nEnforcing strict dedicated folders creates unnecessary directory sprawl.",
    );
    expect(rendered).toContain(
      "# Alternatives Considered\n\n- Strict Mandatory Folders\n- Strict Flat Colocation",
    );
    expect(rendered).toContain(
      "# Decision\n\nWe adopt a permissive containment model.",
    );
  });

  // @verifies ADR-4
  it("[ADR-4] should render frontmatter with links: [] when links are empty", () => {
    const rendered = renderAdrMarkdown({
      title: "Standalone Decision",
      links: [],
    });

    expect(rendered).toContain("links: []");
    expect(rendered).toContain("# Context");
    expect(rendered).toContain("# Alternatives Considered\n\n- None recorded.");
    expect(rendered).toContain("# Decision");
  });

  // @verifies ADR-4
  it("[ADR-4] should provide sensible defaults for missing section texts", () => {
    const rendered = renderAdrMarkdown({
      title: "Defaulted Decision",
    });

    expect(rendered).toContain(
      "Architecture decision context and motivation for Defaulted Decision.",
    );
    expect(rendered).toContain("- None recorded.");
    expect(rendered).toContain(
      "Adopted decision regarding Defaulted Decision.",
    );
  });

  // @verifies ADR-4, ADR-8, RULE-26
  it("[ADR-4][ADR-8][RULE-26] should render summary in canonical YAML frontmatter when provided", () => {
    const rendered = renderAdrMarkdown({
      title: "Signpost Progressive Disclosure",
      summary:
        "Emit 1-2 sentence ADR summaries during context compilation to prevent prompt bloat.",
      links: ["ADR-4", "RULE-26"],
      context: "Full ADR bodies bloat upward context compilation.",
      decision: "Adopt frontmatter summary field.",
    });

    expect(rendered).toContain(
      "---\nsummary: Emit 1-2 sentence ADR summaries during context compilation to prevent prompt bloat.\nlinks:\n  - ADR-4\n  - RULE-26\n---",
    );
  });

  // @verifies ADR-4, ADR-8
  it("[ADR-4][ADR-8] should collapse multi-line summary into single-line YAML frontmatter and omit blank summary", () => {
    const multiLine = renderAdrMarkdown({
      title: "Multi-line Summary ADR",
      summary: "First sentence.\n  Second sentence.",
    });
    expect(multiLine).toContain(
      "---\nsummary: First sentence. Second sentence.\nlinks: []\n---",
    );

    const blankSummary = renderAdrMarkdown({
      title: "Blank Summary ADR",
      summary: "   ",
    });
    expect(blankSummary).not.toContain("summary:");
  });
});

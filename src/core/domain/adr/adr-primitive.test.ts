/**
 * Unit tests for ADR primitives and template rendering.
 * Tagged per RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { formatArtifactFilename } from "../common/filename.ts";
import { formatArtifactTag } from "../common/tag.ts";
import {
  extractAdrSummary,
  parseAdrMarkdown,
  renderAdrMarkdown,
  validateAdrLinks,
} from "./template.ts";
import { validateAdrTitle } from "./validation.ts";

describe("ADR Primitive - Frontmatter Links Validation (RULE-14, RULE-35)", () => {
  // @verifies RULE-14, RULE-35
  it("[RULE-14][RULE-35] should accept valid ADR and RULE link targets", () => {
    const adr1 = formatArtifactTag("ADR", 1);
    const rule8 = formatArtifactTag("RULE", 8);
    const adr4 = formatArtifactTag("ADR", 4);
    expect(() => validateAdrLinks([adr1])).not.toThrow();
    expect(() => validateAdrLinks([rule8])).not.toThrow();
    expect(() => validateAdrLinks([adr1, rule8, adr4])).not.toThrow();
  });

  // @verifies RULE-14
  it("[RULE-14] should accept empty links array", () => {
    expect(() => validateAdrLinks([])).not.toThrow();
  });

  // @verifies RULE-14, RULE-35
  it("[RULE-14][RULE-35] should reject TASK, MOTIVE and invalid link targets with RULE-14 error", () => {
    const task1 = formatArtifactTag("TASK", 1);
    const motive1 = formatArtifactTag("MOTIVE", 1);

    expect(() => validateAdrLinks([task1])).toThrow(
      `Invalid ADR link target: "${task1}". An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts.`,
    );
    expect(() => validateAdrLinks([motive1])).toThrow(
      `Invalid ADR link target: "${motive1}". An ADR artifact's frontmatter links must exclusively reference ADR or RULE artifacts.`,
    );
    expect(() => validateAdrLinks(["INVALID"])).toThrow(
      'Invalid ADR link target: "INVALID". An ADR artifact\'s frontmatter links must exclusively reference ADR or RULE artifacts.',
    );
  });
});

describe("ADR Primitive - Template Rendering (RULE-14, RULE-35)", () => {
  // @verifies RULE-14, RULE-35
  it("[RULE-14][RULE-35] should render standard ADR sections with frontmatter links", () => {
    const rule8 = formatArtifactTag("RULE", 8);
    const adr2 = formatArtifactTag("ADR", 2);
    const rendered = renderAdrMarkdown({
      title: "Subtype Directory Partitioning",
      links: [rule8, adr2],
      contextSection:
        "Enforcing strict dedicated folders creates unnecessary directory sprawl.",
      alternatives: "- Strict Mandatory Folders\n- Strict Flat Colocation",
      decision: "We adopt a permissive containment model.",
    });

    expect(rendered).toContain(`links:\n  - ${rule8}\n  - ${adr2}`);
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

  // @verifies RULE-14
  it("[RULE-14] should render frontmatter with links: [] when links are empty", () => {
    const rendered = renderAdrMarkdown({
      title: "Standalone Decision",
      links: [],
    });

    expect(rendered).toContain("links: []");
    expect(rendered).toContain("# Context");
    expect(rendered).toContain("# Alternatives Considered\n\n- None recorded.");
    expect(rendered).toContain("# Decision");
  });

  // @verifies RULE-38
  it("[RULE-38] should provide sensible defaults for missing section texts", () => {
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
    expect(rendered).toContain("# Consequences\n\n- None recorded.");
  });

  // @verifies RULE-38
  it("[RULE-38] should render consequences section when provided", () => {
    const rendered = renderAdrMarkdown({
      title: "Consolidated Tools",
      links: [],
      decision: "Adopt 5 consolidated tools.",
      consequences: "- Reduced cognitive load.\n- Controlled trade-off.",
    });

    expect(rendered).toContain(
      "# Consequences\n\n- Reduced cognitive load.\n- Controlled trade-off.",
    );
  });

  // @verifies RULE-26
  it("[RULE-26] should parse ADR markdown with consequences and summary", () => {
    const markdown = renderAdrMarkdown({
      title: "Extracted ADR",
      summary: "Short signpost summary.",
      links: [],
      contextSection: "Context content.",
      alternatives: "Alternatives content.",
      decision: "Decision content.",
      consequences: "Consequences content.",
    });

    const filename = formatArtifactFilename({
      slug: "extracted-adr",
      subtype: "ADR",
      id: "999",
    });
    const parsed = parseAdrMarkdown(markdown, filename);
    expect(parsed.summary).toBe("Short signpost summary.");
    expect(parsed.contextSection).toBe("Context content.");
    expect(parsed.alternatives).toBe("Alternatives content.");
    expect(parsed.decision).toBe("Decision content.");
    expect(parsed.consequences).toBe("Consequences content.");
  });

  // @verifies RULE-26, RULE-35
  it("[RULE-26][RULE-35] should render summary in canonical YAML frontmatter when provided", () => {
    const adr4 = formatArtifactTag("ADR", 4);
    const rule26 = formatArtifactTag("RULE", 26);
    const rendered = renderAdrMarkdown({
      title: "Signpost Progressive Disclosure",
      summary:
        "Emit 1-2 sentence ADR summaries during context compilation to prevent prompt bloat.",
      links: [adr4, rule26],
      contextSection: "Full ADR bodies bloat upward context compilation.",
      decision: "Adopt frontmatter summary field.",
    });

    expect(rendered).toContain(
      `---\nsummary: Emit 1-2 sentence ADR summaries during context compilation to prevent prompt bloat.\nlinks:\n  - ${adr4}\n  - ${rule26}\n---`,
    );
  });

  // @verifies RULE-26
  it("[RULE-26] should collapse multi-line summary into single-line YAML frontmatter and omit blank summary", () => {
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

describe("ADR Summary Extraction (RULE-26)", () => {
  it("[RULE-26] should prefer explicit frontmatter summary and fallback to Decision or Context when omitted", () => {
    const withExplicit = `---
summary: Explicit frontmatter summary.
links: []
---

# Context

Context paragraph.

# Decision

Decision paragraph.
`;
    expect(extractAdrSummary(withExplicit, "test-adr")).toBe(
      "Explicit frontmatter summary.",
    );

    const withDecision = `---
links: []
---

# Context

Context paragraph.

# Decision

We adopt the Signpost Model with Progressive On-Demand Disclosure.

Additional details in second paragraph.
`;
    expect(extractAdrSummary(withDecision, "test-adr")).toBe(
      "We adopt the Signpost Model with Progressive On-Demand Disclosure.",
    );

    const withContextOnly = `---
links: []
---

# Context

Fallback context description when Decision is absent.
`;
    expect(extractAdrSummary(withContextOnly, "test-adr")).toBe(
      "Fallback context description when Decision is absent.",
    );

    const emptyDoc = `---\nlinks: []\n---\n`;
    expect(extractAdrSummary(emptyDoc, "fallback-slug-title")).toBe(
      "fallback slug title",
    );
  });
});

describe("ADR Primitive - Tombstone ADR Title Validation (RULE-1, RULE-4, RULE-38)", () => {
  // @verifies RULE-1, RULE-4, RULE-38
  it("[RULE-1][RULE-4][RULE-38] should accept forward-looking architectural decision titles", () => {
    expect(() =>
      validateAdrTitle("Deterministic Context Compilation"),
    ).not.toThrow();
    expect(() =>
      validateAdrTitle("Declarative CLI Engine Architecture"),
    ).not.toThrow();
    expect(() =>
      validateAdrTitle("Signpost Model with Progressive On-Demand Disclosure"),
    ).not.toThrow();
  });

  // @verifies RULE-1, RULE-4, RULE-38
  it("[RULE-1][RULE-4][RULE-38] should reject titles containing sunset or deletion keywords", () => {
    const tombstoneTitles = [
      "Sunset Legacy Markdown Parser",
      "Retire Deprecated Tooling",
      "Deprecate Old Configuration Options",
      "Delete Redundant Graph Index",
      "Remove Legacy CLI Wrapper",
      "Cleanup Obsolete Fixtures",
    ];

    for (const title of tombstoneTitles) {
      expect(() => validateAdrTitle(title)).toThrow(
        /Tombstone ADR detected.*ADRs must constrain future code/s,
      );
    }
  });

  // @verifies RULE-1, RULE-4, RULE-38
  it("[RULE-1][RULE-4][RULE-38] should allow tombstone keywords when force is true", () => {
    expect(() =>
      validateAdrTitle("Sunset Legacy Pipeline", true),
    ).not.toThrow();
    expect(() =>
      validateAdrTitle("Deprecate Old Protocol", true),
    ).not.toThrow();
  });
});


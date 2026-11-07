/**
 * Unit tests for extractAdrSummary.
 * @verifies ADR-4, ADR-8, RULE-26
 */

import { describe, expect, it } from "bun:test";
import { extractAdrSummary } from "./summary.ts";

describe("ADR Summary Extraction (ADR-4, ADR-8, RULE-26)", () => {
  it("[ADR-4][ADR-8][RULE-26] should prefer explicit frontmatter summary and fallback to Decision or Context when omitted", () => {
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

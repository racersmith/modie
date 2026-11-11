/**
 * Unit tests for foundational Markdown parsing and frontmatter handling layer.
 * @verifies ADR-4, RULE-1, RULE-25, RULE-26, RULE-35
 */

import { describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../domain/index.ts";
import {
  buildArtifactParseContext,
  parseFrontmatterFields,
  parseFrontmatterLineMap,
  parseMarkdownDocument,
  parseMarkdownSections,
  splitMarkdownFrontmatter,
} from "./index.ts";

describe("Markdown Foundational Layer - splitMarkdownFrontmatter (RULE-1, RULE-25)", () => {
  it("[RULE-1][RULE-25] should split valid YAML frontmatter and markdown body", () => {
    const adr1Tag = formatArtifactTag("ADR", 1);
    const content = `---
links:
  - ${adr1Tag}
---

# Context

Body text here.
`;

    const { frontmatter, body } = splitMarkdownFrontmatter(content);
    expect(frontmatter).toBe(`links:\n  - ${adr1Tag}`);
    expect(body).toBe("# Context\n\nBody text here.");
  });

  it("[RULE-1][RULE-25] should return empty frontmatter when document has no opening delimiter", () => {
    const content = `# Context\n\nSome content\n---\nMore content after horizontal rule.`;
    const { frontmatter, body } = splitMarkdownFrontmatter(content);
    expect(frontmatter).toBe("");
    expect(body).toBe(content);
  });

  it("[RULE-1][RULE-25] should return empty frontmatter when opening delimiter is unclosed", () => {
    const adr1Tag = formatArtifactTag("ADR", 1);
    const content = `---\nlinks:\n  - ${adr1Tag}\n# Context\nUnclosed frontmatter`;
    const { frontmatter, body } = splitMarkdownFrontmatter(content);
    expect(frontmatter).toBe("");
    expect(body).toBe(content);
  });

  it("[RULE-1][RULE-25] should not prematurely split on mid-line --- inside frontmatter comments or values", () => {
    const adr1Tag = formatArtifactTag("ADR", 1);
    const content = `---
# --- Governance Links ---
links:
  - ${adr1Tag}
---

# Context

Body text with --- horizontal rule:
---
End of body.`;

    const { frontmatter, body } = splitMarkdownFrontmatter(content);
    expect(frontmatter).toBe(
      `# --- Governance Links ---\nlinks:\n  - ${adr1Tag}`,
    );
    expect(body).toBe(
      "# Context\n\nBody text with --- horizontal rule:\n---\nEnd of body.",
    );
  });

  it("[RULE-1][RULE-25] should handle CRLF line endings cleanly", () => {
    const rule1Tag = formatArtifactTag("RULE", 1);
    const content = `---\r\nlinks:\r\n  - ${rule1Tag}\r\n---\r\n\r\nRule assertion text.\r\n`;
    const { frontmatter, body } = splitMarkdownFrontmatter(content);
    expect(frontmatter).toBe(`links:\r\n  - ${rule1Tag}`);
    expect(body).toBe("Rule assertion text.");
  });
});

describe("Markdown Foundational Layer - parseFrontmatterFields (RULE-1, RULE-25, RULE-35)", () => {
  it("[RULE-1][RULE-25][RULE-35] should parse block list links and depends_on fields", () => {
    const adr1Tag = formatArtifactTag("ADR", 1);
    const rule2Tag = formatArtifactTag("RULE", 2);
    const task3Tag = formatArtifactTag("TASK", 3);

    const frontmatter = `
# Frontmatter comment
depends_on:
  - ${task3Tag}

links:
  - "${adr1Tag}"
  - '${rule2Tag}'
`;

    const parsed = parseFrontmatterFields(frontmatter);
    expect(parsed.links).toEqual([adr1Tag, rule2Tag]);
    expect(parsed.depends_on).toEqual([task3Tag]);
  });

  it("[RULE-1][RULE-25][RULE-35] should parse inline bracketed arrays and omit empty depends_on", () => {
    const adr4Tag = formatArtifactTag("ADR", 4);
    const rule9Tag = formatArtifactTag("RULE", 9);

    const parsed = parseFrontmatterFields(
      `depends_on: []\nlinks: [${adr4Tag}, "${rule9Tag}"]`,
    );
    expect(parsed.links).toEqual([adr4Tag, rule9Tag]);
    expect(parsed.depends_on).toBeUndefined();
  });

  it("[RULE-1][RULE-25][RULE-35] should ignore unrelated YAML keys between or after target lists", () => {
    const adr1Tag = formatArtifactTag("ADR", 1);
    const adr2Tag = formatArtifactTag("ADR", 2);

    const frontmatter = `
links:
  - ${adr1Tag}
supersedes:
  - ${adr2Tag}
superseded_by: []
`;

    const parsed = parseFrontmatterFields(frontmatter);
    expect(parsed.links).toEqual([adr1Tag]);
    expect(parsed.supersedes).toEqual([adr2Tag]);
    expect(parsed.superseded_by).toBeUndefined();
    expect(parsed.depends_on).toBeUndefined();
  });

  it("[ADR-4][RULE-1][RULE-25][RULE-35] should parse supersedes and superseded_by in block, inline array, and scalar formats and map line numbers", () => {
    const adr1Tag = formatArtifactTag("ADR", 1);
    const adr2Tag = formatArtifactTag("ADR", 2);
    const adr3Tag = formatArtifactTag("ADR", 3);

    const docText = `---
summary: Unified parser test
links:
  - ${adr1Tag}
supersedes: [${adr2Tag}]
superseded_by: ${adr3Tag}
---

# Context

Unified context section.
`;

    const doc = parseMarkdownDocument(docText);
    expect(doc.frontmatterFields.summary).toBe("Unified parser test");
    expect(doc.frontmatterFields.links).toEqual([adr1Tag]);
    expect(doc.frontmatterFields.supersedes).toEqual([adr2Tag]);
    expect(doc.frontmatterFields.superseded_by).toEqual([adr3Tag]);
    expect(doc.sections["Context"]).toBe("Unified context section.");

    const lineMap = parseFrontmatterLineMap(docText.split("\n"));
    expect(lineMap.frontmatterEndLine).toBe(7);
    expect(lineMap.linkLines.get(3)).toBe("links");
    expect(lineMap.linkLines.get(4)).toBe("links");
    expect(lineMap.linkLines.get(5)).toBe("supersedes");
    expect(lineMap.linkLines.get(6)).toBe("superseded_by");
  });

  it("[ADR-8][RULE-25][RULE-26] should parse inline, quoted, and folded block summary fields from frontmatter", () => {
    const adr1Tag = formatArtifactTag("ADR", 1);

    const inlineParsed = parseFrontmatterFields(
      `summary: Adopt flat self-indexing filenames.\nlinks:\n  - ${adr1Tag}`,
    );
    expect(inlineParsed.summary).toBe("Adopt flat self-indexing filenames.");
    expect(inlineParsed.links).toEqual([adr1Tag]);

    const quotedParsed = parseFrontmatterFields(
      `summary: "Quoted summary: with colon"\nlinks: []`,
    );
    expect(quotedParsed.summary).toBe("Quoted summary: with colon");

    const blockParsed = parseFrontmatterFields(
      `summary: >\n  First sentence of summary.\n  Second sentence of summary.\nlinks:\n  - ${adr1Tag}`,
    );
    expect(blockParsed.summary).toBe(
      "First sentence of summary. Second sentence of summary.",
    );
  });
});

describe("Markdown Foundational Layer - parseMarkdownSections (RULE-1, RULE-25, RULE-26)", () => {
  it("[RULE-1][RULE-25][RULE-26] should extract level-1 sections while preserving level-2 subheadings inside sections", () => {
    const body = `# Context

Context paragraph.

# Alternatives Considered

- Option A
- Option B

# Decision

We adopt Option A.

## 1. Naming & Storage

Details under subheading 1.

## 2. Verification

Details under subheading 2.
`;

    const sections = parseMarkdownSections(body);
    expect(Object.keys(sections)).toEqual([
      "Context",
      "Alternatives Considered",
      "Decision",
    ]);
    expect(sections["Context"]).toBe("Context paragraph.");
    expect(sections["Alternatives Considered"]).toBe("- Option A\n- Option B");
    expect(sections["Decision"]).toContain("## 1. Naming & Storage");
    expect(sections["Decision"]).toContain("## 2. Verification");
  });

  it("[RULE-1][RULE-25][RULE-26] should ignore # comment lines inside fenced code blocks", () => {
    const body = `# Decision

We use a line-delimited ledger format:

\`\`\`text
# Modie GIST Ledger
DIR_INPUT   7d8f9a2e10

# Local Source Files: <filename> <source_hash> <baseline_hash>
active-scanner.ts    3f8a02c914    3f8a02c914
\`\`\`

And with tilde fences:

~~~bash
# Shell comment inside tilde fence
git diff HEAD
~~~

Final decision paragraph.

# Consequences

- Fast zero-read verification.
`;

    const sections = parseMarkdownSections(body);
    expect(Object.keys(sections)).toEqual(["Decision", "Consequences"]);
    expect(sections["Decision"]).toContain("# Modie GIST Ledger");
    expect(sections["Decision"]).toContain(
      "# Shell comment inside tilde fence",
    );
    expect(sections["Decision"]).toContain("Final decision paragraph.");
    expect(sections["Consequences"]).toBe("- Fast zero-read verification.");
  });

  it("[ADR-4][RULE-25] should compile unified document and ArtifactParseContext", () => {
    const rule1Tag = formatArtifactTag("RULE", 1);
    const adr10Tag = formatArtifactTag("ADR", 10);
    const raw = `---
links:
  - ${rule1Tag}
---
# Title
Custom Title

# Context
Context line.
`;

    const doc = parseMarkdownDocument(raw);
    expect(doc.frontmatterFields.links).toEqual([rule1Tag]);
    expect(doc.sections["Title"]).toBe("Custom Title");

    const ctx = buildArtifactParseContext(raw, {
      filename: `custom-slug.${adr10Tag}.md`,
      filepath: `src/.modie/adrs/custom-slug.${adr10Tag}.md`,
    });

    expect(ctx.id).toBe("10");
    expect(ctx.slug).toBe("custom-slug");
    expect(ctx.title).toBe("Custom Title");
    expect(ctx.frontmatterFields.links).toEqual([rule1Tag]);
    expect(ctx.sections["Context"]).toBe("Context line.");
  });
});

---
depends_on:
  - TASK-64

links:
  - RULE-1
  - RULE-36
---

# Context

Per the maintainability review (§4.8), frontmatter handling is currently burdened by accidental complexity across two ad-hoc, brittle implementations:
1. `parseFrontmatterFields` (CC 36, 112 lines) in `src/core/query/markdown-parser.ts`, which attempts to hand-parse YAML scalars, quotes, and block/inline arrays across multiple fields.
2. `mutateFrontmatterListField` (CC 31, 178 lines) in `src/core/linking/mutation.ts`, which performs complex string surgery and lookahead loops under the mistaken assumption that YAML frontmatter had to be preserved byte-for-byte.

As mandated by `RULE-36`, mutations must update YAML frontmatter idempotently **without altering the document body**. Empirical analysis shows all Modie artifacts use standard machine-readable YAML frontmatter without comments, while user prose, checklists, and code live in the markdown body.

Rather than building a complex custom AST tokenizer engine, replace the hand-rolled string parsers with Bun's built-in native YAML engine (`import { YAML } from "bun"`):
- **Field Extraction (`parseFrontmatterFields`)**: Use `YAML.parse(frontmatterStr)` to extract `links`, `depends_on`, `supersedes`, `superseded_by`, and `summary`. Replaces 112 lines of ad-hoc parsing with ~15 lines (CC ≤ 3) with full YAML spec compliance out of the box.
- **Frontmatter Mutation (`mutateFrontmatterListField`)**: Split the document on the frontmatter closing fence (`---`), parse the frontmatter with `YAML.parse`, update target arrays idempotently, serialize back canonically via `YAML.stringify(data, null, 2)`, and reattach the untouched markdown body. Replaces 178 lines of regex surgery with ~25 lines (CC ≤ 4) while guaranteeing 100% byte-for-byte preservation of the document body.
- **Line Mapping (`parseFrontmatterLineMap`)**: Maintain a clean, lightweight line scanner for `references.ts` to map frontmatter line numbers to key names for citation classification.

# Acceptance Criteria

- [ ] Reimplement `parseFrontmatterFields` using Bun's native `YAML.parse`, reducing cyclomatic complexity from 36 to <= 5 and LOC from 112 to < 25.
- [ ] Reimplement `mutateFrontmatterListField` using Bun's native `YAML.parse` and `YAML.stringify`, reducing cyclomatic complexity from 31 to <= 5 and LOC from 178 to < 35.
- [ ] Guarantee 100% byte-for-byte preservation of the markdown document body during frontmatter mutations per `RULE-36`.
- [ ] Streamline `parseFrontmatterLineMap` as a lightweight line scanner (CC <= 5) for citation classification in `references.ts`.
- [ ] Verify complete compatibility across frontmatter parser, linking, and archival mutation test suites with zero regressions.
- [ ] User Review

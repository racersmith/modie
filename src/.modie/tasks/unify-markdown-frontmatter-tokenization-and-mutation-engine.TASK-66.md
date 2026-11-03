---
depends_on:
  - TASK-64

links:
  - RULE-1
  - RULE-36
---

# Context

Per the maintainability review (§4.8), frontmatter handling is currently fragmented across three independent, ad-hoc YAML-like parsing implementations:
1. `parseFrontmatterFields` (CC 36, 112 lines) in `src/core/query/markdown-parser.ts`, which repeats near-identical parsing loops across four list fields (`links`, `depends_on`, `supersedes`, `superseded_by`).
2. `parseFrontmatterLineMap` (63 lines) in `src/core/query/markdown-parser.ts`, which re-parses frontmatter lines independently to calculate line number mappings.
3. `mutateFrontmatterListField` (CC 31, 178 lines) in `src/core/linking/mutation.ts`, which maintains its own fence regex and list-item rules to perform string splices.

Because these three implementations parse YAML independently using separate regexes, they can diverge on edge cases (such as blank lines within lists, inline array brackets `[]`, comment lines, and mixed indentation).

To eliminate this structural duplication and guarantee consistency:
- Implement a canonical frontmatter tokenizer:
  `scanFrontmatter(raw: string) => { fence: { startLine, endLine }, blocks: FrontmatterBlock[] }`
  where each block captures `{ key, startLine, endLine, items: string[], inline: boolean }`.
- Reimplement `parseFrontmatterFields` as a single fold over the scanned blocks across configured list fields (`LIST_FIELDS = ["links", "depends_on", "supersedes", "superseded_by"]`), reducing cyclomatic complexity to ≤ 10.
- Reimplement `parseFrontmatterLineMap` as a direct line-number projection of the scanned blocks.
- Reimplement `mutateFrontmatterListField` to perform surgical block splicing using tokenizer line boundaries, guaranteeing byte-for-byte formatting and comment preservation for all surrounding document content.

# Acceptance Criteria

- [ ] Implement a unified frontmatter tokenizer/scanner `scanFrontmatter(raw)` that parses YAML fences, keys, and scalar/list blocks deterministically.
- [ ] Reimplement `parseFrontmatterFields` as a single fold over scanned blocks across all list fields (`links`, `depends_on`, `supersedes`, `superseded_by`), reducing CC to <= 10.
- [ ] Reimplement `parseFrontmatterLineMap` as a direct line-number projection of scanned blocks.
- [ ] Reimplement `mutateFrontmatterListField` using tokenized block boundaries while preserving byte-for-byte formatting and comments of surrounding document content.
- [ ] Verify complete compatibility against frontmatter parser, linking, and archival mutation test suites with zero regressions.
- [ ] User Review

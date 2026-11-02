---
depends_on:
  - TASK-64

links:
  - RULE-1
  - RULE-36
---

# Context

Unify the three separate frontmatter parsing and mutation implementations (parseFrontmatterFields CC 36, parseFrontmatterLineMap, mutateFrontmatterListField CC 31) into a single deterministic scanFrontmatter tokenizer in src/core/query/markdown-parser.ts and src/core/linking/mutation.ts. Preserves byte-for-byte fidelity of surrounding document content and comments while eliminating duplicated block slicing logic.

# Acceptance Criteria

- [ ] Implement a unified frontmatter tokenizer/scanner scanFrontmatter that parses YAML fences, keys, and scalar/list blocks deterministically
- [ ] Reimplement parseFrontmatterFields as a single fold over scanned blocks across all list fields (links, depends_on, supersedes, superseded_by), reducing CC to <= 10
- [ ] Reimplement parseFrontmatterLineMap as a direct line-number projection of scanned blocks
- [ ] Reimplement mutateFrontmatterListField using tokenized block boundaries while preserving byte-for-byte formatting of surrounding document content
- [ ] Verify complete compatibility against frontmatter parser and linking test suites
- [ ] User Review

---
depends_on: []

links:
  - RULE-25
  - RULE-31
  - ADR-4
  - ADR-5
---

# Context

Replace linear filesystem directory crawling in findArtifactReferences with git-native indexing (git grep or in-memory AST caching) to improve citation scan performance on large codebases.

# Acceptance Criteria

- [x] Implement git-native citation discovery using git grep / index query
- [x] Maintain fallback for untracked files in the working directory
- [x] Benchmark and optimize query execution
- [x] Verify all references tests pass with identical citation discovery results

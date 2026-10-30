---
depends_on: []

links:
  - RULE-20
  - RULE-9
  - RULE-8
  - RULE-12
  - ADR-2
  - ADR-4
  - ADR-8
  - ADR-10
---

# Context

Establish the foundational GIST domain module in src/core/gist providing canonical path resolution, data structures, and discovery reader services per RULE-20, ADR-8, and ADR-10. This service enables discovering and loading directory-level summaries (<dir>/.modie/gists/GIST.md), file-level implementation proxies (<dir>/.modie/gists/<filename>.GIST.md), and immediate child directory signposts without coupling to full freshness hashing or AST parsing. Serves as the core contract and prerequisite for unified context compilation (TASK-54).

# Acceptance Criteria

- [ ] Define core domain types for directory GISTs, file-level GIST proxies, and child signposts conforming to RULE-20 and ADR-10
- [ ] Implement path resolution utilities for <dir>/.modie/gists/GIST.md and <dir>/.modie/gists/<filename>.GIST.md
- [ ] Implement reader services to resolve all local GISTs (directory summary and file proxies) for a given target path (RULE-9, RULE-20)
- [ ] Implement shallow signpost discovery service to locate immediate child directory GIST summaries (depth=1) per ADR-8
- [ ] Export public GIST discovery and pathing APIs from core index
- [ ] Verify resolution and discovery across nested directories and edge cases with test coverage
- [ ] User Review

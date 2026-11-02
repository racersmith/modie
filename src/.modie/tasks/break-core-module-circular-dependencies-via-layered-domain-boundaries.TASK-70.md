---
depends_on:
  - TASK-65
  - TASK-66
  - TASK-67
  - TASK-68
  - TASK-69

links:
  - RULE-1
  - RULE-8
  - RULE-28
---

# Context

Eliminate the 8 mutual 2-cycles in src/core (pipeline <-> adr, pipeline <-> rule, pipeline <-> task, pipeline <-> query, query <-> task, archival <-> adr, archival <-> rule, resolver <-> vcs) per the maintainability review. Establish a layered architecture: foundation (common, markdown, pure vcs port), domain (rules, adrs, tasks, gists, motives, linking), application (pipeline, query context/references), and composition root (core/registry.ts). Separate pure VCS git execution from artifact history inspection.

# Acceptance Criteria

- [ ] Establish foundational layer (src/core/common, src/core/markdown) for tag parsing, filename formatting, and frontmatter handling without upward imports
- [ ] Invert ArtifactDefinition registration: pipeline defines DefinitionRegistry; concrete definitions register via a composition root src/core/registry.ts
- [ ] Separate IVcsAdapter into pure VCS operations and move artifact-specific git tree inspection into src/core/resolver/artifact-history.ts
- [ ] Break all mutual 2-cycles across src/core, verified via bun run check:complexity cycles
- [ ] Verify entire test suite passes cleanly
- [ ] User Review

---
summary: Decompose oversized MCP interface modules, lifecycle guard/query services, and large test files into cohesive, single-responsibility modules without changing public APIs or behavior.

depends_on: []

links:
  - RULE-28
  - RULE-34
  - RULE-35
---

# Context

Several source and test files have grown beyond the 500-line maintainability threshold, triggering oxlint max-lines warnings on MCP handler and renderer monoliths and creating a 1,300+ line lifecycle branching test file. This parent task coordinates decomposing both areas along existing feature and responsibility boundaries while keeping all barrel exports intact, deduplicating repeated boilerplate, and clearing all lint warnings.

# Acceptance Criteria

- [ ] MCP interface handlers, Markdown renderers, tool registration wrappers, and integration tests are decomposed by feature cluster with zero breaking changes to public exports
- [ ] Lifecycle collision guards, historical query services, and branching test suites are decomposed by responsibility with shared test fixture helpers and zero breaking changes to public exports
- [ ] All repository verification checks pass with zero lint warnings across the modularized source modules
- [ ] User Review

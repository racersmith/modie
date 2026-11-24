---
summary: Split MCP handlers, Markdown renderers, server tool wrappers, and integration tests by feature cluster while deduplicating active-task scope inference.

depends_on: []

links:
  - RULE-25
  - RULE-26
  - RULE-34
  - RULE-35
---

# Context

Decompose MCP handlers into exploration, lifecycle, authoring, mutation, and shared scope/task resolution helpers (deduplicating the repeated branch-to-task-to-scope lookup across exploration and authoring handlers); split Markdown renderers into artifact, mission brief, directory context, and task queue modules; extract shared Markdown and structured tool registration wrappers in the MCP server; and split the MCP integration test suite by cluster with a shared test harness helper. Preserve all public barrel exports.

# Acceptance Criteria

- [ ] MCP tool handlers are organized into cohesive feature-cluster modules with shared active-task ID and default scope inference helpers eliminating duplicated branch-to-scope lookup logic
- [ ] MCP Markdown renderers are organized into separate modules for artifact rendering, mission briefs, directory context, and task queues while preserving all public exports
- [ ] MCP server tool registration uses shared registration wrappers for Markdown and structured JSON tools to eliminate repeated workspace-resolution and error-envelope boilerplate
- [ ] MCP integration tests are split by feature cluster using a shared test harness helper, and all repository verification checks pass with zero lint warnings in the MCP interface
- [ ] User Review

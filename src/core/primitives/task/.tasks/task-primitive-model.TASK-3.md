---
depends_on:
  - TASK-2

links:
  - ADR-1
  - ADR-4
  - ADR-6
  - RULE-1
  - RULE-15
  - RULE-18
  - RULE-22
---

# Context

As part of `src/core/primitives/task`, we need strongly-typed domain models, filename parsing/formatting utilities, frontmatter schema definitions, and markdown template generators for `TASK` artifacts.

This encapsulates task representation and template construction into a reusable core primitive that can be leveraged by the watermark resolver, creation service, CLI, and MCP interfaces.

# Acceptance Criteria

- [ ] Define `TaskArtifact` data structure and frontmatter types (`depends_on`, `links`, title, slug, id).
- [ ] Implement slug generator that converts arbitrary task titles to kebab-case slugs per RULE-1.
- [ ] Implement task filename formatter and parser conforming to `[slug].TASK-[ID].md`.
- [ ] Implement default task markdown template generator producing frontmatter, `# Context`, and `# Acceptance Criteria` checklist sections (RULE-22).
- [ ] Implement acceptance criteria checklist parser and validator.
- [ ] Add unit tests verifying slugification, filename formatting, and template rendering.

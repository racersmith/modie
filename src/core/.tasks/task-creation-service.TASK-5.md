---
depends_on:
  - TASK-3
  - TASK-4

links:
  - ADR-4
  - ADR-6
  - RULE-6
  - RULE-8
  - RULE-12
  - RULE-25
---

# Context

We need an orchestrating task creation domain service within `src/core` that coordinates watermark resolution, template generation, filesystem scoping, and file writing.

In compliance with RULE-25 (Interface-Core Decoupling), this service must be exposed via `src/core/index.ts` so that interfaces (CLI, MCP, etc.) interact strictly through this public API rather than manipulating files directly.

# Acceptance Criteria

- [ ] Implement `createTask` domain function in `src/core` accepting title, optional scope directory, links, and context.
- [ ] Resolve target file location adhering to RULE-8 (`<dir>/.tasks/[slug].TASK-[ID].md` or `<dir>/[slug].TASK-[ID].md`).
- [ ] Validate task placement and downward blast radius constraints per RULE-6 and RULE-12.
- [ ] Call the watermark resolver (TASK-4) to obtain the next monotonic ID.
- [ ] Call the task primitive template generator (TASK-3) and write the file to disk.
- [ ] Export `createTask` and associated types from `src/core/index.ts` as the public domain API.
- [ ] Add integration tests verifying end-to-end task creation via the core API.

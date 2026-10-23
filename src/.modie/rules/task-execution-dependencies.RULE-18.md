---
links:
  - ADR-5
---

A `TASK` artifact's frontmatter `depends_on` list must exclusively reference other `TASK` artifacts. `depends_on` references are exempt from filesystem directory ancestry constraints, but must form a directed acyclic graph with no circular dependencies.

Task sequence numbers (including sub-task numerical suffixes) do not infer execution order. Any execution dependencies between tasks or sub-tasks must be explicitly declared via `depends_on`. Independent sub-tasks may execute concurrently or in any sequence.

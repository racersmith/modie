---
links:
  - ADR-5
---

A `TASK` artifact's frontmatter `depends_on` list must exclusively reference other `TASK` artifacts. `depends_on` references are exempt from filesystem directory ancestry constraints, but must form a directed acyclic graph with no circular dependencies.

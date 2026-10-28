---
links:
  - ADR-5
---

A `RULE` artifact's frontmatter `links` must only reference `ADR` artifacts. The schema validator must fail parsing if a rule references another rule, a task, or any other artifact subtype.

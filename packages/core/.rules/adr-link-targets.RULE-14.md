---
links:
  - ADR-5
---

An `ADR` artifact's frontmatter `links` must only reference `ADR` or `RULE` artifacts. The schema validator must fail parsing if an ADR references a task, a motivation document, or a gist.

---
links:
  - ADR-5
---

Any mutation to an artifact's frontmatter links or execution dependencies must validate subtype compatibility, spatial ancestry or descendant scoping, sideways subtree prohibitions, and acyclic task dependency constraints prior to modifying the file, and must update YAML frontmatter idempotently without altering the document body.

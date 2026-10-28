---
links:
  - ADR-5
---

An `ADR` artifact referencing a `RULE` must target a `RULE` residing in the ADR's directory or within its descendant subtree. The graph validator must fail compilation if an ADR references an ancestor rule or a rule in an unrelated sibling subtree.

---
links:
  - ADR-5
---

A `RULE` artifact referencing an `ADR` must target an `ADR` residing in the rule's directory or an ancestor directory up to the repository root. The graph validator must fail compilation if a rule references a descendant or sibling ADR.

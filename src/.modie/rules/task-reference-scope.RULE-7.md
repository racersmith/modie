---
links:
  - ADR-5
---

A task document must only declare frontmatter `links` to `RULE`s and `ADR`s that exist in its direct directory ancestry (the task's containing directory or any parent directory up to the repository root) or within explicitly declared package dependencies.

The graph validator must fail compilation if a task references an invariant residing in a sibling directory or un-traversed subtree.

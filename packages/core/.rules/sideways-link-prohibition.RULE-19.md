---
links:
  - ADR-5
---

An artifact's frontmatter `links` must never reference artifacts residing in a sibling subtree outside the referencing artifact's direct directory ancestry or descendant scope. The graph validator must fail compilation upon encountering cross-subtree links.

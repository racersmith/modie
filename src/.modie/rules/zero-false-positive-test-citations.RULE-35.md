---
links:
  - ADR-7
---

Automated tests and fixture data must not contain literal governance tags or mock citations that produce false-positive matches during repository reference queries. Dynamic test tags must be generated programmatically (such as via makeTestTag) to ensure citation queries reflect only authentic repository dependencies and verification traces.

---
links:
  - ADR-1
  - ADR-2
  - RULE-1
---

All indexable artifacts (`RULE`, `ADR`, `TASK`) must be deterministically resolvable across the repository by their canonical tag (`[SUBTYPE]-[ID]`). Tooling interfaces must expose tag resolution to return an artifact's file path, and must provide artifact inspection in both human-oriented presentation and agent-optimized structured schema representations.

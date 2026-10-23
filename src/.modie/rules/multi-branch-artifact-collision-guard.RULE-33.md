---
links:
  - ADR-1
  - ADR-2
  - ADR-9
---

Artifact ID watermark resolution must discover active indexable artifacts across all local git branches using git tree queries to prevent concurrent branches from allocating duplicate monotonic IDs.

Task branch merging must execute a pre-merge artifact collision guard that verifies newly introduced or modified indexable artifacts do not collide with active artifacts on the target branch (by duplicate tag or conflicting filepath) before checkout and merge, rejecting the operation unless --force is specified.

---
links:
  - ADR-7
---

Automated tests must execute against isolated temporary fixture workspaces and mock directories. Test assertions must never depend on the mutable state or specific counts of active artifacts in the host repository.

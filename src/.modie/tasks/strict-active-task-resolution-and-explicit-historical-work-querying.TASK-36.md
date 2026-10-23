---
depends_on: []

links:
  - RULE-21
  - ADR-6
  - ADR-9
---

# Context

Simplify task resolution so that active task queries strictly search active .md files on disk by default, removing implicit Git deletion log searches. Introduce explicit historical query support (--history) for inspecting completed task work and branches in Git history per ADR-6.

# Acceptance Criteria

- [ ] Default task resolution to search strictly active .md files on disk without automatic Git deletion scanning
- [ ] Add explicit --history flag to task status and find commands to query completed task history and branches
- [ ] Clean up allowZombie and implicit deletion fallback paths in core task query APIs
- [ ] Add unit and integration tests verifying strict active resolution and explicit history queries

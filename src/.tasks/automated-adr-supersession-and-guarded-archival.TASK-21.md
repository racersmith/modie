---
depends_on:
  - TASK-20

links:
  - ADR-1
  - ADR-4
  - ADR-10
  - RULE-4
  - RULE-14
  - RULE-25
  - RULE-27
  - RULE-31
---

# Context

Provide automated CLI and core tooling for declaring ADR supersession and executing guarded archival that strictly enforces zero active incoming references per RULE-31.

# Acceptance Criteria

- [ ] Implement supersedes option in ADR creation core service and CLI command, writing bidirectional frontmatter links
- [ ] Implement modie adr archive command validating zero active incoming references via impact analysis prior to renaming
- [ ] Enforce strict rejection when attempting to archive an ADR with active dependent references unless explicitly forced
- [ ] Add unit and integration tests verifying supersession tagging, guarded archival rejection, and successful file renaming

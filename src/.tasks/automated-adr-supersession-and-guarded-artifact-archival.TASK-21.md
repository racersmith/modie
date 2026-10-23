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

Provide automated CLI and core tooling for declaring ADR supersession and executing guarded archival for both ADR and RULE artifacts, strictly enforcing zero active incoming references per RULE-31 prior to renaming.

# Acceptance Criteria

- [x] Implement supersedes option in ADR creation core service and CLI command, writing bidirectional frontmatter links
- [x] Implement guarded artifact archival core service verifying canArchive via references query for any indexable artifact subtype
- [x] Implement modie adr archive <tag> and modie rule archive <tag> commands enforcing zero active references prior to .ARCHIVED.md renaming
- [x] Enforce strict rejection when attempting to archive an ADR or RULE with active dependent references unless explicitly forced
- [x] Add unit and integration tests verifying supersession tagging, guarded archival rejection for ADRs and RULEs, and successful file renaming

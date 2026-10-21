---
depends_on: []

links:
  - ADR-6
  - RULE-18
  - RULE-22
  - RULE-25
  - RULE-27
---

# Context

Provide developers and AI agents with direct visibility into the active task queue, checklist completion status, and dependency readiness via modie task list and modie task status per ADR-6, RULE-18, RULE-25, and RULE-27.

# Acceptance Criteria

- [x] Implement active task queue query service in core returning parsed tasks, checklist progress, and DAG dependency readiness (READY vs BLOCKED)
- [x] Implement CLI command modie task list outputting structured human-readable table to stderr and machine JSON with --json
- [x] Support filtering active tasks (e.g. --ready to show only unblocked tasks ready for execution)
- [x] Add unit and integration tests verifying task listing, DAG readiness computation, and stream separation per RULE-27

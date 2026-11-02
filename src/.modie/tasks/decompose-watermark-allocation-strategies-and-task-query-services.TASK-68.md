---
depends_on:
  - TASK-64

links:
  - RULE-1
  - RULE-18
  - RULE-21
  - RULE-28
---

# Context

Extract reusable sequence computation from resolveWatermark (CC 28) in src/core/resolver/watermark.ts and encapsulate branch-aware allocation strategies (trunk, subtask, prefixed). Decompose queryTaskHistory (CC 44) and queryTaskQueue (CC 23) in src/core/task/query.ts by extracting shared toTaskQueueItem synthesis, acceptance criteria progress calculation, and discrete historical source collection handlers.

# Acceptance Criteria

- [ ] Extract reusable nextSequence calculation utility and encapsulate allocation strategies (trunk, subtask, prefixed) into strategy handlers
- [ ] Reduce resolveWatermark cyclomatic complexity to <= 10
- [ ] Extract shared toTaskQueueItem and calculateCriteriaProgress helpers used by both queryTaskQueue and queryTaskHistory
- [ ] Decompose queryTaskHistory into discrete source collection functions, reducing CC from 44 to <= 12
- [ ] Verify watermark allocation and task queue querying across all resolver and task query tests
- [ ] User Review

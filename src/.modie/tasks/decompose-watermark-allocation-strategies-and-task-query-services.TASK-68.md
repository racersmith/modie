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

Per the maintainability review (§2.5, §3.1, §4.5, §4.6), sequence allocation and task query pipelines exhibit copy-pasted algorithms, monolithic loops, and leaky VCS calls:

1. **Watermark Sequence Allocation Hotspot (`resolveWatermark` CC 28, 179 lines)**:
   - In `src/core/resolver/watermark.ts`, the "next free sequence" algorithm (regex capture -> max + 1 -> skip collisions) is copy-pasted four separate times across trunk, subtask, and prefixed branches.
   - Extract a reusable sequence calculator:
     `nextSequence(knownIds, { match: RegExp, format: (n: number) => string }): string`
   - Encapsulate allocation logic into distinct strategy handlers (`trunk`, `subtask`, `prefixed`), and structure the design so task-specific sequence allocation can be delegated to `taskDefinition.allocateId`.

2. **Task Query & History Decomposition (`queryTaskHistory` CC 44, `queryTaskQueue` CC 23)**:
   - Both `queryTaskQueue` and `queryTaskHistory` in `src/core/task/query.ts` build `TaskQueueItem` records using duplicate criteria progress arithmetic (lines 228–232 vs 444–449). Extract shared `toTaskQueueItem` and `calculateCriteriaProgress` helpers.
   - `queryTaskHistory` merges three disparate task sources (active branches, git-deleted tasks, and branch-only commits) across three monolithic loops. Decompose into discrete collection functions (`collectBranchTasks`, `collectDeletedTasks`, `collectBranchOnlyTasks`).
   - `queryTaskHistory` currently relies on raw git commands via `vcs.run()` for `git log --diff-filter=D` and `git show <sha>~1:` (lines 411–438). Introduce typed methods on `IVcsAdapter` (`readFileAtRef(ref, path)`, `readDeletedFile(path)`) so domain query services do not invoke raw shell commands.

# Acceptance Criteria

- [x] Extract reusable `nextSequence` calculation utility and encapsulate allocation strategies (`trunk`, `subtask`, `prefixed`) into strategy handlers, reducing `resolveWatermark` cyclomatic complexity to <= 10.
- [x] Extract shared `toTaskQueueItem` and `calculateCriteriaProgress` helpers used by both `queryTaskQueue` and `queryTaskHistory`.
- [x] Decompose `queryTaskHistory` into discrete source collection handlers (`collectBranchTasks`, `collectDeletedTasks`, `collectBranchOnlyTasks`), reducing cyclomatic complexity from 44 to <= 12.
- [x] Add typed VCS methods (`readFileAtRef`, `readDeletedFile`) to `IVcsAdapter` to replace raw `vcs.run()` calls in historical task parsing.
- [x] Verify watermark allocation and task queue/history querying across all resolver and task query tests.
- [x] User Review

---
summary: Enforce a strict single-level subtask depth by hard-rejecting task creation on subtask branches, rejecting multi-level IDs in branch topology, and hardening Git ancestry and working-tree guards across start and merge lifecycles.

depends_on: []

links:
  - RULE-28
  - ADR-9
  - RULE-1
  - RULE-21
  - RULE-34
  - RULE-35
---

# Context

Previously, Modie's watermark allocator allowed creating sub-subtasks (e.g. TASK-5-2-1) when invoked on a subtask branch, while subtask topology parsing only recognized single-level hyphenated IDs (parent-sequence). As a result, multi-level subtasks were silently classified as root tasks and merged directly into trunk instead of their parent branch.

This task enforces a single-level subtask hierarchy (trunk -> root task -> subtask) and hardens Git branch lifecycle safety:
- Allocation Guard: Hard-reject task creation when the active branch is already a subtask branch, preventing nested sub-subtasks and stranded task artifacts on child branches.
- Grammar & Topology Validation: Restrict task branch ID parsing to at most one subtask level and explicitly error on deeper multi-segment task IDs instead of falling back to trunk.
- Pre-Merge Ancestry Safety: Verify before merging into trunk that the source branch does not carry unmerged commits belonging to another active task branch.
- Start & Merge Hardening: Validate explicit base branch overrides against protected and subtask branches, require a clean working tree prior to destructive branch-switching merges, verify parent ancestry when checking out pre-existing subtask branches, and escape task IDs in active-subtask branch pattern matching.
- Documentation & Guidance: Clarify the depth-1 subtask invariant in hierarchical branching governance and CLI/MCP agent instructions.

# Acceptance Criteria

- [x] Watermark and task allocation hard-reject creating tasks while checked out on a subtask branch with actionable guidance to switch to the root parent branch or trunk
- [x] Domain task-branch grammar and topology resolution explicitly reject multi-level subtask IDs (depth > 1) instead of silently defaulting to trunk as root tasks
- [x] Merge lifecycle enforces a pre-merge Git ancestry guard blocking merges into trunk when the source branch contains unmerged commits from another active task branch (unless forced)
- [x] Branch start and merge guards reject invalid --base targets (subtask or protected branches unless forced), verify clean working trees before branch-switching merges, escape task IDs in active-subtask regex checks, and validate existing subtask branch ancestry
- [x] Governance rule documentation and CLI/MCP agent guidance reflect the single-level subtask depth limit and branching invariants
- [x] Isolated fixture tests cover subtask-branch creation rejection, multi-level ID rejection, pre-merge ancestry blocking, --base validation, and clean-tree guards, and the full verification suite passes
- [x] User Review

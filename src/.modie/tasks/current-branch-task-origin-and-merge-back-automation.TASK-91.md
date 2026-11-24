---
summary: Spawn root task branches from the active non-protected, non-task branch by default, record the origin branch in per-branch Git config, and automatically merge completed root tasks back into their origin branch across CLI and MCP.
depends_on: []

links:
  - ADR-9
  - RULE-28
  - RULE-34
  - RULE-35
---

# Context

Currently, starting a root task always defaults its base branch to configured trunk (dev) and merging/completing a root task always defaults its target branch to trunk. When working on a feature branch (e.g. feat/abc), users must pass --base and --target manually in the CLI, and MCP start_task/complete_task have no way to branch from or merge back into the feature branch.

Design:
1. Per-branch origin tracking in local Git config: Extend the VCS adapter abstraction (and its Git CLI and mock implementations) with local Git config write/unset operations. When start creates a new root task branch, record its base branch at branch.<taskBranch>.modieBase. Git automatically cleans up this config section when git branch -d deletes the branch after merge, avoiding working-tree churn and resolving zero-commit ambiguity when a feature branch shares trunk's HEAD commit.
2. Current-branch default on start:
   - Subtasks remain strictly bound to their parent task branch per RULE-28.
   - Protected branches remain rejected on start unless overridden.
   - Non-protected, non-task branches (e.g. feat/abc, dev, release/*) become the default base branch; detached HEAD falls back to configured trunk.
   - Starting a root task while checked out on another active task/* branch is rejected with an actionable error instructing the user to switch to their intended base branch or pass an explicit --base override (preventing accidental root-task chaining).
3. Origin-aware merge target and guards:
   - Root task merges resolve the default target from branch.<sourceBranch>.modieBase, falling back to configured trunk only when no modieBase key is recorded.
   - If a recorded modieBase branch no longer exists locally, fail loudly and prompt for an explicit target rather than silently merging into trunk.
   - Extend the foreign task ancestry guard to validate against any root-task merge target (feature branch or trunk) so unrelated active task commits cannot leak across branches.
4. CLI and MCP parity and visibility:
   - Add optional base parameter to MCP start_task and optional target parameter to MCP complete_task.
   - Surface the resolved origin/target branch in task start responses (CLI output and MCP Mission Brief) and task status output.

# Acceptance Criteria

- [x] The VCS adapter interface, Git CLI adapter, and mock adapter support writing and unsetting local Git configuration values.
- [x] Starting a root task from a non-protected, non-task branch defaults to branching from that active branch and persists branch.<taskBranch>.modieBase in local Git config.
- [x] Starting a root task while checked out on a protected branch remains rejected unless overridden, and starting a root task while checked out on another task branch is rejected with an actionable error directing the user to switch branches or specify an explicit base.
- [x] Subtask branching and merging remain strictly bound to the parent task branch per RULE-28.
- [x] Merging or completing a root task without an explicit target automatically merges into its recorded modieBase branch (falling back to configured trunk only when no modieBase is recorded), fails loudly if the recorded modieBase branch no longer exists, and rejects protected merge targets.
- [x] The foreign task ancestry guard prevents unmerged commits from unrelated active task branches from leaking into any root-task merge target (both feature branches and trunk).
- [x] MCP start_task accepts an optional base override, MCP complete_task accepts an optional target override, and task start and status outputs surface the resolved origin/target branch.
- [x] Isolated fixture-workspace unit and CLI/MCP integration tests verify the feature-branch multi-task loop, missing recorded base error, cross-task-branch start rejection, and subtask invariance, with all repository verification checks passing.
- [x] Update documentation for users and agents as necessary. Agent docs should work on progressive disclosure when possible to keep baseline context small.
- [x] User Review

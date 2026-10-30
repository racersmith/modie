---
summary: Prevent concurrent task ID collisions using hierarchical branch-aware namespacing for subtasks and global multi-ref Git watermark scanning.
links:
  - ADR-1
  - ADR-6
  - RULE-1
  - RULE-18
  - RULE-21
  - RULE-28
---

# Context

[ADR-6] established the Git-Backed Ephemeral Task Lifecycle with monotonic unscoped IDs (`TASK-[ID]`) and deleted git history as the watermark ledger. However, concurrent development across separate git branches introduces the risk of ID collisions:

1. Two developers or AI agents branching from trunk at commit `C` simultaneously create a new task.
2. Both query local working tree and commit history up to `C`, discovering the same watermark (e.g., `TASK-5`).
3. Both allocate `TASK-6`, creating an ID collision when branches are merged or cross-referenced.

TASK-1 explicitly requires: _"Creating tasks on separate git branches does not result in ID overlap."_

We need a deterministic, low-friction task ID allocation strategy that eliminates branch collisions while maintaining clean readability and full compatibility with [ADR-1] and [ADR-6].

# Alternatives Considered

### 1. Global UUIDs / Content Hashes (`TASK-e4a8b2`)

- **Pros:** Statistically collision-free without coordination.
- **Cons:** Destroys human readability, breaks monotonic progression, high token/typing overhead, and violates ADR-1's flat readable naming philosophy.

### 2. Central Coordination Branch / Remote Locking

- **Pros:** Preserves flat integer sequences.
- **Cons:** Requires network access and remote locks, completely breaking offline agent execution and shallow local development.

### 3. Git Branch & Author Namespaced Prefixes

- **Pros:** Deterministic, completely offline, zero network coordination required. Highly human-readable and preserves parent-child task traceability.
- **Cons:** Slightly varied ID formats (`TASK-1` vs `TASK-2-1` vs `TASK-J1`).

# Decision

We adopt a **Hierarchical Branch & Author Namespaced Allocation Model**:

### 1. Trunk Monotonic Progression (`main`, `dev`)

- When on the repository's primary trunk branch (`main`, `master`, `dev`), task IDs allocate as clean, unpadded monotonic integers: `TASK-1`, `TASK-2`, `TASK-3`...
- Watermark is computed as `max(active_disk_ids, git_deleted_ids) + 1`.

### 2. Task Branch Sub-Task Namespacing (`task/<id>-<slug>`)

- When working on a task-specific branch following the convention `task/<parent_id>-<slug>` (e.g., `task/2-task-id-allocation-and-rule-alignment`), any sub-tasks created within this branch automatically inherit the parent task namespace:
  - Format: `TASK-<parent_id>-<sequence>` (e.g., `TASK-2-1`, `TASK-2-2`).
- This guarantees that sub-tasks spawned on separate task branches can never collide with each other or with trunk tasks.
- Sub-task sequence suffixes (`-1`, `-2`) provide collision-free ID namespacing and do not inherently define execution order. Execution order between sub-tasks must be explicitly declared via `depends_on:` declarations per [RULE-18]. Independent sub-tasks can execute concurrently.

### 3. Feature Branch & Agent/Author Namespacing (`feature/*`, `agent/*`)

- When working on feature branches or when multiple agents work concurrently:
  - The CLI checks for an optional explicit prefix flag (`--prefix <tag>`) or a Git configuration key (`git config modie.prefix`).
  - Format: `TASK-<prefix><sequence>` (e.g., `TASK-J101`, `TASK-A101`).
- If no prefix is explicitly configured, the CLI falls back to the standard monotonic integer sequence (`TASK-1`, `TASK-2`...), defaulting to simplicity without prompting or synthesizing artificial branch tokens.

### 4. Global Multi-Ref Watermark Scanning

- The watermark resolver inspects:
  1. Active files on disk in the current workspace.
  2. Deleted files across all reachable git commits (`git log --all --diff-filter=D --name-only -- "*.TASK-*.md"`).
- IDs never reset or rewind when active tasks are deleted upon completion.

### 5. Lifecyle and Merge Compatibility

- Completed tasks are deleted from the working tree in their implementation commit ([RULE-21]).
- If an active namespaced task merges into trunk, its unique ID remains valid in downstream `depends_on:` declarations until completed and deleted.

### 6. Hierarchical Task Branch Topology & Merge Lifecycle

To enable automated branch management and multi-agent isolation, tasks and sub-tasks follow a strict nested Git branch topology:

1. **Branch Hierarchy:**
   - **Trunk:** Primary development branch (`main` or `dev`).
   - **Parent Task Branch:** `task/<parent_id>-<slug>` (branched directly from trunk).
   - **Sub-Task Branch:** `task/<parent_id>-<sequence>-<slug>` (branched directly from the parent task branch).

2. **Sub-Task Execution & Merge Loop:**
   - When beginning a sub-task, the sub-task branch is spawned from the parent branch:
     `git checkout -b task/<parent_id>-<sequence>-<slug> task/<parent_id>-<slug>`
   - All mutations are restricted to the sub-task's scope subtree per [RULE-6].
   - Upon verification of acceptance criteria, the sub-task artifact is deleted in the implementation commit per [RULE-21].
   - The sub-task branch is merged back into the parent task branch, and the sub-task branch is deleted.
   - Deletion of the sub-task artifact on the parent branch automatically updates the active disk queue, unblocking downstream sub-tasks per [ADR-6].

3. **Parent Task Completion:**
   - The parent task branch merges into trunk (`dev`) only after all child sub-tasks have completed, deleted their artifacts, and merged into the parent branch per [RULE-28].
   - The parent task artifact is deleted in the parent completion commit.
   - The parent task branch is merged into trunk and deleted.

4. **CLI Automation Target:**
   - CLI automation tools (`modie task start <id>`, `modie task complete <id>`) leverage this deterministic topology:
     - `start` automatically detects parentage and checks out or creates the proper base and target branches.
     - `complete` verifies criteria, executes deletion commits, and targets the correct merge destination (`parent branch` for sub-tasks, `trunk` for root tasks).

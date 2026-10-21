---
links:
  - ADR-4
  - ADR-5
  - RULE-6
  - RULE-7
  - RULE-15
  - RULE-18
  - RULE-21
  - RULE-22
  - ADR-9
---

# Context

`TASK` artifacts represent ephemeral execution plans. Unlike `ADR` and `RULE` documents, which are low-volume, permanent governance records, tasks are high-volume, transient units of work that accumulate rapidly over the lifetime of a project.

Applying the in-place `.ARCHIVED.` suffix mechanism from ADR-1 to tasks creates severe repository friction:

- **Directory Sprawl:** Feature folders become cluttered with dozens of dead task files alongside active code.
- **Context Pollution:** Completed task files risk being ingested during context compilation, exposing AI agents to speculative, outdated planning notes rather than ground-truth code.
- **Cognitive Overhead:** Humans and agents must constantly filter out obsolete work items.

However, tasks cannot simply be deleted without a lifecycle strategy because downstream tasks rely on `depends_on: [TASK-XXXX]` to sequence execution and verify that prerequisite tasks have finished.

We need a formal task completion mechanism that ensures a clean working tree while preserving reliable dependency validation.

# Explored Solutions & Alternatives

### 1. In-Place Archive (`.ARCHIVED.md` / `.DONE.md`)

- **Mechanism:** Rename `add-parser.TASK-0001.md` to `add-parser.TASK-0001.DONE.md` in place.
- **Advantages:** Consistent with ADR-1; zero file relocation; simple glob lookup for `depends_on`.
- **Drawbacks:** Unbounded directory sprawl; pollutes project directories with hundreds of dead markdown files over time.

### 2. Colocated Subdirectory (`<dir>/.tasks/done/` or `<dir>/.done/`)

- **Mechanism:** Move completed tasks to a local dot-prefixed subdirectory alongside the code.
- **Advantages:** Keeps active task directories clean while preserving physical proximity to the code territory the task mutated.
- **Drawbacks:** Still accumulates disk sprawl over time; adds nested directory scaffolding across the codebase.

### 3. Central Repository Archive (`.modie/archive/tasks/`)

- **Mechanism:** Move completed task files to a single centralized archive folder at the repository root.
- **Advantages:** Leaves the active source tree completely clean; simple to inspect, backup, or ignore in bulk.
- **Drawbacks:** Breaks colocation of historical records; requires namespacing to avoid filename collisions across packages.

### 4. Immediate Deletion on Completion

- **Mechanism:** Delete the `*.TASK-*.md` file as soon as the task is completed and verified.
- **Advantages:** Pristine working tree with zero sprawl; honors the true definition of "ephemeral". Git commit history permanently retains the task.
- **Drawbacks:** Breaks `depends_on` validation; the engine cannot distinguish between a successfully completed task and an invalid/missing task ID.

### 5. Keep-N / Retention Window

- **Mechanism:** Retain completed tasks in place or in `.done/` for a fixed window (e.g. last 10 tasks or 14 days), then purge.
- **Advantages:** Preserves immediate visibility for active milestones while capping long-term sprawl.
- **Drawbacks:** Requires automated garbage collection tooling (`modie task prune`) and arbitrary retention thresholds.

### 6. Dependency Burn-Down (Mutating Downstream Tasks)

- **Mechanism:** When a task completes, the engine searches all downstream tasks, strips the completed task ID from their `depends_on` lists, and deletes the completed task file. Once a task's `depends_on` list is empty, it is unblocked.
- **Advantages:** Zero completed task files remain on disk; zero external databases or git queries needed to evaluate readiness.
- **Drawbacks:** Completing a task requires mutating multiple task files across unrelated directories, increasing the likelihood of git merge conflicts across concurrent branches.

### 7. Git-Backed Ephemeral State (Presence = Pending, Git Deletion = Complete)

- **Mechanism:** Active tasks exist as files on disk. Completing a task means deleting its file in the commit that implements the code. Downstream tasks retain `depends_on: [TASK-XXXX]`. The engine resolves dependencies by checking:
  1. If `TASK-XXXX.md` exists on disk $\rightarrow$ **Blocked** (task still pending).
  2. If `TASK-XXXX.md` does not exist on disk, but was deleted in Git history $\rightarrow$ **Satisfied** (task completed).
  3. If `TASK-XXXX.md` does not exist on disk or in Git $\rightarrow$ **Error** (invalid task ID).
- **Advantages:** Completely pristine working tree; zero file mutations to downstream tasks; no merge conflicts; leverages Git as the immutable completion ledger (`git log --diff-filter=D`).
- **Drawbacks:** Evaluating dependencies requires querying Git commit history.

### 8. Completion Ledger (`.modie/completed.jsonl`)

- **Mechanism:** On completion, append the task ID, slug, and completion commit to a single flat ledger file and delete the markdown file.
- **Advantages:** Zero directory clutter; fast file-based lookup for `depends_on` without querying git log.
- **Drawbacks:** Introduces a state file that must be maintained and merged across branches.

# Decision

We adopt the **Git-Backed Ephemeral Task Lifecycle** with **Monotonic Unscoped IDs**:

1. **Active Work on Disk:**
   - A `TASK` artifact file exists in the working tree if and only if the task is active or pending.
   - Tasks are globally identifiable across the repository via unscoped, monotonic IDs (`TASK-[ID]`), allowing tasks to be relocated between directories without breaking references.
   - Optional developer or agent prefixes (e.g., `TASK-J101`, `TASK-A102`) may be utilized to prevent concurrent branch ID collisions.

2. **Completion Signified by Deletion:**
   - When a task's implementation is verified, all acceptance criteria checklist items must be marked complete (`[x]`) and committed to Git (`feat: ... (satisfy TASK-XXXX)`).
   - Once the completed state is committed, the task's markdown file is deleted from the working tree in a lifecycle chore commit (`chore(task): delete completed TASK-XXXX artifact per RULE-21`).
   - This two-phase audit lifecycle ensures Git history permanently records verifiable completion before deletion, preventing completed tasks from appearing identical to abandoned tasks in diff logs.
   - Completed task files are never retained on disk (no `.ARCHIVED.` suffixes or `.done/` subdirectories), keeping the codebase pristine and eliminating context pollution for AI agents.
   - Git commit history serves as the immutable, permanent completion ledger (`git log --diff-filter=D -- "*.TASK-*.md"`).

3. **Static Dependency Resolution (Active Queue Model):**
   - Downstream tasks declare prerequisites via static `depends_on: [TASK-XXXX]` lists.
   - Downstream task files are **never mutated** when upstream tasks finish, eliminating multi-branch merge conflicts.
   - A dependency `TASK-XXXX` is evaluated cleanly via active queue inspection:
     - If `TASK-XXXX` exists on disk $\rightarrow$ **Blocked** (prerequisite task is still pending).
     - If `TASK-XXXX` does not exist on disk $\rightarrow$ **Satisfied** (prerequisite task is complete).
   - This eliminates complex Git log queries during runtime, ensuring instant evaluation that functions seamlessly in shallow CI clones (`--depth=1`) and gitless environments.
   - Soft linter warnings flag any dependency that has never been registered in project history to guard against typos.

4. **Standardized Acceptance Criteria & Programmatic Progress:**
   - Tasks declare deliverables as a Markdown checklist (`- [ ]` / `- [x]`) under an `# Acceptance Criteria` section.
   - Agents update progress programmatically via CLI or MCP tools (e.g. `modie task check TASK-XXXX --item 1`) rather than opening, reading, editing, and saving markdown files.
   - This minimizes agent action cost (a single lightweight tool turn) and token consumption while providing machine-verifiable task completion status.

5. **Automated Monotonic ID Allocation:**
   - Humans and AI agents never manually compute or allocate task IDs.
   - The Modie CLI and MCP tools automatically determine and assign the next monotonic ID upon task creation.
   - When the active queue on disk is empty (all tasks completed and deleted), the tool resolves the watermark via Git history or a lightweight local watermark to ensure IDs monotonically advance without resetting.

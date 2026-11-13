# Hierarchical Sub-Tasks & Cross-Cutting Context Compilation

> Consolidated from sparks `[1f76]` (*Sub-tasks for granular scoping and context compilation*) and `[657f]` (*Include parent task in subtask context*).

## Problem & Motivation

Modie enforces **Strict Downward Blast Radius**: a task placed in `<dir>/.modie/tasks/` may only mutate files at or below `<dir>/`.

This works well when a feature is localized to a single subsystem (e.g. `src/interfaces/cli`), where the agent receives only the upward context chain (`cli -> interfaces -> src -> .`). However, when a feature is **cross-cutting**—for example, adding a new capability in `src/core/engine/` and exposing it in `src/interfaces/cli/` and `src/interfaces/mcp/`—authors currently face an awkward trade-off:

1. **Single Broad Task at `src/`:**
   Placing one task in `src/.modie/tasks/` satisfies the downward blast radius rule, but sacrifices granular scope confinement and loses the localized rules of `src/core/engine/`, `src/interfaces/cli/`, and `src/interfaces/mcp/` during `task_context` compilation.
2. **Disconnected Leaf Tasks:**
   Creating separate top-level tasks (`TASK-90` in `src/core/` and `TASK-91` in `src/interfaces/`) preserves tight blast radii and local rule inheritance, but loses the shared architectural narrative and parent branch coordination.

---

## Existing Foundation in Modie

Modie already implements 80% of hierarchical subtask infrastructure:

- **Subtask ID Parsing (`src/core/domain/common/tag.ts`):** `parseSubtaskId` and `normalizeTaskId` already support hierarchical IDs such as `TASK-89-1` and `TASK-89-2` under parent `TASK-89`.
- **Hierarchical Task Branching (`src/core/engine/lifecycle/branching.ts`):** `startTaskBranch` and `mergeTaskBranch` already support branching `task/89-1-<slug>` from parent branch `task/89-<slug>` and merging completed subtask branches back into their parent task branch before the parent merges to trunk.

What is missing is **spatial decoupling between parent and child tasks** and **parent-aware context compilation**.

---

## Proposed Design

### 1. Parent Coordinator Task + Deeper Scoped Subtasks

Allow a parent task to act as the cross-cutting coordinator at the Deepest Common Ancestor (`src/`), while its subtasks (`TASK-<id>-1`, `TASK-<id>-2`) live in the deeper `.modie/tasks/` directories of the specific subsystems they modify:

```
src/
├── .modie/tasks/
│   └── cross-cutting-feature.TASK-90.md          ← Parent scope: src/
│       (depends_on: [TASK-90-1, TASK-90-2])
├── core/
│   └── .modie/tasks/
│       └── engine-pipeline.TASK-90-1.md          ← Subtask 1 scope: src/core/
└── interfaces/
    └── .modie/tasks/
        └── cli-and-mcp-exposure.TASK-90-2.md     ← Subtask 2 scope: src/interfaces/
```

- **Creation (`modie task create --parent TASK-90 -s src/core` or `create_task`):**
  - Automatically allocates the next child watermark ID (`90-1`, `90-2`) under parent `90`.
  - Validates that the child subtask's `scopeDir` (`src/core`) is at or strictly below the parent task's `scopeDir` (`src/`).
  - Automatically registers `TASK-90-1` in the parent `TASK-90`'s `depends_on` list so the parent task remains `BLOCKED` until all child subtasks are completed and merged into the parent branch.

### 2. Parent & Sibling Awareness in `task_context` (`[657f]`)

When an agent starts or inspects a subtask (`start_task("TASK-90-1")`, `task_context`, or `modie://task`):

1. **Local Blast Radius & Rules Come from the Subtask's Scope (`src/core`):**
   - The agent is strictly confined to mutating `src/core/**` and receives the exact upward rule chain for `src/core` (`core -> src -> .`).
2. **Synthesized Parent Mission Context:**
   - `renderTaskMissionBrief` (`src/interfaces/mcp/renderers.ts`) and `compileContext` (`src/core/engine/query/context.ts`) detect the parent task ID (`90` from `90-1`), resolve `TASK-90` on disk, and include a compact **Parent Task Context** section in the Mission Brief:
     ```markdown
     ## Parent Task: TASK-90 (Cross-Cutting Feature)
     - **Parent Scope**: `src`
     - **Parent Summary**: Coordinate engine pipeline and interface exposure for ...
     - **Sibling Subtasks**:
       - `TASK-90-1` (`src/core`): CURRENT (1/3 criteria)
       - `TASK-90-2` (`src/interfaces`): READY (0/4 criteria)
     ```
3. **Inherited Governing Links:**
   - Any `ADR` or `RULE` linked in the parent task's `links:` frontmatter that is in the ancestor chain of the child subtask is automatically surfaced in the child's governing context without requiring manual duplication.

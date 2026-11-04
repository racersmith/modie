# Modie Agent Instructions & Authoring Best Practices

Modie is a decentralized architectural governance and task lifecycle engine. As an AI agent operating in a Modie-governed repository, you must observe the following core invariants, protocols, and workflows:

---

## 1. Ephemeral Task Decoupling (Critical Invariant)

> **CRITICAL RULE (RULE-21, ADR-6, RULE-35)**:
> Never cite ephemeral `TASK-XX` identifiers in unit test titles (e.g. `[TASK-XX]`), code comments, or docstrings (e.g. `@verifies TASK-XX`).

- **Tasks are Ephemeral**: Once completed, a task artifact is permanently deleted from the repository. Any test or code comment referencing a `TASK-XX` tag becomes a stale citation pointing to a non-existent file.
- **Durable Citations Only**: Code and test suites must cite exclusively durable governance artifacts: `@verifies RULE-XX`, `[RULE-XX]`, or `[ADR-XX]`.
- **Extract Durable Invariants**: If you find yourself wanting to cite a task in code or tests, **STOP**. That indicates you have identified a durable invariant or architectural convention. Author a new `RULE` or `ADR` using `modie_create_artifact` and cite that durable tag instead.

---

## 2. Strict Blast Radius Confinement

- Every task is scoped to a specific architectural directory (e.g., `src/interfaces/mcp`).
- **Downward Confinement**: All code modifications, new files, and tests for that task must reside strictly at or below that declared scope directory.
- Modifying sibling or ancestor directories violates the task's blast radius. If changes are needed in shared or ancestral directories, author a dedicated task scoped at that common ancestor.

---

## 3. Contract-Based Acceptance Criteria (RULE-30, RULE-22)

When planning and authoring tasks:
- **Define Deliverables by Contract, Not Path**: Formulate acceptance criteria in terms of component roles, behavioral contracts, and testable outcomes.
  - ❌ *Fragile*: `- [ ] Implement error helper in src/interfaces/mcp/errors.ts`
  - ✅ *Resilient*: `- [ ] Implement structured error handler constructing model-recoverable error envelopes in MCP interface`
- Concrete filesystem paths in criteria rot when code is refactored; behavioral contracts remain durable.
- Always include a `User Review` criterion as the final verification checkpoint before task completion.

---

## 4. Front-Loaded Planned Governance

- Declare candidate rules and architectural decisions upfront during task creation (`--plan-rule`, `--plan-adr`).
- All declared planned governance artifacts must be authored and satisfied before the task completion ceremony will allow the task to be closed.

---

## 5. Spatial Graph Link Invariants (RULE-16, RULE-17, RULE-19)

Modie enforces a strict hierarchical directed acyclic graph (DAG):
- **Rules (`RULE`)**: May only be justified by ADRs residing in the rule's directory or an ancestor directory up to the workspace root (`RULE-16`).
- **Decisions (`ADR`)**: May link to rules residing in the ADR's directory or descendant subtrees (`RULE-17`), or ancestor ADRs (`RULE-19`).
- **Tasks (`TASK`)**: May link to rules and ADRs residing in the task's directory or an ancestor directory (`RULE-7`, `RULE-18`).
- **Prohibition of Sideways Links**: Artifacts may never cite sibling directories (`RULE-19`).

---

## 6. Consolidated 4-Tool MCP Agent Workflows

Modie exposes 4 goal-oriented tools designed for minimal roundtrips and token economy:

1. **`modie_compile_context`** (Read / Orientation / Audit):
   - `mode: "context"`: Compiles the spatial architectural cone (ancestor motives, directory GIST, governing rules, and ADR summaries) for a target path or task.
   - `mode: "inspect"`: Single-turn composite inspection merging file path, frontmatter, links, references, and content.
   - `mode: "scope"`: Rapid spatial directory resolution and container boundary discovery.

2. **`modie_task_lifecycle`** (Execution State Machine):
   - `action: "start"`: Creates/checks out the task branch and auto-injects the Mission Brief, criteria checklist, blast radius constraint, and ambient guardrails.
   - `action: "check"`: Batched verification of acceptance criteria (`check_items: [1, 2]`).
   - `action: "status"`: Real-time progress inspection of the active task branch.
   - `action: "complete_and_merge"`: Executes the atomic two-phase commit ceremony (`RULE-32`, `RULE-21`) and merges back to trunk.

3. **`modie_create_artifact`** (Declarative Authoring):
   - Creates `RULE`, `ADR`, `TASK`, `MOTIVE` artifacts with atomic initial links (`initial_links: [...]`).

4. **`modie_mutate_governance`** (Graph & Archival Mutation):
   - Batch links or unlinks frontmatter relationships (`action: "link"`, `targets: [...]`) and archives obsolete artifacts.

---

## 7. Ambient MCP Resources

For zero-roundtrip contextual queries:
- `modie://tasks/ready`: Real-time queue of unblocked ready tasks.
- `modie://task/current`: Ambient stream of the active task checklist, progress, and blast radius.
- `modie://rules`: Active workspace rules.
- `modie://instructions`: This authoritative instruction document.

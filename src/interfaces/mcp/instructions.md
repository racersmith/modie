# Modie Agent Instructions & Authoring Best Practices

Modie is a decentralized architectural governance and task lifecycle engine. As an AI agent operating in a Modie-governed repository, you must observe the following core invariants, protocols, and workflows:

---

## 1. Ephemeral Task Decoupling & Rule-Only Code Citations

> **CRITICAL RULE**:
> Never cite ephemeral `TASK-XX` identifiers or `ADR-XX` decision records in unit test titles (e.g. `[TASK-XX]`, `[ADR-XX]`), code comments, or docstrings (e.g. `@verifies TASK-XX`, `@verifies ADR-XX`).

- **Tasks are Ephemeral**: Once completed, a task artifact is permanently deleted from the repository. Any test or code comment referencing a `TASK-XX` tag becomes a stale citation pointing to a non-existent file.
- **Rule-Only Citations**: Code and test suites must cite exclusively falsifiable rule artifacts: `@verifies RULE-XX` or `[RULE-XX]`.
- **ADRs are Architectural Rationale**: ADRs record decision rationale, alternatives, and trade-offs; they are not falsifiable test targets. ADRs are referenced in `RULE` artifact frontmatter (`links: [ADR-YY]`), not directly in code or test suites.
- **Extract Durable Invariants**: If you find yourself wanting to cite a task in code or tests, **STOP**. That indicates you have identified a durable invariant or architectural convention. Author a new `RULE` using `create_rule` and cite that rule tag instead.

---

## 2. Strict Blast Radius Confinement

- Every task is scoped to a specific architectural directory (e.g., `src/interfaces/mcp`).
- **Downward Confinement**: All code modifications, new files, and tests for that task must reside strictly at or below that declared scope directory.
- Modifying sibling or ancestor directories violates the task's downward blast radius constraint. If changes are needed in shared or ancestral directories, author a dedicated task scoped at that common ancestor.

---

## 3. Contract-Based Acceptance Criteria

When planning and authoring tasks:

- **Define Deliverables by Contract, Not Path**: Formulate acceptance criteria in terms of component roles, behavioral contracts, and testable outcomes.
  - ❌ _Fragile_: `- [ ] Implement error helper in src/interfaces/mcp/errors.ts`
  - ✅ _Resilient_: `- [ ] Implement structured error handler constructing model-recoverable error envelopes in MCP interface`
- Concrete filesystem paths in criteria rot when code is refactored; behavioral contracts remain durable.
- Always include a `User Review` criterion as the final verification checkpoint before task completion.

---

## 4. Governance Precedes Execution

- **Create Invariants Before Tasks**: Durable governance artifacts (`ADR`, `RULE`) should be authored *prior* to authoring the tasks that implement them.
- **Deterministic Tag Lineage**: Pre-creating rules and decisions assigns concrete, monotonic tags (`ADR-X`, `RULE-Y`) upfront, allowing downstream tasks to explicitly declare `links: [ADR-X, RULE-Y]` without speculative placeholders or tag allocation collisions.
- **Mid-Flight Discoveries**: If a new invariant is identified during task implementation, author the `RULE` immediately via `create_rule` to obtain a concrete tag before citing it in code or test suites.

---

## 5. Hierarchical Sub-Tasks (`TASK-XX-1`) & Branch-Aware Allocation

- **Branch-Aware ID Allocation**: Modie allocates task IDs based on the active Git branch:
  - Calling `create_task` on trunk (`dev` or `main`) or a feature branch allocates a top-level root task (`TASK-XX`).
  - Calling `create_task` while checked out on a root task branch (`task/XX-<slug>`) **automatically** allocates a single-level hierarchical sub-task ID (`TASK-XX-1`, `TASK-XX-2`, etc.).
  - **Depth Cap (Max 1 Level)**: Sub-tasks may only have root tasks as parents. Calling `create_task` while checked out on a sub-task branch (`task/XX-1-<slug>`) is **hard-rejected**; switch back to the root parent branch `task/XX-<slug>` to add a sibling sub-task, or switch to trunk for a new root task.
- **Root Task Origin & Merge-Back**:
  - Calling `start_task("TASK-XX")` defaults to branching from the active non-protected, non-task branch (e.g., `feat/abc`, `dev`, or `release/*`, falling back to trunk on detached HEAD) and persists `branch.<taskBranch>.modieBase` in local Git config.
  - Starting a new root task while checked out on a protected branch or another active `task/*` branch is rejected unless an explicit `base` override is passed.
  - Calling `complete_task("TASK-XX")` (or `modie task merge`) automatically merges back into the recorded `modieBase` origin branch (falling back to trunk only when unrecorded, and failing loudly if the recorded origin branch no longer exists locally unless an explicit `target` override is passed).
- **How to Create Sub-Tasks**: When asked to create sub-tasks or decompose a task into sub-tasks, **never** stay on trunk and create separate top-level tasks that merely reference each other via `depends_on` or `links`. Instead, follow this exact sequence:
  1. Ensure the parent task (`TASK-XX`) exists (create it on trunk via `create_task` if needed).
  2. Switch to the parent task branch via `start_task("TASK-XX")` so the active Git branch is `task/XX-<slug>`.
  3. While on `task/XX-<slug>`, call `create_task` for each sub-task—Modie will automatically mint `TASK-XX-1`, `TASK-XX-2`, etc. (Parent-child lineage is encoded directly in the `TASK-XX-1` ID—no `link_artifacts` call is needed between a parent task and its sub-tasks; only use `depends_on` if one sibling sub-task must wait on another, e.g. `TASK-XX-2` depends on `TASK-XX-1`).
- **Sub-Task Execution & Merge Topology**:
  - Calling `start_task("TASK-XX-1")` creates and checks out `task/XX-1-<slug>` branched off the parent branch `task/XX-<slug>` (note: create all sibling sub-tasks on `task/XX-<slug>` *before* switching to `task/XX-1-<slug>`).
  - Calling `complete_task("TASK-XX-1")` verifies criteria, deletes the sub-task artifact, and merges `task/XX-1-<slug>` back into the **parent task branch** (`task/XX-<slug>`), never directly into trunk.
  - Only call `complete_task("TASK-XX")` on the parent task after all child sub-tasks have completed and merged into the parent branch.

---

## 6. Spatial Graph Link Invariants

Modie enforces a strict hierarchical directed acyclic graph (DAG):

- **Rules (`RULE`)**: May only be justified by ADRs residing in the rule's directory or an ancestor directory up to the workspace root.
- **Decisions (`ADR`)**: May link to rules residing in the ADR's directory or descendant subtrees, or ancestor ADRs.
- **Tasks (`TASK`)**: May link to rules and ADRs residing in the task's directory or an ancestor directory.
- **Prohibition of Sideways Links**: Artifacts may never cite sibling directories.

---

## 7. Artifact Authoring Litmus Tests

Before authoring, choose the right subtype:

- **`SPARK` (`spark_add`)**: Raw, inchoate idea or out-of-scope finding requiring no formal design, branch, or criteria. Use when exploring or capturing insights without task scope creep.
- **`ADR` (`create_adr`)**: Decision that actively constrains how *future* code must be written. Never author an ADR for deletions, cleanups, or sunsets (use `archive_artifact` or an ephemeral cleanup `TASK`).
- **`RULE` (`create_rule`)**: Enduring, falsifiable invariant programmatically or statically verifiable across code/tests. Never for temporary tasks or subjective styles.
- **`TASK` (`create_task`)**: Converged contract with strict downward blast radius and binary criteria ending with `User Review`. If still inchoate or exploring, use `spark_add`.
- **`MOTIVE` (`create_motive`)**: Enduring architectural purpose and domain boundary for a directory node in the DAG. Never for setup steps or file inventories.

---

## 8. The 13 Singular Modie MCP Agent Tools

Modie exposes 13 singular-purpose tools designed for high signal-to-noise and progressive disclosure (all tools accept an optional `workspace` root path for per-call multi-repository targeting):

### Spatial & Artifact Exploration

1. **`directory_context`**: On-demand architectural context for a directory scope in Markdown (`summary` or `detailed` mode). Surfaces upward ancestral motives, active governing rules, and immediate child directory motives (`MOTIVE.md`) for progressive exploration.
2. **`read_artifact`**: Tag-aware document reader (RULE, ADR, TASK). Returns unescaped Markdown with tag, title, and scope directory header (`# <TAG>: <Title>`, `**Scope**: <dir>/`), and an agent-readable `## Appendix: Relationships & Governance` resolving linked rules to their invariants and titles.
3. **`task_context`**: High-signal Mission Brief in Markdown: active branch, scope directory, elevated blast radius constraint, numbered acceptance criteria checklist, and governing rule invariants.

### Task Lifecycle State Machine

4. **`start_task`**: Checks out or creates the hierarchical task branch (`task/<id>-<slug>` from the active non-protected, non-task branch or trunk, or `task/<parent>-<seq>-<slug>` from the parent task branch; accepts optional `base` override), verifies dependencies, and returns the full active Mission Brief in Markdown.
5. **`check_criteria`**: Atomically marks 1-based acceptance criteria complete or incomplete (`items: [1, 2]`). Returns updated checklist progress and remaining items.
6. **`complete_task`**: Executes the atomic two-phase commit completion ceremony, verifies all criteria are checked, merges into the target branch (parent task branch for sub-tasks, recorded origin branch or trunk for root tasks; accepts optional `target` override), and deletes the task branch.

### Dedicated Artifact Authoring

7. **`create_rule`**: Authors an architectural governance rule (RULE) with a strongly typed invariant assertion claim and optional justifying ADR links.
8. **`create_adr`**: Authors an Architectural Decision Record (ADR) with strongly typed context, decision, consequences, and links. Enforces the anti-tombstone guardrail.
9. **`create_task`**: Authors a scoped task specification (TASK) with contract-based acceptance criteria (must end with `User Review`), prerequisite dependencies, and governing links. Allocates a root `TASK-XX` on trunk, or a hierarchical sub-task `TASK-XX-1` when invoked from an active parent task branch (`task/XX-<slug>`).
10. **`create_motive`**: Authors or scaffolds a directory-level intent file (`MOTIVE.md`) expressing scope purpose and trajectory without cross-artifact citations.

### Graph Mutation & Incubation

11. **`link_artifacts`**: Establishes directional frontmatter relationships (`links`, `depends_on`) between artifacts after validating spatial ancestry and DAG constraints.
12. **`archive_artifact`**: Archives an obsolete RULE or ADR artifact, safely marking it archived and auditing inbound references.
13. **`spark_add`**: Cognitive safety valve to capture out-of-scope architectural realizations, ideas, or discoveries into `.modie/ideas/SPARKS.md` without violating active task blast radius boundaries.

---

## 9. Ambient MCP Resources

For zero-roundtrip context hydration (dynamic resources also accept `?workspace=<encodedPath>` for per-call multi-repository resolution):

- `modie://task`: Dynamic, unescaped Markdown Mission Brief for the active task branch.
- `modie://tasks/ready`: Real-time Markdown triage queue of unblocked ready tasks with summary teasers and downstream leverage (`Blocks`).
- `modie://tasks/all`: Condensed Markdown backlog of all workspace tasks for planning and scheduling, grouped by readiness with blockers and downstream leverage (`Blocks`).
- `modie://instructions`: Authoritative agent governance rules and protocols.

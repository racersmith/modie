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

## 5. Spatial Graph Link Invariants

Modie enforces a strict hierarchical directed acyclic graph (DAG):

- **Rules (`RULE`)**: May only be justified by ADRs residing in the rule's directory or an ancestor directory up to the workspace root.
- **Decisions (`ADR`)**: May link to rules residing in the ADR's directory or descendant subtrees, or ancestor ADRs.
- **Tasks (`TASK`)**: May link to rules and ADRs residing in the task's directory or an ancestor directory.
- **Prohibition of Sideways Links**: Artifacts may never cite sibling directories.

---

## 6. The 12 Singular Modie MCP Agent Tools

Modie exposes 12 singular-purpose tools designed for high signal-to-noise and progressive disclosure:

### Spatial & Artifact Exploration

1. **`directory_context`**: On-demand architectural context for a directory scope in Markdown (`summary` or `detailed` mode). Surfaces upward ancestral motives, active governing rules, and immediate child directory motives (`MOTIVE.md`) for progressive exploration.
2. **`read_artifact`**: Tag-aware document reader (RULE, ADR, TASK). Returns unescaped Markdown with tag, title, and scope directory header (`# <TAG>: <Title>`, `**Scope**: <dir>/`), and an agent-readable `## Appendix: Relationships & Governance` resolving linked rules to their invariants and titles.
3. **`task_context`**: High-signal Mission Brief in Markdown: active branch, scope directory, elevated blast radius constraint, numbered acceptance criteria checklist, and governing rule invariants.

### Task Lifecycle State Machine

4. **`start_task`**: Checks out or creates the hierarchical task branch (`task/<id>-<slug>`), verifies dependencies, and returns the full active Mission Brief in Markdown.
5. **`check_criteria`**: Atomically marks 1-based acceptance criteria complete or incomplete (`items: [1, 2]`). Returns updated checklist progress and remaining items.
6. **`complete_task`**: Executes the atomic two-phase commit completion ceremony, verifies all criteria are checked, merges to trunk, and deletes the task branch.

### Dedicated Artifact Authoring

7. **`create_rule`**: Authors an architectural governance rule (RULE) with a strongly typed invariant assertion claim and optional justifying ADR links.
8. **`create_adr`**: Authors an Architectural Decision Record (ADR) with strongly typed context, decision, consequences, and links.
9. **`create_task`**: Authors a scoped task specification (TASK) with contract-based acceptance criteria (must end with `User Review`), prerequisite dependencies, and governing links.
10. **`create_motive`**: Authors or scaffolds a directory-level intent file (`MOTIVE.md`) expressing scope purpose and trajectory without cross-artifact citations.

### Graph Mutation

11. **`link_artifacts`**: Establishes directional frontmatter relationships (`links`, `depends_on`) between artifacts after validating spatial ancestry and DAG constraints.
12. **`archive_artifact`**: Archives an obsolete RULE or ADR artifact, safely marking it archived and auditing inbound references.

---

## 7. Ambient MCP Resources

For zero-roundtrip context hydration:

- `modie://task`: Dynamic, unescaped Markdown Mission Brief for the active task branch.
- `modie://tasks/ready`: Real-time Markdown triage queue of unblocked ready tasks with summary teasers and downstream leverage (`Blocks`).
- `modie://tasks/all`: Condensed Markdown backlog of all workspace tasks for planning and scheduling, grouped by readiness with blockers and downstream leverage (`Blocks`).
- `modie://instructions`: Authoritative agent governance rules and protocols.

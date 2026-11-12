# Modie Architectural Governance

Modie maintains architectural governance and task lifecycle alongside code using a filesystem-as-DAG model.

## Universal Governance Invariants
- **Rule-Only Citations**: Code annotations and unit tests must exclusively cite falsifiable rules (`@verifies RULE-XX`, `[RULE-XX]`). Never cite ephemeral `TASK-XX` identifiers or `ADR-XX` decision records in code comments, test names, or docstrings. ADRs provide architectural rationale and are linked via artifact frontmatter (`links: [ADR-YY]`), not directly in code.
- **Strict Blast Radius**: All modifications, new files, and tests for a task must remain strictly confined to the task's declared scope directory or below.
- **Contract-Based Acceptance Criteria**: Define criteria by component roles and testable outcomes, never concrete filesystem paths. Always include `User Review` as the final criterion.
- **Artifact Authoring Litmus Tests**: Every artifact subtype must satisfy a strict litmus test before authoring:
  - `SPARK`: Raw, inchoate idea or out-of-scope finding requiring no formal design, branch, or criteria (`spark_add`).
  - `ADR`: Decision actively constraining, guiding, or justifying how future code must be written. Never author an ADR for deletions, refactors, or sunsets (use `archive_artifact` or an ephemeral cleanup task).
  - `RULE`: Enduring, falsifiable invariant programmatically or statically verifiable across code/tests. Never author rules for temporary tasks or subjective styles.
  - `TASK`: Converged design with a strict downward blast radius and deterministic binary acceptance criteria ending with `User Review`. If still inchoate or exploring, use `spark_add`.
  - `MOTIVE`: Enduring architectural responsibility and domain boundary for a directory node in the system DAG. Never author setup steps or file inventories.

## Agent Context & Task Lifecycle
- **Zero-Roundtrip Context**: Read `modie://task` for the active task Mission Brief, or `modie://tasks/ready` to triage unblocked tasks.
- **Artifact Inspection**: Use `read_artifact(TAG)` to read any tagged document (`RULE-XX`, `ADR-XX`, `TASK-XX`).
- **Task Lifecycle**: Check out branches with `start_task`, track progress with `check_criteria`, and complete tasks with `complete_task`.
- **Authoritative Protocols**: Read `modie://instructions` for comprehensive governance rules and workflows.

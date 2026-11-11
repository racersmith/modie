# Problem & Motivation

As Modie matures and both human engineers and AI agents author governance artifacts, there is a natural tendency to reach for high-ceremony artifacts (`ADR`, `RULE`, `TASK`) prematurely or for the wrong purposes:

1. **Tombstone ADRs (Changelog Pollution):** Authors frequently propose an ADR to document the deletion, retirement, or refactoring of an existing feature (e.g., "ADR: Sunset X"). An ADR recording that something was deleted provides zero actionable guidance for how to write code tomorrow. Worse, Modie's context compiler indexes active ADRs, permanently taxing agent context windows with obituaries of dead code.
2. **Premature / Vague Tasks:** When an engineer or agent encounters an unvetted concept, they often open a `TASK` immediately. Because the design has not yet converged, the task ends up with vague acceptance criteria and ambiguous scope, corrupting Modie's deterministic two-phase completion ceremony.
3. **Transient or Subjective Rules:** Teams often propose a `RULE` for temporary development conventions, style preferences, or one-off task requirements, rather than enduring, falsifiable, and programmatically verifiable architectural invariants.
4. **Procedural Motives:** Authors sometimes treat `MOTIVE.md` as a README, filling it with temporary setup instructions or file inventories rather than the enduring architectural responsibility of the directory node in the system DAG.

Without clear, memorable **litmus tests**, artifact authoring degrades into an administrative changelog rather than an active architectural flight controller.

---

# The Artifact Authoring Litmus Test Matrix

To keep governance lean, durable, and high-signal, every artifact subtype across Modie's cognitive funnel must satisfy a distinct, non-negotiable litmus test before authoring.

```
┌──────────┬─────────────────────────────────────────────────────────────────────────────┐
│ Artifact │ The Litmus Test Question                                                    │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ SPARK    │ "Is this a nascent realization, observation, or unvetted idea captured with │
│          │  zero ceremony before formal architectural design or execution?"            │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ ADR      │ "Does this decision actively constrain, guide, or justify how future code   │
│          │  must be written in this repository?"                                       │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ RULE     │ "Is this an enduring, falsifiable invariant that can be programmatically   │
│          │  or statically verified across the codebase?"                               │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ TASK     │ "Has the design converged such that we can define a strict downward blast  │
│          │  radius and deterministic, binary acceptance criteria?"                     │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ MOTIVE   │ "Does this state the enduring architectural reason and domain boundary     │
│          │  for this directory node's existence in the system DAG?"                  │
└──────────┴─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Subtype Evaluation Criteria

### 1. Sparks & Incubation (`SPARK` in `SPARKS.md` / `spark_add`)

* **The Litmus Question:** *"Is this a nascent realization, observation, or unvetted idea captured with zero ceremony before formal architectural design or execution?"*
* **Capture a SPARK when:**
  - An engineer or agent has a fleeting thought, observation, or improvement idea during development.
  - An agent encounters an out-of-scope defect or architectural realization during task execution that cannot be addressed without violating the task's downward blast radius (RULE-6).
  - Capturing or incubating a rough concept before committing to formal rules, decisions, or executable tasks.
  - *Long Explorations:* If a spark grows into a multi-paragraph architectural exploration, it remains in `SPARKS.md` or can be promoted to a standalone `[slug].IDEA.md` design file via `modie spark promote <handle>`.
* **DO NOT capture a SPARK when:**
  - The work is already fully designed, estimated, and ready for immediate branch execution with binary acceptance criteria (author a `TASK`).
  - A definitive architectural choice has been made that must constrain future code (author an `ADR`).

### 2. Architectural Decision Records (`ADR`)

* **The Litmus Question:** *"Does this decision actively constrain, guide, or justify how future code must be written in this repository?"*
* **Author an ADR when:**
  - Choosing between mutually exclusive architectural patterns or system topologies.
  - Decoupling layers or establishing dependency boundaries that every future module must respect.
  - Adopting an architectural invariant whose rationale would not be obvious to a future developer.
* **DO NOT author an ADR when:**
  - Recording the retirement, deletion, or cleanup of an obsolete feature. (Use Git commit history, task context, or archive status on the original ADR).
  - Documenting an ephemeral migration procedure or one-off task checklist.
  - Making routine implementation decisions (e.g., choosing a helper function name).

### 3. Architectural Rules (`RULE`)

* **The Litmus Question:** *"Is this an enduring, falsifiable invariant that can be programmatically or statically verified across the codebase?"*
* **Author a RULE when:**
  - Enforcing a structural constraint with zero acceptable exceptions (e.g., import direction, stream separation, blast radius).
  - The violation of the rule can be flagged by CI, automated tests, or deterministic static analysis.
* **DO NOT author a RULE when:**
  - The requirement is subjective, negotiable, or context-dependent.
  - The rule represents a temporary milestone or task-specific instruction.
  - The concept is a decision rationale rather than an enforceable constraint (that belongs in an ADR).

### 4. Ephemeral Tasks (`TASK`)

* **The Litmus Question:** *"Has the design converged such that we can define a strict downward blast radius and deterministic, binary acceptance criteria?"*
* **Author a TASK when:**
  - The work is an executable contract ready for branch isolation, implementation, verification, and atomic commit ceremonies.
  - Every acceptance criterion can be evaluated to a concrete, binary `[x]` checked state ending with `User Review`.
* **DO NOT author a TASK when:**
  - The concept is still in divergent brainstorming, exploration, or trade-off evaluation. (Use `SPARKS.md` via `spark_add` or an incubated idea file).
  - The blast radius cannot be localized to a specific subtree.

### 5. Intent & Scoping (`MOTIVE`)

* **The Litmus Question:** *"Does this state the enduring architectural reason and domain boundary for this directory node's existence in the system DAG?"*
* **Author a MOTIVE when:**
  - A directory represents a coherent subsystem, module boundary, or domain capability.
  - Upward ancestral traversal needs to know the "why" of this directory to provide context to child tasks.
* **DO NOT author a MOTIVE when:**
  - Storing volatile implementation details, file summaries, or temporary setup steps.

---

# Tooling & Ergonomics Integration

These litmus tests are not passive documentation; they are actively injected into Modie's authoring workflows:

### 1. MCP Agent Guidance (`agentGuidance`)
Prepend the litmus test to MCP tool descriptions so language models evaluate the condition before invoking the authoring tools:
* `create_adr`: *"Author an ADR. LITMUS TEST: Does this decision actively constrain future code? Do NOT author an ADR for deletions, refactors, or sunsets (use archive_artifact instead)."*
* `create_rule`: *"Author a RULE. LITMUS TEST: Is this an enduring, falsifiable invariant verifiable in code/tests? Do NOT author rules for temporary tasks or subjective styles."*
* `create_task`: *"Author a TASK. LITMUS TEST: Has the design converged to a strict blast radius and binary checklist criteria? If still exploring, use spark_add."*
* `create_motive`: *"Author a MOTIVE. LITMUS TEST: Does this state the enduring architectural reason for this directory? Do not author setup steps or file inventories."*

### 2. Automated Tombstone ADR Linter & Guardrail
* In `create_adr` (MCP) and `modie adr create` (CLI):
  - Detect sunset keywords (`sunset`, `retire`, `deprecate`, `delete`, `remove`, `cleanup`) in the proposed ADR title.
  - Emit an actionable error diagnostic:
    ```
    TOMBSTONE_ADR_DETECTED:
    ADRs must constrain future code, not record past deletions or retirements.
    • To retire an existing decision or rule: use archive_artifact (or `modie archive <tag>`)
    • To clean up dead code: author an ephemeral TASK
    • If this decision genuinely constrains future code: rephrase title (or pass --force)
    ```
  - Allow explicit override via `--force` or `force: true` when a decision legitimately uses these words.

### 3. Repository Guidelines in `AGENTS.md`
Embed the Litmus Test Matrix directly into `AGENTS.md` under universal governance invariants, establishing an explicit protocol for all human and AI pair-programming sessions.

---

# Resolved Decisions

- **Automated Title Linter:** Resolved in favor of a low-complexity, high-value keyword check on `create_adr` (`sunset`, `retire`, `deprecate`, `delete`, `remove`) with a `--force` escape hatch to permanently eliminate changelog pollution.
- **Graduation Check:** Resolved as non-applicable; idea graduation is a lean, manual process where `.IDEA.md` files are deleted after spawning concrete tasks and rules.

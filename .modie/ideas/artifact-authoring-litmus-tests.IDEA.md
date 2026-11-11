---
references:
  - ADR-2
  - ADR-4
  - ADR-6
  - RULE-25
outputs: []
---

# Problem & Motivation

As Modie matures and both human engineers and AI agents author governance artifacts, there is a natural tendency to reach for high-ceremony artifacts (`ADR`, `RULE`, `TASK`) prematurely or for the wrong purposes:

1. **Tombstone ADRs (Changelog Pollution):** Authors frequently propose an ADR to document the deletion, retirement, or refactoring of an existing feature (e.g., "ADR: Sunset X"). An ADR recording that something was deleted provides zero actionable guidance for how to write code tomorrow. Worse, Modie's context compiler indexes active ADRs, permanently taxing agent context windows with obituaries of dead code.
2. **Premature / Vague Tasks:** When an engineer or agent encounters an unvetted concept, they often open a `TASK` immediately. Because the design has not yet converged, the task ends up with vague acceptance criteria and ambiguous scope, corrupting Modie's deterministic two-phase completion ceremony.
3. **Transient or Subjective Rules:** Teams often propose a `RULE` for temporary development conventions, style preferences, or one-off task requirements, rather than enduring, falsifiable, and programmatically verifiable architectural invariants.
4. **Procedural Motives:** Authors sometimes treat `MOTIVE.md` as a README, filling it with temporary setup instructions or file inventories rather than the enduring architectural responsibility of the directory node in the system DAG.

Without clear, memorable **litmus tests**, artifact authoring degrades into an administrative changelog rather than an active architectural flight controller.

---

# The Artifact Authoring Litmus Test Matrix

To keep governance lean, durable, and high-signal, every primitive artifact subtype must satisfy a distinct, non-negotiable litmus test before authoring.

```
┌──────────┬─────────────────────────────────────────────────────────────────────────────┐
│ Artifact │ The Litmus Test Question                                                    │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ ADR      │ "Does this decision actively constrain, guide, or justify how future code    │
│          │  must be written in this repository?"                                       │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ RULE     │ "Is this an enduring, falsifiable invariant that can be programmatically    │
│          │  or statically verified across the codebase?"                               │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ TASK     │ "Has the design converged such that we can define a strict downward blast   │
│          │  radius and deterministic, binary acceptance criteria?"                    │
├──────────┼─────────────────────────────────────────────────────────────────────────────┤
│ MOTIVE   │ "Does this state the enduring architectural reason and domain boundary      │
│          │  for this directory node's existence in the system DAG?"                   │
└──────────┴─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Subtype Evaluation Criteria

### 1. Architectural Decision Records (`ADR`)

* **The Litmus Question:** *"Does this decision actively constrain, guide, or justify how future code must be written in this repository?"*
* **Author an ADR when:**
  - Choosing between mutually exclusive architectural approaches or design patterns.
  - Decoupling layers or establishing dependency boundaries that every future module must respect.
  - Adopting an architectural invariant whose rationale would not be obvious to a future developer.
* **DO NOT author an ADR when:**
  - Recording the retirement, deletion, or cleanup of an obsolete feature. (Use Git commit history, task context, or archive status on the original ADR).
  - Documenting an ephemeral migration procedure or one-off task checklist.
  - Making routine implementation decisions (e.g., choosing a helper function name).

### 2. Architectural Rules (`RULE`)

* **The Litmus Question:** *"Is this an enduring, falsifiable invariant that can be programmatically or statically verified across the codebase?"*
* **Author a RULE when:**
  - Enforcing a structural constraint with zero acceptable exceptions (e.g., import direction, stream separation, blast radius).
  - The violation of the rule can be flagged by CI, automated tests, or deterministic static analysis.
* **DO NOT author a RULE when:**
  - The requirement is subjective, negotiable, or context-dependent.
  - The rule represents a temporary milestone or task-specific instruction.
  - The concept is a decision rationale rather than an enforceable constraint (that belongs in an ADR).

### 3. Ephemeral Tasks (`TASK`)

* **The Litmus Question:** *"Has the design converged such that we can define a strict downward blast radius and deterministic, binary acceptance criteria?"*
* **Author a TASK when:**
  - The work is an executable contract ready for branch isolation, implementation, verification, and atomic commit ceremonies.
  - Every acceptance criterion can be evaluated to a concrete, binary `[x]` checked state.
* **DO NOT author a TASK when:**
  - The concept is still in divergent brainstorming, exploration, or trade-off evaluation. (Use `SPARKS.md` or an `[slug].IDEA.md` file).
  - The blast radius cannot be localized to a specific subtree.

### 4. Intent & Scoping (`MOTIVE`)

* **The Litmus Question:** *"Does this state the enduring architectural reason and domain boundary for this directory node's existence in the system DAG?"*
* **Author a MOTIVE when:**
  - A directory represents a coherent subsystem, module boundary, or domain capability.
  - Upward ancestral traversal needs to know the "why" of this directory to provide context to child tasks.
* **DO NOT author a MOTIVE when:**
  - Storing volatile implementation details, file summaries, or temporary setup steps.

---

# Tooling & Ergonomics Integration

These litmus tests should not remain passive documentation; they should be actively injected into Modie's authoring workflows:

1. **MCP Agent Guidance (`agentGuidance`):**
   - Inject the litmus test into tool descriptions and schemas (`create_adr`, `create_rule`, `create_task`).
   - Specifically guide models: *"Before creating an ADR, verify that it constrains future code. If documenting a deletion or sunset, do not author an ADR."*
2. **Interactive CLI Authoring Guards:**
   - In interactive CLI mode (`modie adr create`), display a confirmation prompt:
     `? Does this decision actively constrain future code? (y/N)`
   - Prevent accidental creation of tombstone ADRs by suggesting archival or commit messages when retirement/deletion keywords are detected in the title.
3. **Standard Guidance in `AGENTS.md`:**
   - Document the Litmus Test Matrix in `.agents/rules/AGENTS.md` and repository guidelines so all paired agent sessions adhere to the same authoring discipline.

---

# Open Questions

- **Automated Title Linter:** Should `create_adr` reject or warn if the title contains obvious sunset keywords (`"sunset"`, `"retire"`, `"deprecate"`) unless a `--force` flag is supplied?
- **Graduation Check:** Should `modie idea graduate` run an interactive litmus review checklist before generating target artifacts?


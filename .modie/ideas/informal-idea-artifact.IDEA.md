---
references:
  - ADR-2
  - ADR-4
  - ADR-6
  - ADR-10
  - RULE-20
outputs: []
---

# Problem & Motivation

Currently, Modie's primitive artifacts (`MOTIVE`, `ADR`, `RULE`, `TASK`, `GIST`) are highly formalized and carry intentional governance overhead:

- `ADR` and `RULE` artifacts represent committed architectural decisions and falsifiable invariants that should be slow to change.
- `TASK` artifacts represent actionable execution plans with defined blast radii, acceptance criteria, and branch/ID ceremony.

When a human or agent encounters a conceptual improvement or rough architectural thought during development, the tendency is to reach for one of these formalized artifacts (usually a premature `TASK` or `ADR`) so the thought isn't lost. However, doing so pollutes the active artifact pool with half-baked concepts before dedicated architectural design has taken place.

Even creating a dedicated idea file in the middle of a task is too much friction when all you have is a fleeting 1-sentence realization.

# Two-Tier Incubation Architecture

We separate **fleeting capture** from **active incubation** using distinct, evocative filenames, while ensuring humans can always edit plain Markdown files directly and use Modie CLI/MCP tooling as an ergonomic accelerator.

## Explicit Opt-In Scope Initialization & Upward Resolution

To prevent sprawl across deep leaf directories while empowering monorepos and multi-package trees, the `ideas/` container is an **explicit opt-in zone**:

- **Explicit Initialization (`modie ideas init [path]`):**
  - Ideas and sparks do not proliferate into random leaf folders.
  - Initialized at workspace root by default (`.modie/ideas/`).
  - Major package scopes (e.g. `packages/core/.modie/ideas/`) can be explicitly activated via `modie ideas init <path>`.
- **Nearest-Ancestor Bubble-Up Resolution:**
  - When running `modie spark "my thought"` or calling the agent `spark_add` tool from any deep directory (e.g. `src/core/resolver/types/`), Modie walks upward to find the nearest initialized `.modie/ideas/` container.
  - If a package-level container exists, the spark lands there; otherwise it bubbles up to the workspace root.
  - Modie never silently spawns un-initialized idea folders.
- **Workspace-Wide Discovery (`modie ideas --all`):**
  - Scans and reports all active incubation zones across the monorepo, showing spark counts and in-flight ideas per package.

## Incubation Stages

1. **Stage 1 — The Spark Ledger (`SPARKS.md`):**
   - A single plain-Markdown list of raw, nascent thoughts (`<scope>/.modie/ideas/SPARKS.md`).
   - **Plain-File First:** A human can keep `SPARKS.md` open in their editor and jot down `- my thought` directly without using the CLI or memorizing verbose syntax, or run `modie spark "my thought"` from the terminal.
   - **Agent Cognitive Safety Valve:** During task execution, agents are constrained by blast radius boundaries (RULE-6). Calling `spark_add({ thought })` gives agents an instant, compliant outlet to capture out-of-scope discoveries without derailing their active task.
   - **Consolidation & Frequency Signal:** When multiple agent sessions or humans jot down similar sparks, an agent triage pass can consolidate duplicates and surface high-value sparks for promotion.

2. **Stage 2 — Dedicated Idea File (`[slug].IDEA.md`):**
   - **Programmatic Promotion (`modie spark promote`):** Tooling atomically extracts one or more sparks from `SPARKS.md` (by list index, substring match, or interactive selection), seeds a new `[slug].IDEA.md` file with those sparks, and removes the promoted lines from `SPARKS.md`.
   - **Un-indexed by Design:** Uses `[slug].IDEA.md` without sequence numbers (ADR-2), keeping focus on the concept's descriptive name and avoiding cross-branch ID collisions.
   - **Explicit Frontmatter Lineage (`references` vs `outputs`):**
     - `references:` Durable context that inspired or informs the idea (`ADR-X`, `RULE-Y`).
     - `outputs:` Spawned artifacts translating the idea into reality (`TASK-XX`, `ADR-YY`, `RULE-ZZ`).
     - This distinction answers whether an idea has been translated into work (`Unplanned` when empty, `In Flight` when tasks are open, `Ready to Graduate` when complete) without risking DAG link rot on permanent records.
   - **Config-Driven WIP Limits:** `.modie/config.json` defines soft/hard limits on active `.IDEA.md` files and `SPARKS.md` entries per scope, prompting consolidation or triage rather than infinite accumulation.

3. **Stage 3 — Terminal Graduation or Rejection:**
   - Like `TASK` (ADR-6), ideas are strictly **ephemeral**.
   - **Direct Spark Graduation (`modie spark task <id>`):** Actionable sparks can graduate directly into a formal `TASK` without requiring an intermediate idea file.
   - **Idea Graduation (`modie idea graduate <slug>`):** Once all spawned artifacts declared in `outputs:` are created on disk, graduation reports the generated artifacts and safely deletes the `.IDEA.md` file.
   - **The Rejection Graveyard (`.modie/ideas/.rejected/`):** Rejected ideas are moved to `.rejected/[slug].IDEA.md` with a brief `# Rationale for Rejection` rather than permanently deleted. This prevents recurring amnesia where the same discarded idea is repeatedly proposed weeks later.

# Authoring, Promotion & Discovery Ergonomics

- **Scope-Aware Discovery (`modie ideas` / `modie sparks`):**
  - By default, displays clickable links to active `[slug].IDEA.md` files alongside numbered sparks from the nearest initialized scope.
  - `--all` / `--workspace` aggregates across all package-level idea zones.
- **Spark Management:**
  - Add: `modie spark "my thought"` (or MCP `spark_add`).
  - List: `modie sparks` (shows numbered list).
  - Promote to Idea: `modie spark promote 1,4 --title "Clickable IDE Tags"`.
  - Graduate to Task: `modie spark task 2 "Add summary to ADR frontmatter" --scope src`.
- **Idea Lifecycle:**
  - Create: `modie idea create "My Concept"` (scaffolds sections and frontmatter).
  - Link Output: `modie idea link <slug> TASK-54 --output`.
  - Graduate: `modie idea graduate <slug>`.
  - Reject: `modie idea graduate <slug> --reject "Rationale for abandonment"`.

# Resolved Questions

- **Frictionless Effort/Impact in `SPARKS.md`:** Resolved against inline complexity. Adding tagging overhead to raw sparks defeats the purpose of rapid, zero-friction capture. Triage happens during promotion.
- **Idea $\rightarrow$ Task/ADR Graduation Tooling:** Resolved in favor of explicit graduation commands for both sparks (`modie spark task`) and ideas (`modie idea graduate`), backed by explicit `outputs:` verification.
- **Scope Proliferation:** Resolved via explicit initialization (`modie ideas init [path]`) with upward nearest-ancestor bubble-up traversal.
- **Rejection Amnesia:** Resolved by preserving rejected ideas in a `.rejected/` subfolder with documented rationale rather than silent deletion.

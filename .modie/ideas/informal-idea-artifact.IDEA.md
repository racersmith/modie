---
links:
  - ADR-2
  - ADR-4
  - ADR-6
  - ADR-10
  - RULE-20
---

# Problem & Motivation

Currently, Modie's primitive artifacts (`MOTIVE`, `ADR`, `RULE`, `TASK`, `GIST`) are highly formalized and carry intentional governance overhead:

- `ADR` and `RULE` artifacts represent committed architectural decisions and falsifiable invariants that should be slow to change.
- `TASK` artifacts represent actionable execution plans with defined blast radii, acceptance criteria, and branch/ID ceremony.

When a human or agent encounters a conceptual improvement or rough architectural thought during development, the tendency is to reach for one of these formalized artifacts (usually a premature `TASK` or `ADR`) so the thought isn't lost. However, doing so pollutes the active artifact pool with half-baked concepts before dedicated architectural design has taken place.

Even creating a dedicated idea file in the middle of a task is too much friction when all you have is a fleeting 1-sentence realization.

# Two-Tier Incubation Architecture

Inside `<dir>/.modie/ideas/`, we separate **fleeting capture** from **active incubation** using distinct, evocative filenames, while ensuring humans can always edit plain Markdown files directly and use Modie CLI/MCP tooling as an ergonomic accelerator:

1. **Stage 1 — The Spark Ledger (`SPARKS.md`):**
   - A single plain-Markdown list of raw, nascent thoughts (`<dir>/.modie/ideas/SPARKS.md`).
   - **Plain-File First:** A human can keep `SPARKS.md` open in their editor and jot down `- my thought` directly without using the CLI or memorizing verbose syntax, or run `modie spark "my thought"` from the terminal.
   - **Consolidation & Frequency Signal:** When multiple agent sessions or humans jot down similar sparks, an agent triage pass can consolidate duplicates and surface high-value sparks for promotion.

2. **Stage 2 — Dedicated Idea File (`[slug].IDEA.md`):**
   - **Programmatic Promotion (`modie spark promote`):** Tooling atomically extracts one or more sparks from `SPARKS.md` (by list index, substring match, or interactive selection), seeds a new `[slug].IDEA.md` file with those sparks, and removes the promoted lines from `SPARKS.md`.
   - **Un-indexed by Design:** Uses `[slug].IDEA.md` without sequence numbers (`ADR-2`), keeping focus on the concept's descriptive name and avoiding cross-branch ID collisions.
   - **Config-Driven WIP Limits:** `.modie/config.json` defines soft/hard limits on active `.IDEA.md` files and `SPARKS.md` entries per scope, prompting consolidation or triage rather than infinite accumulation.

3. **Stage 3 — Terminal Graduation or Pruning:**
   - Like `TASK` ([ADR-6]), ideas are strictly **ephemeral** (never `.ARCHIVED.md`).
   - Once an `[slug].IDEA.md` is either **graduated** into formal `ADR`/`RULE`/`TASK` artifacts or **rejected**, the `.IDEA.md` file is deleted.

# Authoring, Promotion & Discovery Ergonomics

- **Quick Discovery (`modie ideas` / `modie spark list`):**
  - Displays clickable links to active `[slug].IDEA.md` files alongside numbered sparks from `SPARKS.md`.
- **Programmatic Spark $\rightarrow$ Idea Promotion:**
  - Single spark: `modie spark promote 1 --title "Clickable IDE Tags"` (or interactive picker if run with no args).
  - Multi-spark consolidation: `modie spark promote 1,4 --title "Clickable IDE Tags"` pulls multiple related bullets out of `SPARKS.md` into the new `.IDEA.md` file in one atomic step.
- **Dual Creation Modes for `[slug].IDEA.md`:**
  - **Human CLI (`modie idea create "my idea"`):** Scaffolds helpful starting sections (`# Problem & Motivation`, `# Concept`, `# Open Questions`) and prints a clickable file link to open directly in the editor.
  - **Programmatic / Agent (`--body`):** Accepts freeform markdown body + optional frontmatter `links:` without rigid section enforcement.

# Open Questions

- **Frictionless Effort/Impact in `SPARKS.md`:** How should loose Effort/Impact be represented so it feels completely natural when editing `SPARKS.md` by hand (e.g., Markdown section headers like `## Quick Wins`, ultra-short `[H/L]` prefix, or only evaluated during triage)?
  - No, in practice this will not be populated and will just be extra overhead to a task that should be as quick as possible so that ideas don't get lost.
- **Idea $\rightarrow$ Task/ADR Graduation Tooling:** Should there also be a programmatic `modie idea graduate <slug>` helper that deletes the `.IDEA.md` once its target `ADR`/`TASK` is created?
  - Yes, for both sparks and ideas. Sometimes a spark can be directly translated to work, othertimes more it needs to be expanded in an idea first.

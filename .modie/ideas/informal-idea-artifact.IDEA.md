# Problem & Motivation

Currently, Modie's primitive artifacts (`MOTIVE`, `ADR`, `RULE`, `TASK`) are highly formalized and carry intentional governance overhead:

- `ADR` and `RULE` artifacts represent committed architectural decisions and falsifiable invariants that should be slow to change.
- `TASK` artifacts represent actionable execution plans with defined blast radii, acceptance criteria, and branch/ID ceremony.

When a human or agent encounters a conceptual improvement or rough architectural thought during development, the tendency is to reach for one of these formalized artifacts (usually a premature `TASK` or `ADR`) so the thought isn't lost. However, doing so pollutes the active artifact pool with half-baked concepts before dedicated architectural design has taken place.

Even creating a dedicated idea file in the middle of a task is too much friction when all you have is a fleeting 1-sentence realization.

# Two-Tier Incubation Architecture

We separate **fleeting capture** from **active incubation** using a lean, two-tier model that lives exclusively at the repository root (`.modie/ideas/`). 

Because ideas and sparks do not mutate code and have zero blast radius, they do not require complex sub-package scoping or directory traversal: there is exactly one shared incubator at workspace root.

## Incubation Stages

### 1. Stage 1 — The Spark Ledger (`SPARKS.md`)

* **Storage:** `.modie/ideas/SPARKS.md`.
* **Heading-Delimited Ledger:** Each spark is bounded by `# [handle] Title` with no document wrapper.
* **Plain-File First (2-Character Friction):** Writing `# My thought` takes the exact same two keystrokes as a bullet (`# ` vs `- `).
* **Full Markdown Freedom:** Because sparks are top-level headings, thoughts can span multiple paragraphs, contain fenced code blocks, checklists, quotes, or sub-headings (`##`, `###`) without cumbersome indentation rules.
* **Native IDE Outlines & Folding:** Every spark appears as a top-level symbol in editor outline sidebars, making jumping between thoughts and folding finished sparks instantaneous.
* **Flexible Handles & Lazy Minting:**
  - Humans can optionally assign custom handles (e.g. `# [ide] Clickable tags` or `# [NEXT] Refactor resolver`).
  - Sparks drafted without handles (e.g. `# Clickable tags`) are preserved, but lazily minted in-place with short 4-character random hex tokens (e.g. `# [7a1f] Clickable tags`, verified unique within the active file) whenever Modie reads or interacts with the file (`modie spark list`, `modie spark promote`, etc.).
  - Random hexes are generated with uniqueness checks against existing active handles, ensuring stability across text edits and typo fixes without the collision overhead of content hashing.
  - Agents calling `spark_add({ title, body })` automatically generate a unique minted handle upon creation.
* **Agent Cognitive Safety Valve:** During task execution, agents are constrained by blast radius boundaries (RULE-6). Calling `spark_add({ title, body })` gives agents an instant, compliant outlet to capture out-of-scope discoveries without derailing their active task.
* **Consolidation & Frequency Signal:** When multiple agent sessions or humans jot down similar sparks, an agent triage pass can consolidate duplicates and surface high-value sparks for promotion.

### 2. Stage 2 — Dedicated Idea File (`[slug].IDEA.md`)

* **Storage:** `.modie/ideas/[slug].IDEA.md`.
* **Programmatic Promotion (`modie spark promote <handle> [slug]`):** Tooling atomically extracts the spark section from `SPARKS.md`, seeds a new `[slug].IDEA.md` file, and removes the promoted section from `SPARKS.md`.
* **Pure Markdown (Zero Frontmatter):**
  - Idea files contain **zero YAML frontmatter**. They are pure, standard Markdown documents with freeform sections (`# Problem & Motivation`, `## Proposed Design`, etc.).
  - Prior art (`ADR-X`, `RULE-Y`) is cited naturally in Markdown prose.
* **Un-indexed by Design:** Uses `[slug].IDEA.md` without sequence numbers (ADR-2), keeping focus on the concept's descriptive name and avoiding cross-branch ID collisions.
* **Unidirectional Citation Invariant:** Because ideas are strictly ephemeral, permanent artifacts (`RULE`, `ADR`) and code/tests must **never cite an `.IDEA.md` file**. Ideas flow downstream into tasks; they never pollute upstream governance.
* **Task Context Connection:** When an idea matures and spawns a `TASK`, the task's existing, native `## Context` section simply cites the originating idea (e.g. `Originating from .modie/ideas/informal-idea-artifact.IDEA.md`). No complex reverse-lookup graph engines are required.

### 3. Stage 3 — Terminal Graduation or Rejection

Like `TASK` (ADR-6), ideas are strictly **ephemeral**.

* **Direct Spark Graduation:** When a spark is already concrete, create the formal `TASK` directly via standard task tools (`modie task create` or `create_task`) and remove the spark from `SPARKS.md`.
* **Idea Graduation:** When an idea has finished spawning its tasks and rules, the author or agent simply deletes the `.IDEA.md` file. Git commit history preserves the permanent record of the design discussion.
* **Two-Tier Rejection Graveyard (`.modie/ideas/.rejected/`):**
  - **Rejected Sparks (`.rejected/SPARKS.md`):** Discarded sparks that were never converted into ideas are transferred to `.rejected/SPARKS.md` with a high-signal blockquote callout immediately below the heading:
    ```markdown
    # [7a1f] Clickable IDE links for artifact tags
    > **Rejected (2026-11-11):** Decided against a proprietary IDE extension in favor of native CLI wayfinding.

    Original thought text, code snippets, and rationale remain preserved here...
    ```
    This keeps heading titles clean in editor outlines, surfaces the rejection rationale immediately upon scanning without scrolling, and preserves the full original context to eliminate repetitive re-proposals.
  - **Rejected Ideas (`.rejected/[slug].IDEA.md`):** Promoted ideas that are abandoned are moved to `.rejected/[slug].IDEA.md` with a `# Rationale for Rejection` section rather than permanently deleted.

# Lean Tooling & Ergonomics

Rather than introducing sprawling subcommand trees or custom branch routers, Modie exposes only four focused operations:

1. **`modie spark add "Title" ["Body"]`** (or MCP `spark_add`):
   - Fast capture for terminal users and agents without opening an editor.
2. **`modie spark list`** (or `modie sparks`):
   - Displays active sparks with handles and titles.
3. **`modie spark promote <handle> [slug]`**:
   - Atomically cuts the spark heading block out of `SPARKS.md` and writes it to `.modie/ideas/[slug].IDEA.md`.
4. **`modie spark reject <handle> [reason]`**:
   - Atomically moves the spark heading block to `.rejected/SPARKS.md` with the rejection blockquote note.

*All other idea management (authoring, editing, linking context, graduating) happens directly in plain Markdown files using standard editor tools.*

# Git Merge Resilience

`.gitattributes` declares:
```gitattributes
**/.modie/ideas/**/SPARKS.md merge=union
```
This allows concurrent appends to both active and rejected spark ledgers to auto-resolve across branches without merge conflicts.

# Resolved Questions

- **Frictionless Spark Addressing & Structure:** Resolved via heading-delimited entries (`# [handle] Title`) and lazy minting: humans can write raw `# My thought` entries with zero indentation overhead and full Markdown freedom, while Modie lazily mints short 4-character random hex handles (`[7a1f]`) in-place during tool interactions.
- **Zero Frontmatter Overhead:** Resolved by eliminating frontmatter entirely from `.IDEA.md` files. Citations live in natural prose; task linkages live in the task's native `## Context` section.
- **Scope Proliferation (YAGNI):** Resolved by maintaining exactly one `.modie/ideas/` container at workspace root. Ideas have no blast radius and require no package partitioning.
- **Branch Topology (YAGNI):** Resolved against custom `idea/` branch routers. Ideas iterate directly in Markdown on trunk; execution branching belongs exclusively to `TASK` artifacts where Modie's branch engine is already mature.
- **WIP Limits (YAGNI):** Resolved against config schemas or blocking limits to keep capture 100% friction-free.
- **Rejection Amnesia:** Resolved via a symmetrical two-tier rejection graveyard: `.rejected/SPARKS.md` for raw sparks with a top-level blockquote callout note (`> **Rejected (date):** ...`), and `.rejected/[slug].IDEA.md` for developed concepts with a `# Rationale for Rejection` section.

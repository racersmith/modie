# Modie

> Give every folder in your repo a memory, and give your AI agent exactly the memory it needs, no more.

> [!NOTE]
> **Early Beta (v0.1.x)**: Modie is built using Modie. The core workflow is stable for daily use, though `0.x` CLI flags, MCP schemas, and file formats may still evolve.

---

## The problem

AI coding agents start every session knowing nothing about your project. Today we patch that with:

- **One big `AGENTS.md` / wiki.** It's loaded in full every time, mostly irrelevant to the file being edited, and it goes stale because nothing ties it to the code.
- **Tickets in a tracker.** The plan lives somewhere the agent (and your `git log`) can't see.
- **"Conventions" in people's heads.** Nothing checks them, so they drift.

The result is bloated prompts, agents that break unwritten rules, and docs nobody trusts.

## The idea

**Your folder tree is already a hierarchy of scope. Modie uses it as the structure for project knowledge.**

Put a small `.modie/` directory next to the code it's about. Knowledge placed there applies to that folder and everything beneath it, and _only_ there. An agent working in `src/interfaces/mcp/` inherits what `src/interfaces/` and `src/` say, and never sees what `src/core/` says.

```
src/
├── .modie/
│   ├── MOTIVE.md                  ← why this whole codebase exists
│   ├── adrs/                      ← decisions made, and what was rejected
│   ├── rules/                     ← laws that apply everywhere under src/
│   └── tasks/                     ← active ephemeral tasks scoped here
├── core/
│   └── .modie/
│       └── MOTIVE.md              ← what "core" is for
└── interfaces/
    ├── .modie/rules/              ← "interfaces never reach into core internals"
    └── mcp/
        └── .modie/rules/          ← "tool responses must contain only actionable schema data"
```

Editing in `src/interfaces/mcp/`? Your context is the chain **mcp → interfaces → src → root**. Nothing else.

This gives you:

- **Knowledge lives beside the code**, versioned on the same branch, reviewed in the same PR.
- **Small context by construction.** Relevant guidance is selected by _where you are_, not by search or by dumping everything.
- **Rules you can check**, not just prose (see below).
- **Work plans that don't pile up** (see below).
- **Least-scope auditing.** Citations across code and tests tell you when a rule is scoped too broadly or too narrowly.

## What goes in a `.modie/`

Four spatial DAG artifacts—plus a lightweight **SPARK** ledger for inchoate ideas—each with a distinct job and litmus test:

| Question                                                         | Artifact                               | Lifetime                                                    |
| :--------------------------------------------------------------- | :------------------------------------- | :---------------------------------------------------------- |
| _Why does this part of the code exist and where is it headed?_   | **MOTIVE**                             | Permanent, rarely edited (`<dir>/.modie/MOTIVE.md`)         |
| _Why did we choose X over Y to constrain future code?_           | **ADR** (Architecture Decision Record) | Immutable point-in-time record; superseded, never rewritten |
| _What must always be true here?_                                 | **RULE**                               | Long-lived, one falsifiable statement each                  |
| _What converged work am I doing right now?_                      | **TASK**                               | Ephemeral, deleted when done                                |
| _What raw idea or out-of-scope finding did I just notice?_       | **SPARK**                              | Incubated in `.modie/ideas/SPARKS.md`; promoted or rejected |

Indexed DAG artifacts (`ADR`, `RULE`, `TASK`) are plain Markdown files whose names carry their identity, e.g. `least-scope-placement.RULE-12.md`. IDs are allocated for you (never by hand), including across parallel branches.

### Rules are meant to be checkable

A rule is a single statement that is either true or false of your code, for example:

> _"An agent protocol tool response must return payloads containing exclusively actionable schema data, omitting decorative formatting, redundant status wrappers, and unsolicited raw document contents."_ (`RULE-26`)

Tests and code cite the rules they enforce (`it("[RULE-26] ...")` or `// @verifies RULE-26`), so a rule nothing verifies shows up as a gap rather than silently decaying into folklore. Because it's just pattern matching on the tag, this works in any language.

Using those citations and governance links, `modie scope audit` computes the **Deepest Common Ancestor (DCA)** for each `RULE` and `ADR` to catch **over-scoped** artifacts (causing context bloat) and **under-scoped** artifacts (cited outside their subtree), and `modie scope move` relocates them cleanly.

### Tasks are plans that disappear

A TASK is a Markdown file with context and a contract-based acceptance-criteria checklist, scoped to the deepest folder that contains the work (least-scope placement) with bounded mutation authority (downward blast radius). It exists **only while the work is pending**:

1. Author any new governing `ADR`s or `RULE`s *before* (or as discovered during) the task, and link them onto the task (`--link ADR-X`, `--link RULE-Y`). Code and tests cite durable `RULE` tags, never ephemeral `TASK` or `ADR` tags.
2. `modie task start` (or `start_task` in MCP) creates and checks out a hierarchical branch (`task/<id>-<slug>`), verifying `depends_on` blockers first.
3. You (or your agent) tick off criteria with `modie task check` (`check_criteria`) as they're verified.
4. Every task includes a **User Review** criterion by default, ensuring a human reviews the changes before completion.
5. `modie task complete` executes an atomic two-phase Git commit: one commit for verified work, and one commit that deletes the task artifact.
6. `modie task merge` brings the verified work back to trunk after running pre-merge artifact collision guards (and in MCP, `complete_task` performs completion, trunk merge, and branch cleanup together).

Git history is the permanent record of what was done. The working tree only ever shows work _still to do_, so neither you nor an agent wades through stale plans. Out-of-scope realizations discovered mid-task can be captured via `modie spark add` / `spark_add` without breaking blast radius boundaries.

### Decisions enable progressive disclosure

ADRs record immutable architectural choices that actively constrain future code. Tombstone ADRs—recording past deletions, sunsets, or cleanups—are blocked by validation guardrails (`validateAdrTitle`), steering you toward `modie archive` (`archive_artifact`) or an ephemeral `TASK` instead.

Each ADR includes a concise 1–2 sentence `summary:` in its frontmatter (falling back to `# Decision` / `# Context` if omitted):

```yaml
---
summary: Encapsulate all governance and intent artifacts within a single unified .modie container directory.
links:
  - ADR-4
  - RULE-8
---
```

When compiling context or listing decisions, Modie surfaces these summaries as signposts, disclosing full decision contexts on demand without overloading agent context windows. When a decision changes, the previous ADR is superseded via bidirectional frontmatter (`supersedes` / `superseded_by`), preserving historical rationale.

### Sparks & Ideas incubate before formalization

Not every thought belongs in a formal `TASK` or `ADR` right away. `modie spark add` (and the `spark_add` MCP tool) appends lightweight entries to `.modie/ideas/SPARKS.md` with short handles (e.g. `[7a1f]` or a custom handle):

- `modie spark list` (`modie sparks`) lists active sparks and lazily mints missing handles.
- `modie spark promote <handle>` promotes a spark into `.modie/ideas/<slug>.IDEA.md` for design incubation.
- `modie spark reject <handle> [reason]` archives discarded sparks to `.modie/ideas/.rejected/SPARKS.md` so settled non-goals aren't re-proposed.

---

## The Context Compiler (`modie context`)

The heart of Modie is the **context compiler**. Given any file or directory path, or an active task identifier, Modie walks the directory DAG to assemble the minimal, complete architectural context needed to work safely:

```bash
# Human-readable diagnostic overview (to stderr)
modie context src/interfaces/mcp

# Synthesized raw Markdown (to stdout, ready to pipe into LLM prompts)
modie context src/interfaces/mcp --raw

# Scoped to an active task as JSON
modie context TASK-10 --json
```

A compiled context bundle contains:

1. **Upward Motives**: The hierarchy of intent from the repository root down to the target scope.
2. **Active Governing Rules**: Every rule in the ancestral tree that applies to this code.
3. **Progressive ADR Summaries**: Concise summaries of decisions made in this scope.
4. **Child Directory Motives**: Immediate child directory `MOTIVE.md` files that can be explored on demand.
5. **Task Specification**: Context, acceptance criteria, dependencies, and declared blast radius when scoped to a task.

---

## How an agent uses it

Modie ships an MCP server with **13 singular-purpose tools** and **4 ambient resources**, allowing Claude Code, Antigravity, Cursor, Windsurf, and custom agents to drive the governance loop natively:

```
directory_context(path) → modie://tasks/ready → start_task → (work, task_context, check_criteria) → (create_rule / create_adr / spark_add) → complete_task
```

### Setup

```json
{
  "mcpServers": {
    "modie": {
      "command": "bunx",
      "args": ["@racersmith/modie", "mcp"]
    }
  }
}
```

Or run via `npx` (or the `modie-mcp` binary directly):

```json
{
  "mcpServers": {
    "modie": {
      "command": "npx",
      "args": ["-y", "@racersmith/modie", "mcp"]
    }
  }
}
```

An Antigravity plugin integration bundle is also included in [`integrations/antigravity/`](integrations/antigravity/README.md).

### Agent Best Practices & Token Economy

- **Token Economy (RULE-26)**: Exploration and brief tools (`directory_context`, `read_artifact`, `task_context`, `start_task`) emit high-signal, unescaped Markdown (`directory_context` defaults to `"summary"` mode with `"detailed"` on demand). Mutation tools (`check_criteria`, `complete_task`, `create_*`, `link_artifacts`, `archive_artifact`, `spark_add`) return lean structured JSON (`structuredContent`) without unsolicited document prose.
- **Read-Only Ambient MCP Resources**: Agents can inspect live workspace state with zero tool-call overhead:
  - `modie://task`: Dynamic Markdown Mission Brief for the active task branch.
  - `modie://tasks/ready`: Unblocked active tasks ready for execution, with summary teasers and downstream leverage.
  - `modie://tasks/all`: Full active workspace task backlog grouped by readiness, blockers, and downstream leverage.
  - `modie://instructions`: Authoritative governance rules (rule-only citations, downward blast radius, contract-based criteria, authoring litmus tests).

---

## Where it stands

Working today:

- [x] **Unified context compiler**: compile ancestral MOTIVEs, active RULEs, ADR summaries, task specs, and child motives (`modie context`, `directory_context`, `task_context`)
- [x] **Artifact creation, lookup, supersession, and archiving**: MOTIVE, ADR, RULE, and TASK
- [x] **Complete task lifecycle**: hierarchical branching, criteria tracking, automatic `User Review` gates, two-phase completion, collision-guarded merge, and DAG readiness
- [x] **Spark & idea incubation ledger**: capture raw realizations into `.modie/ideas/SPARKS.md` with minted handles, promote to `.IDEA.md`, or reject to `.rejected/SPARKS.md`
- [x] **Least-scope placement auditing & relocation**: `modie scope audit` (`modie audit`) and `modie scope move` using Deepest Common Ancestor (DCA) citation analysis
- [x] **Artifact authoring litmus tests & anti-tombstone guardrails**: subtype litmus enforcement and tombstone ADR blocking
- [x] **Progressive disclosure**: ADR `summary:` frontmatter signposts and token-lean Markdown/JSON MCP responses (RULE-26)
- [x] **Governance and task querying**: `rule list`, `adr list`, `task list` (`backlog`), `task status`, `scope`, `find`, and `read`
- [x] **Declarative frontmatter linking**: bidirectional `link` and `unlink` with graph topology, ancestry, and DAG acyclicity validation
- [x] **Collision-free ID allocation**: deterministic watermark resolution across parallel git branches
- [x] **Reference scanner**: inbound citation and outbound link detection (`references` / `refs`) across code, tests, governance artifacts, and docs
- [x] **CLI & MCP interfaces**: 29 declarative Zod-typed CLI commands (with `--json` and stdout/stderr separation), 13 singular MCP tools, 4 ambient resources, `.modie/config.json`, and an Antigravity plugin bundle
- [x] **Unified container architecture**: all artifacts encapsulated in `<dir>/.modie/<subtypes>/`

Planned / Roadmap (incubating in [`.modie/ideas/`](.modie/ideas)):

- [ ] **Architecture linter & blast-radius verification**: fast verification checks for unverified `RULE`s (zero test/code citations), forbidden `TASK` / `ADR` citations in code and tests, and mechanical `git diff` downward blast-radius enforcement on `complete_task`
- [ ] **Hierarchical subtasks & cross-cutting context**: parent coordinator tasks at a common ancestor (`src/`) with deeper scoped child subtasks (`src/core/`, `src/interfaces/`) that inherit parent mission context while keeping local rules and blast radius tight
- [ ] **Targeted rule citations & meta-rule scoping**: assertion-level `@verifies` tagging, separation of rule verification vs. enforcement vs. compliance, and scope-pinning for repository-wide rules so feature tests stay free of compliance-tag noise
- [ ] **Gitignore-aware & configurable citation scanning**: native `.gitignore` support across scanners plus `.modie/config.json` directory and documentation exclusion lists

Modie is its own first user. This repo's [`.modie/`](.modie) and [`src/.modie/`](src/.modie) folders are a live example of everything above, and its [`.modie/MOTIVE.md`](.modie/MOTIVE.md) states the goal: prove the ergonomics, token efficiency, and machine-verifiable safety of filesystem-as-DAG governance by using it.

---

## Installation

```bash
# Global CLI
npm install -g @racersmith/modie

# Or as a project devDependency
bun add -d @racersmith/modie
# or
pnpm add -D @racersmith/modie
```

## CLI quick reference

Machine-readable output (`--json`, file paths, or `--raw` Markdown) goes to `stdout`; human formatting, tables, and diagnostic messages go to `stderr`, making commands safe to pipe and script.

```bash
# Context & Discovery
modie context src/interfaces/mcp     # compile unified architectural context
modie context src/core --raw         # emit synthesized raw Markdown to stdout
modie context TASK-10 --json         # compile context for specific task as JSON
modie find RULE-26                   # locate artifact path by tag
modie read RULE-26                   # view artifact details (add --raw for full body)
modie scope src/interfaces/cli       # inspect governing scope and ancestral rule chain
modie scope audit                    # audit least-scope placement (alias: modie audit)
modie scope audit --apply            # automatically relocate over/under-scoped artifacts
modie scope move RULE-12 src/core    # relocate artifact (omit target for auto-DCA scope)
modie references ADR-6               # citations and declared outbound links (alias: refs)

# Task Lifecycle
modie backlog                        # active tasks, progress, blockers (alias: modie task list)
modie task list --ready              # show only unblocked tasks ready for work
modie task status TASK-10            # inspect specific task status (or --history)
modie task create "Add JWT Auth" \
  -a "Verify token signatures" \
  -a "Test token expiry" \
  -l ADR-2
modie task start TASK-10             # creates and checks out branch task/10-add-jwt-auth
modie task check -i 1                # tick off criterion 1 (inferred from active branch)
modie task complete                  # atomic two-phase commit & artifact deletion (alias: finish)
modie task merge                     # validate collisions and merge back to trunk

# Architectural Governance
modie motive create "Purpose text" -s src/interfaces/cli   # scaffold or update MOTIVE.md
modie rule create "Deterministic ID Allocation" -l ADR-1
modie rule create "Updated Validation" -S RULE-5
modie rule list -s src/interfaces    # list active rules governing scope (alias: ls)
modie rule archive RULE-3            # archive rule (refuses if still cited)
modie adr create "Git-Backed Ephemeral Task Lifecycle" \
  --summary "Manage tasks as active-only working tree files deleted on completion."
modie adr list                       # list active ADRs (alias: ls)
modie adr archive ADR-3              # archive ADR
modie archive RULE-3                 # unified archive command for RULE or ADR
modie link RULE-16 ADR-5             # add validated frontmatter link or dependency
modie unlink RULE-16 ADR-5           # remove frontmatter link or dependency

# Sparks & Ideas
modie spark add "Idea title" "Details..."   # capture nascent idea in SPARKS.md
modie spark list                            # list active sparks (aliases: ls, modie sparks)
modie spark promote 7a1f                    # promote spark to .modie/ideas/<slug>.IDEA.md
modie spark reject 7a1f "Out of scope"      # archive spark to .rejected/SPARKS.md

# Model Context Protocol
modie mcp                            # run MCP server over stdio (also: modie-mcp)
```

### MCP tools

| Tool                 | Category    | Purpose                                                                           |
| :------------------- | :---------- | :-------------------------------------------------------------------------------- |
| `directory_context`  | Exploration | Compile upward motives, governing rules, and child motives (`summary`/`detailed`) |
| `read_artifact`      | Exploration | Read any `RULE`, `ADR`, or `TASK` tag in Markdown with relationship appendix      |
| `task_context`       | Exploration | High-signal Mission Brief with active branch, blast radius, criteria, and rules   |
| `start_task`         | Lifecycle   | Check out or create `task/<id>-<slug>` branch, verify blockers, return brief      |
| `check_criteria`     | Lifecycle   | Atomically mark 1-based acceptance criteria complete or incomplete                |
| `complete_task`      | Lifecycle   | Verify criteria, run two-phase completion commit, merge to trunk, delete branch   |
| `create_rule`        | Authoring   | Author a `RULE` with invariant assertion and optional justifying `ADR` links      |
| `create_adr`         | Authoring   | Author an `ADR` with context/decision/consequences and anti-tombstone validation  |
| `create_task`        | Authoring   | Author a scoped `TASK` with contract-based criteria ending in `User Review`       |
| `create_motive`      | Authoring   | Create or scaffold a directory-level `MOTIVE.md` scope intent file                |
| `link_artifacts`     | Graph       | Establish validated `links` or `depends_on` edges between artifacts               |
| `archive_artifact`   | Graph       | Archive an obsolete `RULE` or `ADR` after auditing inbound references             |
| `spark_add`          | Incubation  | Capture out-of-scope realizations into `.modie/ideas/SPARKS.md`                   |

**Ambient MCP resources:** `modie://task`, `modie://tasks/ready`, `modie://tasks/all`, `modie://instructions`.

---

## License

[MIT](LICENSE) © 2026 Josh Smith

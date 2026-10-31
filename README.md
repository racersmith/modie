# Modie

> Give every folder in your repo a memory, and give your AI agent exactly the memory it needs, no more.

> [!WARNING]
> **Active Alpha (v0.0.x)**: Modie is built using Modie. CLI commands, MCP tools, and file formats are still changing quickly.

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
│   ├── gists/                     ← concise summaries of this folder & files
│   └── tasks/                     ← active ephemeral tasks scoped here
├── core/
│   └── .modie/
│       ├── MOTIVE.md              ← what "core" is for
│       └── gists/                 ← summaries of core modules
└── interfaces/
    ├── .modie/rules/              ← "interfaces never reach into core internals"
    └── mcp/
        └── .modie/rules/          ← "tool responses must be token-lean"
```

Editing in `src/interfaces/mcp/`? Your context is the chain **mcp → interfaces → src → root**. Nothing else.

This gives you:

- **Knowledge lives beside the code**, versioned on the same branch, reviewed in the same PR.
- **Small context by construction.** Relevant guidance is selected by _where you are_, not by search or by dumping everything.
- **Rules you can check**, not just prose (see below).
- **Work plans that don't pile up** (see below).

## What goes in a `.modie/`

Five kinds of artifact, each with a distinct job. If you're unsure which one something is, ask the question:

| Question                                                       | Artifact                               | Lifetime                                                          |
| :------------------------------------------------------------- | :------------------------------------- | :---------------------------------------------------------------- |
| _Why does this part of the code exist and where is it headed?_ | **MOTIVE**                             | Permanent, rarely edited                                          |
| _Why did we choose X over Y?_                                  | **ADR** (Architecture Decision Record) | Immutable point-in-time record; superseded, never rewritten       |
| _What must always be true here?_                               | **RULE**                               | Long-lived, one falsifiable statement each                        |
| _How does this currently work, in a sentence or two?_          | **GIST**                               | Concise folder/file summary with Git blob hash freshness tracking |
| _What am I doing right now?_                                   | **TASK**                               | Ephemeral, deleted when done                                      |

Artifacts are plain Markdown files whose names carry their identity, e.g. `least-scope-placement.RULE-12.md`. IDs are allocated for you (never by hand), including across parallel branches.

### Rules are meant to be checkable

A rule is a single statement that is either true or false of your code, for example:

> _"A tool response must contain only actionable data: no decorative formatting, redundant status wrappers, or unsolicited document contents."_ (`RULE-26`)

Tests cite the rules they enforce (`it("[RULE-26] ...")` or `// @verifies RULE-26`), so a rule nothing verifies shows up as a gap rather than silently decaying into folklore. Because it's just pattern matching on the ID, this works in any language.

### Tasks are plans that disappear

A TASK is a Markdown file with context and an acceptance-criteria checklist, scoped to the deepest folder that contains the work (least-scope placement) with bounded mutation authority (downward blast radius). It exists **only while the work is pending**:

1. `modie task start` creates a dedicated branch for it (`task/<id>-<slug>`).
2. You (or your agent) tick off criteria with `modie task check` as they're verified.
3. Every task includes an automatic **User Review** gate by default, ensuring a human reviews the changes before completion.
4. Tasks can declare front-loaded **planned governance** (`--plan-rule`, `--plan-adr`), requiring new architectural conventions to be authored before task completion.
5. `modie task complete` executes an atomic two-phase Git commit: one commit for verified work, and one commit that deletes the task artifact.
6. `modie task merge` brings the verified work back to trunk after validating pre-merge artifact collision guards.

Git history is the permanent record of what was done. The working tree only ever shows work _still to do_, so neither you nor an agent wades through stale plans. Tasks can declare `depends_on` other tasks and link to the ADRs and RULEs they must respect. Code and tests cite those durable ADRs/RULEs, never the TASK that happened to introduce them.

### Decisions enable progressive disclosure

ADRs record immutable architectural choices. Each ADR includes a concise 1–2 sentence `summary:` in its frontmatter:

```yaml
---
summary: Encapsulate all governance, intent, and GIST artifacts within a single unified .modie container directory.
links:
  - ADR-4
  - RULE-8
---
```

When compiling context or listing decisions, Modie surfaces these summaries as signposts, disclosing full decision contexts on demand without overloading agent context windows. When a decision changes, the previous ADR is superseded via bidirectional frontmatter (`supersedes` / `superseded_by`), preserving historical rationale.

### GISTs provide fast, verified code summaries

GISTs are compact natural-language summaries living in `.modie/gists/`:

- **Directory GIST (`GIST.md`)**: A concise summary of what lives in the directory.
- **File GIST (`<filename>.GIST.md`)**: A 1–2 sentence implementation proxy for an individual source file.
- **Freshness Ledger (`.gists`)**: A semantic ledger that tracks Git blob hashes for each summarized file. Modie verifies whether code has drifted from its gist with zero-read hash checks.

---

## The Context Compiler (`modie context`)

The heart of Modie is the **context compiler**. Given any file or directory path, or an active task identifier, Modie walks the directory DAG to assemble the minimal, complete architectural context needed to work safely:

```bash
# Human-readable diagnostic overview
modie context src/interfaces/mcp

# Synthesized raw Markdown (ready to pipe into LLM prompts)
modie context src/interfaces/mcp --raw

# Scoped to an active task
modie context TASK-44 --json
```

A compiled context bundle contains:

1. **Upward Motives**: The hierarchy of intent from the repository root down to the target scope.
2. **Active Governing Rules**: Every rule in the ancestral tree that applies to this code.
3. **Progressive ADR Summaries**: 1-sentence summaries of decisions made in this scope.
4. **Local GISTs & Downward Signposts**: Summaries of local files and shallow child directories that can be explored on demand.
5. **Task Specification**: Context, acceptance criteria, and declared blast radius when scoped to a task.

---

## How an agent uses it

Modie ships an MCP server, allowing Claude Code, Gemini/Antigravity, Cursor, Windsurf, and custom agents to drive the entire governance loop through native tools:

```
context(path) → task_list → task_start → (work, context, task_check) → (rule_create / adr_create) → task_complete → task_merge
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

Or run via npx:

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

### Agent Best Practices & Token Economy

- **Token Economy (RULE-26)**: All MCP tools return lean, structured JSON payloads. Verbose prose and unsolicited document contents are stripped by default unless explicitly requested (e.g. `raw: true`).
- **Read-Only MCP Resources**: Agents can cheaply inspect live workspace state without burning tool execution cycles:
  - `modie://tasks/ready`: Active tasks unblocked by dependencies and ready for execution.
  - `modie://tasks`: Full active task queue with DAG dependency readiness.
  - `modie://rules`: All active workspace rules and assertions.
  - `modie://instructions`: Comprehensive guidelines on ephemeral task decoupling, contract-based criteria (RULE-30), and front-loaded planned governance.

---

## Where it stands

Working today:

- [x] **Unified context compiler**: compile ancestral MOTIVEs, active RULEs, ADR summaries, task specs, GISTs, and child signposts (`modie context`, `context` MCP tool)
- [x] **Artifact creation, lookup, supersession, and archiving**: MOTIVE, ADR, RULE, and TASK
- [x] **Complete task lifecycle**: branch creation, acceptance criteria tracking, automatic User Review gates, two-phase completion, guarded merge, and DAG readiness
- [x] **Front-loaded planned governance**: declare planned RULEs/ADRs on tasks upfront, enforced prior to task completion
- [x] **Progressive disclosure**: ADR summary frontmatter and token-lean payload sanitization (RULE-26)
- [x] **GIST discovery and freshness model**: directory-level summaries, file-level implementation proxies, and `.gists` Git blob hash tracking
- [x] **Governance and task querying**: `rule list` and `adr list` with ancestral scope filtering, plus DAG-aware `task list` (`backlog`) and `task status`
- [x] **Declarative frontmatter linking**: bidirectional `link` and `unlink` with graph topology, ancestry, and dependency validation
- [x] **Collision-free ID allocation**: deterministic watermark resolution across parallel git branches
- [x] **Reference scanner**: inbound citation and outbound link detection (`references`) across code, tests, and markdown
- [x] **CLI and MCP server parity**: shared declarative schema registry projecting CLI commands into typed MCP tools and resources
- [x] **Unified container architecture**: all artifacts encapsulated in `<dir>/.modie/<subtypes>/`

Planned / Roadmap:

- [ ] **Architecture linter**: automated verification that all rules have active test citations, links stay valid, and scope boundaries aren't bypassed
- [ ] **Automated GIST generation & sync**: CLI command and MCP tool to scaffold and re-hash GIST proxies as code evolves
- [ ] **Interactive IDE integrations**: clickable artifact cross-references and diagnostics in VS Code / Antigravity

Modie is its own first user. This repo's [`.modie/`](src/.modie) folders are a live example of everything above, and its [`MOTIVE.md`](MOTIVE.md) states the goal: prove the ergonomics, token efficiency, and safety of folder-scoped governance by using it.

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

Machine-readable output (`--json`) and raw Markdown (`--raw`) go to `stdout`; progress and diagnostic messages go to `stderr`, making commands safe to pipe and script.

```bash
# Context & Discovery
modie context src/interfaces/mcp     # compile unified architectural context
modie context src/core --raw        # emit synthesized raw Markdown to stdout
modie context TASK-44 --json        # compile context for specific task
modie find RULE-26                  # locate artifact path by tag
modie read RULE-26                  # view artifact details (add --raw for full body)
modie scope src/interfaces/cli      # inspect governing scope and ancestral rule chain
modie references ADR-6              # citations and declared outbound links (alias: refs)

# Task Lifecycle
modie backlog                       # active tasks, progress, blockers (alias: modie task list)
modie task list --ready             # show only unblocked tasks ready for work
modie task status TASK-10           # inspect specific task status
modie task create "Add JWT Auth" \
  -a "Verify token signatures" \
  -a "Test token expiry" \
  --plan-rule "Token Expiration Invariance" \
  --link ADR-2
modie task start TASK-10            # creates and checks out branch task/10-add-jwt-auth
modie task check -i 1               # tick off criterion 1 (inferred from active branch)
modie task complete                 # atomic two-phase commit & artifact deletion (alias: finish)
modie task merge                    # validate collisions and merge back to trunk

# Architectural Governance
modie motive create "Purpose text" -s src/interfaces/cli   # scaffold or update MOTIVE.md
modie rule create "Deterministic ID Allocation" --link ADR-1
modie rule create "Updated Validation" --supersedes RULE-5
modie rule list -s src/interfaces   # list active rules governing scope (alias: ls)
modie rule archive RULE-3           # archive rule (refuses if still cited)
modie adr create "Git-Backed Ephemeral Task Lifecycle" \
  --summary "Manage tasks as active-only working tree files deleted on completion."
modie adr list                      # list active ADRs (alias: ls)
modie adr archive ADR-3             # archive ADR
modie archive RULE-3                # unified archive command for RULE or ADR
modie link RULE-16 ADR-5            # add validated frontmatter link or dependency
modie unlink RULE-16 ADR-5          # remove frontmatter link or dependency

# Model Context Protocol
modie mcp                           # run MCP server over stdio
```

### MCP tools

| Tool                                         | Purpose                                                                                  |
| :------------------------------------------- | :--------------------------------------------------------------------------------------- |
| `context`                                    | Compile unified architectural context (motives, rules, ADR summaries, GISTs, task)       |
| `task_list` / `task_status`                  | List active tasks with DAG readiness, or inspect deep task details                       |
| `task_create` / `task_start` / `task_check`  | Create tasks, check out task branches, and tick off acceptance criteria items            |
| `task_complete` / `task_merge`               | Complete tasks via two-phase commit ceremony, delete task files, and merge back to trunk |
| `rule_create` / `rule_list` / `rule_archive` | Author, list with scope filtering, and archive RULE artifacts                            |
| `adr_create` / `adr_list` / `adr_archive`    | Author with summary frontmatter, list, and archive ADR artifacts                         |
| `motive_create`                              | Scaffold or update directory-level MOTIVE.md scope intent                                |
| `link_artifact` / `unlink_artifact`          | Add or remove validated frontmatter links or task execution dependencies                 |
| `archive`                                    | Unified archival command for governance artifacts (RULE, ADR) with citation guards       |
| `find` / `read` / `scope` / `references`     | Find filepaths, read details/raw content, resolve scope chains, and trace citations      |

---

## License

[MIT](LICENSE) © 2026 Josh Smith

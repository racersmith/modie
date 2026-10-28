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
│   └── rules/                     ← laws that apply everywhere under src/
├── core/
│   └── .modie/MOTIVE.md           ← what "core" is for
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

| Question                                                       | Artifact                               | Lifetime                                   |
| :------------------------------------------------------------- | :------------------------------------- | :----------------------------------------- |
| _Why does this part of the code exist and where is it headed?_ | **MOTIVE**                             | Permanent, rarely edited                   |
| _Why did we choose X over Y?_                                  | **ADR** (Architecture Decision Record) | Immutable. Replaced, never rewritten       |
| _What must always be true here?_                               | **RULE**                               | Long-lived, one falsifiable statement each |
| _How does this currently work, in a sentence or two?_          | **GIST** _(planned)_                   | Updated as code changes                    |
| _What am I doing right now?_                                   | **TASK**                               | Ephemeral, deleted when done               |

Artifacts are plain Markdown files whose names carry their identity, e.g. `least-scope-placement.RULE-12.md`. IDs are allocated for you (never by hand), including across parallel branches.

### Rules are meant to be checkable

A rule is a single statement that is either true or false of your code, for example:

> _"A tool response must contain only actionable data: no decorative formatting, redundant status wrappers, or unsolicited document contents."_ (`RULE-26`)

Tests cite the rules they enforce (`it("[RULE-26] ...")` or `// @verifies RULE-26`), so a rule nothing verifies shows up as a gap rather than silently decaying into folklore. Because it's just pattern matching on the ID, this works in any language.

### Tasks are plans that disappear

A TASK is a Markdown file with context and an acceptance-criteria checklist, scoped to the deepest folder that contains the work. It exists **only while the work is pending**:

1. `modie task start` creates a branch for it.
2. You (or your agent) tick off criteria as they're verified.
3. `modie task complete` makes two commits: one for the verified work, one that deletes the task file.
4. `modie task merge` brings it back to trunk.

Git history is the permanent record of what was done. The working tree only ever shows work _still to do_, so neither you nor an agent wades through stale plans. Tasks can declare `depends_on` other tasks and link to the ADRs and RULEs they must respect. Code and tests cite those durable ADRs/RULEs, never the TASK that happened to introduce them.

## How an agent uses it

Modie ships an MCP server, so Claude Code, Gemini/Antigravity, Cursor, Windsurf and others can drive the whole loop through tools:

```
task_list  →  task_start  →  (work, task_check as criteria pass)  →  task_complete  →  task_merge
```

The agent can also author `rule_create` / `adr_create` when it discovers a convention worth keeping, and look up what exists with `find`, `show`, and `references`. The server also exposes read-only resources (`modie://tasks/ready`, `modie://rules`, `modie://instructions`) so agents can orient themselves cheaply. Tool output is intentionally terse, since tokens are the budget.

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

## Where it stands

Working today:

- [x] Artifact creation, lookup, supersession and archiving (MOTIVE/ADR/RULE/TASK)
- [x] Task lifecycle: branch, checklist, two-phase completion, guarded merge, dependency readiness
- [x] Collision-free ID allocation across branches
- [x] Reference scanner: where is this ADR/RULE cited?
- [x] CLI and MCP server over the same core
- [x] Pluggable VCS layer (Git, plus a mock for tests)

Not yet built (this is the heart of the vision):

- [ ] **Context compiler**: given a path, compile the minimal ancestral MOTIVEs and RULEs, plus short "signposts" (sibling folders and their GISTs) that the agent can drill into on demand
- [ ] **Architecture linter**: verify that rules have tests, links point the right way, and the graph stays valid
- [ ] **GISTs**
- [ ] **rule/ADR list commands**

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

Machine-readable output (`--json`) goes to `stdout`; progress and errors go to `stderr`, so it's safe to pipe.

```bash
# Work
modie backlog                       # active tasks, progress, blockers (alias: modie task list)
modie task create "Add JWT auth" \
  -a "Verify token signatures" \
  -a "Test token expiry" \
  --link ADR-2
modie task start TASK-10            # creates task/<id>-<slug>
modie task check -i 1               # task inferred from current branch
modie task complete                 # two-phase commit (alias: finish)
modie task merge

# Governance
modie rule create "Deterministic ID Allocation" --link ADR-1
modie rule create "Updated Validation" --supersedes RULE-5
modie adr create "Git-Backed Ephemeral Task Lifecycle"
modie archive RULE-3                # refuses if still cited

# Discovery
modie find "references-scanner"
modie show RULE-34
modie references ADR-6
```

### MCP tools

| Tool                                                                         | Purpose                                           |
| :--------------------------------------------------------------------------- | :------------------------------------------------ |
| `task_list` / `task_status`                                                  | Queue, readiness, blockers; deep-inspect one task |
| `task_create` / `task_start` / `task_check` / `task_complete` / `task_merge` | The task lifecycle                                |
| `rule_create` / `adr_create`                                                 | Author governance                                 |
| `rule_archive` / `adr_archive` / `archive`                                   | Retire governance with citation checks            |
| `find` / `show` / `references`                                               | Look things up                                    |

---

## License

[MIT](LICENSE) © 2026 Josh Smith

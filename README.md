# Modie

> Filesystem-as-DAG architectural governance and context compilation for human developers and AI agents.

> [!WARNING]
> **Active Alpha Development (v0.0.x)**: Modie is currently in early-stage, active development. CLI interfaces, core APIs, and artifact schemas are evolving rapidly as we dogfood the system.

---

## What is Modie?

Modie is a self-governing architectural framework that structures project knowledge, rules, decisions, and tasks directly within the repository filesystem. By treating the directory hierarchy as a **Directed Acyclic Graph (DAG)**, Modie ensures that architectural constraints and context remain physically colocated with the code they govern.

### Why Filesystem-as-DAG?

* **Zero Documentation Rot**: Architectural decisions and rules live right next to the code, not in detached wikis or stale design docs.
* **Token-Efficient Context Compilation**: AI coding agents compile only the ancestral motives and rules relevant to the specific file they are editing, eliminating context-window bloat and prompt pollution.
* **Bounded Blast Radius**: Tasks and rules are scoped to the deepest common ancestor directory, preventing changes from rippling across unrelated subtrees.
* **Ephemeral Work Lifecycle**: Active tasks exist on disk only while pending. Upon completion and verification, they are committed and deleted—leaving the working tree pristine while Git history acts as the permanent ledger.

---

## Artifact Triage

Modie divides architectural knowledge into five distinct core primitives based on lifecycle, authority, and mutability:

```
Is this explaining the fundamental purpose, trajectory, and scope of this territory?
└── YES ──► MOTIVE.md

Is this debating architectural trade-offs, design rationale, or rejected options?
└── YES ──► ADR

Is this a non-negotiable law that code, tests, or a linter can assert as true/false?
└── YES ──► RULE

Is this summarizing how the code is currently implemented without embedding code syntax?
└── YES ──► GIST

Is this an ephemeral plan for implementing a scoped unit of work?
└── YES ──► TASK
```

| Primitive | Lifecycle | Purpose | Scope |
| :--- | :--- | :--- | :--- |
| **`MOTIVE`** | Permanent | High-level purpose and directional trajectory of a directory. | Ancestral (inherited downwards) |
| **`ADR`** | Immutable | Point-in-time Architectural Decision Records with context and trade-offs. | Local directory |
| **`RULE`** | Long-lived | Falsifiable, machine-verifiable invariants that code or linters must satisfy. | Ancestral (governs directory subtree) |
| **`GIST`** | Dynamic | Implementation summaries for fast agent wayfinding without full AST parsing. | Local component/file |
| **`TASK`** | Ephemeral | Scoped execution plans with acceptance checklists; deleted upon completion. | Deepest common ancestor |

---

## Current Status & Roadmap

Modie is being built under its own laws (dogfooded). Current capabilities:

- [x] **Task Domain Services**: Ephemeral task creation, least-scope directory resolution, and acceptance criteria management.
- [x] **Watermark Resolver**: Branch-aware, monotonic task ID allocation backed by active disk scanning and Git history inspection.
- [x] **CLI Interface**: Core commands for task creation, criterion checking, and task completion.
- [ ] **Context Compiler**: Upward traversal engine to compile minimal-token context prompts for LLM agents.
- [ ] **MCP Server**: Native Model Context Protocol (MCP) interface for AI coding agents.
- [ ] **Architecture Linter**: Automated verification of rule compliance, ancestral references, and link integrity.

---

## Installation & CLI Usage

### Installation

```bash
# Global CLI
npm install -g modie

# Or as a project devDependency
pnpm add -D modie
# or
bun add -d modie
```

### Basic Commands

```bash
# Create a new ephemeral task with automatic monotonic ID allocation
modie task create "Implement user authentication" \
  -a "Add JWT token verification" \
  -a "Write unit tests for token expiration"

# Check off an acceptance criterion
modie task check TASK-1 --item 1

# Complete a verified task (deletes artifact and completes lifecycle per RULE-21)
modie task complete TASK-1

# View help and version
modie --help
modie version
```

---

## License

[MIT](LICENSE) © 2026 Josh Smith

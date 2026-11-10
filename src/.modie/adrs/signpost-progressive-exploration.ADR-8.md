---
summary: Compile lean initial context from upward ancestral motives and rules alongside immediate child directory motives for progressive on-demand territory exploration.
links:
  - ADR-4
  - RULE-2
  - RULE-9
---

# Context

In multi-package repositories and monorepos, code in one package inevitably depends on sibling packages or interfaces (e.g. `src/interfaces/mcp` depending on `src/core`).

Attempting to eagerly resolve and import cross-package dependencies into the agent's initial prompt creates severe architectural hazards:

1. **Tight Build-Tool Coupling:** Requires Modie to parse package manifests (`package.json`, `Cargo.toml`, `go.mod`, etc.), opening a maintenance nightmare across diverse ecosystems.
2. **Context Flooding:** Dumps thousands of tokens of external package documentation into the agent's initial context window before the agent even determines whether it needs them.
3. **Stale Configuration Risks:** Discrepancies between manifests and real code cause invalid context injections.

The initial context compiler should not try to solve global codebase understanding in a single monolithic injection.

# Alternatives Considered

- **Eager Manifest-Driven Ingestion:** Parsing package manager files and appending all upstream package trees to the initial prompt. Causes token bloat and ecosystem fragility.
- **Full Repository Dumps:** Shoveling all project files or shallow tree listings into the context window. Burns tokens and creates "needle-in-a-haystack" attention decay.
- **Fuzzy Vector / RAG Embeddings:** Using vector similarity to guess related files. Non-deterministic and misses structural hierarchy.

# Decision

We adopt the **Signpost Model with Progressive On-Demand Disclosure**:

1. **Lean Initial Context:**
   - The initial context compiler gathers only the target path's upward ancestry (`MOTIVE.md` and active `RULE`s).
   - Along with the ancestral vector, Modie appends immediate **Child Directory Motives** (`<child>/.modie/MOTIVE.md`).

2. **Interactive On-Demand Drill-Down:**
   - When an AI agent or engineer determines that an external package or subsystem is needed, it calls the on-demand `directory_context` MCP tool or CLI `modie context`:
     `directory_context({ path: "src/core", mode: "summary" })`
   - Modie returns a compact architectural overview of the requested directory containing its `MOTIVE.md`, active governing rules, and immediate child directory motives.
   - Raw source code is never dumped during directory exploration.

3. **Active Agent Navigation:**
   - The agent navigates child motives to locate the exact module it needs, reading only the specific files required for the task.
   - This keeps initial prompts ultra-lean, eliminates language-specific package manager dependencies, and treats AI agents as active, reasoning engineers.

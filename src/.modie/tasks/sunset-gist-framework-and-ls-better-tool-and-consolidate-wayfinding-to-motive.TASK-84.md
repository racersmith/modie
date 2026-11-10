---
summary: Sunset the vestigial GIST artifact subtype and ls_better tool, archive dead governance, implement on-demand directory_context MCP tool, and consolidate spatial wayfinding onto directory MOTIVE signposts.
depends_on: []

links:
  - ADR-4
  - ADR-8
  - ADR-10
  - RULE-8
  - RULE-9
  - RULE-12
  - RULE-14
---

# Context

## Problem & Rationale
1. **GIST Subtype & Freshness Machinery**: File-level GIST proxies (`<file>.GIST.md`) and Merkle ledgers (`.gists`) introduce high maintenance friction and stale documentation risks without adoption. Modern AI agents explore code faster and with higher fidelity using native grep, symbol lookups, and direct file inspection.
2. **`ls_better` Obsolescence**: The `ls_better` MCP tool existed solely to render GIST summaries in directory listings. Without GISTs, it duplicates native directory listing tools (`ls`, `find`) without adding architectural value.
3. **Missing On-Demand Spatial Guidance**: Modie's MCP server currently only exposes `task_context` (which requires an active `TASK-XX`). When an agent is exploring or planning work in a directory before a task is created, it lacks a targeted MCP tool to inspect the architectural motives, governing rules, and child module signposts for that directory.

## Architectural Direction
1. **Durable Governance Lifecycle (Lean Governance)**:
   - Apply the ADR Litmus Test: do not mint a tombstone ADR for deletions.
   - Archive sole-purpose dead artifacts: `ADR-11` (`gist-content-addressed-freshness-hashing`) and `RULE-20` (`gist-attachment-targets`).
   - Refine living ADRs in-place: update `ADR-4` (4 core primitives) and `ADR-8` (signpost progressive exploration using child `MOTIVE.md` files).
   - Prune dead GIST clauses in-place from active rules (`RULE-8`, `RULE-9`, `RULE-12`, `RULE-14`).
2. **Codebase Pruning**:
   - Delete `src/core/domain/gist/` and `src/core/engine/gist/`.
   - Remove GIST container and filename resolution helpers from `common/directories.ts` and `common/filename.ts`.
   - Remove GIST fixture helpers from `src/core/platform/testing/fixture-workspace.ts`.
3. **MCP Tooling Evolution**:
   - Remove `ls_better` from `src/interfaces/mcp/`.
   - Implement `directory_context` MCP tool (accepting `path` and `mode`: `"summary"` | `"detailed"`) powered by `compileContext` with child directory `MOTIVE.md` signposts and token-conscious rendering.
4. **Documentation & Alignment**:
   - Update `README.md`, `instructions.md`, and agent rules to reflect the 4 core primitives (`MOTIVE`, `RULE`, `ADR`, `TASK`) and the updated MCP tool suite.

# Acceptance Criteria

- [x] Archive sole-purpose GIST governance (ADR-11, RULE-20) with retirement rationale
- [x] Remove GIST domain and engine modules (src/core/domain/gist/, src/core/engine/gist/) and prune GIST exports from core facades
- [x] Retire ls_better and implement on-demand directory_context MCP tool with summary and detailed modes
- [x] Update living governance in-place (ADR-4, ADR-8, RULE-8, RULE-9, RULE-12, RULE-14) and prune test fixtures
- [x] Update documentation (README.md, instructions.md, AGENTS.md) removing GIST and ls_better references
- [x] passes `verify` tests.
- [x] User Review

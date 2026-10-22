---
links:
  - ADR-3
  - ADR-4
  - RULE-8
  - RULE-20
supersedes:
  - ADR-3
---

# Context

Subtype-partitioned dot directories (.rules/, .tasks/, .adrs/, .gists/) proliferate across source directories, cluttering IDE file trees and tooling configurations. Furthermore, scaling semantic file-level GIST proxies across all source files would double the file count of every code directory if colocated. Because Modie artifacts are compiled by the Modie engine into synthesized context for agents rather than traversed raw, all governance metadata belongs in a single encapsulated container.

# Alternatives Considered

1. **Subtype-Partitioned Dot Directories (ADR-3):** Multiple dot directories (.rules/, .tasks/, .adrs/) per code folder; creates excessive folder clutter.
2. **Flat Colocation in Source Directories:** Placing rules, tasks, and GISTs directly alongside source code; doubles directory file counts when file-level GISTs are used.
3. **Monolithic Repository Root Vault:** Storing all repository artifacts in a single root directory; breaks hierarchical locality, package autonomy, and least-scope placement (RULE-12).

# Decision

We adopt the unified .modie/ containment architecture, superseding ADR-3:

1. All governance, intent, and indexing artifacts for any directory `<dir>` are encapsulated within a single `<dir>/.modie/` container.
2. Internal structure within `<dir>/.modie/`: `MOTIVE.md` (scope intent and domain purpose), `gists/` (semantic proxy files for directory summaries and individual source files), `rules/` (invariant rule files scoped to `<dir>`), `adrs/` (architectural decision records scoped to `<dir>`), and `tasks/` (ephemeral execution tasks scoped to `<dir>`).
3. Scope normalization (RULE-8) resolves any artifact within `<dir>/.modie/*` to the enclosing `<dir>` architectural scope.

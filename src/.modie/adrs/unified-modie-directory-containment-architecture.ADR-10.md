---
summary: Encapsulate all governance and intent artifacts for a directory within a single unified .modie container directory.
links:
  - ADR-4
  - RULE-8
supersedes:
  - ADR-3
---

# Context

Subtype-partitioned dot directories (.rules/, .tasks/, .adrs/) proliferate across source directories, cluttering IDE file trees and tooling configurations. Because Modie artifacts are compiled by the Modie engine into synthesized context for agents rather than traversed raw, all governance metadata belongs in a single encapsulated container.

# Alternatives Considered

1. **Subtype-Partitioned Dot Directories (ADR-3):** Multiple dot directories (.rules/, .tasks/, .adrs/) per code folder; creates excessive folder clutter.
2. **Flat Colocation in Source Directories:** Placing rules and tasks directly alongside source code; clutters code directories.
3. **Monolithic Repository Root Vault:** Storing all repository artifacts in a single root directory; breaks hierarchical locality, package autonomy, and least-scope placement (RULE-12).

# Decision

We adopt the unified .modie/ containment architecture, superseding ADR-3:

1. All governance and intent artifacts for any directory `<dir>` are encapsulated within a single `<dir>/.modie/` container.
2. Internal structure within `<dir>/.modie/`: `MOTIVE.md` (scope intent and domain purpose), `rules/` (invariant rule files scoped to `<dir>`), `adrs/` (architectural decision records scoped to `<dir>`), and `tasks/` (ephemeral execution tasks scoped to `<dir>`).
3. Scope normalization (RULE-8) resolves any artifact within `<dir>/.modie/*` to the enclosing `<dir>` architectural scope.

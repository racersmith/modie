---
summary: Allow governance artifacts to reside either flat in a directory or inside subtype-specific dot-prefixed folders.
links:
  - RULE-8
superseded_by:
  - ADR-10
---

# Context

Enforcing strict dedicated folders (`.rules/`, `.tasks/`) creates unnecessary directory sprawl for small leaf packages that only possess one rule or a single task. Conversely, forcing flat colocation clutters larger domain directories.

# Alternatives Considered

- **Strict Mandatory Folders (`.rules/`, `.tasks/` only):** Clean in large modules, but high friction and excessive empty-folder scaffolding in small leaf directories.
- **Strict Flat Colocation (No sub-directories allowed):** Simple, but degrades readability in core domain roots with dozens of tasks and rules.

# Decision

We adopt a permissive containment model:

1. `RULE`, `TASK`, and `ADR` files CAN live directly in `<dir>/` OR within dedicated dot-prefixed subdirectories (`<dir>/.rules/`, `<dir>/.tasks/`, `<dir>/.adrs/`).
2. The core discovery engine treats `<dir>/[slug].RULE-0001.md` and `<dir>/.rules/[slug].RULE-0001.md` as semantically identical.
3. `MOTIVE.md` and `GIST.md` remain strictly at `<dir>/` to preserve instant wayfinding visibility.

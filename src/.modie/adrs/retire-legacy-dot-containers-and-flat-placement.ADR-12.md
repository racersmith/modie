---
links:
  - RULE-8
  - ADR-10
---

# Context

Following the adoption of ADR-10, transitional backwards-compatibility shims remained in the codebase for legacy ADR-3 dot-containers (.rules/, .tasks/, .adrs/) and flat artifact colocation. This dual-path logic increased complexity across directory resolution, CLI flags (--flat), and test fixtures.

# Alternatives Considered

Retain backwards-compatibility shims indefinitely: prolongs dual-path complexity, introduces ambiguity into scope normalization, and permits divergent container layouts.

# Decision

Formally retire legacy dot-containers and flat placement. All multi-instance artifacts must reside exclusively in normalized <dir>/.modie/<subtypes>/ directories. Purge the --flat flag and useSubtypeContainer parameters across core pipelines, CLI commands, and test suites.

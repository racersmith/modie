---
summary: Layered Core Architecture Decomposition
links: []
---

# Context

Modie's src/core directory currently hosts 17 flat sibling modules, conflating pure domain artifact models (ADR, Rule, Task), graph traversal and lifecycle compilation engines, and platform infrastructure (VCS, Markdown parser, test harnesses). This flat structure creates high cognitive load and obscures architectural boundaries.

# Alternatives Considered

- None recorded.

# Decision

Decompose src/core into three strictly layered namespaces: domain/ (pure artifact schemas, graph primitives, and subtype definitions), engine/ (traversal, context compilation, lifecycle management, and pipelines), and platform/ (VCS adapters, storage, and markdown serialization), while preserving src/core/index.ts as the stable public API facade.

# Consequences

Establishes clear architectural boundaries, isolates pure domain logic from host I/O, prevents test harness leakage into production bundles, and enforces unidirectional dependency flow without altering the interface consumption contract.

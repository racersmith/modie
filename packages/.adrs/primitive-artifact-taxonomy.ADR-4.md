---
links:
  - ADR-2
  - RULE-1
  - RULE-10
  - RULE-11
---

# Context

Architectural governance and agentic context compilation require distinct categories of documentation to represent differing lifecycles, authorities, and operational roles. Combining all architectural knowledge into unstructured wikis or monolithic design documents causes context window bloat, documentation rot, and un-verifiable system assertions.

# Alternatives Considered

- **Monolithic Architecture Specifications:** High token cost to compile, prone to obsolescence, and cannot be colocated alongside specific code targets.
- **Uniform Single-Type Markdown Notes:** Lacks schema differentiation, making automated invariant checking and graph-based resolution impossible.
- **External Wiki Systems:** Disconnected from the codebase and filesystem tree, breaking branch-relative versioning and offline local verification.

# Decision

We adopt a taxonomy of five distinct core primitive artifact types:

1. **`MOTIVATION`**: Composable, slowest to change, expressing directory-level purpose and trajectory without referencing other documents.
2. **`RULE`**: Atomic, falsifiable, implementation-agnostic invariants with ancestry-based influence.
3. **`ADR`**: Immutable, point-in-time decision records capturing trade-offs, rationale, and supersession links.
4. **`GIST`**: Ultra-concise implementation summaries for rapid wayfinding without full AST or file parsing.
5. **`TASK`**: Ephemeral execution plans strictly constrained by directory blast radius and ancestral reference scopes.

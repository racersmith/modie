---
summary: Implement the 5-tier artifact authoring litmus test matrix, automated tombstone ADR detection guardrail, and authoring tool guidance across domain, CLI, and MCP layers.

depends_on: []

links: []
---

# Context

Implement the artifact authoring litmus tests and tombstone ADR prevention guardrail agreed upon in .modie/ideas/artifact-authoring-litmus-tests.IDEA.md.

# Acceptance Criteria

- [x] Pure domain title validator in ADR primitives detecting tombstone keywords with override bypass
- [x] Declarative CLI command guardrail rejecting tombstone ADR titles and supporting --force override
- [x] MCP ADR creation tool enforcing tombstone guardrail with force parameter and exposing litmus guidance
- [x] MCP tool definitions enriched with subtype litmus tests across all creation endpoints
- [x] Repository agent guidelines updated with the 5-subtype Litmus Test Matrix
- [x] Full test suite and static analysis passing with zero regressions
- [x] User Review

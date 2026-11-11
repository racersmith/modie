---
summary: Implement the two-tier idea incubation framework including the heading-delimited spark ledger, lazy minting of random hex handles, spark CLI management commands, and agent spark_add MCP tool.

depends_on: []

links: []
---

# Context

Originating from `.modie/ideas/informal-idea-artifact.IDEA.md`. Implements Stage 1 (SPARKS.md heading-delimited ledger, lazy minting of unique random hex handles) and Stage 2 (promotion to un-indexed pure-Markdown [slug].IDEA.md), alongside rejection archiving and CLI/MCP ergonomics.

# Acceptance Criteria

- [x] Existing repository sparks are migrated to the heading-delimited ledger structure
- [x] Spark ledger parser accurately reads and writes heading-delimited entries with custom and minted handles
- [x] Lazy minting generates verified unique 4-character random hex handles in-place for untagged sparks
- [x] CLI commands for adding, listing, promoting, and rejecting sparks function with machine-parseable stdout and user stderr per stream separation
- [x] MCP tool exposes spark capture safety valve for autonomous agents
- [x] Full verification suite passes with zero type, lint, circular, or test regressions
- [x] User Review

---
depends_on:
  - TASK-51
  - TASK-55
  - TASK-56

links:
  - RULE-2
  - RULE-6
  - RULE-9
  - RULE-12
  - RULE-20
  - RULE-25
  - RULE-26
  - ADR-4
  - ADR-8
  - ADR-10
---

# Context

Implement a unified `context` command and core compilation service that synthesizes the complete Cone of Governance & Orientation for a target directory or task identifier. Operating as the primary entry point for agentic wayfinding and task execution, the context compiler traverses the upward directory ancestry vector to assemble the monotonically widening chain of `MOTIVE.md` files (RULE-2, RULE-9) and active `RULE` invariants (RULE-9, RULE-12), extracts relevant governing `ADR` decisions, encapsulates task acceptance criteria and blast radius constraints when scoped to a task (RULE-6, RULE-22), resolves all local directory and file-level implementation GIST proxies at the target scope (RULE-9, RULE-20), and discovers immediate child directory `GIST.md` signposts via shallow downward BFS exploration (ADR-8). The synthesized payload is delivered through both a CLI `modie context` command and a token-efficient MCP `context` tool (RULE-25, RULE-26).

# Acceptance Criteria

- [ ] Implement core context compilation service synthesizing upward ancestral motives (RULE-2), active governing rules (RULE-9), and linked ADR summaries for any target path or task identifier
- [ ] Incorporate task-scoped metadata when given a task tag, including context, acceptance criteria, dependency status, and directory blast radius boundaries (RULE-6)
- [ ] Collect all local directory and file-level GISTs at target scope <dir>/.modie/gists/ (RULE-9, RULE-20) and attach shallow downward signposts (<child>/.modie/gists/GIST.md) for immediate child subdirectories (ADR-8)
- [ ] Expose declarative modie context CLI command with stdout/stderr separation (RULE-27) and --raw/--json rendering options
- [ ] Register primary context MCP tool delivering token-efficient structured payloads optimized for agent prompt injection (RULE-25, RULE-26)
- [ ] Verify context compilation across root, intermediate, and leaf scopes with comprehensive test coverage

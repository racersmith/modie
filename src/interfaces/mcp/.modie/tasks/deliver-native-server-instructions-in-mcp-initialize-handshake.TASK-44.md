---
depends_on:
  - TASK-47

links:
  - RULE-6
  - RULE-21
  - RULE-25
  - RULE-26
  - RULE-30
---

# Context

Per the maintainability review (§3.7) and the Agent-First MCP Design (`scratch/mcp-design.md` §3), agent guidance text currently drifts across three separate locations:
1. `agentGuidance` in `src/interfaces/cli/commands/task/create.ts`
2. Fallback instructions in `src/interfaces/mcp/server.ts`
3. Static documentation in `.agents/plugins/modie/instructions.md`

This duplication causes instructions to diverge as governance rules evolve.

To unify agent guidance:
- Consolidate agent guidance into a single authoritative markdown source.
- Deliver agent governance instructions directly during the MCP protocol `initialize` handshake response via `McpServerOptions.instructions`.
- By injecting instructions into the protocol handshake, connecting AI agents immediately receive essential architectural conventions in their initial system prompt without requiring explicit resource reads or wasting preamble tokens.
- Instructions must emphasize:
  - Ephemeral task branching and lifecycle discipline (`RULE-21`, `RULE-28`).
  - Strict blast radius confinement (`RULE-6`).
  - Concrete, verifiable acceptance criteria (`RULE-30`).
  - Consolidated 5-tool MCP workflows over deprecated command looping.
- Maintain `modie://instructions` as a read-only resource for standalone client resource browsing.

# Acceptance Criteria

- [x] Consolidate agent guidance text into a single authoritative markdown source, eliminating duplication across MCP, CLI help, and plugin instructions.
- [x] Load instructions dynamically during server initialization and populate `McpServerOptions.instructions` in the `initialize` handshake response.
- [x] Emphasize ephemeral task decoupling (`RULE-21`), blast radius confinement (`RULE-6`), contract-based criteria (`RULE-30`), and consolidated 5-tool workflows.
- [x] Maintain `modie://instructions` read-only resource for standalone resource browsing.
- [x] Verify client receives populated instructions in initialize response without requiring explicit resource reads.
- [x] User Review

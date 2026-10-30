---
depends_on: []

links:
  - RULE-25
  - RULE-26
  - RULE-28
---

# Context

Enforce stateless MCP server operation by requiring or strongly prioritizing explicit task identifiers in tool schemas and agent guidance, preventing race conditions and concurrency hazards caused by implicit local Git branch resolution.

# Acceptance Criteria

- [ ] Update tool schemas and descriptions for task mutation tools to require or strongly mandate explicit task identifier arguments
- [ ] Update agent guidance across task tools to explicitly direct agents to pass task IDs rather than relying on active branch state
- [ ] Return a clear isError: true recovery message when task ID is omitted and active branch is not a task branch, directing the agent to supply an explicit identifier
- [ ] Verify server ignores incoming session headers and operates statelessly across interleaved tool invocations in test suite
- [ ] User Review

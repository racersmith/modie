---
depends_on: []

links:
  - RULE-25
  - RULE-26
---

# Context

Format tool validation and execution error messages to return isError: true with actionable guidance—naming the invalid parameter, describing valid formats or ranges, and suggesting discovery tools—to prevent model retry loops per spec [2026-07-28 best practices](https://modelcontextprotocol.info/docs/best-practices/).

# Acceptance Criteria

- [ ] Standardize MCP tool execution error handler to construct structured, model-actionable error messages
- [ ] Include parameter name, invalid value, and expected format or allowed enumeration values for input validation failures
- [ ] Include suggested lookup tools such as task_list, rule_list, or find when requested artifact identifiers or tags are not found
- [ ] Verify model-recoverable error messages are returned with isError: true across invalid arguments and missing artifact scenarios in test suite

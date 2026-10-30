---
depends_on: []

links:
  - RULE-25
  - RULE-27
---

# Context

While the MCP server dynamically projects tools by iterating over allCliCommands, the CLI router in src/interfaces/cli/cli.ts maintains a duplicated direct command map, namespace table, and a hardcoded help string. Every command addition, rename, or purge requires manual synchronization across three distinct locations. Unify the CLI router and global help banner to be generated dynamically from the declarative allCliCommands registry.

# Acceptance Criteria

- [x] Derive root CLI dispatch table and namespace subcommand routing dynamically from allCliCommands registry
- [x] Generate printGlobalHelp usage text dynamically using command metadata (name, description, aliases)
- [x] Eliminate manual command routing dictionaries in src/interfaces/cli/cli.ts
- [x] Verify help emission, root command dispatch, namespace subcommand dispatch, and unknown command handling across CLI test suites
- [x] User Review

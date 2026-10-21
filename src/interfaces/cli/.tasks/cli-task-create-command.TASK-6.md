---
depends_on:
  - TASK-5

links:
  - ADR-1
  - ADR-6
  - RULE-25
  - RULE-27
---

# Context

We need a CLI command to expose task creation to human developers and AI agents from the terminal.

The command will consume the public `@core` task creation service (RULE-25), handle CLI argument parsing and flags, format output according to standard CLI conventions, and ensure strict stdout/stderr separation (RULE-27).

# Acceptance Criteria

- [ ] Implement CLI command (`canon task create <title>`) with flags for target scope directory, links, and output formats.
- [ ] Integrate with `@core` public API (`createTask`) without importing private core modules.
- [ ] Ensure machine-parsable payloads (file path or JSON) are sent to stdout and human status/diagnostics to stderr (RULE-27).
- [ ] Configure CLI executable entrypoint and register `bin` field in `package.json`.
- [ ] Add CLI integration tests verifying command execution, error exit codes, and stdout/stderr separation.

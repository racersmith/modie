---
links:
  - ADR-12
---

Plugin MCP server definitions must execute through environment-resolved binaries and inherit the active workspace working directory rather than hardcoding static paths or CWD overrides.

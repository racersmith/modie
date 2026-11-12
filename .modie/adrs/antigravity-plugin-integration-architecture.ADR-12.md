---
summary: Antigravity Plugin Integration Architecture
links: []
---

# Context

Modie previously maintained an ad-hoc Antigravity plugin bundle in .agents/_plugins/modie, copied manually to ~/.gemini/config/plugins/modie. The bundle hardcoded local user paths and MODIE_CWD, preventing multi-workspace usage and creating synchronization drift. Developing directly against live TypeScript sources also risked crashing agent sessions on mid-turn syntax errors. Antigravity provides lifecycle management UI only for global plugins, requiring a distinct development workflow.

# Alternatives Considered

## Project specific `.agents/plugins` directory for local dogfooding.  
This was difficult to manage with the current setup in Antigravity IDE. Project level plugins do not appear in the settings and can not be easily toggled to reset the mcp at will. This created friction between new mcp features, instructions and rules not being deterministically available during development.

## Project level mcp
This made the instructions and rules intertwined from the deliverable modie project and the dogfooding modie project itself. Consumers of modie didn't have a good way to include and update instructions and rules for agents.

# Decision

Package the Antigravity plugin as a dedicated repository integration with compiled MCP bundle execution, workspace-independent environment resolution, and a symlinked developer workflow for on-demand lifecycle restarts.

# Consequences

Centralizes Antigravity plugin source under integrations/antigravity/ with standardized manifest and rules. Allows Antigravity to manage child process lifecycle via global symlink and Settings UI while executing against stable compiled dist/ outputs. Enables multi-repo usage by defaulting MCP CWD to the active Antigravity workspace.

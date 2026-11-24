# Modie Antigravity Plugin Integration

First-class Antigravity plugin bundle providing ambient architectural governance and task lifecycle tools to Google Antigravity agents.

## Architecture

- Executes the compiled standalone MCP bundle (`dist/bin/mcp.js`) using environment-resolved `node`.
- Contains no hardcoded static host paths or forced `MODIE_CWD` working directory overrides.
- Ships a zero-dependency `PreToolUse` hook (`hooks.json` -> `hooks/resolve-workspace.mjs`) that injects the active conversation's workspace into Modie MCP tool calls and dynamic `modie://` resource reads per call, enabling deterministic multi-repository and multi-window usage without shared mutable state or altering permission handling for non-Modie MCP servers.

## Development & Dogfooding Workflow

To register this plugin globally for live development in Antigravity:

```bash
# Symlink this integration bundle into the global Antigravity plugins directory
ln -sfn "$(pwd)/integrations/antigravity" "$HOME/.gemini/config/plugins/modie"
```

After modifying sources, recompile distribution outputs:
```bash
bun run build
```

Then reset or restart the Modie MCP server from the Antigravity Customizations panel or session controls.

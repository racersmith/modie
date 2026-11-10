# Modie Antigravity Plugin Integration

First-class Antigravity plugin bundle providing ambient architectural governance and task lifecycle tools to Google Antigravity agents.

## Architecture

This plugin complies with **RULE-37** and **ADR-12**:
- Executes the compiled standalone MCP bundle (`dist/bin/mcp.js`) using environment-resolved `node`.
- Contains no hardcoded static host paths or forced `MODIE_CWD` working directory overrides.
- Inherits the active Antigravity workspace dynamically for seamless multi-repository usage.

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


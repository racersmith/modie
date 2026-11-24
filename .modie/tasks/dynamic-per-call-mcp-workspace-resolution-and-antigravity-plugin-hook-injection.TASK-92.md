---
summary: Support per-call workspace resolution on Modie MCP tools and dynamic ambient resources, and ship an Antigravity plugin PreToolUse hook that injects the active workspace safely across concurrent IDE windows.
depends_on: []

links:
  - ADR-12
  - RULE-37
---

# Context

When Modie is installed as a global Antigravity plugin, Antigravity spawns the plugin MCP server with its process working directory set to the plugin directory rather than the active repository, injects no workspace environment variable, and does not populate MCP `roots/list`. Consequently, all MCP tools and ambient resources resolve to the plugin directory (finding zero tasks, rules, or motives) across every open IDE window.

## Empirical Antigravity Hook Findings

Live smoke testing against Antigravity's `PreToolUse` hook runtime established the exact contract required for safe multi-window workspace injection:

1. **Per-window workspace isolation:** `PreToolUse` hooks receive the calling conversation's true `cwd` and `workspacePaths` on `stdin` independently per IDE window (with no shared mutable state required across windows; do not store active workspace state in `$PLUGIN_DATA`, which is shared across all windows).
2. **Intercepted MCP payloads:**
   - Tool calls arrive as `toolCall.name === "call_mcp_tool"` with `args = { ServerName, ToolName, Arguments }`.
   - Resource reads arrive as `toolCall.name === "read_resource"` with `args = { ServerName, Uri }`.
   - `overwrite` performs a shallow top-level merge on `args` (`Arguments` for `call_mcp_tool`, `Uri` for `read_resource`) and rewrites the call before execution.
3. **Permission decision semantics (critical):**
   - **Empty stdout (`""`, exit 0)** is a true pass-through that defers completely to Antigravity's default permission policy (no denial, no auto-approval, no overwrite).
   - **Empty JSON `{}`**, **`{"overwrite": ...}` without `decision`**, or **`decision: ""`** all **fail closed and deny** the tool call (`tool call denied by pre-tool hook:`).
   - Only `"allow"`, `"ask"`, `"force_ask"`, and `"deny"` are valid `decision` values (other values fail with `unsupported hook decision`).
   - Therefore:
     - For **non-Modie MCP servers** and **Modie calls that do not require rewriting** (e.g., `workspace` already set, `modie://instructions`, or no workspace path available on `stdin`), the hook **must exit 0 with empty stdout (`""`)** so unrelated MCP servers and already-scoped calls never get denied or auto-approved.
     - For **Modie calls requiring `overwrite`**, an explicit `decision` is mandatory: use `"allow"` for read-only/non-destructive Modie calls (and `read_resource`), and `"ask"` (which respects Antigravity's "Always Allow" permission cache) for destructive Modie tools (`complete_task`, `archive_artifact`) so the hook does not silently bypass user confirmation on destructive operations.
4. **Strict plugin validation:** `agy plugin validate --strict` verifies that relative hook script paths declared in `hooks.json` exist inside the plugin directory.

## Design

1. **Per-call MCP tool workspace resolution:** Extend all Modie MCP tool schemas to accept an optional `workspace` parameter and resolve a per-call `WorkspaceContext` when provided, preserving the existing fallback chain (`roots/list` -> `MODIE_CWD` -> `process.cwd()`) without mutating server-wide workspace state.
2. **Parameterized ambient MCP resources & diagnostics:** Register MCP `ResourceTemplate` handlers supporting `?workspace=<encodedPath>` for dynamic ambient resources (`modie://task`, `modie://tasks/ready`, `modie://tasks/all`) alongside the existing static resource registrations so default discovery remains unchanged. Ensure ambient resource handlers invoke `ensureWorkspace()` before reading, and log `roots/list` failures to `stderr` instead of swallowing them silently.
3. **Antigravity plugin `PreToolUse` hook:** Ship a root `hooks.json` and bundled zero-dependency hook script inside the Antigravity plugin bundle (invoked via environment-resolved binary and relative path per RULE-37) matching `call_mcp_tool|read_resource` that:
   - Identifies Modie targets resiliently across both local symlinks (`modie_modie`) and alternate/Marketplace plugin install directory names (`<dir>_modie`): match `read_resource` by `Uri.startsWith("modie://")`, and match `call_mcp_tool` by `ServerName === "modie_modie" || ServerName.endsWith("_modie")` combined with Modie's known tool names (rather than hardcoding only `"modie_modie"`).
   - Exits `0` with empty stdout (`""`) for any non-Modie server, missing workspace context, already-parameterized call, or static resource (`modie://instructions`).
   - Injects `workspace` into `Arguments` (for `call_mcp_tool`) or `?workspace=<encoded>` into `Uri` (for dynamic `read_resource` calls) via `overwrite`, emitting `"decision": "ask"` for destructive Modie tools (`complete_task`, `archive_artifact`) and `"decision": "allow"` for non-destructive Modie tools and resource reads.
4. **Validation, tests, and documentation:** Extend plugin validation to check the hook manifest and script against RULE-37 and `agy plugin validate --strict`, add isolated fixture-workspace tests covering MCP tools/resources and hook pass-through/rewriting/permission decisions, and concisely update plugin and agent documentation.

# Acceptance Criteria

- [x] All Modie MCP tools accept an optional workspace parameter and resolve a per-call workspace context targeting that repository without mutating server-wide state for concurrent or subsequent calls from other workspaces
- [x] Dynamic ambient MCP resources support workspace-scoped resolution via URI query parameter templates alongside static resource discovery, invoke dynamic root resolution before reading, and preserve static instructions resource behavior
- [x] MCP workspace root resolution logs roots/list failures to stderr diagnostics rather than silently swallowing errors
- [x] The Antigravity plugin ships a PreToolUse hook using environment-resolved commands and relative paths that resiliently identifies Modie tool calls and `modie://` resource reads across plugin install names and automatically injects the active conversation workspace when not already specified
- [x] The plugin hook preserves multi-window isolation with no shared mutable state, exits 0 with empty stdout for non-Modie MCP servers and pass-through Modie calls (avoiding both fail-closed denials and unintended auto-approvals), and emits decision "ask" rather than "allow" when rewriting destructive Modie tools
- [x] Plugin validation verifies the plugin hook manifest and script exist, comply with environment-independence invariants, and pass Antigravity strict plugin validation
- [x] Isolated fixture-workspace unit and integration tests cover per-call workspace overrides, parameterized resource reads, fallback behavior, and hook pass-through, argument rewriting, and permission-decision routing, with all repository verification checks passing
- [x] Plugin and agent documentation is updated concisely to reflect dynamic hook-based workspace resolution
- [x] User Review

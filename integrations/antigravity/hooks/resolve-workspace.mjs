/**
 * Antigravity PreToolUse hook for dynamic per-call Modie MCP workspace injection.
 *
 * Emits empty stdout (exit 0) for non-Modie MCP servers and pass-through Modie calls
 * so Antigravity defers completely to its default permission policy without failing closed
 * or auto-approving unrelated servers.
 *
 * Complies with RULE-37 (no hardcoded host paths or shared mutable state across windows).
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MODIE_TOOLS = new Set([
  "directory_context",
  "read_artifact",
  "task_context",
  "start_task",
  "check_criteria",
  "complete_task",
  "create_rule",
  "create_adr",
  "create_task",
  "create_motive",
  "link_artifacts",
  "archive_artifact",
  "spark_add",
]);

const DESTRUCTIVE_MODIE_TOOLS = new Set(["complete_task", "archive_artifact"]);

const DYNAMIC_RESOURCE_URIS = new Set([
  "modie://task",
  "modie://tasks/ready",
  "modie://tasks/all",
]);

function isModieServerName(serverName) {
  return (
    typeof serverName === "string" &&
    (serverName === "modie" ||
      serverName === "modie_modie" ||
      serverName.endsWith("_modie"))
  );
}

function extractActiveWorkspace(payload) {
  const fromCwd = typeof payload?.cwd === "string" ? payload.cwd.trim() : "";
  if (fromCwd) {
    return fromCwd;
  }
  if (Array.isArray(payload?.workspacePaths)) {
    for (const candidate of payload.workspacePaths) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }
  return null;
}

/**
 * Computes the PreToolUse hook JSON response object, or null when the hook
 * should pass through silently (empty stdout, exit 0).
 */
export function computeWorkspaceHookResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (payload.hookEventName && payload.hookEventName !== "PreToolUse") {
    return null;
  }

  const workspace = extractActiveWorkspace(payload);
  if (!workspace) {
    return null;
  }

  const toolCall = payload.toolCall;
  const toolName = toolCall?.name;
  const args = toolCall?.args;
  if (!args || typeof args !== "object") {
    return null;
  }

  if (toolName === "call_mcp_tool") {
    if (
      !isModieServerName(args.ServerName) ||
      !MODIE_TOOLS.has(args.ToolName)
    ) {
      return null;
    }

    const existingArgs =
      args.Arguments &&
      typeof args.Arguments === "object" &&
      !Array.isArray(args.Arguments)
        ? args.Arguments
        : {};

    if (
      typeof existingArgs.workspace === "string" &&
      existingArgs.workspace.trim().length > 0
    ) {
      return null;
    }

    const decision = DESTRUCTIVE_MODIE_TOOLS.has(args.ToolName)
      ? "ask"
      : "allow";

    return {
      decision,
      overwrite: {
        Arguments: {
          ...existingArgs,
          workspace,
        },
      },
    };
  }

  if (toolName === "read_resource") {
    const rawUri = args.Uri;
    if (typeof rawUri !== "string" || !rawUri.startsWith("modie://")) {
      return null;
    }

    const baseUri = rawUri.split("?")[0].split("#")[0];
    if (!DYNAMIC_RESOURCE_URIS.has(baseUri)) {
      return null;
    }

    let parsed;
    try {
      parsed = new URL(rawUri);
    } catch {
      return null;
    }

    if (parsed.searchParams.get("workspace")?.trim()) {
      return null;
    }

    parsed.searchParams.set("workspace", workspace);
    return {
      decision: "allow",
      overwrite: {
        Uri: parsed.toString(),
      },
    };
  }

  return null;
}

async function runCli() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  if (!raw.trim()) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const response = computeWorkspaceHookResponse(payload);
  if (response) {
    process.stdout.write(JSON.stringify(response) + "\n");
  }
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  runCli().catch(() => {
    process.exit(0);
  });
}

/**
 * Unit and subprocess tests for the Antigravity PreToolUse workspace resolver hook.
 * @verifies RULE-37
 */

import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatArtifactTag } from "../../core/index.ts";

const HOOK_SCRIPT_PATH = resolve(
  import.meta.dir,
  "../../../integrations/antigravity/hooks/resolve-workspace.mjs",
);

const { computeWorkspaceHookResponse } = (await import(
  pathToFileURL(HOOK_SCRIPT_PATH).href
)) as {
  computeWorkspaceHookResponse: (payload: unknown) => {
    decision: string;
    overwrite: {
      Arguments?: Record<string, unknown>;
      Uri?: string;
    };
  } | null;
};

function runHookSubprocess(stdinPayload: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const proc = Bun.spawnSync(["node", HOOK_SCRIPT_PATH], {
    stdin: new TextEncoder().encode(stdinPayload),
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("[RULE-37] Antigravity PreToolUse Workspace Resolver Hook", () => {
  it("injects workspace from cwd for non-destructive Modie MCP tools with allow decision", () => {
    const result = computeWorkspaceHookResponse({
      hookEventName: "PreToolUse",
      cwd: "/tmp/repo-alpha",
      workspacePaths: ["/tmp/repo-alpha"],
      toolCall: {
        name: "call_mcp_tool",
        args: {
          ServerName: "modie_modie",
          ToolName: "directory_context",
          Arguments: { path: "src", mode: "summary" },
        },
      },
    });

    expect(result).toEqual({
      decision: "allow",
      overwrite: {
        Arguments: {
          path: "src",
          mode: "summary",
          workspace: "/tmp/repo-alpha",
        },
      },
    });
  });

  it("matches alternate plugin install directory server names ending with _modie", () => {
    const sampleTag = formatArtifactTag("RULE", 301);
    const result = computeWorkspaceHookResponse({
      hookEventName: "PreToolUse",
      cwd: "",
      workspacePaths: ["/tmp/repo-marketplace"],
      toolCall: {
        name: "call_mcp_tool",
        args: {
          ServerName: "-1870732469773246571_modie",
          ToolName: "read_artifact",
          Arguments: { tag: sampleTag },
        },
      },
    });

    expect(result).toEqual({
      decision: "allow",
      overwrite: {
        Arguments: {
          tag: sampleTag,
          workspace: "/tmp/repo-marketplace",
        },
      },
    });
  });

  it("emits ask decision rather than allow when rewriting destructive Modie tools", () => {
    for (const toolName of ["complete_task", "archive_artifact"]) {
      const result = computeWorkspaceHookResponse({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-beta",
        toolCall: {
          name: "call_mcp_tool",
          args: {
            ServerName: "modie_modie",
            ToolName: toolName,
            Arguments: {},
          },
        },
      });

      expect(result).toEqual({
        decision: "ask",
        overwrite: {
          Arguments: {
            workspace: "/tmp/repo-beta",
          },
        },
      });
    }
  });

  it("passes through (returns null) for non-Modie MCP servers and unknown tools", () => {
    expect(
      computeWorkspaceHookResponse({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-alpha",
        toolCall: {
          name: "call_mcp_tool",
          args: {
            ServerName: "knip",
            ToolName: "knip-run",
            Arguments: {},
          },
        },
      }),
    ).toBeNull();

    expect(
      computeWorkspaceHookResponse({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-alpha",
        toolCall: {
          name: "call_mcp_tool",
          args: {
            ServerName: "modie_modie",
            ToolName: "unknown_tool",
            Arguments: {},
          },
        },
      }),
    ).toBeNull();
  });

  it("passes through when workspace is already explicitly specified on a Modie tool call", () => {
    const result = computeWorkspaceHookResponse({
      hookEventName: "PreToolUse",
      cwd: "/tmp/repo-alpha",
      toolCall: {
        name: "call_mcp_tool",
        args: {
          ServerName: "modie_modie",
          ToolName: "directory_context",
          Arguments: { path: ".", workspace: "/tmp/explicit-repo" },
        },
      },
    });

    expect(result).toBeNull();
  });

  it("rewrites dynamic modie:// resource URIs regardless of ServerName and skips static instructions", () => {
    for (const uri of [
      "modie://task",
      "modie://tasks/ready",
      "modie://tasks/all",
    ]) {
      const result = computeWorkspaceHookResponse({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo with spaces/app",
        toolCall: {
          name: "read_resource",
          args: {
            ServerName: "custom_plugin_server",
            Uri: uri,
          },
        },
      });

      expect(result?.decision).toBe("allow");
      expect(result?.overwrite.Uri).toBeDefined();
      const rewritten = new URL(result!.overwrite.Uri!);
      expect(rewritten.searchParams.get("workspace")).toBe(
        "/tmp/repo with spaces/app",
      );
    }

    // Static instructions resource should pass through untouched
    expect(
      computeWorkspaceHookResponse({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-alpha",
        toolCall: {
          name: "read_resource",
          args: {
            ServerName: "modie_modie",
            Uri: "modie://instructions",
          },
        },
      }),
    ).toBeNull();

    // Already parameterized resource URI should pass through untouched
    expect(
      computeWorkspaceHookResponse({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-alpha",
        toolCall: {
          name: "read_resource",
          args: {
            ServerName: "modie_modie",
            Uri: "modie://tasks/all?workspace=%2Ftmp%2Fother",
          },
        },
      }),
    ).toBeNull();

    // Non-modie URI should pass through untouched
    expect(
      computeWorkspaceHookResponse({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-alpha",
        toolCall: {
          name: "read_resource",
          args: {
            ServerName: "other_server",
            Uri: "file:///tmp/readme.md",
          },
        },
      }),
    ).toBeNull();
  });

  it("maintains strict multi-window isolation across concurrent workspace payloads", () => {
    const winA = computeWorkspaceHookResponse({
      hookEventName: "PreToolUse",
      cwd: "/tmp/window-a",
      toolCall: {
        name: "call_mcp_tool",
        args: {
          ServerName: "modie_modie",
          ToolName: "directory_context",
          Arguments: { path: "." },
        },
      },
    });
    const winB = computeWorkspaceHookResponse({
      hookEventName: "PreToolUse",
      cwd: "/tmp/window-b",
      toolCall: {
        name: "call_mcp_tool",
        args: {
          ServerName: "modie_modie",
          ToolName: "directory_context",
          Arguments: { path: "." },
        },
      },
    });

    expect(winA?.overwrite.Arguments?.workspace).toBe("/tmp/window-a");
    expect(winB?.overwrite.Arguments?.workspace).toBe("/tmp/window-b");
  });

  it("exits 0 with empty stdout on non-Modie calls and malformed input, and emits valid JSON on Modie calls", () => {
    const nonModie = runHookSubprocess(
      JSON.stringify({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-a",
        toolCall: {
          name: "call_mcp_tool",
          args: { ServerName: "knip", ToolName: "knip-run", Arguments: {} },
        },
      }),
    );
    expect(nonModie.exitCode).toBe(0);
    expect(nonModie.stdout).toBe("");

    const malformed = runHookSubprocess("{not-valid-json");
    expect(malformed.exitCode).toBe(0);
    expect(malformed.stdout).toBe("");

    const modieCall = runHookSubprocess(
      JSON.stringify({
        hookEventName: "PreToolUse",
        cwd: "/tmp/repo-a",
        toolCall: {
          name: "call_mcp_tool",
          args: {
            ServerName: "modie_modie",
            ToolName: "directory_context",
            Arguments: { path: "." },
          },
        },
      }),
    );
    expect(modieCall.exitCode).toBe(0);
    expect(JSON.parse(modieCall.stdout)).toEqual({
      decision: "allow",
      overwrite: {
        Arguments: { path: ".", workspace: "/tmp/repo-a" },
      },
    });
  });
});

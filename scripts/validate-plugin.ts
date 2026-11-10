#!/usr/bin/env bun
/**
 * Antigravity Plugin Integration Validator.
 * Verifies that the plugin bundle structure, manifest, MCP server definition,
 * and governance rules strictly comply with architectural invariants.
 *
 * @verifies RULE-37
 * @verifies ADR-12
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dir, "..");
const pluginDir = join(workspaceRoot, "integrations", "antigravity");

interface ValidationCheck {
  description: string;
  run: () => void;
}

const checks: ValidationCheck[] = [
  {
    description: "Plugin directory exists",
    run: () => {
      if (!existsSync(pluginDir)) {
        throw new Error(`Plugin directory not found: ${pluginDir}`);
      }
    },
  },
  {
    description: "plugin.json manifest exists and is valid",
    run: () => {
      const manifestPath = join(pluginDir, "plugin.json");
      if (!existsSync(manifestPath)) {
        throw new Error("Missing plugin.json");
      }
      const raw = readFileSync(manifestPath, "utf8");
      const json = JSON.parse(raw);
      if (!json.name || typeof json.name !== "string") {
        throw new Error("plugin.json must declare a valid 'name' property");
      }
      if (json.name !== "modie") {
        throw new Error(`Expected plugin.json name to be 'modie', got '${json.name}'`);
      }
    },
  },
  {
    description: "mcp_config.json complies with RULE-37 and ADR-12",
    run: () => {
      const configPath = join(pluginDir, "mcp_config.json");
      if (!existsSync(configPath)) {
        throw new Error("Missing mcp_config.json");
      }
      const raw = readFileSync(configPath, "utf8");
      const json = JSON.parse(raw);
      const server = json.mcpServers?.modie;
      if (!server) {
        throw new Error("mcp_config.json must define mcpServers.modie");
      }

      // 1. Environment-resolved command (RULE-37: no absolute host paths)
      if (typeof server.command !== "string" || server.command.includes("/") || server.command.includes("\\")) {
        throw new Error(
          `server.command must be an environment-resolved binary without path separators: got '${server.command}'`,
        );
      }

      // 2. No forced CWD / MODIE_CWD overrides (RULE-37)
      if (server.env?.MODIE_CWD !== undefined) {
        throw new Error("mcp_config.json must not specify MODIE_CWD environment variable override (RULE-37)");
      }

      // 3. Arguments must point to compiled distribution output (ADR-12)
      if (!Array.isArray(server.args) || server.args.length === 0) {
        throw new Error("mcp_config.json must provide non-empty 'args' array");
      }

      for (const arg of server.args) {
        if (typeof arg === "string" && (arg.startsWith("/home/") || arg.startsWith("/Users/"))) {
          throw new Error(`Found static host path in server args: '${arg}' (ADR-12 violation)`);
        }
        if (typeof arg === "string" && arg.endsWith(".ts")) {
          throw new Error(`Found live TypeScript source in server args: '${arg}' (ADR-12 violation, must use compiled bundle)`);
        }
      }

      const targetScript = resolve(pluginDir, server.args[server.args.length - 1]);
      if (!existsSync(targetScript)) {
        throw new Error(`Compiled MCP bundle not found at target: ${targetScript}. Run 'bun run build' first.`);
      }
    },
  },
  {
    description: "rules/AGENTS.md governance rules exist and are non-empty",
    run: () => {
      const rulesPath = join(pluginDir, "rules", "AGENTS.md");
      if (!existsSync(rulesPath)) {
        throw new Error("Missing rules/AGENTS.md in plugin bundle");
      }
      const content = readFileSync(rulesPath, "utf8").trim();
      if (content.length === 0) {
        throw new Error("rules/AGENTS.md must not be empty");
      }
    },
  },
  {
    description: "README.md exists and documents the symlinked development workflow",
    run: () => {
      const readmePath = join(pluginDir, "README.md");
      if (!existsSync(readmePath)) {
        throw new Error("Missing README.md in plugin bundle");
      }
      const content = readFileSync(readmePath, "utf8");
      if (!content.includes("ln -sfn") && !content.includes("symlink")) {
        throw new Error("README.md must document the symlinked global development workflow");
      }
    },
  },
];

console.log("🔍 Validating Antigravity plugin integration...\n");
let failures = 0;

for (const check of checks) {
  try {
    check.run();
    console.log(`  ✓ ${check.description}`);
  } catch (error: any) {
    console.error(`  ✗ ${check.description}: ${error.message || error}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n❌ Plugin validation failed with ${failures} error(s).\n`);
  process.exit(1);
} else {
  console.log("\n✨ Antigravity plugin integration passed all checks!\n");
  process.exit(0);
}

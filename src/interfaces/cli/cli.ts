/**
 * Modie CLI dispatcher and declarative command registry.
 * Complies with RULE-25 and RULE-27.
 */

import { allCliCommands } from "./commands/index.ts";
import { createCommandHandler } from "./framework/execute.ts";
import type { CliCommandDefinition } from "./framework/types.ts";
import type { CliIoOptions, CommandHandler } from "./types.ts";

export const MODIE_VERSION = "0.1.0";

export interface CommandNamespace {
  name: string;
  commands: Record<string, CommandHandler>;
  aliases: Record<string, string>;
  commandDefs: CliCommandDefinition[];
  help: (stderr: (msg: string) => void) => void;
}

export interface CliRouter {
  directCommands: Record<string, CommandHandler>;
  namespaces: Record<string, CommandNamespace>;
  allCommands: CliCommandDefinition[];
}

/**
 * Builds the CLI command dispatch table and namespace registry dynamically from declared commands.
 */
export function buildCliRouter(
  commands: CliCommandDefinition[] = allCliCommands,
): CliRouter {
  const directCommands: Record<string, CommandHandler> = {};
  const namespaces: Record<string, CommandNamespace> = {};

  for (const cmd of commands) {
    const handler = createCommandHandler(cmd);

    if (cmd.namespace) {
      const ns = (namespaces[cmd.namespace] ??= {
        name: cmd.namespace,
        commands: {},
        aliases: {},
        commandDefs: [],
        help: (stderr) => printNamespaceHelp(cmd.namespace!, commands, stderr),
      });

      ns.commands[cmd.name] = handler;
      ns.commandDefs.push(cmd);

      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          ns.aliases[alias] = cmd.name;
        }
      }

      if (cmd.rootAliases) {
        for (const rootAlias of cmd.rootAliases) {
          directCommands[rootAlias] = handler;
        }
      }
    } else {
      directCommands[cmd.name] = handler;

      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          directCommands[alias] = handler;
        }
      }

      if (cmd.rootAliases) {
        for (const rootAlias of cmd.rootAliases) {
          directCommands[rootAlias] = handler;
        }
      }
    }
  }

  return { directCommands, namespaces, allCommands: commands };
}

/**
 * Formats help text for a specific command namespace dynamically.
 */
export function printNamespaceHelp(
  namespace: string,
  commands: CliCommandDefinition[] | ((msg: string) => void) = allCliCommands,
  maybeStderr?: (msg: string) => void,
): void {
  const stderr =
    typeof commands === "function"
      ? commands
      : (maybeStderr ?? ((msg: string) => process.stderr.write(msg + "\n")));
  const commandList = Array.isArray(commands) ? commands : allCliCommands;

  const nsCommands = commandList.filter((cmd) => cmd.namespace === namespace);
  const rows: Array<{ invocation: string; description: string }> = [];

  for (const cmd of nsCommands) {
    const summary = cmd.summaryUsage ? ` ${cmd.summaryUsage}` : "";
    const invocation = `${cmd.name}${summary}`;
    let desc = cmd.description ?? "";
    if (cmd.aliases && cmd.aliases.length > 0) {
      desc += ` (alias: ${cmd.aliases.join(", ")})`;
    }
    rows.push({ invocation, description: desc });
  }

  const padWidth = Math.max(29, ...rows.map((r) => r.invocation.length + 2));
  const lines: string[] = [
    `Usage: modie ${namespace} <subcommand> [options]`,
    "",
    "Subcommands:",
    ...rows.map(
      (r) => `  ${r.invocation.padEnd(padWidth)}${r.description}`,
    ),
    "",
  ];

  stderr(lines.join("\n"));
}

/**
 * Prints task namespace usage to stderr.
 */
export function printTaskNamespaceHelp(stderr: (msg: string) => void): void {
  printNamespaceHelp("task", allCliCommands, stderr);
}

/**
 * Prints rule namespace usage to stderr.
 */
export function printRuleNamespaceHelp(stderr: (msg: string) => void): void {
  printNamespaceHelp("rule", allCliCommands, stderr);
}

/**
 * Prints ADR namespace usage to stderr.
 */
export function printAdrNamespaceHelp(stderr: (msg: string) => void): void {
  printNamespaceHelp("adr", allCliCommands, stderr);
}

/**
 * Prints global Modie CLI usage dynamically from declared command registry to stderr.
 */
export function printGlobalHelp(
  stderr: (msg: string) => void = (msg: string) => process.stderr.write(msg + "\n"),
  commands: CliCommandDefinition[] = allCliCommands,
): void {
  const rows: Array<{ invocation: string; description: string }> = [];

  for (const cmd of commands) {
    const summary = cmd.summaryUsage ? ` ${cmd.summaryUsage}` : "";
    const namePrefix = cmd.namespace ? `${cmd.namespace} ` : "";
    const invocation = `${namePrefix}${cmd.name}${summary}`;
    let desc = cmd.description ?? "";
    if (cmd.aliases && cmd.aliases.length > 0) {
      desc += ` (alias: ${cmd.aliases.join(", ")})`;
    }
    rows.push({ invocation, description: desc });

    if (cmd.rootAliases) {
      for (const rootAlias of cmd.rootAliases) {
        const rootSummary = cmd.summaryUsage ? ` ${cmd.summaryUsage}` : "";
        const aliasInvocation = `${rootAlias}${rootSummary}`;
        const targetCommand = `${namePrefix}${cmd.name}`;
        const aliasDesc = `${cmd.description ?? ""} (alias: ${targetCommand})`;
        rows.push({ invocation: aliasInvocation, description: aliasDesc });
      }
    }
  }

  rows.push({ invocation: "help", description: "Show help for a command" });
  rows.push({ invocation: "version", description: "Show Modie version" });

  const padWidth = Math.max(29, ...rows.map((r) => r.invocation.length + 2));
  const lines: string[] = [
    "Modie: Architectural Governance Engine & Context Compiler",
    "",
    "Usage:",
    "  modie <command> [subcommand] [arguments] [options]",
    "",
    "Commands:",
    ...rows.map(
      (r) => `  ${r.invocation.padEnd(padWidth)}${r.description}`,
    ),
    "",
    "Options:",
    "  -h, --help                   Show this help message",
    "  -v, --version                Show version",
    "",
  ];

  stderr(lines.join("\n"));
}

let defaultRouter: CliRouter | null = null;

function getDefaultRouter(): CliRouter {
  if (!defaultRouter) {
    defaultRouter = buildCliRouter(allCliCommands);
  }
  return defaultRouter;
}

/**
 * Main CLI entrypoint router.
 */
export async function runCli(
  args: string[],
  options: CliIoOptions = {},
  commands?: CliCommandDefinition[],
): Promise<number> {
  const stdout =
    options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr =
    options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const cmdList = commands ?? allCliCommands;

  if (
    args.length === 0 ||
    args[0] === "-h" ||
    args[0] === "--help" ||
    args[0] === "help"
  ) {
    printGlobalHelp(stderr, cmdList);
    return 0;
  }

  if (args[0] === "-v" || args[0] === "--version" || args[0] === "version") {
    stdout(MODIE_VERSION);
    return 0;
  }

  const router = commands ? buildCliRouter(commands) : getDefaultRouter();
  const [command, ...subArgs] = args;

  // Direct root commands (find, read, references, refs, backlog, mcp, etc.)
  const directHandler = router.directCommands[command!];
  if (directHandler) {
    return directHandler(subArgs, options);
  }

  // Namespaced command groups (task, rule, adr)
  const ns = router.namespaces[command!];
  if (ns) {
    if (
      subArgs.length === 0 ||
      subArgs[0] === "-h" ||
      subArgs[0] === "--help" ||
      subArgs[0] === "help"
    ) {
      ns.help(stderr);
      return 0;
    }

    const [rawSubcommand, ...cmdArgs] = subArgs;
    const subcommand = ns.aliases[rawSubcommand!] ?? rawSubcommand!;
    const handler = ns.commands[subcommand];

    if (handler) {
      return handler(cmdArgs, options);
    }

    const available = Object.keys(ns.commands).join(", ");
    stderr(
      `Error: Unknown ${command} subcommand "${rawSubcommand}". Available: ${available}`,
    );
    return 1;
  }

  stderr(
    `Error: Unknown command "${command}". Run 'modie --help' for available commands.`,
  );
  return 1;
}

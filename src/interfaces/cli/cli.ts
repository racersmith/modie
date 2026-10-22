/**
 * Modie CLI dispatcher and declarative command registry.
 * Complies with RULE-25 and RULE-27.
 */

import { handleFind } from "./commands/find/find.ts";
import { handleShow } from "./commands/show/show.ts";
import { handleRuleCreate } from "./commands/rule/create.ts";
import {
  handleTaskCheck,
  handleTaskComplete,
  handleTaskCreate,
  handleTaskList,
  handleTaskStatus,
} from "./commands/task/index.ts";
import type { CliIoOptions } from "./types.ts";

export const MODIE_VERSION = "0.1.0";

export type CommandHandler = (
  args: string[],
  options: CliIoOptions,
) => Promise<number>;

export interface CommandNamespace {
  help: (stderr: (msg: string) => void) => void;
  commands: Record<string, CommandHandler>;
  aliases?: Record<string, string>;
}

/**
 * Prints global Modie CLI usage to stderr.
 */
export function printGlobalHelp(stderr: (msg: string) => void): void {
  stderr(`Modie: Architectural Governance Engine & Context Compiler

Usage:
  modie <command> [subcommand] [arguments] [options]

Commands:
  find <tag> [options]         Find the file path of an artifact by tag
  show <tag> [options]         Display artifact details or content
  rule create <title>          Create a new RULE artifact
  task create <title>          Create a new TASK artifact with automatic watermark resolution
  task check <id> --item <n>   Check or uncheck an acceptance criteria item
  task complete <id>           Complete a task and delete its artifact per RULE-21
  task list [options]          List active tasks with DAG readiness and progress
  task status [id]             Inspect active queue or specific task status
  help                         Show help for a command
  version                      Show Modie version

Options:
  -h, --help                   Show this help message
  -v, --version                Show version
`);
}

export function printTaskNamespaceHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task <subcommand> [options]

Subcommands:
  create <title>               Create a new TASK artifact
  check <id> --item <n>        Check or uncheck an acceptance criteria item
  complete <id>                Verify criteria and delete completed task per RULE-21
  list [options]               List active tasks with DAG readiness and progress
  status [id] [options]        Inspect active queue or specific task status
`);
}

export function printRuleNamespaceHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie rule <subcommand> [options]

Subcommands:
  create <title>               Create a new RULE artifact
`);
}

const directCommands: Record<string, CommandHandler> = {
  find: handleFind,
  show: handleShow,
};

const namespaces: Record<string, CommandNamespace> = {
  task: {
    help: printTaskNamespaceHelp,
    commands: {
      create: handleTaskCreate,
      check: handleTaskCheck,
      complete: handleTaskComplete,
      list: handleTaskList,
      status: handleTaskStatus,
    },
    aliases: {
      ls: "list",
    },
  },
  rule: {
    help: printRuleNamespaceHelp,
    commands: {
      create: handleRuleCreate,
    },
  },
};

/**
 * Main CLI entrypoint router.
 */
export async function runCli(
  args: string[],
  options: CliIoOptions = {},
): Promise<number> {
  const stdout =
    options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr =
    options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  if (
    args.length === 0 ||
    args[0] === "-h" ||
    args[0] === "--help" ||
    args[0] === "help"
  ) {
    printGlobalHelp(stderr);
    return 0;
  }

  if (args[0] === "-v" || args[0] === "--version" || args[0] === "version") {
    stdout(MODIE_VERSION);
    return 0;
  }

  const [command, ...subArgs] = args;

  // Direct root commands (find, show)
  const directHandler = directCommands[command!];
  if (directHandler) {
    return directHandler(subArgs, options);
  }

  // Namespaced command groups (task, rule)
  const ns = namespaces[command!];
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
    const subcommand = ns.aliases?.[rawSubcommand!] ?? rawSubcommand!;
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

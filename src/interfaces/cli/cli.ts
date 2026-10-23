/**
 * Modie CLI dispatcher and declarative command registry.
 * Complies with RULE-25 and RULE-27.
 */

import { handleFind } from "./commands/find/find.ts";
import { handleShow } from "./commands/show/show.ts";
import { handleReferences } from "./commands/references/references.ts";
import { handleRuleCreate, handleRuleArchive } from "./commands/rule/index.ts";
import { handleAdrCreate, handleAdrArchive } from "./commands/adr/index.ts";
import {
  handleTaskCheck,
  handleTaskComplete,
  handleTaskCreate,
  handleTaskList,
  handleTaskMerge,
  handleTaskStart,
  handleTaskStatus,
} from "./commands/task/index.ts";
import { handleMcp } from "./commands/mcp/index.ts";
import type { CliIoOptions, CommandHandler } from "./types.ts";

export const MODIE_VERSION = "0.1.0";

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
  references <tag> [options]   Display citations and declared outbound links (alias: refs)
  rule create <title>          Create a new RULE artifact
  rule archive <tag>           Archive a RULE artifact (RULE-31)
  adr create <title>           Create a new ADR artifact
  adr archive <tag>            Archive an ADR artifact (RULE-31)
  task create <title>          Create a new TASK artifact with automatic watermark resolution
  task start <id>              Create and checkout a hierarchical task branch
  task check <id> --item <n>   Check or uncheck an acceptance criteria item
  task complete <id>           Complete a task and delete its artifact (alias: finish)
  task merge <id>              Merge completed task branch back into parent or trunk
  task list [options]          List active tasks with DAG readiness and progress
  task status [id]             Inspect active queue or specific task status
  mcp                          Launch Model Context Protocol server over standard I/O
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
  start <id> [options]         Create and checkout a hierarchical task branch
  check <id> --item <n>        Check or uncheck an acceptance criteria item
  complete <id>                Verify criteria and delete completed task (alias: finish)
  merge <id> [options]         Merge completed task branch back into parent or trunk
  list [options]               List active tasks with DAG readiness and progress
  status [id] [options]        Inspect active queue or specific task status
`);
}

export function printRuleNamespaceHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie rule <subcommand> [options]

Subcommands:
  create <title>               Create a new RULE artifact
  archive <tag> [options]      Archive a RULE artifact (RULE-31)
`);
}

export function printAdrNamespaceHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie adr <subcommand> [options]

Subcommands:
  create <title>               Create a new ADR artifact
  archive <tag> [options]      Archive an ADR artifact (RULE-31)
`);
}

const directCommands: Record<string, CommandHandler> = {
  find: handleFind,
  show: handleShow,
  references: handleReferences,
  refs: handleReferences,
  mcp: handleMcp,
};

const namespaces: Record<string, CommandNamespace> = {
  task: {
    help: printTaskNamespaceHelp,
    commands: {
      create: handleTaskCreate,
      start: handleTaskStart,
      check: handleTaskCheck,
      complete: handleTaskComplete,
      merge: handleTaskMerge,
      list: handleTaskList,
      status: handleTaskStatus,
    },
    aliases: {
      ls: "list",
      finish: "complete",
    },
  },
  rule: {
    help: printRuleNamespaceHelp,
    commands: {
      create: handleRuleCreate,
      archive: handleRuleArchive,
    },
  },
  adr: {
    help: printAdrNamespaceHelp,
    commands: {
      create: handleAdrCreate,
      archive: handleAdrArchive,
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

/**
 * Modie CLI dispatcher.
 * Handles command routing and global flags (--help, --version).
 * Complies with RULE-27.
 */

import { handleFind } from "./find.ts";
import { handleShow } from "./show.ts";
import { handleTaskCheck } from "./task-check.ts";
import { handleTaskComplete } from "./task-complete.ts";
import { handleTaskCreate } from "./task-create.ts";
import { handleTaskList } from "./task-list.ts";
import { handleTaskStatus } from "./task-status.ts";
import type { CliIoOptions } from "./types.ts";

export const MODIE_VERSION = "0.1.0";

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

  if (command === "find") {
    return handleFind(subArgs, options);
  }

  if (command === "show") {
    return handleShow(subArgs, options);
  }

  if (command === "task") {
    if (
      subArgs.length === 0 ||
      subArgs[0] === "-h" ||
      subArgs[0] === "--help" ||
      subArgs[0] === "help"
    ) {
      stderr(`Usage: modie task <subcommand> [options]

Subcommands:
  create <title>               Create a new TASK artifact
  check <id> --item <n>        Check or uncheck an acceptance criteria item
  complete <id>                Verify criteria and delete completed task per RULE-21
  list [options]               List active tasks with DAG readiness and progress
  status [id] [options]        Inspect active queue or specific task status
`);
      return 0;
    }

    const [subcommand, ...taskArgs] = subArgs;

    if (subcommand === "create") {
      return handleTaskCreate(taskArgs, options);
    }

    if (subcommand === "check") {
      return handleTaskCheck(taskArgs, options);
    }

    if (subcommand === "complete") {
      return handleTaskComplete(taskArgs, options);
    }

    if (subcommand === "list" || subcommand === "ls") {
      return handleTaskList(taskArgs, options);
    }

    if (subcommand === "status") {
      return handleTaskStatus(taskArgs, options);
    }

    stderr(
      `Error: Unknown task subcommand "${subcommand}". Available: create, check, complete, list, status`,
    );
    return 1;
  }

  stderr(
    `Error: Unknown command "${command}". Run 'modie --help' for available commands.`,
  );
  return 1;
}

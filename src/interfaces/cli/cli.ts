/**
 * Canon CLI dispatcher.
 * Handles command routing and global flags (--help, --version).
 * Complies with RULE-27.
 */

import { handleTaskCheck } from "./task-check.ts";
import { handleTaskComplete } from "./task-complete.ts";
import { handleTaskCreate } from "./task-create.ts";
import type { CliIoOptions } from "./types.ts";

export const CANON_VERSION = "0.1.0";

/**
 * Prints global Canon CLI usage to stderr.
 */
export function printGlobalHelp(stderr: (msg: string) => void): void {
  stderr(`Canon: Architectural Governance Engine & Context Compiler

Usage:
  canon <command> [subcommand] [arguments] [options]

Commands:
  task create <title>          Create a new TASK artifact with automatic watermark resolution
  task check <id> --item <n>   Check or uncheck an acceptance criteria item
  task complete <id>           Complete a task and delete its artifact per RULE-21
  help                         Show help for a command
  version                      Show Canon version

Options:
  -h, --help                   Show this help message
  -v, --version                Show version
`);
}

/**
 * Main CLI entrypoint router.
 */
export async function runCli(args: string[], options: CliIoOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help" || args[0] === "help") {
    printGlobalHelp(stderr);
    return 0;
  }

  if (args[0] === "-v" || args[0] === "--version" || args[0] === "version") {
    stdout(CANON_VERSION);
    return 0;
  }

  const [command, ...subArgs] = args;

  if (command === "task") {
    if (subArgs.length === 0 || subArgs[0] === "-h" || subArgs[0] === "--help" || subArgs[0] === "help") {
      stderr(`Usage: canon task <subcommand> [options]

Subcommands:
  create <title>               Create a new TASK artifact
  check <id> --item <n>        Check or uncheck an acceptance criteria item
  complete <id>                Verify criteria and delete completed task per RULE-21
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

    stderr(`Error: Unknown task subcommand "${subcommand}". Available: create, check, complete`);
    return 1;
  }

  stderr(`Error: Unknown command "${command}". Run 'canon --help' for available commands.`);
  return 1;
}

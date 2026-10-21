/**
 * CLI command handler for `canon task create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createTask, type CreateTaskOptions } from "../../core/index.ts";
import type { CliIoOptions } from "./types.ts";

/**
 * Prints usage instructions for `canon task create`.
 */
export function printTaskCreateHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: canon task create <title> [options]

Arguments:
  <title>                 Title of the task to create (e.g. "Create CLI Harness")

Options:
  -s, --scope <dir>       Target scope directory (defaults to current working directory)
  -c, --context <text>    Context / problem statement for the task
  -d, --depends-on <ids>  Prerequisite TASK IDs (repeat flag or use comma-separated list)
  -l, --link, --links <targets>
                          ADR and RULE link targets (repeat flag or use comma-separated list)
  -a, --criterion, --criteria <items>
                          Acceptance criteria items (repeat -a/--criterion for verbatim items with punctuation)
  -p, --prefix <tag>      Custom task ID prefix tag (e.g. "J" for TASK-J1)
  -b, --branch <name>     Git branch override for ID allocation
      --flat              Create flat task file without .tasks container (RULE-8)
      --force-trunk       Force trunk monotonic integer sequence
      --allow-broad-scope Allow placing task above deepest common ancestor (RULE-12)
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `canon task create`.
 */
export async function handleTaskCreate(args: string[], options: CliIoOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
  const cwd = options.cwd ?? process.cwd();

  const titleWords: string[] = [];
  let scopeDir: string | undefined;
  let context: string | undefined;
  const depends_on: string[] = [];
  const links: string[] = [];
  const acceptanceCriteria: string[] = [];
  let prefix: string | undefined;
  let branch: string | undefined;
  let useSubtypeContainer = true;
  let forceTrunk = false;
  let allowBroadScope = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "-h" || arg === "--help") {
      printTaskCreateHelp(stderr);
      return 0;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--flat") {
      useSubtypeContainer = false;
      continue;
    }

    if (arg === "--force-trunk") {
      forceTrunk = true;
      continue;
    }

    if (arg === "--allow-broad-scope") {
      allowBroadScope = true;
      continue;
    }

    if (arg === "-s" || arg === "--scope") {
      scopeDir = args[++i];
      if (!scopeDir) {
        stderr("Error: Missing argument for --scope flag.");
        return 1;
      }
      continue;
    }

    if (arg === "-c" || arg === "--context") {
      context = args[++i];
      if (!context) {
        stderr("Error: Missing argument for --context flag.");
        return 1;
      }
      continue;
    }

    if (arg === "-p" || arg === "--prefix") {
      prefix = args[++i];
      if (!prefix) {
        stderr("Error: Missing argument for --prefix flag.");
        return 1;
      }
      continue;
    }

    if (arg === "-b" || arg === "--branch") {
      branch = args[++i];
      if (!branch) {
        stderr("Error: Missing argument for --branch flag.");
        return 1;
      }
      continue;
    }

    if (arg === "-d" || arg === "--depend-on" || arg === "--depends-on") {
      const val = args[++i];
      if (!val) {
        stderr("Error: Missing argument for --depends-on flag.");
        return 1;
      }
      if (arg === "--depend-on") {
        depends_on.push(val.trim());
      } else {
        depends_on.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
      }
      continue;
    }

    if (arg === "-l" || arg === "--link" || arg === "--links") {
      const val = args[++i];
      if (!val) {
        stderr("Error: Missing argument for --links flag.");
        return 1;
      }
      if (arg === "--link") {
        links.push(val.trim());
      } else {
        links.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
      }
      continue;
    }

    if (
      arg === "-a" ||
      arg === "--criterion" ||
      arg === "--criteria" ||
      arg === "--acceptance-criteria"
    ) {
      const val = args[++i];
      if (!val) {
        stderr("Error: Missing argument for --criteria flag.");
        return 1;
      }
      if (arg === "-a" || arg === "--criterion") {
        acceptanceCriteria.push(val.trim());
      } else {
        acceptanceCriteria.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
      }
      continue;
    }

    if (arg.startsWith("-")) {
      stderr(`Error: Unknown flag "${arg}". Run 'canon task create --help' for usage.`);
      return 1;
    }

    titleWords.push(arg);
  }

  const title = titleWords.join(" ").trim();
  if (!title) {
    stderr("Error: Missing required task title. Usage: canon task create <title> [options]");
    return 1;
  }

  const taskOptions: CreateTaskOptions = {
    title,
    scopeDir,
    context,
    depends_on: depends_on.length > 0 ? depends_on : undefined,
    links: links.length > 0 ? links : undefined,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
    useSubtypeContainer,
    prefix,
    branch,
    forceTrunk,
    allowBroadScope,
    cwd,
  };

  try {
    const result = await createTask(taskOptions);

    if (json) {
      // Machine-parsable JSON output strictly to stdout (RULE-27)
      stdout(
        JSON.stringify(
          {
            id: result.artifact.id,
            slug: result.artifact.slug,
            filename: result.filename,
            filepath: result.filepath,
            relativePath: result.relativePath,
            title: result.artifact.title,
            depends_on: result.artifact.depends_on,
            links: result.artifact.links,
            acceptanceCriteria: result.artifact.acceptanceCriteria,
            watermark: result.watermark,
          },
          null,
          2,
        ),
      );
      // Status message strictly to stderr (RULE-27)
      stderr(`✓ Created task TASK-${result.artifact.id} (${result.relativePath})`);
    } else {
      // Machine-parsable path strictly to stdout (RULE-27)
      stdout(result.relativePath);
      // Human diagnostic status strictly to stderr (RULE-27)
      stderr(`✓ Created task TASK-${result.artifact.id}: ${result.filename}`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}

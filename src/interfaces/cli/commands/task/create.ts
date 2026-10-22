/**
 * CLI command handler for `modie task create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createTask, type CreateTaskOptions } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie task create`.
 */
export function printTaskCreateHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie task create <title> [options]

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
 * Handles argument parsing and execution for `modie task create`.
 */
export async function handleTaskCreate(
  args: string[],
  options: CliIoOptions = {},
): Promise<number> {
  const stdout =
    options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr =
    options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
  const cwd = options.cwd ?? process.cwd();

  const parsed = parseCliArgs({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      flat: { type: "boolean" },
      "force-trunk": { type: "boolean" },
      "allow-broad-scope": { type: "boolean" },
      scope: { type: "string", short: "s" },
      context: { type: "string", short: "c" },
      prefix: { type: "string", short: "p" },
      branch: { type: "string", short: "b" },
      "depends-on": { type: "string", multiple: true, short: "d" },
      "depend-on": { type: "string", multiple: true },
      link: { type: "string", multiple: true, short: "l" },
      links: { type: "string", multiple: true },
      criterion: { type: "string", multiple: true, short: "a" },
      criteria: { type: "string", multiple: true },
      "acceptance-criteria": { type: "string", multiple: true },
    },
    helpUsage: "modie task create --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printTaskCreateHelp(stderr);
    return 0;
  }

  const title = parsed.positionals.join(" ").trim();
  if (!title) {
    stderr(
      "Error: Missing required task title. Usage: modie task create <title> [options]",
    );
    return 1;
  }

  // Aggregate depends_on values
  const depends_on: string[] = [];
  if (parsed.values["depend-on"]) {
    for (const d of parsed.values["depend-on"] as string[]) {
      depends_on.push(d.trim());
    }
  }
  if (parsed.values["depends-on"]) {
    for (const d of parsed.values["depends-on"] as string[]) {
      depends_on.push(...d.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }

  // Aggregate links values
  const links: string[] = [];
  if (parsed.values.link) {
    for (const l of parsed.values.link as string[]) {
      links.push(l.trim());
    }
  }
  if (parsed.values.links) {
    for (const l of parsed.values.links as string[]) {
      links.push(...l.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }

  // Aggregate criteria values (preserve verbatim for -a/--criterion)
  const acceptanceCriteria: string[] = [];
  if (parsed.values.criterion) {
    for (const c of parsed.values.criterion as string[]) {
      acceptanceCriteria.push(c.trim());
    }
  }
  if (parsed.values.criteria) {
    for (const c of parsed.values.criteria as string[]) {
      acceptanceCriteria.push(...c.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  if (parsed.values["acceptance-criteria"]) {
    for (const c of parsed.values["acceptance-criteria"] as string[]) {
      acceptanceCriteria.push(...c.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }

  const taskOptions: CreateTaskOptions = {
    title,
    scopeDir: parsed.values.scope,
    context: parsed.values.context,
    depends_on: depends_on.length > 0 ? depends_on : undefined,
    links: links.length > 0 ? links : undefined,
    acceptanceCriteria:
      acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
    useSubtypeContainer: !parsed.values.flat,
    prefix: parsed.values.prefix,
    branch: parsed.values.branch,
    forceTrunk: Boolean(parsed.values["force-trunk"]),
    allowBroadScope: Boolean(parsed.values["allow-broad-scope"]),
    cwd,
  };

  try {
    const result = await createTask(taskOptions);

    if (parsed.values.json) {
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
      stderr(
        `✓ Created task TASK-${result.artifact.id} (${result.relativePath})`,
      );
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

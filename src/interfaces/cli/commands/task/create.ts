/**
 * Declarative CLI command definition for `modie task create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createTask, type CreateTaskOptions } from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface TaskCreateFlags {
  scope?: string;
  context?: string;
  "depends-on"?: string[];
  "depend-on"?: string[];
  link?: string[];
  links?: string[];
  criterion?: string[];
  criteria?: string[];
  "acceptance-criteria"?: string[];
  prefix?: string;
  branch?: string;
  flat?: boolean;
  "force-trunk"?: boolean;
  "allow-broad-scope"?: boolean;
}

export interface TaskCreateResultPayload {
  id: string;
  slug: string;
  filename: string;
  filepath: string;
  relativePath: string;
  title: string;
  depends_on: string[];
  links: string[];
  acceptanceCriteria: any[];
  watermark: any;
}

/**
 * Declarative definition for the `modie task create` command.
 */
export const taskCreateCommand: CliCommandDefinition<
  TaskCreateFlags,
  TaskCreateResultPayload
> = {
  name: "create",
  usage: "modie task create <title> [options]",
  description: "Create a new TASK artifact",
  helpUsage: "modie task create --help",
  positionals: [
    {
      name: "title",
      description: 'Title of the task to create (e.g. "Create CLI Harness")',
      required: true,
      variadic: true,
      missingError:
        "Error: Missing required task title. Usage: modie task create <title> [options]",
    },
  ],
  flags: {
    scope: {
      type: "string",
      short: "s",
      placeholder: "<dir>",
      description: "Target scope directory (defaults to current working directory)",
    },
    context: {
      type: "string",
      short: "c",
      placeholder: "<text>",
      description: "Context / problem statement for the task",
    },
    "depends-on": {
      type: "string",
      short: "d",
      multiple: true,
      placeholder: "<ids>",
      description: "Prerequisite TASK IDs (repeat flag or use comma-separated list)",
    },
    "depend-on": {
      type: "string",
      multiple: true,
      description: "Prerequisite TASK ID (verbatim)",
    },
    link: {
      type: "string",
      short: "l",
      multiple: true,
      placeholder: "<targets>",
      description: "ADR and RULE link targets (repeat flag for verbatim targets)",
    },
    links: {
      type: "string",
      multiple: true,
      placeholder: "<targets>",
      description: "ADR and RULE link targets (comma-separated list)",
    },
    criterion: {
      type: "string",
      short: "a",
      multiple: true,
      placeholder: "<items>",
      description:
        "Acceptance criteria items (repeat -a/--criterion for verbatim items with punctuation)",
    },
    criteria: {
      type: "string",
      multiple: true,
      placeholder: "<items>",
      description: "Acceptance criteria items (comma-separated list)",
    },
    "acceptance-criteria": {
      type: "string",
      multiple: true,
      description: "Alias for --criteria",
    },
    prefix: {
      type: "string",
      short: "p",
      placeholder: "<tag>",
      description: 'Custom task ID prefix tag (e.g. "J" for TASK-J1)',
    },
    branch: {
      type: "string",
      short: "b",
      placeholder: "<name>",
      description: "Git branch override for ID allocation",
    },
    flat: {
      type: "boolean",
      description: "Create flat task file without .tasks container",
    },
    "force-trunk": {
      type: "boolean",
      description: "Force trunk monotonic integer sequence",
    },
    "allow-broad-scope": {
      type: "boolean",
      description: "Allow placing task above deepest common ancestor",
    },
  },
  run: async (context) => {
    const title = context.positionals.join(" ").trim();

    // Aggregate depends_on values
    const depends_on: string[] = [];
    if (context.flags["depend-on"]) {
      for (const d of context.flags["depend-on"]) {
        depends_on.push(d.trim());
      }
    }
    if (context.flags["depends-on"]) {
      for (const d of context.flags["depends-on"]) {
        depends_on.push(...d.split(",").map((s) => s.trim()).filter(Boolean));
      }
    }

    // Aggregate links values (preserve verbatim for -l/--link)
    const links: string[] = [];
    if (context.flags.link) {
      for (const l of context.flags.link) {
        links.push(l.trim());
      }
    }
    if (context.flags.links) {
      for (const l of context.flags.links) {
        links.push(...l.split(",").map((s) => s.trim()).filter(Boolean));
      }
    }

    // Aggregate criteria values (preserve verbatim for -a/--criterion)
    const acceptanceCriteria: string[] = [];
    if (context.flags.criterion) {
      for (const c of context.flags.criterion) {
        acceptanceCriteria.push(c.trim());
      }
    }
    if (context.flags.criteria) {
      for (const c of context.flags.criteria) {
        acceptanceCriteria.push(...c.split(",").map((s) => s.trim()).filter(Boolean));
      }
    }
    if (context.flags["acceptance-criteria"]) {
      for (const c of context.flags["acceptance-criteria"]) {
        acceptanceCriteria.push(...c.split(",").map((s) => s.trim()).filter(Boolean));
      }
    }

    const taskOptions: CreateTaskOptions = {
      title,
      scopeDir: context.flags.scope,
      context: context.flags.context,
      depends_on: depends_on.length > 0 ? depends_on : undefined,
      links: links.length > 0 ? links : undefined,
      acceptanceCriteria:
        acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
      useSubtypeContainer: !context.flags.flat,
      prefix: context.flags.prefix,
      branch: context.flags.branch,
      forceTrunk: Boolean(context.flags["force-trunk"]),
      allowBroadScope: Boolean(context.flags["allow-broad-scope"]),
      cwd: context.cwd,
    };

    const result = await createTask(taskOptions);

    return {
      id: result.artifact.id,
      slug: result.artifact.slug,
      filename: result.filename,
      filepath: result.filepath,
      relativePath: result.relativePath,
      title: result.artifact.title ?? title,
      depends_on: result.artifact.depends_on,
      links: result.artifact.links,
      acceptanceCriteria: result.artifact.acceptanceCriteria,
      watermark: result.watermark,
    };
  },
  render: (result, context) => {
    context.stdout(result.relativePath);
    context.stderr(`✓ Created task TASK-${result.id}: ${result.filename}`);
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(`✓ Created task TASK-${result.id} (${result.relativePath})`);
  },
};

/**
 * CLI command handler for `modie task create`.
 */
export const handleTaskCreate: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(taskCreateCommand);

/**
 * Prints usage instructions for `modie task create`.
 */
export function printTaskCreateHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(taskCreateCommand));
}

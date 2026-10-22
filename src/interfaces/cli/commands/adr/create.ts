/**
 * Declarative CLI command definition for `modie adr create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createAdr, type CreateAdrOptions } from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface AdrCreateFlags {
  scope?: string;
  context?: string;
  alternatives?: string;
  decision?: string;
  link?: string[];
  links?: string[];
  flat?: boolean;
}

export interface AdrCreateResultPayload {
  id: string;
  tag: string;
  slug: string;
  filename: string;
  filepath: string;
  relativePath: string;
  title: string;
  links: string[];
  context?: string;
  alternatives?: string;
  decision?: string;
}

/**
 * Declarative definition for the `modie adr create` command.
 */
export const adrCreateCommand: CliCommandDefinition<
  AdrCreateFlags,
  AdrCreateResultPayload
> = {
  name: "create",
  usage: "modie adr create <title> [options]",
  description: "Create a new ADR artifact",
  helpUsage: "modie adr create --help",
  positionals: [
    {
      name: "title",
      description:
        'Title of the architectural decision record (e.g. "Subtype Directory Partitioning")',
      required: true,
      variadic: true,
      missingError:
        "Error: Missing required ADR title. Usage: modie adr create <title> [options]",
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
      description: "Problem statement and architectural motivation (ADR-4)",
    },
    alternatives: {
      type: "string",
      short: "a",
      placeholder: "<text>",
      description: "Alternatives considered and trade-off evaluations (ADR-4)",
    },
    decision: {
      type: "string",
      short: "d",
      placeholder: "<text>",
      description: "Adopted decision specification (ADR-4)",
    },
    link: {
      type: "string",
      short: "l",
      multiple: true,
      placeholder: "<targets>",
      description:
        "ADR and RULE link targets (repeat flag or use comma-separated list) (RULE-14, RULE-17)",
      aliases: ["links"],
    },
    flat: {
      type: "boolean",
      description: "Create flat ADR file without .adrs container (RULE-8)",
    },
  },
  run: async (context) => {
    const title = context.positionals.join(" ").trim();

    // Aggregate link values from repeated -l/--link and comma-separated --links
    const rawLinks: string[] = [
      ...(context.flags.link ?? []),
      ...(context.flags.links ?? []),
    ];
    const links: string[] = [];
    for (const item of rawLinks) {
      links.push(...item.split(",").map((s) => s.trim()).filter(Boolean));
    }

    const adrOptions: CreateAdrOptions = {
      title,
      scopeDir: context.flags.scope,
      context: context.flags.context,
      alternatives: context.flags.alternatives,
      decision: context.flags.decision,
      links: links.length > 0 ? links : undefined,
      useSubtypeContainer: !context.flags.flat,
      cwd: context.cwd,
    };

    const result = await createAdr(adrOptions);

    return {
      id: result.artifact.id,
      tag: result.tag,
      slug: result.artifact.slug,
      filename: result.filename,
      filepath: result.filepath,
      relativePath: result.relativePath,
      title: result.artifact.title,
      links: result.artifact.links,
      context: result.artifact.context,
      alternatives: result.artifact.alternatives,
      decision: result.artifact.decision,
    };
  },
  render: (result, context) => {
    context.stdout(result.relativePath);
    context.stderr(`✓ Created ADR ${result.tag}: ${result.filename}`);
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(`✓ Created ADR ${result.tag} (${result.relativePath})`);
  },
};

/**
 * CLI command handler for `modie adr create`.
 */
export const handleAdrCreate: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(adrCreateCommand);

/**
 * Prints usage instructions for `modie adr create`.
 */
export function printAdrCreateHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(adrCreateCommand));
}

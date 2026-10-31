/**
 * Declarative CLI command definition for `modie adr create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { createAdr, type CreateAdrOptions } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const adrCreateSchema = z.object({
  title: z
    .string()
    .min(1, "ADR title is required")
    .describe(
      "Title of the architectural decision record (e.g. 'Subtype Directory Partitioning')",
    ),
  scope: z
    .string()
    .optional()
    .describe("Target scope directory (defaults to current working directory)"),
  summary: z
    .string()
    .optional()
    .describe(
      "Concise 1-2 sentence signpost summary of the core decision for progressive disclosure",
    ),
  context: z
    .string()
    .optional()
    .describe("Problem statement and architectural motivation"),
  alternatives: z
    .string()
    .optional()
    .describe("Alternatives considered and trade-off evaluations"),
  decision: z.string().optional().describe("Adopted decision specification"),
  links: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "ADR and RULE link targets (repeat flag or use comma-separated list)",
    ),
  supersedes: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Target ADR tag(s) superseded by this decision (repeat flag or use comma-separated list)",
    ),
});

export type AdrCreateInput = z.infer<typeof adrCreateSchema>;

export interface AdrCreateFlags {
  scope?: string;
  summary?: string;
  context?: string;
  alternatives?: string;
  decision?: string;
  link?: string[];
  links?: string[];
  supersedes?: string[];
}

export interface AdrCreateResultPayload {
  id: string;
  tag: string;
  slug: string;
  filename: string;
  filepath: string;
  relativePath: string;
  title: string;
  summary?: string;
  links: string[];
  supersedes?: string[];
  context?: string;
  alternatives?: string;
  decision?: string;
}

/**
 * Declarative definition for the `modie adr create` command.
 */
export const adrCreateCommand: CliCommandDefinition<
  AdrCreateFlags,
  AdrCreateResultPayload,
  typeof adrCreateSchema
> = defineCommand({
  id: "adr_create",
  namespace: "adr",
  name: "create",
  summaryUsage: "<title>",
  usage: "modie adr create <title> [options]",
  description: "Create a new ADR artifact",
  agentGuidance:
    "Call this tool to document significant architectural decisions, trade-offs, and design rationale.\n\n" +
    "BEST PRACTICE: Author ADRs upfront when introducing major design choices, subsystem abstractions, or structural conventions. Derived invariants should be codified as linked RULE artifacts.",
  helpUsage: "modie adr create --help",
  schema: adrCreateSchema,
  positionals: [
    {
      name: "title",
      required: true,
      variadic: true,
      missingError:
        "Error: Missing required ADR title. Usage: modie adr create <title> [options]",
    },
  ],
  flags: {
    scope: {
      short: "s",
      placeholder: "<dir>",
    },
    summary: {
      placeholder: "<text>",
    },
    context: {
      short: "c",
      placeholder: "<text>",
    },
    alternatives: {
      short: "a",
      placeholder: "<text>",
    },
    decision: {
      short: "d",
      placeholder: "<text>",
    },
    link: {
      short: "l",
      placeholder: "<targets>",
      aliases: ["links"],
    },
    supersedes: {
      short: "S",
      placeholder: "<targets>",
    },
  },
  execute: async (input, context): Promise<AdrCreateResultPayload> => {
    const adrOptions: CreateAdrOptions = {
      title: input.title,
      scopeDir: input.scope,
      summary: input.summary,
      context: input.context,
      alternatives: input.alternatives,
      decision: input.decision,
      links: input.links.length > 0 ? input.links : undefined,
      supersedes: input.supersedes.length > 0 ? input.supersedes : undefined,
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
      summary: result.artifact.summary,
      links: result.artifact.links,
      supersedes: result.artifact.supersedes,
      context: result.artifact.context,
      alternatives: result.artifact.alternatives,
      decision: result.artifact.decision,
    };
  },
  render: (result, context) => {
    const supersedesNotice =
      result.supersedes && result.supersedes.length > 0
        ? ` (supersedes ${result.supersedes.join(", ")})`
        : "";
    context.stdout(result.relativePath);
    context.stderr(
      `✓ Created ADR ${result.tag}: ${result.filename}${supersedesNotice}`,
    );
  },
  renderJson: (result, context) => {
    const supersedesNotice =
      result.supersedes && result.supersedes.length > 0
        ? ` (supersedes ${result.supersedes.join(", ")})`
        : "";
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(
      `✓ Created ADR ${result.tag} (${result.relativePath})${supersedesNotice}`,
    );
  },
});

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

/**
 * Declarative CLI command definition for `modie rule create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import { createRule, type CreateRuleOptions } from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const ruleCreateSchema = z.object({
  title: z
    .string()
    .min(1, "Rule title is required")
    .describe("Title of the rule to create (e.g. 'Rule Verification Tagging')"),
  scope: z
    .string()
    .optional()
    .describe("Target scope directory (defaults to current working directory)"),
  context: z.string().optional().describe("Invariant assertion claim text"),
  links: z
    .array(z.string())
    .optional()
    .default([])
    .describe("ADR link targets (repeat flag or use comma-separated list)"),
  supersedes: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Target RULE tag(s) superseded by this rule (repeat flag or use comma-separated list)",
    ),
  flat: z
    .boolean()
    .default(false)
    .describe("Create flat rule file without .rules container"),
});

export type RuleCreateInput = z.infer<typeof ruleCreateSchema>;

export interface RuleCreateFlags {
  scope?: string;
  context?: string;
  assertion?: string;
  link?: string[];
  links?: string[];
  supersedes?: string[];
  flat?: boolean;
}

export interface RuleCreateResultPayload {
  id: string;
  tag: string;
  slug: string;
  filename: string;
  filepath: string;
  relativePath: string;
  title: string;
  links: string[];
  supersedes?: string[];
  assertion?: string;
}

/**
 * Declarative definition for the `modie rule create` command.
 */
export const ruleCreateCommand: CliCommandDefinition<
  RuleCreateFlags,
  RuleCreateResultPayload,
  typeof ruleCreateSchema
> = defineCommand({
  id: "rule_create",
  name: "create",
  usage: "modie rule create <title> [options]",
  description: "Create a new RULE artifact",
  agentGuidance:
    "Call this tool to establish a new architectural, interface, or workflow rule with monotonic ID allocation.\n\n" +
    "BEST PRACTICE: Author rules to capture durable invariants and conventions. Test assertions and code annotations must reference RULE IDs (e.g. `[RULE-XX]` or `@verifies RULE-XX`) rather than ephemeral TASK IDs.",
  helpUsage: "modie rule create --help",
  schema: ruleCreateSchema,
  positionals: [
    {
      name: "title",
      property: "title",
      description:
        'Title of the rule to create (e.g. "Rule Verification Tagging")',
      required: true,
      variadic: true,
      missingError:
        "Error: Missing required rule title. Usage: modie rule create <title> [options]",
    },
  ],
  flags: {
    scope: {
      type: "string",
      short: "s",
      placeholder: "<dir>",
      description:
        "Target scope directory (defaults to current working directory)",
    },
    context: {
      type: "string",
      short: "c",
      placeholder: "<text>",
      description: "Invariant assertion claim text",
      aliases: ["assertion"],
    },
    link: {
      type: "string",
      short: "l",
      multiple: true,
      placeholder: "<targets>",
      description: "ADR link targets (repeat flag or use comma-separated list)",
      aliases: ["links"],
      property: "links",
    },
    supersedes: {
      type: "string",
      short: "S",
      multiple: true,
      placeholder: "<targets>",
      description:
        "Target RULE tag(s) superseded by this rule (repeat flag or use comma-separated list)",
      property: "supersedes",
    },
    flat: {
      type: "boolean",
      description: "Create flat rule file without .rules container",
    },
  },
  execute: async (input, context): Promise<RuleCreateResultPayload> => {
    const ruleOptions: CreateRuleOptions = {
      title: input.title,
      scopeDir: input.scope,
      context: input.context,
      links: input.links.length > 0 ? input.links : undefined,
      supersedes: input.supersedes.length > 0 ? input.supersedes : undefined,
      useSubtypeContainer: !input.flat,
      cwd: context.cwd,
    };

    const result = await createRule(ruleOptions);

    return {
      id: result.artifact.id,
      tag: result.tag,
      slug: result.artifact.slug,
      filename: result.filename,
      filepath: result.filepath,
      relativePath: result.relativePath,
      title: result.artifact.title,
      links: result.artifact.links,
      supersedes: result.artifact.supersedes,
      assertion: result.artifact.assertion,
    };
  },
  render: (result, context) => {
    const supersedesNotice =
      result.supersedes && result.supersedes.length > 0
        ? ` (supersedes ${result.supersedes.join(", ")})`
        : "";
    context.stdout(result.relativePath);
    context.stderr(
      `✓ Created rule ${result.tag}: ${result.filename}${supersedesNotice}`,
    );
  },
  renderJson: (result, context) => {
    const supersedesNotice =
      result.supersedes && result.supersedes.length > 0
        ? ` (supersedes ${result.supersedes.join(", ")})`
        : "";
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(
      `✓ Created rule ${result.tag} (${result.relativePath})${supersedesNotice}`,
    );
  },
});

/**
 * CLI command handler for `modie rule create`.
 */
export const handleRuleCreate: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(ruleCreateCommand);

/**
 * Prints usage instructions for `modie rule create`.
 */
export function printRuleCreateHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(ruleCreateCommand));
}

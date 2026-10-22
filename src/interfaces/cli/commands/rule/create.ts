/**
 * Declarative CLI command definition for `modie rule create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createRule, type CreateRuleOptions } from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface RuleCreateFlags {
  scope?: string;
  context?: string;
  assertion?: string;
  link?: string[];
  links?: string[];
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
  assertion?: string;
}

/**
 * Declarative definition for the `modie rule create` command.
 */
export const ruleCreateCommand: CliCommandDefinition<
  RuleCreateFlags,
  RuleCreateResultPayload
> = {
  name: "create",
  usage: "modie rule create <title> [options]",
  description: "Create a new RULE artifact",
  helpUsage: "modie rule create --help",
  positionals: [
    {
      name: "title",
      description: 'Title of the rule to create (e.g. "Rule Verification Tagging")',
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
      description: "Target scope directory (defaults to current working directory)",
    },
    context: {
      type: "string",
      short: "c",
      placeholder: "<text>",
      description: "Invariant assertion claim text (RULE-3, RULE-11)",
    },
    assertion: {
      type: "string",
      placeholder: "<text>",
      description: "Invariant assertion claim text (RULE-3, RULE-11)",
    },
    link: {
      type: "string",
      short: "l",
      multiple: true,
      placeholder: "<targets>",
      description:
        "ADR link targets (repeat flag or use comma-separated list) (RULE-13, RULE-16)",
      aliases: ["links"],
    },
    flat: {
      type: "boolean",
      description: "Create flat rule file without .rules container (RULE-8)",
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

    const ruleOptions: CreateRuleOptions = {
      title,
      scopeDir: context.flags.scope,
      context: context.flags.context ?? context.flags.assertion,
      links: links.length > 0 ? links : undefined,
      useSubtypeContainer: !context.flags.flat,
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
      assertion: result.artifact.assertion,
    };
  },
  render: (result, context) => {
    context.stdout(result.relativePath);
    context.stderr(`✓ Created rule ${result.tag}: ${result.filename}`);
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
    context.stderr(`✓ Created rule ${result.tag} (${result.relativePath})`);
  },
};

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

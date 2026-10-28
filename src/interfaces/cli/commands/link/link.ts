/**
 * Declarative CLI command definition for `modie link <source> <target> [options]`.
 * Exposes `link_artifact` MCP tool via automatic registry projection.
 * Complies with ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17,
 * RULE-18, RULE-19, RULE-25, RULE-26, RULE-27, and RULE-36.
 */

import { z } from "zod";
import {
  linkArtifact,
  type ArtifactLinkRelationship,
  type LinkMutationResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const linkSchema = z.object({
  source: z
    .string()
    .min(1, "Source artifact identifier is required")
    .describe("Source artifact tag (e.g. RULE-16, ADR-5), slug, or file path"),
  target: z
    .string()
    .min(1, "Target artifact identifier is required")
    .describe("Target artifact tag (e.g. ADR-5, RULE-13), slug, or file path"),
  relationship: z
    .enum(["links", "depends_on"])
    .optional()
    .describe(
      "Optional explicit frontmatter relationship field override ('links' or 'depends_on'). Automatically inferred from artifact subtypes when omitted.",
    ),
  type: z
    .enum(["links", "depends_on"])
    .optional()
    .describe(
      "Optional alias for relationship ('links' or 'depends_on'). Automatically inferred when omitted.",
    ),
});

export type LinkInput = z.infer<typeof linkSchema>;

export interface LinkFlags {
  type?: ArtifactLinkRelationship;
  relationship?: ArtifactLinkRelationship;
  json?: boolean;
}

/**
 * Declarative definition for the root `modie link` command (`link_artifact` MCP tool).
 */
export const linkCommand: CliCommandDefinition<
  LinkFlags,
  LinkMutationResult,
  typeof linkSchema
> = defineCommand({
  id: "link_artifact",
  name: "link",
  usage: "modie link <source> <target> [options]",
  description:
    "Add a validated frontmatter link or dependency from a source artifact to a target artifact",
  agentGuidance:
    "Call this tool to add a frontmatter 'links' reference or 'depends_on' task dependency between two artifacts. Automatically infers 'depends_on' for task-to-task edges and 'links' for governance references, while strictly enforcing subtype compatibility, spatial ancestry/subtree scoping, and DAG acyclicity.",
  helpUsage: "modie link --help",
  schema: linkSchema,
  positionals: [
    {
      name: "source",
      property: "source",
      description:
        "Source artifact tag (e.g. RULE-16, ADR-5), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required source artifact identifier. Usage: modie link <source> <target> [options]",
    },
    {
      name: "target",
      property: "target",
      description:
        "Target artifact tag (e.g. ADR-5, RULE-13), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required target artifact identifier. Usage: modie link <source> <target> [options]",
    },
  ],
  flags: {
    type: {
      type: "string",
      short: "t",
      property: "relationship",
      aliases: ["relationship"],
      placeholder: "<links|depends_on>",
      description:
        "Explicit frontmatter relationship field override ('links' or 'depends_on')",
    },
  },
  execute: async (input, context) => {
    const relationship = input.relationship ?? input.type;
    return linkArtifact({
      source: input.source,
      target: input.target,
      relationship,
      cwd: context.cwd,
    });
  },
  render: (result, context) => {
    context.stdout(result.relativePath);

    if (result.changed) {
      context.stderr(
        `✓ Linked ${result.source.tag} -> ${result.target.tag} (${result.relationship}) in ${result.relativePath}`,
      );
    } else {
      context.stderr(
        `✓ Link ${result.source.tag} -> ${result.target.tag} (${result.relationship}) already present in ${result.relativePath}`,
      );
    }
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    if (result.changed) {
      context.stderr(
        `✓ Linked ${result.source.tag} -> ${result.target.tag} (${result.relationship})`,
      );
    } else {
      context.stderr(
        `✓ Link ${result.source.tag} -> ${result.target.tag} (${result.relationship}) already present`,
      );
    }
  },
});

/**
 * CLI command handler for `modie link`.
 */
export const handleLink: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(linkCommand);

/**
 * Prints usage instructions for `modie link`.
 */
export function printLinkHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(linkCommand));
}

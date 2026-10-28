/**
 * Declarative CLI command definition for `modie unlink <source> <target> [options]`.
 * Exposes `unlink_artifact` MCP tool via automatic registry projection.
 * Complies with ADR-5, RULE-25, RULE-26, RULE-27, and RULE-36.
 */

import { z } from "zod";
import {
  unlinkArtifact,
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

export const unlinkSchema = z.object({
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

export type UnlinkInput = z.infer<typeof unlinkSchema>;

export interface UnlinkFlags {
  type?: ArtifactLinkRelationship;
  relationship?: ArtifactLinkRelationship;
  json?: boolean;
}

/**
 * Declarative definition for the root `modie unlink` command (`unlink_artifact` MCP tool).
 */
export const unlinkCommand: CliCommandDefinition<
  UnlinkFlags,
  LinkMutationResult,
  typeof unlinkSchema
> = defineCommand({
  id: "unlink_artifact",
  name: "unlink",
  usage: "modie unlink <source> <target> [options]",
  description:
    "Remove a frontmatter link or dependency from a source artifact to a target artifact",
  agentGuidance:
    "Call this tool to remove a frontmatter 'links' reference or 'depends_on' task dependency from a source artifact without modifying its Markdown body or corrupting YAML structure.",
  helpUsage: "modie unlink --help",
  schema: unlinkSchema,
  positionals: [
    {
      name: "source",
      property: "source",
      description:
        "Source artifact tag (e.g. RULE-16, ADR-5), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required source artifact identifier. Usage: modie unlink <source> <target> [options]",
    },
    {
      name: "target",
      property: "target",
      description:
        "Target artifact tag (e.g. ADR-5, RULE-13), slug, or file path",
      required: true,
      missingError:
        "Error: Missing required target artifact identifier. Usage: modie unlink <source> <target> [options]",
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
    return unlinkArtifact({
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
        `✓ Unlinked ${result.source.tag} -x-> ${result.target.tag} (${result.relationship}) in ${result.relativePath}`,
      );
    } else {
      context.stderr(
        `✓ Link ${result.source.tag} -> ${result.target.tag} (${result.relationship}) was not present in ${result.relativePath}`,
      );
    }
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));

    if (result.changed) {
      context.stderr(
        `✓ Unlinked ${result.source.tag} -x-> ${result.target.tag} (${result.relationship})`,
      );
    } else {
      context.stderr(
        `✓ Link ${result.source.tag} -> ${result.target.tag} (${result.relationship}) was not present`,
      );
    }
  },
});

/**
 * CLI command handler for `modie unlink`.
 */
export const handleUnlink: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(unlinkCommand);

/**
 * Prints usage instructions for `modie unlink`.
 */
export function printUnlinkHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(unlinkCommand));
}

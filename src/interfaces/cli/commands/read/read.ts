/**
 * Declarative CLI command definition for `modie read <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  getArtifactDetails,
  type ArtifactDetails,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
  type CliExecutionContext,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const readSchema = z.object({
  tag: z
    .string()
    .min(1, "Artifact tag or identifier is required")
    .describe("Artifact tag (e.g. RULE-1, ADR-6, TASK-12), slug, or filename"),
  raw: z
    .boolean()
    .default(false)
    .describe("Emit unparsed raw markdown content to stdout"),
});

export type ReadInput = z.infer<typeof readSchema>;

export interface ReadFlags {
  raw?: boolean;
  content?: boolean;
  json?: boolean;
}

/**
 * Standard human-readable renderer for artifact details to stderr per RULE-27.
 */
export function renderArtifactDetails(
  details: ArtifactDetails,
  context: CliExecutionContext<ReadFlags>,
): void {
  if (context.flags.raw) {
    context.stdout(details.rawContent);
    return;
  }

  // Human-readable formatted overview to stderr per RULE-27
  const statusLabel = details.isArchived ? "Archived (.ARCHIVED)" : "Active";
  context.stderr(`${details.tag}: ${details.slug}`);
  context.stderr(`Subtype:     ${details.subtype}`);
  context.stderr(`ID:          ${details.id}`);
  context.stderr(`Path:        ${details.relativePath}`);
  context.stderr(`Scope:       ${details.scope}`);
  context.stderr(`Status:      ${statusLabel}`);

  if (details.summary) {
    context.stderr(`Summary:     ${details.summary}`);
  }

  if (details.depends_on && details.depends_on.length > 0) {
    context.stderr(`Depends On:  ${details.depends_on.join(", ")}`);
  }

  if (details.links.length > 0) {
    context.stderr(`Links:       ${details.links.join(", ")}`);
  }

  if (details.context) {
    context.stderr(`\nContext:\n  ${details.context}`);
  }

  if (details.acceptanceCriteria && details.acceptanceCriteria.length > 0) {
    context.stderr(`\nAcceptance Criteria:`);
    details.acceptanceCriteria.forEach((c, idx) => {
      const box = c.completed ? "[x]" : "[ ]";
      context.stderr(`  ${idx + 1}. ${box} ${c.text}`);
    });
  }

  // If there are other sections (e.g. for ADR)
  for (const [heading, content] of Object.entries(details.sections)) {
    if (heading === "Context" || heading === "Acceptance Criteria") continue;
    context.stderr(`\n${heading}:\n  ${content.split("\n").join("\n  ")}`);
  }

  // For RULE or simple documents with no # sections
  if (Object.keys(details.sections).length === 0 && details.body) {
    context.stderr(`\nContent:\n  ${details.body.split("\n").join("\n  ")}`);
  }
}

/**
 * Standard structured JSON renderer for artifact details to stdout per RULE-26.
 */
export function renderArtifactDetailsJson(
  details: ArtifactDetails,
  context: CliExecutionContext<ReadFlags>,
): void {
  // Agent-optimized structured payload per RULE-26
  const payload: Record<string, unknown> = {
    tag: details.tag,
    subtype: details.subtype,
    id: details.id,
    slug: details.slug,
    filename: details.filename,
    filepath: details.filepath,
    relativePath: details.relativePath,
    scope: details.scope,
    isArchived: details.isArchived,
    links: details.links,
  };

  if (details.summary) {
    payload.summary = details.summary;
  }

  if (details.depends_on) {
    payload.depends_on = details.depends_on;
  }

  if (details.context) {
    payload.context = details.context;
  }

  if (details.acceptanceCriteria) {
    payload.acceptanceCriteria = details.acceptanceCriteria;
  }

  if (Object.keys(details.sections).length > 0) {
    payload.sections = details.sections;
  } else {
    payload.body = details.body;
  }

  context.stdout(JSON.stringify(payload, null, 2));
}

/**
 * Declarative definition for the `modie read` command.
 */
export const readCommand: CliCommandDefinition<
  ReadFlags,
  ArtifactDetails,
  typeof readSchema
> = defineCommand({
  id: "read",
  name: "read",
  summaryUsage: "<tag> [options]",
  usage: "modie read <tag-or-identifier> [options]",
  description: "Display artifact details or content",
  helpUsage: "modie read --help",
  schema: readSchema,
  positionals: [
    {
      name: "tag-or-identifier",
      required: true,
      missingError:
        "Error: Missing required artifact identifier. Usage: modie read <tag>",
    },
  ],
  flags: {
    raw: {
      aliases: ["content"],
    },
  },
  execute: async (input, context) => {
    return getArtifactDetails(input.tag, { cwd: context.cwd });
  },
  render: renderArtifactDetails,
  renderJson: renderArtifactDetailsJson,
});

/**
 * CLI command handler for `modie read`.
 */
export const handleRead: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(readCommand);

/**
 * Prints usage instructions for `modie read`.
 */
export function printReadHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(readCommand));
}

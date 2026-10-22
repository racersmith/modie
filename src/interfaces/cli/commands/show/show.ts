/**
 * Declarative CLI command definition for `modie show <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import {
  getArtifactDetails,
  type ArtifactDetails,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface ShowFlags {
  raw?: boolean;
  content?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie show` command.
 */
export const showCommand: CliCommandDefinition<
  ShowFlags,
  ArtifactDetails
> = {
  name: "show",
  usage: "modie show <tag-or-identifier> [options]",
  description:
    "Display artifact details or content in human or agent-optimized format.",
  helpUsage: "modie show --help",
  positionals: [
    {
      name: "tag-or-identifier",
      description:
        "Artifact tag (e.g. RULE-1, ADR-6, TASK-12), slug, or filename",
      required: true,
      missingError:
        "Error: Missing required artifact identifier. Usage: modie show <tag>",
    },
  ],
  flags: {
    raw: {
      type: "boolean",
      description: "Emit unparsed raw markdown content to stdout",
      aliases: ["content"],
    },
  },
  run: async (context) => {
    const targetIdentifier = context.positionals[0]!;
    return getArtifactDetails(targetIdentifier, { cwd: context.cwd });
  },
  render: (details, context) => {
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
    context.stderr(`Status:      ${statusLabel}`);

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
  },
  renderJson: (details, context) => {
    // Agent-optimized structured payload per RULE-26
    const payload: Record<string, unknown> = {
      tag: details.tag,
      subtype: details.subtype,
      id: details.id,
      slug: details.slug,
      filename: details.filename,
      filepath: details.filepath,
      relativePath: details.relativePath,
      isArchived: details.isArchived,
      links: details.links,
    };

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
  },
};

/**
 * CLI command handler for `modie show`.
 */
export const handleShow: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(showCommand);

/**
 * Prints usage instructions for `modie show`.
 */
export function printShowHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(showCommand));
}

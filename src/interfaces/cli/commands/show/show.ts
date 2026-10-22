/**
 * CLI command handler for `modie show <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { getArtifactDetails } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie show`.
 */
export function printShowHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie show <tag-or-identifier> [options]

Display artifact details or content in human or agent-optimized format.

Arguments:
  <tag-or-identifier>     Artifact tag (e.g. RULE-1, ADR-6, TASK-12), slug, or filename

Options:
      --json              Emit agent-optimized JSON payload to stdout
      --raw, --content    Emit unparsed raw markdown content to stdout
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie show`.
 */
export async function handleShow(
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
      raw: { type: "boolean" },
      content: { type: "boolean" },
    },
    helpUsage: "modie show --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printShowHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length === 0) {
    stderr("Error: Missing required artifact identifier. Usage: modie show <tag>");
    return 1;
  }

  if (parsed.positionals.length > 1) {
    stderr(`Error: Unexpected additional argument "${parsed.positionals[1]}".`);
    return 1;
  }

  const targetIdentifier = parsed.positionals[0]!;
  const json = Boolean(parsed.values.json);
  const raw = Boolean(parsed.values.raw || parsed.values.content);

  try {
    const details = await getArtifactDetails(targetIdentifier, { cwd });

    if (raw) {
      stdout(details.rawContent);
      return 0;
    }

    if (json) {
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

      stdout(JSON.stringify(payload, null, 2));
      return 0;
    }

    // Human-readable formatted overview to stderr per RULE-27
    const statusLabel = details.isArchived ? "Archived (.ARCHIVED)" : "Active";
    stderr(`${details.tag}: ${details.slug}`);
    stderr(`Subtype:     ${details.subtype}`);
    stderr(`ID:          ${details.id}`);
    stderr(`Path:        ${details.relativePath}`);
    stderr(`Status:      ${statusLabel}`);

    if (details.depends_on && details.depends_on.length > 0) {
      stderr(`Depends On:  ${details.depends_on.join(", ")}`);
    }

    if (details.links.length > 0) {
      stderr(`Links:       ${details.links.join(", ")}`);
    }

    if (details.context) {
      stderr(`\nContext:\n  ${details.context}`);
    }

    if (details.acceptanceCriteria && details.acceptanceCriteria.length > 0) {
      stderr(`\nAcceptance Criteria:`);
      details.acceptanceCriteria.forEach((c, idx) => {
        const box = c.completed ? "[x]" : "[ ]";
        stderr(`  ${idx + 1}. ${box} ${c.text}`);
      });
    }

    // If there are other sections (e.g. for ADR)
    for (const [heading, content] of Object.entries(details.sections)) {
      if (heading === "Context" || heading === "Acceptance Criteria") continue;
      stderr(`\n${heading}:\n  ${content.split("\n").join("\n  ")}`);
    }

    // For RULE or simple documents with no # sections
    if (Object.keys(details.sections).length === 0 && details.body) {
      stderr(`\nContent:\n  ${details.body.split("\n").join("\n  ")}`);
    }

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}

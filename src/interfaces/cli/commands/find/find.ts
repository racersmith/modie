/**
 * CLI command handler for `modie find <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { resolveArtifactByTag } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie find`.
 */
export function printFindHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie find <tag-or-identifier> [options]

Find the filesystem path of an indexable artifact by canonical tag (RULE-29).

Arguments:
  <tag-or-identifier>     Artifact tag (e.g. RULE-1, ADR-6, TASK-12), slug, or filename

Options:
      --absolute          Emit absolute file path instead of relative path
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie find`.
 */
export async function handleFind(
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
      absolute: { type: "boolean" },
    },
    helpUsage: "modie find --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printFindHelp(stderr);
    return 0;
  }

  if (parsed.positionals.length === 0) {
    stderr("Error: Missing required artifact identifier. Usage: modie find <tag>");
    return 1;
  }

  if (parsed.positionals.length > 1) {
    stderr(`Error: Unexpected additional argument "${parsed.positionals[1]}".`);
    return 1;
  }

  const targetIdentifier = parsed.positionals[0]!;
  const json = Boolean(parsed.values.json);
  const absolute = Boolean(parsed.values.absolute);

  try {
    const artifact = await resolveArtifactByTag(targetIdentifier, { cwd });

    if (json) {
      stdout(JSON.stringify(artifact, null, 2));
      return 0;
    }

    const outputPath = absolute ? artifact.filepath : artifact.relativePath;
    stdout(outputPath);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}

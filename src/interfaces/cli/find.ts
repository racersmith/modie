/**
 * CLI command handler for `modie find <tag> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { resolveArtifactByTag } from "../../core/index.ts";
import type { CliIoOptions } from "./types.ts";

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

  let targetIdentifier: string | undefined;
  let json = false;
  let absolute = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "-h" || arg === "--help") {
      printFindHelp(stderr);
      return 0;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--absolute") {
      absolute = true;
      continue;
    }

    if (arg.startsWith("-")) {
      stderr(
        `Error: Unknown flag "${arg}". Run 'modie find --help' for usage.`,
      );
      return 1;
    }

    if (!targetIdentifier) {
      targetIdentifier = arg;
    } else {
      stderr(`Error: Unexpected additional argument "${arg}".`);
      return 1;
    }
  }

  if (!targetIdentifier) {
    stderr("Error: Missing required artifact identifier. Usage: modie find <tag>");
    return 1;
  }

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

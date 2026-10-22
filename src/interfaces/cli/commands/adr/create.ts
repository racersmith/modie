/**
 * CLI command handler for `modie adr create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createAdr, type CreateAdrOptions } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie adr create`.
 */
export function printAdrCreateHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie adr create <title> [options]

Arguments:
  <title>                 Title of the architectural decision record (e.g. "Subtype Directory Partitioning")

Options:
  -s, --scope <dir>       Target scope directory (defaults to current working directory)
  -c, --context <text>    Problem statement and architectural motivation (ADR-4)
  -a, --alternatives <text>
                          Alternatives considered and trade-off evaluations (ADR-4)
  -d, --decision <text>   Adopted decision specification (ADR-4)
  -l, --link, --links <targets>
                          ADR and RULE link targets (repeat flag or use comma-separated list) (RULE-14, RULE-17)
      --flat              Create flat ADR file without .adrs container (RULE-8)
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie adr create`.
 */
export async function handleAdrCreate(
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
      flat: { type: "boolean" },
      scope: { type: "string", short: "s" },
      context: { type: "string", short: "c" },
      alternatives: { type: "string", short: "a" },
      decision: { type: "string", short: "d" },
      link: { type: "string", multiple: true, short: "l" },
      links: { type: "string", multiple: true },
    },
    helpUsage: "modie adr create --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printAdrCreateHelp(stderr);
    return 0;
  }

  const title = parsed.positionals.join(" ").trim();
  if (!title) {
    stderr(
      "Error: Missing required ADR title. Usage: modie adr create <title> [options]",
    );
    return 1;
  }

  // Aggregate link values from repeated -l/--link and comma-separated --links
  const rawLinks: string[] = [
    ...(parsed.values.link ?? []),
    ...(parsed.values.links ?? []),
  ];
  const links: string[] = [];
  for (const item of rawLinks) {
    links.push(...item.split(",").map((s) => s.trim()).filter(Boolean));
  }

  const adrOptions: CreateAdrOptions = {
    title,
    scopeDir: parsed.values.scope,
    context: parsed.values.context,
    alternatives: parsed.values.alternatives,
    decision: parsed.values.decision,
    links: links.length > 0 ? links : undefined,
    useSubtypeContainer: !parsed.values.flat,
    cwd,
  };

  try {
    const result = await createAdr(adrOptions);

    if (parsed.values.json) {
      // Machine-parsable JSON output strictly to stdout (RULE-27)
      stdout(
        JSON.stringify(
          {
            id: result.artifact.id,
            tag: result.tag,
            slug: result.artifact.slug,
            filename: result.filename,
            filepath: result.filepath,
            relativePath: result.relativePath,
            title: result.artifact.title,
            links: result.artifact.links,
            context: result.artifact.context,
            alternatives: result.artifact.alternatives,
            decision: result.artifact.decision,
          },
          null,
          2,
        ),
      );
      // Status message strictly to stderr (RULE-27)
      stderr(
        `✓ Created ADR ${result.tag} (${result.relativePath})`,
      );
    } else {
      // Machine-parsable relative path strictly to stdout (RULE-27)
      stdout(result.relativePath);
      // Human diagnostic status strictly to stderr (RULE-27)
      stderr(`✓ Created ADR ${result.tag}: ${result.filename}`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}

/**
 * CLI command handler for `modie rule create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createRule, type CreateRuleOptions } from "../../../../core/index.ts";
import { parseCliArgs } from "../../arg-parser.ts";
import type { CliIoOptions } from "../../types.ts";

/**
 * Prints usage instructions for `modie rule create`.
 */
export function printRuleCreateHelp(stderr: (msg: string) => void): void {
  stderr(`Usage: modie rule create <title> [options]

Arguments:
  <title>                 Title of the rule to create (e.g. "Rule Verification Tagging")

Options:
  -s, --scope <dir>       Target scope directory (defaults to current working directory)
  -c, --context <text>    Invariant assertion claim text (RULE-3, RULE-11)
  -l, --link, --links <targets>
                          ADR link targets (repeat flag or use comma-separated list) (RULE-13, RULE-16)
      --flat              Create flat rule file without .rules container (RULE-8)
      --json              Emit machine-parsable JSON payload to stdout (RULE-27)
  -h, --help              Show this help message
`);
}

/**
 * Handles argument parsing and execution for `modie rule create`.
 */
export async function handleRuleCreate(
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
      assertion: { type: "string" },
      link: { type: "string", multiple: true, short: "l" },
      links: { type: "string", multiple: true },
    },
    helpUsage: "modie rule create --help",
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  if (parsed.values.help) {
    printRuleCreateHelp(stderr);
    return 0;
  }

  const title = parsed.positionals.join(" ").trim();
  if (!title) {
    stderr(
      "Error: Missing required rule title. Usage: modie rule create <title> [options]",
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

  const ruleOptions: CreateRuleOptions = {
    title,
    scopeDir: parsed.values.scope,
    context: parsed.values.context ?? parsed.values.assertion,
    links: links.length > 0 ? links : undefined,
    useSubtypeContainer: !parsed.values.flat,
    cwd,
  };

  try {
    const result = await createRule(ruleOptions);

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
            assertion: result.artifact.assertion,
          },
          null,
          2,
        ),
      );
      // Status message strictly to stderr (RULE-27)
      stderr(
        `✓ Created rule ${result.tag} (${result.relativePath})`,
      );
    } else {
      // Machine-parsable relative path strictly to stdout (RULE-27)
      stdout(result.relativePath);
      // Human diagnostic status strictly to stderr (RULE-27)
      stderr(`✓ Created rule ${result.tag}: ${result.filename}`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Error: ${message}`);
    return 1;
  }
}

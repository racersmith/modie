/**
 * CLI command handler for `modie rule create <title> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { createRule, type CreateRuleOptions } from "../../core/index.ts";
import type { CliIoOptions } from "./types.ts";

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

  const titleWords: string[] = [];
  let scopeDir: string | undefined;
  let context: string | undefined;
  const links: string[] = [];
  let useSubtypeContainer = true;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "-h" || arg === "--help") {
      printRuleCreateHelp(stderr);
      return 0;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--flat") {
      useSubtypeContainer = false;
      continue;
    }

    if (arg === "-s" || arg === "--scope") {
      scopeDir = args[++i];
      if (!scopeDir) {
        stderr("Error: Missing argument for --scope flag.");
        return 1;
      }
      continue;
    }

    if (arg === "-c" || arg === "--context" || arg === "--assertion") {
      context = args[++i];
      if (!context) {
        stderr("Error: Missing argument for --context flag.");
        return 1;
      }
      continue;
    }

    if (arg === "-l" || arg === "--link" || arg === "--links") {
      const val = args[++i];
      if (!val) {
        stderr("Error: Missing argument for --links flag.");
        return 1;
      }
      if (arg === "--link") {
        links.push(val.trim());
      } else {
        links.push(
          ...val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      continue;
    }

    if (arg.startsWith("-")) {
      stderr(
        `Error: Unknown flag "${arg}". Run 'modie rule create --help' for usage.`,
      );
      return 1;
    }

    titleWords.push(arg);
  }

  const title = titleWords.join(" ").trim();
  if (!title) {
    stderr(
      "Error: Missing required rule title. Usage: modie rule create <title> [options]",
    );
    return 1;
  }

  const ruleOptions: CreateRuleOptions = {
    title,
    scopeDir,
    context,
    links: links.length > 0 ? links : undefined,
    useSubtypeContainer,
    cwd,
  };

  try {
    const result = await createRule(ruleOptions);

    if (json) {
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

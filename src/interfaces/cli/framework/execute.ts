/**
 * Standard declarative CLI execution wrapper enforcing RULE-25 and RULE-27.
 */

import type { ParseArgsConfig } from "node:util";
import { parseCliArgs } from "../arg-parser.ts";
import type { CliIoOptions, CliCommandResult, CommandHandler } from "../types.ts";
import { generateCommandHelp } from "./help.ts";
import type {
  CliCommandDefinition,
  CliExecutionContext,
  CliFlagDefinition,
} from "./types.ts";

/**
 * Builds the ParseArgsConfig options map from declared command flags.
 */
function buildParseOptions(
  declaredFlags: Record<string, CliFlagDefinition> = {},
): ParseArgsConfig["options"] {
  const optionsMap: NonNullable<ParseArgsConfig["options"]> = {};

  for (const [flagName, flagDef] of Object.entries(declaredFlags)) {
    const entry: { type: "string" | "boolean"; short?: string; multiple?: boolean } = {
      type: flagDef.type,
    };
    if (flagDef.short !== undefined) {
      entry.short = flagDef.short;
    }
    if (flagDef.multiple !== undefined) {
      entry.multiple = flagDef.multiple;
    }
    optionsMap[flagName] = entry;

    if (flagDef.aliases) {
      for (const alias of flagDef.aliases) {
        const aliasEntry: { type: "string" | "boolean"; multiple?: boolean } = {
          type: flagDef.type,
        };
        if (flagDef.multiple !== undefined) {
          aliasEntry.multiple = flagDef.multiple;
        }
        optionsMap[alias] = aliasEntry;
      }
    }
  }

  // Always register standard help and json flags if not already defined
  if (!optionsMap.help) {
    optionsMap.help = { type: "boolean", short: "h" };
  }
  if (!optionsMap.json) {
    optionsMap.json = { type: "boolean" };
  }

  return optionsMap;
}

/**
 * Normalizes parsed flag values by merging aliases, applying defaults, and standardizing booleans.
 */
function normalizeFlags(
  parsedValues: Record<string, any>,
  declaredFlags: Record<string, CliFlagDefinition> = {},
): Record<string, any> {
  const normalized: Record<string, any> = { ...parsedValues };

  for (const [flagName, flagDef] of Object.entries(declaredFlags)) {
    if (flagDef.default !== undefined && normalized[flagName] === undefined) {
      normalized[flagName] = flagDef.default;
    }

    if (flagDef.aliases && flagDef.aliases.length > 0) {
      if (flagDef.type === "boolean") {
        const isTrue = Boolean(
          normalized[flagName] ||
            flagDef.aliases.some((a) => normalized[a]),
        );
        normalized[flagName] = isTrue;
      } else if (normalized[flagName] === undefined) {
        for (const alias of flagDef.aliases) {
          if (normalized[alias] !== undefined) {
            normalized[flagName] = normalized[alias];
            break;
          }
        }
      }
    }
  }

  return normalized;
}

/**
 * Executes a declarative CLI command definition against command arguments and I/O sinks.
 */
export async function executeCliCommand<TFlags = Record<string, any>, TResult = any>(
  definition: CliCommandDefinition<TFlags, TResult>,
  args: string[],
  options: CliIoOptions = {},
): Promise<number> {
  const stdout =
    options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const stderr =
    options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
  const cwd = options.cwd ?? process.cwd();

  const parseOptions = buildParseOptions(definition.flags);
  const helpUsage =
    definition.helpUsage ??
    (definition.usage ? `${definition.usage.split(" ")[0]} ${definition.name} --help` : undefined);

  const parsed = parseCliArgs({
    args,
    options: parseOptions,
    helpUsage,
    stderr,
  });

  if (!parsed) {
    return 1;
  }

  // 1. Handle --help / -h
  if (parsed.values.help) {
    if (definition.help) {
      definition.help(stderr);
    } else {
      stderr(generateCommandHelp(definition));
    }
    return 0;
  }

  const normalizedFlags = normalizeFlags(
    parsed.values,
    definition.flags,
  ) as TFlags & { help?: boolean; json?: boolean };

  // 2. Validate positional arguments
  const positionals = parsed.positionals;
  const declaredPositionals = definition.positionals ?? [];
  const hasVariadic = declaredPositionals.some((p) => p.variadic);

  for (let i = 0; i < declaredPositionals.length; i++) {
    const posDef = declaredPositionals[i]!;
    if (posDef.required) {
      const val = posDef.variadic
        ? positionals.slice(i).join(" ").trim()
        : positionals[i]?.trim();

      if (!val) {
        if (posDef.missingError) {
          stderr(posDef.missingError);
        } else {
          const usageHint = definition.usage ? ` Usage: ${definition.usage}` : "";
          stderr(`Error: Missing required ${posDef.name}.${usageHint}`);
        }
        return 1;
      }
    }
  }

  if (!hasVariadic) {
    const maxPos = declaredPositionals.length;
    if (positionals.length > maxPos) {
      const extraArg = positionals[maxPos];
      if (maxPos === 0) {
        stderr(`Error: Unexpected argument "${extraArg}".`);
      } else {
        stderr(`Error: Unexpected additional argument "${extraArg}".`);
      }
      return 1;
    }
  }

  const context: CliExecutionContext<TFlags> = {
    args,
    positionals,
    flags: normalizedFlags,
    stdout,
    stderr,
    cwd,
    io: options,
  };

  try {
    const result = await definition.run(context);

    if (typeof result === "number") {
      return result;
    }

    if (normalizedFlags.json) {
      if (definition.renderJson) {
        definition.renderJson(result as TResult, context);
      } else if (result !== undefined) {
        stdout(JSON.stringify(result, null, 2));
      }
    } else {
      if (definition.render) {
        definition.render(result as TResult, context);
      }
    }

    return 0;
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = rawMessage.startsWith("Error:")
      ? rawMessage
      : `Error: ${rawMessage}`;
    stderr(message);
    return 1;
  }

}

/**
 * Creates a standard CommandHandler function wrapping a declarative CliCommandDefinition.
 */
export function createCommandHandler<TFlags = Record<string, any>, TResult = any>(
  definition: CliCommandDefinition<TFlags, TResult>,
): (args: string[], options?: CliIoOptions) => Promise<number> {
  return (args: string[], options: CliIoOptions = {}) =>
    executeCliCommand(definition, args, options);
}

/**
 * Standardized CLI help generation from declarative command definitions.
 * Complies with RULE-27.
 */

import type { CliCommandDefinition, CliFlagDefinition } from "./types.ts";

/**
 * Formats flag invocation tokens (e.g. "-s, --scope <dir>" or "    --flat").
 */
function formatFlagTokens(name: string, flag: CliFlagDefinition): string {
  const parts: string[] = [];

  if (flag.short) {
    parts.push(`-${flag.short}`);
  }

  const longTokens = [`--${name}`];
  if (flag.aliases && flag.aliases.length > 0) {
    for (const alias of flag.aliases) {
      longTokens.push(`--${alias}`);
    }
  }

  let longStr = longTokens.join(", ");
  if (flag.placeholder) {
    longStr += ` ${flag.placeholder}`;
  }

  if (flag.short) {
    return `-${flag.short}, ${longStr}`;
  }

  return `    ${longStr}`;
}

/**
 * Generates canonical, aligned help text for a declared CLI command.
 */
export function generateCommandHelp(
  definition: CliCommandDefinition<any, any>,
): string {
  const sections: string[] = [];

  // 1. Usage line
  const usage = definition.usage || `modie ${definition.name} [options]`;
  sections.push(`Usage: ${usage}`);

  // 2. Optional description
  if (definition.description) {
    sections.push(`\n${definition.description}`);
  }

  // 3. Arguments section
  if (definition.positionals && definition.positionals.length > 0) {
    sections.push("\nArguments:");
    const maxArgLen = Math.max(
      ...definition.positionals.map((p) => `<${p.name}>`.length),
      22,
    );
    for (const pos of definition.positionals) {
      const token = `  <${pos.name}>`.padEnd(maxArgLen + 4);
      sections.push(`${token}${pos.description}`);
    }
  }

  // 4. Options section
  sections.push("\nOptions:");

  const standardFlags: Record<string, CliFlagDefinition> = {
    ...(definition.flags ?? {}),
  };

  if (!standardFlags.json) {
    standardFlags.json = {
      type: "boolean",
      description: "Emit machine-parsable JSON payload to stdout",
    };
  }

  if (!standardFlags.help) {
    standardFlags.help = {
      type: "boolean",
      short: "h",
      description: "Show this help message",
    };
  }

  const formattedFlags: Array<{ token: string; description: string }> = [];

  for (const [name, flag] of Object.entries(standardFlags)) {
    // Avoid re-listing aliases as independent rows
    const isAliasOfAnother = Object.entries(standardFlags).some(
      ([otherName, otherFlag]) =>
        otherName !== name && otherFlag.aliases?.includes(name),
    );
    if (isAliasOfAnother) continue;

    formattedFlags.push({
      token: `  ${formatFlagTokens(name, flag)}`,
      description: flag.description,
    });
  }

  const maxTokenLen = 26;

  for (const item of formattedFlags) {
    if (item.token.length >= maxTokenLen) {
      sections.push(
        `${item.token}\n${" ".repeat(maxTokenLen)}${item.description}`,
      );
    } else {
      sections.push(`${item.token.padEnd(maxTokenLen)}${item.description}`);
    }
  }

  return sections.join("\n") + "\n";
}

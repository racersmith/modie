/**
 * Standard zero-dependency CLI argument parser wrapping node:util.parseArgs.
 * Formats errors for strict RULE-27 compliance.
 */

import { parseArgs, type ParseArgsConfig } from "node:util";

export interface ParseCliArgsOptions {
  args: string[];
  options?: ParseArgsConfig["options"];
  allowPositionals?: boolean;
  helpUsage?: string;
  stderr: (msg: string) => void;
}

export interface ParsedCliArgs {
  values: Record<string, any>;
  positionals: string[];
}

/**
 * Safely parses CLI arguments using node:util.parseArgs.
 * Emits standardized error messages to stderr upon syntax errors.
 */
export function parseCliArgs(config: ParseCliArgsOptions): ParsedCliArgs | null {
  try {
    const result = parseArgs({
      args: config.args,
      options: config.options,
      strict: true,
      allowPositionals: config.allowPositionals ?? true,
    });
    return result;
  } catch (error: any) {
    if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      const match = error.message.match(/Unknown option '([^']+)'/);
      const flag = match ? match[1] : "";
      const usageHint = config.helpUsage
        ? ` Run '${config.helpUsage}' for usage.`
        : "";
      config.stderr(`Error: Unknown flag "${flag}".${usageHint}`);
      return null;
    }

    if (error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
      const match = error.message.match(/Option '([^\s']+)/);
      const flag = match ? match[1] : "";
      config.stderr(`Error: Missing argument for ${flag} flag.`);
      return null;
    }

    config.stderr(`Error: ${error.message}`);
    return null;
  }
}

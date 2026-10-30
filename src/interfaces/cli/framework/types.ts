/**
 * Type-safe declarative CLI command and argument definition schema.
 * Enforces RULE-25 (interface core decoupling) and RULE-27 (stdout/stderr separation).
 */

import type { z } from "zod";
import type { CliIoOptions } from "../types.ts";

export interface CliFlagDefinition {
  /**
   * Data type for the option flag.
   */
  type: "string" | "boolean";

  /**
   * Single-character short alias (e.g. "s" for -s).
   */
  short?: string;

  /**
   * Human-readable description printed in command help.
   */
  description: string;

  /**
   * Whether the flag can be passed multiple times (accumulates array of values).
   */
  multiple?: boolean;

  /**
   * Placeholder name shown in help usage (e.g. "<dir>", "<text>").
   */
  placeholder?: string;

  /**
   * Default value if omitted.
   */
  default?: any;

  /**
   * Alternate flag names (e.g. ["links"] for flag "link").
   */
  aliases?: string[];

  /**
   * Target property in the Zod schema to map this flag into.
   */
  property?: string;

  /**
   * Whether string values should be split on commas when mapping to an array schema property.
   * Defaults to true unless verbatim preservation is required.
   */
  splitCommas?: boolean;
}

export interface CliPositionalDefinition {
  /**
   * Identifier name of the positional argument (e.g. "title", "id-or-path").
   */
  name: string;

  /**
   * Description shown in command help.
   */
  description: string;

  /**
   * Whether the positional argument is mandatory.
   * If true, missing argument halts execution with error before handler is called.
   */
  required?: boolean;

  /**
   * Whether this positional consumes all remaining tokens (e.g. multi-word title).
   */
  variadic?: boolean;

  /**
   * Custom error message emitted if this required positional argument is omitted.
   */
  missingError?: string;

  /**
   * Target property in the Zod schema to map this positional argument into.
   */
  property?: string;
}

export interface CliExecutionContext<TFlags = Record<string, any>> {
  /**
   * Raw argv slice passed to the command.
   */
  args: string[];

  /**
   * Parsed positional argument strings.
   */
  positionals: string[];

  /**
   * Parsed flag values (including merged aliases and defaults).
   */
  flags: TFlags & {
    help?: boolean;
    json?: boolean;
  };

  /**
   * Machine-parsable stdout sink (RULE-27).
   */
  stdout: (msg: string) => void;

  /**
   * Human diagnostics / logs / progress stderr sink (RULE-27).
   */
  stderr: (msg: string) => void;

  /**
   * Working directory for command execution.
   */
  cwd: string;

  /**
   * Original I/O options passed from caller.
   */
  io: CliIoOptions;
}

export interface CliCommandDefinition<
  TFlags = Record<string, any>,
  TResult = any,
  TSchema extends z.ZodObject<any> = any,
> {
  /**
   * Canonical name of the command or subcommand (e.g. "create", "list").
   */
  name: string;

  /**
   * Optional logical namespace for grouping subcommands (e.g. "task", "rule", "adr").
   * Omitted for root-level direct commands.
   */
  namespace?: string;

  /**
   * Command name aliases within its namespace or root scope (e.g. ["ls"] for "list", ["finish"] for "complete").
   */
  aliases?: string[];

  /**
   * Top-level root command aliases that route directly to this command
   * (e.g. ["backlog"] routing directly to `task list`).
   */
  rootAliases?: string[];

  /**
   * Short argument summary used when formatting command tables in help outputs
   * (e.g. "<title>", "<tag> [options]", "<id> --item <n>").
   */
  summaryUsage?: string;

  /**
   * Canonical action identifier (e.g. "task_create", "find").
   * Used as the tool name when projected into protocol interfaces (MCP).
   */
  id?: string;

  /**
   * Short description of the command's purpose.
   */
  description?: string;

  /**
   * Optional guidance for AI agents on when and why to invoke this command/tool.
   */
  agentGuidance?: string;

  /**
   * Full usage banner (e.g. "modie rule create <title> [options]").
   */
  usage?: string;

  /**
   * Optional custom usage hint shown upon syntax errors (defaults to `${usage || name} --help`).
   */
  helpUsage?: string;

  /**
   * Declared positional arguments.
   */
  positionals?: CliPositionalDefinition[];

  /**
   * Declared option flags.
   */
  flags?: Record<string, CliFlagDefinition>;

  /**
   * Declarative Zod schema defining the input contract.
   * Shared between CLI argument adapter and protocol (MCP) tool registrations.
   */
  schema?: TSchema;

  /**
   * Optional custom help formatter override.
   * If omitted, standardized help is generated automatically from definition metadata.
   */
  help?: (stderr: (msg: string) => void) => void;

  /**
   * Typed domain execution handler receiving parsed and validated Zod inputs.
   */
  execute?: (
    input: z.infer<TSchema>,
    context: CliExecutionContext<TFlags>,
  ) => Promise<TResult | number | void> | TResult | number | void;

  /**
   * Core CLI execution handler.
   * Returns a structured result payload, a numeric exit code, or void.
   */
  run: (
    context: CliExecutionContext<TFlags>,
  ) => Promise<TResult | number | void> | TResult | number | void;

  /**
   * Presentation renderer for standard (non-JSON) mode.
   * Outputs machine data to stdout and diagnostics to stderr per RULE-27.
   */
  render?: (result: TResult, context: CliExecutionContext<TFlags>) => void;

  /**
   * Presentation renderer for `--json` mode.
   * If omitted, default behavior outputs `JSON.stringify(result, null, 2)` to stdout.
   */
  renderJson?: (result: TResult, context: CliExecutionContext<TFlags>) => void;
}

export type DefineCommandOptions<
  TSchema extends z.ZodObject<any>,
  TResult = any,
  TFlags = Record<string, any>,
> = Omit<CliCommandDefinition<TFlags, TResult, TSchema>, "run"> & {
  schema: TSchema;
  execute: (
    input: z.infer<TSchema>,
    context: CliExecutionContext<TFlags>,
  ) => Promise<TResult | number | void> | TResult | number | void;
  run?: (
    context: CliExecutionContext<TFlags>,
  ) => Promise<TResult | number | void> | TResult | number | void;
};

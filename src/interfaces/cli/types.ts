/**
 * CLI interface types and I/O options.
 * Enforces RULE-27 (stdout/stderr separation).
 */

export interface CliIoOptions {
  /**
   * Standard output sink for machine-parsable data payloads (RULE-27).
   */
  stdout?: (msg: string) => void;

  /**
   * Standard error sink for diagnostics, human status, and logs (RULE-27).
   */
  stderr?: (msg: string) => void;

  /**
   * Working directory override (defaults to process.cwd()).
   */
  cwd?: string;
}

export interface CliCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandHandler = (
  args: string[],
  options?: CliIoOptions,
) => Promise<number>;

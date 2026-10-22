/**
 * Test utilities and harness helpers for Modie CLI integration tests.
 * Captures stdout, stderr, and exit codes in-process.
 */

import { runCli } from "./cli.ts";
import type { CliIoOptions } from "./types.ts";

export interface CapturedCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Helper to capture stdout, stderr, and exitCode from in-process CLI execution.
 */
export async function captureCli(
  args: string[],
  cwd: string = process.cwd(),
): Promise<CapturedCliResult> {
  let stdout = "";
  let stderr = "";

  const io: CliIoOptions = {
    stdout: (msg) => {
      stdout += (stdout ? "\n" : "") + msg;
    },
    stderr: (msg) => {
      stderr += (stderr ? "\n" : "") + msg;
    },
    cwd,
  };

  const exitCode = await runCli(args, io);
  return { exitCode, stdout, stderr };
}

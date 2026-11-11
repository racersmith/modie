import { join } from "node:path";
import { runCli } from "./cli.ts";
import type { CliIoOptions } from "./types.ts";

export { runCli };
export type { CliIoOptions };

export interface CapturedCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Helper to capture stdout, stderr, and exitCode from in-process CLI execution.
 * Accepts either a working directory path or a workspace object containing cwd.
 */
export async function captureCli(
  args: string[],
  cwdOrWorkspace: string | { cwd: string } = process.cwd(),
): Promise<CapturedCliResult> {
  const cwd =
    typeof cwdOrWorkspace === "string" ? cwdOrWorkspace : cwdOrWorkspace.cwd;
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

/**
 * Executes the CLI binary as a subprocess with the given arguments and working directory.
 * Accepts either a working directory path or a workspace object containing cwd.
 */
export async function execBin(
  args: string[],
  cwdOrWorkspace: string | { cwd: string } = process.cwd(),
): Promise<{ stdout: string; stderr: string }> {
  const cwd =
    typeof cwdOrWorkspace === "string" ? cwdOrWorkspace : cwdOrWorkspace.cwd;
  const binPath = join(import.meta.dir, "bin.ts");
  const proc = Bun.spawn([process.execPath, binPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const error = new Error(
      `Command failed with exit code ${exitCode}: ${stderr}`,
    );
    Object.assign(error, { code: exitCode, exitCode, stdout, stderr });
    throw error;
  }
  return { stdout, stderr };
}

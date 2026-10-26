import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  createFixtureWorkspace,
  makeTestTag,
  type CreateAdrOptions,
  type CreateFixtureArtifactOptions,
  type CreateRuleOptions,
  type CreateTaskOptions,
  type CreatedFixtureArtifact,
  type FixtureWorkspace,
  type TaskCriterionItem,
} from "../../core/testing/index.ts";
import { runCli } from "./cli.ts";
import type { CliIoOptions } from "./types.ts";

const execFileAsync = promisify(execFile);

export { makeTestTag };
export type {
  CreateAdrOptions,
  CreateFixtureArtifactOptions,
  CreateRuleOptions,
  CreateTaskOptions,
  CreatedFixtureArtifact,
  FixtureWorkspace,
  TaskCriterionItem,
};

export interface CapturedCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface TestWorkspace extends FixtureWorkspace {
  binPath: string;
  captureCli(args: string[]): Promise<CapturedCliResult>;
  execBin(args: string[]): Promise<{ stdout: string; stderr: string }>;
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

/**
 * Creates an isolated temporary test workspace with helpers for creating
 * test-scoped fixture artifacts and executing CLI commands in-process and via subprocess.
 * Enforces RULE-34 (Fixture-Based Test Isolation) and RULE-25 (Interface-Core Decoupling).
 */
export async function createTestWorkspace(
  prefix: string = "modie-cli-test-",
): Promise<TestWorkspace> {
  const baseWorkspace = await createFixtureWorkspace(prefix);
  const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");

  return {
    ...baseWorkspace,
    binPath,
    async captureCli(args: string[]): Promise<CapturedCliResult> {
      return captureCli(args, baseWorkspace.cwd);
    },
    async execBin(args: string[]): Promise<{ stdout: string; stderr: string }> {
      return execFileAsync(process.execPath, [binPath, ...args], { cwd: baseWorkspace.cwd });
    },
  };
}

/**
 * Integration and unit tests for the Modie CLI harness and global routing.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { captureCli } from "./test-utils.ts";

describe("CLI Harness - Global Commands & Stream Separation (RULE-27)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit global help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("modie <command>");
    expect(stderr).toContain("rule create <title>");
    expect(stderr).toContain("task create <title>");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit version to stdout with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("0.1.0");
    expect(stderr).toBe("");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit error to stderr on unknown command with non-zero exit code", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["unknown-command"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown command "unknown-command"');
  });

  // @verifies RULE-27
  it("[RULE-27] should emit task subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["task", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie task <subcommand>");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit rule subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["rule", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie rule <subcommand>");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown task subcommand", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["task", "bogus"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown task subcommand "bogus"');
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown rule subcommand", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["rule", "bogus"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown rule subcommand "bogus"');
  });
});

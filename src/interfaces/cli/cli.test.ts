/**
 * Integration and unit tests for the Modie CLI harness and global routing.
 */

import { describe, expect, it } from "bun:test";
import { captureCli, createTestWorkspace, makeTestTag } from "./test-utils.ts";

describe("CLI Harness - Global Commands & Stream Separation (RULE-25, RULE-27, RULE-34, RULE-35)", () => {
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

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should route top-level backlog command to task list in fixture workspace", async () => {
    const workspace = await createTestWorkspace("modie-cli-backlog-");
    const task = await workspace.createTask({
      id: "TEST-1",
      slug: "fixture-backlog-item",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "backlog",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Active Task Queue");
    expect(stderr).toContain(task.tag);

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should route task backlog subcommand alias to task list in fixture workspace", async () => {
    const workspace = await createTestWorkspace("modie-cli-backlog-alias-");
    const task = await workspace.createTask({
      id: "TEST-1",
      slug: "fixture-backlog-item",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "backlog",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Active Task Queue");
    expect(stderr).toContain(task.tag);

    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should emit machine JSON array when backlog --json is passed in fixture workspace", async () => {
    const workspace = await createTestWorkspace("modie-cli-backlog-json-");
    const task = await workspace.createTask({
      id: "TEST-1",
      slug: "fixture-backlog-item",
    });

    const { exitCode, stdout } = await workspace.captureCli([
      "backlog",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].fullTaskId).toBe(task.tag);

    await workspace.cleanup();
  });

  // @verifies RULE-27
  it("[RULE-27] should emit adr subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["adr", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie adr <subcommand>");
    expect(stderr).toContain("create <title>");
    expect(stderr).toContain("list [options]");
    expect(stderr).toContain("archive <tag>");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown adr subcommand", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["adr", "bogus"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown adr subcommand "bogus"');
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should dynamically build router and dispatch commands and aliases", async () => {
    const { buildCliRouter, runCli } = await import("./cli.ts");
    const { defineCommand } = await import("./framework/index.ts");
    const { z } = await import("zod");

    let executedDirect = false;
    let executedSub = false;

    const dummyDirect = defineCommand({
      name: "frob",
      aliases: ["fr"],
      rootAliases: ["frobnicate"],
      summaryUsage: "[options]",
      description: "Frobnicate a widget",
      schema: z.object({}),
      execute: () => {
        executedDirect = true;
      },
    });

    const dummySub = defineCommand({
      namespace: "gizmo",
      name: "tweak",
      aliases: ["tw"],
      summaryUsage: "<item>",
      description: "Tweak a gizmo",
      schema: z.object({
        item: z.string().optional(),
      }),
      execute: () => {
        executedSub = true;
      },
    });

    const customCommands = [dummyDirect, dummySub];
    const router = buildCliRouter(customCommands);

    expect(router.directCommands["frob"]).toBeDefined();
    expect(router.directCommands["fr"]).toBeDefined();
    expect(router.directCommands["frobnicate"]).toBeDefined();
    expect(router.namespaces["gizmo"]).toBeDefined();
    expect(router.namespaces["gizmo"]?.commands["tweak"]).toBeDefined();
    expect(router.namespaces["gizmo"]?.aliases["tw"]).toBe("tweak");

    // Execute via runCli with custom registry
    const stderrLines: string[] = [];
    const exit1 = await runCli(["frobnicate"], { stderr: (msg) => stderrLines.push(msg) }, customCommands);
    expect(exit1).toBe(0);
    expect(executedDirect).toBe(true);

    const exit2 = await runCli(["gizmo", "tw"], { stderr: (msg) => stderrLines.push(msg) }, customCommands);
    expect(exit2).toBe(0);
    expect(executedSub).toBe(true);

    const helpOutput: string[] = [];
    const exitHelp = await runCli(["--help"], { stderr: (msg) => helpOutput.push(msg) }, customCommands);
    expect(exitHelp).toBe(0);
    const joinedHelp = helpOutput.join("\n");
    expect(joinedHelp).toContain("frob [options]");
    expect(joinedHelp).toContain("(alias: fr)");
    expect(joinedHelp).toContain("frobnicate [options]");
    expect(joinedHelp).toContain("(alias: frob)");
    expect(joinedHelp).toContain("gizmo tweak <item>");
    expect(joinedHelp).toContain("(alias: tw)");
  });
});

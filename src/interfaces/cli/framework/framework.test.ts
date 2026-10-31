import { describe, expect, it } from "bun:test";
import {
  executeCliCommand,
  generateCommandHelp,
  type CliCommandDefinition,
} from "./index.ts";
import { ruleCreateCommand } from "../commands/rule/create.ts";
import { adrCreateCommand } from "../commands/adr/create.ts";
import { taskCreateCommand } from "../commands/task/create.ts";
import { taskListCommand } from "../commands/task/list.ts";
import { taskCheckCommand } from "../commands/task/check.ts";
import { taskStatusCommand } from "../commands/task/status.ts";
import { findCommand } from "../commands/find/find.ts";
import { readCommand } from "../commands/read/read.ts";
import { referencesCommandDefinition } from "../commands/references/references.ts";
import { taskStartCommand } from "../commands/task/start.ts";
import { taskCompleteCommand } from "../commands/task/complete.ts";
import { taskMergeCommand } from "../commands/task/merge.ts";

describe("Declarative CLI Subcommand Framework (ADR-4, RULE-25, RULE-27)", () => {
  it("should generate standardized aligned help output from command metadata", () => {
    const testCommand: CliCommandDefinition = {
      name: "frobnicate",
      usage: "modie frobnicate <widget> [options]",
      description: "Perform high-velocity widget frobnication.",
      positionals: [
        {
          name: "widget",
          description: "Target widget identifier",
          required: true,
        },
      ],
      flags: {
        speed: {
          type: "string",
          short: "s",
          placeholder: "<level>",
          description: "Operational velocity (slow, fast, ludacris)",
        },
        turbo: {
          type: "boolean",
          short: "t",
          description: "Enable afterburner boost",
        },
        tags: {
          type: "string",
          multiple: true,
          placeholder: "<list>",
          description: "Metadata classification tags",
          aliases: ["tag"],
        },
      },
      run: () => 0,
    };

    const helpText = generateCommandHelp(testCommand);

    expect(helpText).toContain("Usage: modie frobnicate <widget> [options]");
    expect(helpText).toContain("Perform high-velocity widget frobnication.");
    expect(helpText).toContain("Arguments:");
    expect(helpText).toContain("<widget>");
    expect(helpText).toContain("Target widget identifier");
    expect(helpText).toContain("Options:");
    expect(helpText).toContain("-s, --speed <level>");
    expect(helpText).toContain("-t, --turbo");
    expect(helpText).toContain("--tags, --tag <list>");
    expect(helpText).toContain("--json");
    expect(helpText).toContain("-h, --help");
  });

  it("should emit help and exit 0 when -h or --help is passed (RULE-27)", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const testCommand: CliCommandDefinition = {
      name: "ping",
      usage: "modie ping",
      description: "Healthcheck ping",
      run: () => 0,
    };

    const exitCode = await executeCliCommand(testCommand, ["--help"], {
      stdout: (msg) => (stdoutOutput += msg + "\n"),
      stderr: (msg) => (stderrOutput += msg + "\n"),
    });

    expect(exitCode).toBe(0);
    // RULE-27: stdout must remain empty during help output
    expect(stdoutOutput).toBe("");
    expect(stderrOutput).toContain("Usage: modie ping");
    expect(stderrOutput).toContain("Healthcheck ping");
  });

  it("should validate required positionals and emit standardized error", async () => {
    let stderrOutput = "";

    const testCommand: CliCommandDefinition = {
      name: "deploy",
      usage: "modie deploy <target>",
      positionals: [
        {
          name: "target",
          description: "Deployment environment",
          required: true,
          missingError:
            "Error: Missing deployment target. Specify staging or prod.",
        },
      ],
      run: () => 0,
    };

    const exitCode = await executeCliCommand(testCommand, [], {
      stderr: (msg) => (stderrOutput += msg + "\n"),
    });

    expect(exitCode).toBe(1);
    expect(stderrOutput).toContain(
      "Error: Missing deployment target. Specify staging or prod.",
    );
  });

  it("should reject unexpected extra positionals when not variadic", async () => {
    let stderrOutput = "";

    const testCommand: CliCommandDefinition = {
      name: "inspect",
      usage: "modie inspect <id>",
      positionals: [
        {
          name: "id",
          description: "Artifact ID",
          required: true,
        },
      ],
      run: () => 0,
    };

    const exitCode = await executeCliCommand(
      testCommand,
      ["123", "extra-arg"],
      {
        stderr: (msg) => (stderrOutput += msg + "\n"),
      },
    );

    expect(exitCode).toBe(1);
    expect(stderrOutput).toContain(
      'Error: Unexpected additional argument "extra-arg".',
    );
  });

  it("should support variadic positionals for multi-word arguments", async () => {
    let capturedTitle = "";

    const testCommand: CliCommandDefinition = {
      name: "create-item",
      usage: "modie create-item <title>",
      positionals: [
        {
          name: "title",
          description: "Item title",
          required: true,
          variadic: true,
        },
      ],
      run: (context) => {
        capturedTitle = context.positionals.join(" ").trim();
        return 0;
      },
    };

    const exitCode = await executeCliCommand(
      testCommand,
      ["My", "Exciting", "New", "Feature"],
      {},
    );

    expect(exitCode).toBe(0);
    expect(capturedTitle).toBe("My Exciting New Feature");
  });

  it("should enforce RULE-27 stream separation and automatic JSON formatting", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    interface BuildResult {
      target: string;
      artifactCount: number;
    }

    const testCommand: CliCommandDefinition<{}, BuildResult> = {
      name: "compile",
      run: () => ({ target: "web", artifactCount: 42 }),
      render: (result, context) => {
        context.stdout(result.target);
        context.stderr(`✓ Compiled ${result.artifactCount} artifacts.`);
      },
      renderJson: (result, context) => {
        context.stdout(JSON.stringify(result, null, 2));
        context.stderr(`✓ Finished compilation`);
      },
    };

    // 1. Standard mode
    const exitCode = await executeCliCommand(testCommand, [], {
      stdout: (msg) => (stdoutOutput += msg + "\n"),
      stderr: (msg) => (stderrOutput += msg + "\n"),
    });

    expect(exitCode).toBe(0);
    expect(stdoutOutput.trim()).toBe("web");
    expect(stderrOutput).toContain("✓ Compiled 42 artifacts.");

    // 2. JSON mode
    stdoutOutput = "";
    stderrOutput = "";
    const jsonExitCode = await executeCliCommand(testCommand, ["--json"], {
      stdout: (msg) => (stdoutOutput += msg + "\n"),
      stderr: (msg) => (stderrOutput += msg + "\n"),
    });

    expect(jsonExitCode).toBe(0);
    const parsed = JSON.parse(stdoutOutput);
    expect(parsed.target).toBe("web");
    expect(parsed.artifactCount).toBe(42);
    expect(stderrOutput).toContain("✓ Finished compilation");
  });

  it("should catch handler errors, format them to stderr, and return exit code 1", async () => {
    let stderrOutput = "";
    let stdoutOutput = "";

    const failingCommand: CliCommandDefinition = {
      name: "fail",
      run: () => {
        throw new Error("Disk space quota exceeded.");
      },
    };

    const exitCode = await executeCliCommand(failingCommand, [], {
      stdout: (msg) => (stdoutOutput += msg + "\n"),
      stderr: (msg) => (stderrOutput += msg + "\n"),
    });

    expect(exitCode).toBe(1);
    expect(stdoutOutput).toBe("");
    expect(stderrOutput).toContain("Error: Disk space quota exceeded.");
  });

  it("should fall back to flag alias when primary flag is omitted", async () => {
    let capturedItem: string | undefined;

    const testCommand: CliCommandDefinition<{ item?: string; index?: string }> =
      {
        name: "select",
        flags: {
          item: {
            type: "string",
            short: "i",
            description: "Target item index",
            aliases: ["index"],
          },
        },
        run: (context) => {
          capturedItem = context.flags.item;
          return 0;
        },
      };

    const exitCode = await executeCliCommand(
      testCommand,
      ["--index", "99"],
      {},
    );
    expect(exitCode).toBe(0);
    expect(capturedItem).toBe("99");
  });

  it("should verify declared core command definitions conform to CliCommandDefinition with Zod schemas", () => {
    const declaredCommands = [
      findCommand,
      readCommand,
      referencesCommandDefinition,
      ruleCreateCommand,
      adrCreateCommand,
      taskCreateCommand,
      taskListCommand,
      taskCheckCommand,
      taskStatusCommand,
      taskStartCommand,
      taskCompleteCommand,
      taskMergeCommand,
    ];

    for (const cmd of declaredCommands) {
      expect(cmd.name).toBeDefined();
      expect(typeof cmd.name).toBe("string");
      expect(cmd.id).toBeDefined();
      expect(typeof cmd.id).toBe("string");
      expect(cmd.usage).toBeDefined();
      expect(cmd.schema).toBeDefined();
      expect(typeof cmd.execute).toBe("function");
      expect(typeof cmd.run).toBe("function");
    }
  });

  it("should coerce arguments and execute handlers via defineCommand", async () => {
    let capturedInput: any = null;

    const widgetSchema = (await import("zod")).z.object({
      id: (await import("zod")).z.string().describe("Widget ID"),
      count: (await import("zod")).z.coerce
        .number()
        .int()
        .positive()
        .describe("Count"),
      verbose: (await import("zod")).z
        .boolean()
        .default(false)
        .describe("Verbose mode"),
      tags: (await import("zod")).z
        .array((await import("zod")).z.string())
        .default([])
        .describe("Tags"),
    });

    const widgetCommand = (await import("./index.ts")).defineCommand({
      id: "widget_process",
      name: "widget",
      usage: "modie widget <id> [options]",
      schema: widgetSchema,
      positionals: [
        {
          name: "id",
          property: "id",
          description: "Widget ID",
          required: true,
        },
      ],
      flags: {
        count: {
          type: "string",
          short: "c",
          description: "Count",
        },
        verbose: {
          type: "boolean",
          short: "v",
          description: "Verbose mode",
        },
        tags: {
          type: "string",
          multiple: true,
          description: "Tags",
          splitCommas: true,
        },
      },
      execute: (input) => {
        capturedInput = input;
        return { processed: true };
      },
    });

    let stdoutOutput = "";
    let stderrOutput = "";
    const exitCode = await (
      await import("./index.ts")
    ).executeCliCommand(
      widgetCommand,
      ["W-123", "--count", "42", "--verbose", "--tags", "alpha,beta"],
      {
        stdout: (msg) => (stdoutOutput += msg + "\n"),
        stderr: (msg) => (stderrOutput += msg + "\n"),
      },
    );

    expect(exitCode).toBe(0);
    expect(capturedInput).toEqual({
      id: "W-123",
      count: 42,
      verbose: true,
      tags: ["alpha", "beta"],
    });
  });

  it("should fail validation and emit error to stderr when required Zod flag is missing", async () => {
    const requiredFlagSchema = (await import("zod")).z.object({
      target: (await import("zod")).z.string().describe("Target"),
    });

    const strictCommand = (await import("./index.ts")).defineCommand({
      id: "strict_op",
      name: "strict",
      schema: requiredFlagSchema,
      flags: {
        target: {
          type: "string",
          description: "Target",
        },
      },
      execute: () => 0,
    });

    let stderrOutput = "";
    const exitCode = await (
      await import("./index.ts")
    ).executeCliCommand(strictCommand, [], {
      stderr: (msg) => (stderrOutput += msg + "\n"),
    });

    expect(exitCode).toBe(1);
    expect(stderrOutput).toContain("Error: Missing required --target flag");
  });

  it("should automatically infer flag types, multiplicity, property bindings, and descriptions from Zod schema", async () => {
    const z = (await import("zod")).z;
    const { defineCommand, executeCliCommand, generateCommandHelp } =
      await import("./index.ts");

    const inferredSchema = z.object({
      targetId: z.string().describe("Target artifact identifier"),
      scope: z.string().optional().describe("Target directory scope"),
      labels: z
        .array(z.string())
        .default([])
        .describe("Classification labels"),
      dryRun: z
        .boolean()
        .default(false)
        .describe("Perform a dry-run simulation without writing files"),
    });

    let captured: any = null;
    const cmd = defineCommand({
      id: "inferred_op",
      name: "inferred",
      usage: "modie inferred <target-id> [options]",
      schema: inferredSchema,
      positionals: [
        {
          name: "target-id",
          required: true,
        },
      ],
      flags: {
        scope: {
          short: "s",
          placeholder: "<dir>",
        },
        label: {
          short: "l",
          aliases: ["labels"],
          property: "labels",
        },
      },
      execute: (input) => {
        captured = input;
        return { ok: true };
      },
    });

    // Verify inferred metadata on positionals and flags (including auto-synthesized --dry-run)
    expect(cmd.positionals?.[0]?.property).toBe("targetId");
    expect(cmd.positionals?.[0]?.description).toBe(
      "Target artifact identifier",
    );
    expect(cmd.flags?.scope?.type).toBe("string");
    expect(cmd.flags?.scope?.description).toBe("Target directory scope");
    expect(cmd.flags?.label?.type).toBe("string");
    expect(cmd.flags?.label?.multiple).toBe(true);
    expect(cmd.flags?.label?.description).toBe("Classification labels");
    expect(cmd.flags?.["dry-run"]?.type).toBe("boolean");
    expect(cmd.flags?.["dry-run"]?.property).toBe("dryRun");
    expect(cmd.flags?.["dry-run"]?.description).toBe(
      "Perform a dry-run simulation without writing files",
    );

    const helpText = generateCommandHelp(cmd);
    expect(helpText).toContain("Target artifact identifier");
    expect(helpText).toContain("-s, --scope <dir>");
    expect(helpText).toContain("Target directory scope");
    expect(helpText).toContain("-l, --label, --labels");
    expect(helpText).toContain("Classification labels");
    expect(helpText).toContain("--dry-run");
    expect(helpText).toContain(
      "Perform a dry-run simulation without writing files",
    );

    const exitCode = await executeCliCommand(
      cmd,
      ["ITEM-1", "-s", "src/core", "-l", "one,two", "--dry-run"],
      {},
    );
    expect(exitCode).toBe(0);
    expect(captured).toEqual({
      targetId: "ITEM-1",
      scope: "src/core",
      labels: ["one", "two"],
      dryRun: true,
    });
  });
});

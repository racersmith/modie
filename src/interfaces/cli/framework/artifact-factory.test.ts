/**
 * Unit and integration tests for standardized artifact CLI command factory and table formatting.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 * @verifies ADR-4, RULE-9, RULE-25, RULE-27, RULE-34, RULE-35
 */

import { describe, expect, it } from "bun:test";
import {
  adrDefinition,
  formatArtifactTag,
  ruleDefinition,
  type ArtifactDefinition,
  type ListedArtifact,
} from "../../../core/index.ts";
import {
  createArtifactListCommand,
  executeCliCommand,
  formatAlignedTable,
  generateCommandHelp,
  renderArtifactListTable,
} from "./index.ts";
import { createTestWorkspace } from "../test-utils.ts";

describe("Artifact CLI Command Factory & Table Formatting (RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should produce a standardized command definition from an ArtifactDefinition", () => {
    const cmd = createArtifactListCommand(adrDefinition);

    expect(cmd.id).toBe("adr_list");
    expect(cmd.namespace).toBe("adr");
    expect(cmd.name).toBe("list");
    expect(cmd.aliases).toEqual(["ls"]);
    expect(cmd.description).toBe("List active ADR artifacts");
    expect(cmd.usage).toBe("modie adr list [options]");
    expect(cmd.helpUsage).toBe("modie adr list --help");
    expect(cmd.schema).toBeDefined();
    expect(cmd.flags?.scope).toBeDefined();
    expect(cmd.flags?.scope?.short).toBe("s");
    expect(cmd.flags?.scope?.placeholder).toBe("<path>");
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should produce a standardized command definition from a string subtype", () => {
    const cmd = createArtifactListCommand("RULE");

    expect(cmd.id).toBe("rule_list");
    expect(cmd.namespace).toBe("rule");
    expect(cmd.name).toBe("list");
    expect(cmd.description).toBe("List active RULE artifacts");
    expect(cmd.usage).toBe("modie rule list [options]");
    expect(cmd.flags?.scope?.description).toContain("rules");
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should support custom subtype definitions with automatic fallback metadata", () => {
    const customDefinition: ArtifactDefinition = {
      subtype: "SPEC",
      containerName: "specs",
      render: () => ({ markdown: "", artifact: {} }),
    };

    const cmd = createArtifactListCommand(customDefinition);

    expect(cmd.id).toBe("spec_list");
    expect(cmd.namespace).toBe("spec");
    expect(cmd.name).toBe("list");
    expect(cmd.description).toBe("List active SPEC artifacts");
    expect(cmd.flags?.scope?.description).toContain("specs");

    const help = generateCommandHelp(cmd);
    expect(help).toContain("modie spec list [options]");
    expect(help).toContain("List active SPEC artifacts");
    expect(help).toContain("-s, --scope <path>");
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should execute list command and render table to stderr with empty stdout", async () => {
    await using workspace = await createTestWorkspace("modie-artifact-factory-");
    const ruleTag = formatArtifactTag("RULE", 1);
    const adr = await workspace.createAdr({
      id: 1,
      slug: "factory-test-decision",
      links: [ruleTag],
      context: "Decision context.",
    });

    const cmd = createArtifactListCommand(adrDefinition);

    let stdout = "";
    let stderr = "";

    const exitCode = await executeCliCommand(
      cmd,
      [],
      {
        stdout: (msg) => (stdout += msg + "\n"),
        stderr: (msg) => (stderr += msg + "\n"),
        cwd: workspace.cwd,
      },
    );

    expect(exitCode).toBe(0);
    // RULE-27: stdout must remain empty in standard non-json mode
    expect(stdout).toBe("");
    // RULE-27: stderr must contain human diagnostic header and aligned table
    expect(stderr).toContain("Active ADRs (1 ADR):");
    expect(stderr).toContain(adr.tag);
    expect(stderr).toContain("factory test decision");
    expect(stderr).toContain(ruleTag);
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should emit machine-parsable JSON to stdout and empty stderr when --json is passed", async () => {
    await using workspace = await createTestWorkspace("modie-artifact-factory-json-");
    const rule = await workspace.createRule({
      id: 10,
      slug: "factory-rule-test",
      body: "Invariant text.",
    });

    const cmd = createArtifactListCommand(ruleDefinition);

    let stdout = "";
    let stderr = "";

    const exitCode = await executeCliCommand(
      cmd,
      ["--json"],
      {
        stdout: (msg) => (stdout += msg + "\n"),
        stderr: (msg) => (stderr += msg + "\n"),
        cwd: workspace.cwd,
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].tag).toBe(rule.tag);
    expect(parsed[0].title).toBe("factory rule test");
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should emit notice to stderr when workspace has no artifacts", async () => {
    await using workspace = await createTestWorkspace("modie-artifact-factory-empty-");
    const cmd = createArtifactListCommand(adrDefinition);

    let stdout = "";
    let stderr = "";

    const exitCode = await executeCliCommand(
      cmd,
      [],
      {
        stdout: (msg) => (stdout += msg + "\n"),
        stderr: (msg) => (stderr += msg + "\n"),
        cwd: workspace.cwd,
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("No active ADRs found in workspace.");
  });

  // @verifies RULE-9, RULE-25, RULE-27, RULE-34
  it("[RULE-9][RULE-25][RULE-27][RULE-34] should emit scope notice when no artifacts govern the scope", async () => {
    await using workspace = await createTestWorkspace("modie-artifact-factory-scope-empty-");
    const cmd = createArtifactListCommand(ruleDefinition);

    let stdout = "";
    let stderr = "";

    const exitCode = await executeCliCommand(
      cmd,
      ["--scope", "src/nonexistent"],
      {
        stdout: (msg) => (stdout += msg + "\n"),
        stderr: (msg) => (stderr += msg + "\n"),
        cwd: workspace.cwd,
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain('No active rules found governing scope "src/nonexistent".');
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should format aligned table correctly with formatAlignedTable", () => {
    const emptyResult = formatAlignedTable([], [
      { header: "COL", value: () => "" },
    ]);
    expect(emptyResult).toBe("");

    const items = [
      { id: "1", name: "short", score: 10 },
      { id: "100", name: "a very long name", score: 5 },
    ];

    const table = formatAlignedTable(items, [
      { header: "ID", minWidth: 4, value: (i) => i.id },
      { header: "NAME", minWidth: 6, value: (i) => i.name },
      { header: "SCORE", align: "right", minWidth: 5, value: (i) => String(i.score) },
    ]);

    const lines = table.split("\n");
    expect(lines.length).toBe(4);
    expect(lines[0]).toContain("ID");
    expect(lines[0]).toContain("NAME");
    expect(lines[0]).toContain("SCORE");
    expect(lines[1]).toContain("----");
    expect(lines[2]).toContain("1");
    expect(lines[2]).toContain("short");
    expect(lines[3]).toContain("100");
    expect(lines[3]).toContain("a very long name");
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should format listed artifacts with renderArtifactListTable", () => {
    const sample: ListedArtifact[] = [
      {
        tag: formatArtifactTag("RULE", 1),
        subtype: "RULE",
        id: "1",
        slug: "first-rule",
        title: "first rule",
        filename: "first-rule.md",
        filepath: "/abs/path/first-rule.md",
        relativePath: ".modie/rules/first-rule.md",
        scope: ".",
        links: [formatArtifactTag("ADR", 2)],
      },
    ];

    const table = renderArtifactListTable(sample);
    expect(table).toContain("TAG");
    expect(table).toContain("TITLE");
    expect(table).toContain("LINKS");
    expect(table).toContain("PATH");
    expect(table).toContain(sample[0]!.tag);
    expect(table).toContain("first rule");
    expect(table).toContain(sample[0]!.links[0]!);
    expect(table).toContain(".modie/rules/first-rule.md");
  });
});

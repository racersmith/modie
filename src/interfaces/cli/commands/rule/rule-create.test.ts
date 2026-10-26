/**
 * Integration and unit tests for `modie rule create`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { createTestWorkspace, makeTestTag } from "../../test-utils.ts";

describe("CLI Rule Creation - Execution & Stream Separation (RULE-8, RULE-13, RULE-16, RULE-25, RULE-27)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit rule subcommand help to stderr with exit code 0", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-help-");
    const { exitCode, stdout, stderr } = await workspace.captureCli(["rule", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie rule <subcommand>");
  });

  // @verifies RULE-1, RULE-8, RULE-25, RULE-27
  it("[RULE-1][RULE-8][RULE-25][RULE-27] should create a rule with relative path to stdout and status to stderr", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-create-");
    const expectedTag = makeTestTag("RULE", 1);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "CLI Stream Verification Rule",
      "--context",
      "Command output must separate machine and human streams.",
    ]);

    expect(exitCode).toBe(0);
    // RULE-27: stdout strictly contains relative file path
    expect(stdout.trim()).toBe(`.modie/rules/cli-stream-verification-rule.${expectedTag}.md`);
    // RULE-27: stderr strictly contains human status
    expect(stderr).toContain(`✓ Created rule ${expectedTag}: cli-stream-verification-rule.${expectedTag}.md`);

    const content = await workspace.readFile(stdout.trim());
    expect(content).toBe("Command output must separate machine and human streams.\n");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-json-");
    const expectedTag = makeTestTag("RULE", 1);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "JSON Mode Rule",
      "--context",
      "JSON payload must go to stdout.",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Created rule ${expectedTag}`);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe("1");
    expect(parsed.tag).toBe(expectedTag);
    expect(parsed.slug).toBe("json-mode-rule");
    expect(parsed.filename).toBe(`json-mode-rule.${expectedTag}.md`);
    expect(parsed.relativePath).toContain(`.modie/rules/json-mode-rule.${expectedTag}.md`);
    expect(parsed.assertion).toBe("JSON payload must go to stdout.");
  });

  // @verifies RULE-8
  it("[RULE-8] should support --flat flag to create file without .modie/rules directory", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-flat-");
    const expectedTag = makeTestTag("RULE", 1);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "Flat File Rule",
      "--flat",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`flat-file-rule.${expectedTag}.md`);
    expect(stderr).toContain(`✓ Created rule ${expectedTag}`);
  });

  // @verifies RULE-13, RULE-16
  it("[RULE-13][RULE-16] should support linking to an ancestor ADR via --link", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-link-");
    const adr50 = await workspace.createAdr({
      id: 50,
      slug: "design",
      context: "Design ADR",
    });

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "Linked Rule",
      "--link",
      adr50.tag,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual([adr50.tag]);

    const content = await workspace.readFile(parsed.relativePath);
    expect(content.startsWith(`---\nlinks:\n  - ${adr50.tag}\n---`)).toBe(true);
  });

  // @verifies RULE-13, RULE-27
  it("[RULE-13][RULE-27] should reject non-ADR link with error to stderr", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-err-");
    const invalidTarget = makeTestTag("RULE", 1);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "Illegal Link Rule",
      "--link",
      invalidTarget,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Invalid rule link target: "${invalidTarget}"`);
    expect(stderr).toContain("RULE-13");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when title is omitted", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-notitle-");
    const { exitCode, stdout, stderr } = await workspace.captureCli(["rule", "create"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required rule title");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-flag-");
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "Test Rule",
      "--bogus",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--bogus"');
  });

  // @verifies RULE-4, RULE-25, RULE-27
  it("[RULE-4][RULE-25][RULE-27] should create a rule with --supersedes and update predecessor", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-supersedes-");
    const oldRule = await workspace.createRule({
      id: 1,
      slug: "old-rule",
      title: "Old Rule",
      body: "Old rule assertion.",
    });

    const newTag = makeTestTag("RULE", 2);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "New Rule",
      "--context",
      "New rule assertion.",
      "--supersedes",
      oldRule.tag,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`.modie/rules/new-rule.${newTag}.md`);
    expect(stderr).toContain(`✓ Created rule ${newTag}: new-rule.${newTag}.md (supersedes ${oldRule.tag})`);

    const rule1Content = await workspace.readFile(oldRule.filepath);
    expect(rule1Content).toContain(`superseded_by:\n  - ${newTag}`);
  });

  // @verifies RULE-4, RULE-27
  it("[RULE-4][RULE-27] should emit supersedes in JSON output when --supersedes and --json are passed", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-sup-json-");
    const oldRule = await workspace.createRule({
      id: 1,
      slug: "old-rule",
      title: "Old Rule",
      body: "Old assertion.",
    });

    const newTag = makeTestTag("RULE", 2);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "Superseding JSON Rule",
      "-S",
      oldRule.tag,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Created rule ${newTag} (.modie/rules/superseding-json-rule.${newTag}.md) (supersedes ${oldRule.tag})`);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(newTag);
    expect(parsed.supersedes).toEqual([oldRule.tag]);
  });

  // @verifies RULE-13, RULE-27
  it("[RULE-13][RULE-27] should reject invalid --supersedes target with error to stderr", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-sup-err-");
    const invalidTarget = makeTestTag("ADR", 1);
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "rule",
      "create",
      "Invalid Target Rule",
      "--supersedes",
      invalidTarget,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Invalid supersedes target: "${invalidTarget}"`);
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute rule create via bin.ts subprocess", async () => {
    await using workspace = await createTestWorkspace("modie-cli-rule-subproc-");
    const expectedTag = makeTestTag("RULE", 1);
    const { stdout, stderr } = await workspace.execBin([
      "rule",
      "create",
      "Subprocess Rule",
      "--json",
    ]);

    expect(stderr).toContain(`✓ Created rule ${expectedTag}`);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(expectedTag);
    expect(parsed.slug).toBe("subprocess-rule");
  });
});

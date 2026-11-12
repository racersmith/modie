/**
 * Integration and unit tests for `modie adr create`.
 * Tagged per RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../../../core/index.ts";
import {
  createFixtureWorkspace,
} from "../../../../core/platform/testing/index.ts";
import {
  captureCli, execBin,
} from "../../test-utils.ts";

describe("CLI ADR Creation - Execution & Stream Separation (RULE-8, RULE-14, RULE-17, RULE-25, RULE-27)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit adr namespace help to stderr with exit code 0", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-help-");
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "--help",
    ], workspace.cwd);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie adr <subcommand>");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit adr create subcommand help to stderr with exit code 0", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-cli-adr-create-help-",
    );
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "--help",
    ], workspace.cwd);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie adr create <title> [options]");
  });

  // @verifies RULE-1, RULE-8, RULE-25, RULE-27
  it("[RULE-1][RULE-8][RULE-25][RULE-27] should create an ADR with relative path to stdout and status to stderr", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-create-");
    const expectedTag = formatArtifactTag("ADR", 1);
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Architecture Decision Separation",
      "--context",
      "Separate machine streams from human streams.",
      "--alternatives",
      "Combined output stream.",
      "--decision",
      "Adopt strict stream isolation.",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    // RULE-27: stdout strictly contains relative file path
    expect(stdout.trim()).toBe(
      `.modie/adrs/architecture-decision-separation.${expectedTag}.md`,
    );
    // RULE-27: stderr strictly contains human status
    expect(stderr).toContain(
      `✓ Created ADR ${expectedTag}: architecture-decision-separation.${expectedTag}.md`,
    );

    const content = await workspace.readFile(stdout.trim());
    expect(content).toContain(
      "# Context\n\nSeparate machine streams from human streams.",
    );
    expect(content).toContain(
      "# Alternatives Considered\n\nCombined output stream.",
    );
    expect(content).toContain("# Decision\n\nAdopt strict stream isolation.");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-json-");
    const expectedTag = formatArtifactTag("ADR", 1);
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "JSON Mode ADR",
      "--context",
      "JSON payload must go to stdout.",
      "--json",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Created ADR ${expectedTag}`);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe("1");
    expect(parsed.tag).toBe(expectedTag);
    expect(parsed.slug).toBe("json-mode-adr");
    expect(parsed.filename).toBe(`json-mode-adr.${expectedTag}.md`);
    expect(parsed.relativePath).toContain(
      `.modie/adrs/json-mode-adr.${expectedTag}.md`,
    );
    expect(parsed.context).toBe("JSON payload must go to stdout.");
  });

  // @verifies RULE-8
  it("[RULE-8] should reject retired --flat flag with error to stderr", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-flat-");
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Flat File ADR",
      "--flat",
    ], workspace.cwd);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--flat"');
  });

  // @verifies RULE-8
  it("[RULE-8] should support --scope flag to target specific directory", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-scope-");
    const expectedTag = formatArtifactTag("ADR", 1);
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Scoped Subsystem ADR",
      "--scope",
      "src/subsystem",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(
      `src/subsystem/.modie/adrs/scoped-subsystem-adr.${expectedTag}.md`,
    );
    expect(stderr).toContain(`✓ Created ADR ${expectedTag}`);

    const content = await workspace.readFile(stdout.trim());
    expect(content).toContain("# Context");
  });

  // @verifies RULE-14
  it("[RULE-14] should support linking to other ADRs via --link", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-link-");
    const targetAdr = await workspace.createAdr({
      id: 10,
      slug: "target-adr",
      title: "Target ADR",
    });
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Linked ADR",
      "--link",
      targetAdr.tag,
      "--json",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual([targetAdr.tag]);

    const content = await workspace.readFile(parsed.relativePath);
    expect(content.startsWith(`---\nlinks:\n  - ${targetAdr.tag}\n---`)).toBe(
      true,
    );
  });

  // @verifies RULE-14, RULE-17
  it("[RULE-14][RULE-17] should support linking to a descendant RULE", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-cli-adr-rule-link-",
    );
    const rule = await workspace.createRule({
      id: 5,
      slug: "sample-rule",
      title: "Sample Rule",
      body: "Sample rule assertion.",
    });

    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "ADR Linking Descendant Rule",
      "--link",
      rule.tag,
      "--json",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual([rule.tag]);
  });

  // @verifies RULE-14, RULE-27
  it("[RULE-14][RULE-27] should reject non-ADR and non-RULE link targets with exit code 1", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-cli-adr-invalid-link-",
    );
    const invalidTarget = formatArtifactTag("TASK", 1);
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Invalid Link Target ADR",
      "--link",
      invalidTarget,
    ], workspace.cwd);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(`Invalid ADR link target: "${invalidTarget}"`);
    expect(stderr).toContain("RULE-14");
  });

  // @verifies RULE-17, RULE-27
  it("[RULE-17][RULE-27] should reject linking to ancestor/sibling RULE with error citing RULE-17", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-cli-adr-rule-scope-err-",
    );
    const rootRule = await workspace.createRule({
      id: 10,
      slug: "root-rule",
      title: "Root Rule",
      body: "Root rule assertion.",
    });

    // Scoped ADR inside "sub" linking to root rule violates RULE-17 (rootRule is ancestor, not descendant)
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Subsystem ADR Violating Scope",
      "--scope",
      "sub",
      "--link",
      rootRule.tag,
    ], workspace.cwd);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("ADR rule scope violation");
    expect(stderr).toContain("RULE-17");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when title is omitted", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-notitle-");
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
    ], workspace.cwd);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required ADR title");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-flag-");
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Test ADR",
      "--unknown-flag",
    ], workspace.cwd);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--unknown-flag"');
  });

  // @verifies RULE-4, RULE-25, RULE-27
  it("[RULE-4][RULE-25][RULE-27] should support --supersedes flag and update predecessor frontmatter", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-cli-adr-supersedes-",
    );
    const adr1 = await workspace.createAdr({
      id: 1,
      slug: "first-arch",
      context: "First.",
    });

    const newTag = formatArtifactTag("ADR", 2);
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Second Arch",
      "--supersedes",
      adr1.tag,
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`.modie/adrs/second-arch.${newTag}.md`);
    expect(stderr).toContain(
      `✓ Created ADR ${newTag}: second-arch.${newTag}.md (supersedes ${adr1.tag})`,
    );

    const adr1Content = await workspace.readFile(adr1.filepath);
    expect(adr1Content).toContain(`superseded_by:\n  - ${newTag}`);

    const adr2Content = await workspace.readFile(stdout.trim());
    expect(adr2Content).toContain(`supersedes:\n  - ${adr1.tag}`);
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute adr create via bin.ts subprocess", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-subproc-");
    const expectedTag = formatArtifactTag("ADR", 1);
    const { stdout, stderr } = await execBin([
      "adr",
      "create",
      "Subprocess ADR",
      "--json",
    ], workspace.cwd);

    expect(stderr).toContain(`✓ Created ADR ${expectedTag}`);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe(expectedTag);
    expect(parsed.slug).toBe("subprocess-adr");
  });

  // @verifies RULE-25, RULE-26, RULE-27, RULE-34
  it("[RULE-25][RULE-26][RULE-27][RULE-34] should support --summary flag and write summary to YAML frontmatter and JSON output", async () => {
    await using workspace = await createFixtureWorkspace("modie-cli-adr-summary-");
    const expectedTag = formatArtifactTag("ADR", 1);
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Summary Enabled ADR",
      "--summary",
      "Concise signpost summary for progressive context disclosure.",
      "--context",
      "Detailed context.",
      "--decision",
      "Adopted decision.",
      "--json",
    ], workspace.cwd);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Created ADR ${expectedTag}`);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.summary).toBe(
      "Concise signpost summary for progressive context disclosure.",
    );

    const content = await workspace.readFile(parsed.relativePath);
    expect(content).toContain(
      "---\nsummary: Concise signpost summary for progressive context disclosure.\nlinks: []\n---",
    );
  });

  // @verifies RULE-1, RULE-4, RULE-25, RULE-27, RULE-34
  it("[RULE-1][RULE-4][RULE-25][RULE-27][RULE-34] should reject tombstone ADR titles and suggest alternatives in stderr", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-cli-adr-tombstone-reject-",
    );
    const { exitCode, stdout, stderr } = await captureCli(
      ["adr", "create", "Sunset Legacy Pipeline"],
      workspace.cwd,
    );

    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Tombstone ADR detected");
    expect(stderr).toContain("ADRs must constrain future code");
  });

  // @verifies RULE-1, RULE-4, RULE-25, RULE-27, RULE-34
  it("[RULE-1][RULE-4][RULE-25][RULE-27][RULE-34] should allow tombstone ADR titles when --force flag is passed", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-cli-adr-tombstone-force-",
    );
    const expectedTag = formatArtifactTag("ADR", 1);
    const { exitCode, stdout, stderr } = await captureCli(
      ["adr", "create", "Sunset Legacy Pipeline", "--force"],
      workspace.cwd,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`✓ Created ADR ${expectedTag}`);
    expect(stdout.trim()).toBe(
      `.modie/adrs/sunset-legacy-pipeline.${expectedTag}.md`,
    );
  });
});

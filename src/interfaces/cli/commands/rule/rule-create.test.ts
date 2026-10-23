/**
 * Integration and unit tests for `modie rule create`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { captureCli } from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI Rule Creation - Execution & Stream Separation (RULE-8, RULE-13, RULE-16, RULE-25, RULE-27)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit rule subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["rule", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie rule <subcommand>");
  });

  // @verifies RULE-1, RULE-8, RULE-25, RULE-27
  it("[RULE-1][RULE-8][RULE-25][RULE-27] should create a rule with relative path to stdout and status to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-create-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "CLI Stream Verification Rule",
        "--context",
        "Command output must separate machine and human streams.",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    // RULE-27: stdout strictly contains relative file path
    expect(stdout.trim()).toBe(".rules/cli-stream-verification-rule.RULE-1.md");
    // RULE-27: stderr strictly contains human status
    expect(stderr).toContain("✓ Created rule RULE-1: cli-stream-verification-rule.RULE-1.md");

    const content = await readFile(join(tempDir, stdout.trim()), "utf8");
    expect(content).toBe("Command output must separate machine and human streams.\n");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-json-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "JSON Mode Rule",
        "--context",
        "JSON payload must go to stdout.",
        "--json",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Created rule RULE-1");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe("1");
    expect(parsed.tag).toBe("RULE-1");
    expect(parsed.slug).toBe("json-mode-rule");
    expect(parsed.filename).toBe("json-mode-rule.RULE-1.md");
    expect(parsed.relativePath).toContain(".rules/json-mode-rule.RULE-1.md");
    expect(parsed.assertion).toBe("JSON payload must go to stdout.");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-8
  it("[RULE-8] should support --flat flag to create file without .rules directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-flat-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "Flat File Rule",
        "--flat",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("flat-file-rule.RULE-1.md");
    expect(stderr).toContain("✓ Created rule RULE-1");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-13, RULE-16
  it("[RULE-13][RULE-16] should support linking to an ancestor ADR via --link", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-link-"));
    const adrDir = join(tempDir, ".adrs");
    await mkdir(adrDir, { recursive: true });
    await writeFile(
      join(adrDir, "design.ADR-50.md"),
      "---\nlinks: []\n---\n# Context\nDesign ADR\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "Linked Rule",
        "--link",
        "ADR-50",
        "--json",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual(["ADR-50"]);

    const content = await readFile(join(tempDir, parsed.relativePath), "utf8");
    expect(content.startsWith("---\nlinks:\n  - ADR-50\n---")).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-13, RULE-27
  it("[RULE-13][RULE-27] should reject non-ADR link with error to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-err-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "Illegal Link Rule",
        "--link",
        "RULE-1",
      ],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Invalid rule link target: "RULE-1"');
    expect(stderr).toContain("RULE-13");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when title is omitted", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["rule", "create"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required rule title");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
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
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-supersedes-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    // Seed RULE-1
    const rule1Path = join(rulesDir, "old-rule.RULE-1.md");
    await writeFile(rule1Path, "Old rule assertion.\n", "utf8");

    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "New Rule",
        "--context",
        "New rule assertion.",
        "--supersedes",
        "RULE-1",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".rules/new-rule.RULE-2.md");
    expect(stderr).toContain("✓ Created rule RULE-2: new-rule.RULE-2.md (supersedes RULE-1)");

    const rule1Content = await readFile(rule1Path, "utf8");
    expect(rule1Content).toContain("superseded_by:\n  - RULE-2");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-4, RULE-27
  it("[RULE-4][RULE-27] should emit supersedes in JSON output when --supersedes and --json are passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-sup-json-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });

    // Seed RULE-1
    await writeFile(join(rulesDir, "old-rule.RULE-1.md"), "Old assertion.\n", "utf8");

    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "Superseding JSON Rule",
        "-S",
        "RULE-1",
        "--json",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Created rule RULE-2 (.rules/superseding-json-rule.RULE-2.md) (supersedes RULE-1)");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("RULE-2");
    expect(parsed.supersedes).toEqual(["RULE-1"]);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-13, RULE-27
  it("[RULE-13][RULE-27] should reject invalid --supersedes target with error to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-sup-err-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "rule",
        "create",
        "Invalid Target Rule",
        "--supersedes",
        "ADR-1",
      ],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Invalid supersedes target: "ADR-1"');

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute rule create via bin.ts subprocess", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-rule-subproc-"));
    const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [binPath, "rule", "create", "Subprocess Rule", "--json"],
      { cwd: tempDir },
    );

    expect(stderr).toContain("✓ Created rule RULE-1");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("RULE-1");
    expect(parsed.slug).toBe("subprocess-rule");

    await rm(tempDir, { recursive: true, force: true });
  });
});

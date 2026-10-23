/**
 * Integration and unit tests for `modie adr create`.
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

describe("CLI ADR Creation - Execution & Stream Separation (ADR-4, RULE-8, RULE-14, RULE-17, RULE-25, RULE-27)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit adr namespace help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["adr", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie adr <subcommand>");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit adr create subcommand help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["adr", "create", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie adr create <title> [options]");
  });

  // @verifies ADR-1, ADR-2, ADR-3, ADR-4, RULE-1, RULE-8, RULE-25, RULE-27
  it("[ADR-4][RULE-1][RULE-8][RULE-25][RULE-27] should create an ADR with relative path to stdout and status to stderr", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-create-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "Architecture Decision Separation",
        "--context",
        "Separate machine streams from human streams.",
        "--alternatives",
        "Combined output stream.",
        "--decision",
        "Adopt strict stream isolation.",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    // RULE-27: stdout strictly contains relative file path
    expect(stdout.trim()).toBe(".adrs/architecture-decision-separation.ADR-1.md");
    // RULE-27: stderr strictly contains human status
    expect(stderr).toContain("✓ Created ADR ADR-1: architecture-decision-separation.ADR-1.md");

    const content = await readFile(join(tempDir, stdout.trim()), "utf8");
    expect(content).toContain("# Context\n\nSeparate machine streams from human streams.");
    expect(content).toContain("# Alternatives Considered\n\nCombined output stream.");
    expect(content).toContain("# Decision\n\nAdopt strict stream isolation.");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-json-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "JSON Mode ADR",
        "--context",
        "JSON payload must go to stdout.",
        "--json",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain("✓ Created ADR ADR-1");

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.id).toBe("1");
    expect(parsed.tag).toBe("ADR-1");
    expect(parsed.slug).toBe("json-mode-adr");
    expect(parsed.filename).toBe("json-mode-adr.ADR-1.md");
    expect(parsed.relativePath).toContain(".adrs/json-mode-adr.ADR-1.md");
    expect(parsed.context).toBe("JSON payload must go to stdout.");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-8
  it("[RULE-8] should support --flat flag to create file without .adrs directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-flat-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "Flat File ADR",
        "--flat",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("flat-file-adr.ADR-1.md");
    expect(stderr).toContain("✓ Created ADR ADR-1");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-8
  it("[RULE-8] should support --scope flag to target specific directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-scope-"));
    const subDir = join(tempDir, "src", "subsystem");
    await mkdir(subDir, { recursive: true });

    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "Scoped Subsystem ADR",
        "--scope",
        "src/subsystem",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("src/subsystem/.adrs/scoped-subsystem-adr.ADR-1.md");
    expect(stderr).toContain("✓ Created ADR ADR-1");

    const exists = await readFile(join(tempDir, stdout.trim()), "utf8");
    expect(exists).toContain("# Context");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-14
  it("[RULE-14] should support linking to other ADRs via --link", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-link-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "Linked ADR",
        "--link",
        "ADR-10",
        "--json",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual(["ADR-10"]);

    const content = await readFile(join(tempDir, parsed.relativePath), "utf8");
    expect(content.startsWith("---\nlinks:\n  - ADR-10\n---")).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-14, RULE-17
  it("[RULE-14][RULE-17] should support linking to a descendant RULE", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-rule-link-"));
    const rulesDir = join(tempDir, ".rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "sample-rule.RULE-5.md"),
      "---\nlinks: []\n---\nSample rule assertion.\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "ADR Linking Descendant Rule",
        "--link",
        "RULE-5",
        "--json",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual(["RULE-5"]);

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-14, RULE-27
  it("[RULE-14][RULE-27] should reject non-ADR and non-RULE link targets with exit code 1", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-invalid-link-"));
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "Invalid Link Target ADR",
        "--link",
        "TASK-1",
      ],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Invalid ADR link target: "TASK-1"');
    expect(stderr).toContain("RULE-14");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-17, RULE-27
  it("[RULE-17][RULE-27] should reject linking to ancestor/sibling RULE with error citing RULE-17", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-rule-scope-err-"));
    // Create rule in root .rules/
    const rootRules = join(tempDir, ".rules");
    await mkdir(rootRules, { recursive: true });
    await writeFile(
      join(rootRules, "root-rule.RULE-10.md"),
      "---\nlinks: []\n---\nRoot rule assertion.\n",
      "utf8",
    );

    // Create sub directory for ADR
    const subDir = join(tempDir, "sub");
    await mkdir(subDir, { recursive: true });

    // Scoped ADR inside "sub" linking to root RULE-10 violates RULE-17 (RULE-10 is ancestor, not descendant)
    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "Subsystem ADR Violating Scope",
        "--scope",
        "sub",
        "--link",
        "RULE-10",
      ],
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("ADR rule scope violation");
    expect(stderr).toContain("RULE-17");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when title is omitted", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["adr", "create"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required ADR title");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "adr",
      "create",
      "Test ADR",
      "--unknown-flag",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--unknown-flag"');
  });

  // @verifies RULE-4, RULE-25, RULE-27
  it("[RULE-4][RULE-25][RULE-27] should support --supersedes flag and update predecessor frontmatter", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-supersedes-"));
    const adrsDir = join(tempDir, ".adrs");
    await mkdir(adrsDir, { recursive: true });

    const adr1Path = join(adrsDir, "first-arch.ADR-1.md");
    await writeFile(
      adr1Path,
      "---\nlinks: []\n---\n# Context\nFirst.",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      [
        "adr",
        "create",
        "Second Arch",
        "--supersedes",
        "ADR-1",
      ],
      tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(".adrs/second-arch.ADR-2.md");
    expect(stderr).toContain("✓ Created ADR ADR-2: second-arch.ADR-2.md (supersedes ADR-1)");

    const adr1Content = await readFile(adr1Path, "utf8");
    expect(adr1Content).toContain("superseded_by:\n  - ADR-2");

    const adr2Content = await readFile(join(tempDir, stdout.trim()), "utf8");
    expect(adr2Content).toContain("supersedes:\n  - ADR-1");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-25, RULE-27
  it("[RULE-25][RULE-27] should execute adr create via bin.ts subprocess", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-adr-subproc-"));
    const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [binPath, "adr", "create", "Subprocess ADR", "--json"],
      { cwd: tempDir },
    );

    expect(stderr).toContain("✓ Created ADR ADR-1");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("ADR-1");
    expect(parsed.slug).toBe("subprocess-adr");

    await rm(tempDir, { recursive: true, force: true });
  });
});


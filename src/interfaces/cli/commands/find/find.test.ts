/**
 * Integration and unit tests for `modie find`.
 * Tagged per ADR-7 and RULE-23 for universal rule verification.
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { captureCli } from "../../test-utils.ts";

const execFileAsync = promisify(execFile);

describe("CLI Find - Execution & Stream Separation (RULE-25, RULE-27, RULE-29)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit find help to stderr with exit code 0", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["find", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: modie find");
  });

  // @verifies RULE-25, RULE-27, RULE-29
  it("[RULE-25][RULE-27][RULE-29] should find active RULE artifact and emit relative path to stdout", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["find", "RULE-1"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("src/.modie/rules/artifact-filename-structure.RULE-1.md");
  });

  // @verifies RULE-25, RULE-27, RULE-29
  it("[RULE-25][RULE-27][RULE-29] should emit absolute path to stdout when --absolute is passed", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "find",
      "ADR-1",
      "--absolute",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toContain("self-indexing-filenames.ADR-1.md");
    expect(stdout.trim().startsWith("/")).toBe(true);
  });

  // @verifies RULE-25, RULE-27, RULE-29
  it("[RULE-25][RULE-27][RULE-29] should emit JSON payload to stdout when --json is passed", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "find",
      "RULE-1",
      "--json",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.tag).toBe("RULE-1");
    expect(parsed.subtype).toBe("RULE");
    expect(parsed.id).toBe("1");
    expect(parsed.isArchived).toBe(false);
    expect(parsed.relativePath).toBe(
      "src/.modie/rules/artifact-filename-structure.RULE-1.md",
    );
  });

  // @verifies RULE-29
  it("[RULE-29] should find archived artifact in custom directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "modie-cli-find-archived-"));
    const archivedPath = join(tempDir, "legacy-decision.ADR-99.ARCHIVED.md");
    await writeFile(
      archivedPath,
      "---\nlinks: []\n---\n# Archived ADR\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["find", "ADR-99"],
      tempDir,
    );
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("legacy-decision.ADR-99.ARCHIVED.md");

    const jsonResult = await captureCli(["find", "ADR-99", "--json"], tempDir);
    expect(jsonResult.exitCode).toBe(0);
    const parsed = JSON.parse(jsonResult.stdout.trim());
    expect(parsed.isArchived).toBe(true);
    expect(parsed.tag).toBe("ADR-99");

    await rm(tempDir, { recursive: true, force: true });
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when artifact tag is not found", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["find", "RULE-9999"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Artifact "RULE-9999" was not found');
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when tag argument is missing", async () => {
    const { exitCode, stdout, stderr } = await captureCli(["find"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required artifact identifier");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flag", async () => {
    const { exitCode, stdout, stderr } = await captureCli([
      "find",
      "RULE-1",
      "--bogus",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--bogus"');
  });

  // @verifies RULE-25, RULE-27, RULE-29
  it("[RULE-25][RULE-27][RULE-29] should execute find via bin.ts subprocess", async () => {
    const binPath = "./src/interfaces/cli/bin.ts";
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      binPath,
      "find",
      "RULE-1",
    ]);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("src/.modie/rules/artifact-filename-structure.RULE-1.md");
  });
});

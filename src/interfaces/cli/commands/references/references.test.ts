/**
 * Integration tests for declarative CLI references command and stream separation.
 * Enforces RULE-25 (interface core decoupling), RULE-27 (stream separation), and RULE-31 (archival guard).
 */

import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runCli } from "../../cli.ts";
import { handleReferences } from "./references.ts";

const execFileAsync = promisify(execFile);

describe("CLI References Command - Execution & Stream Separation (RULE-25, RULE-27, RULE-31)", () => {
  it("[RULE-25][RULE-27] should emit human formatted output to stderr and exit code 0", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-25"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: process.cwd(),
    });

    expect(exitCode).toBe(0);
    // RULE-27: stdout strictly empty for human command output
    expect(stdoutOutput).toBe("");
    // Human output on stderr
    expect(stderrOutput).toContain("Target: RULE-25");
    expect(stderrOutput).toContain("[Found In]");
    expect(stderrOutput).toContain("[Links To]");
    expect(stderrOutput).toContain("[Archival Safety Check]");
  });

  it("[RULE-27] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-25", "--json"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: process.cwd(),
    });

    expect(exitCode).toBe(0);
    expect(stderrOutput).toBe("");

    const parsed = JSON.parse(stdoutOutput);
    expect(parsed.target.tag).toBe("RULE-25");
    expect(parsed.target.slug).toBe("interface-core-decoupling");
    expect(parsed.foundIn).toBeDefined();
    expect(parsed.linksTo).toBeDefined();
    expect(parsed.archivalGuard).toBeDefined();
    expect(typeof parsed.archivalGuard.canArchive).toBe("boolean");
  });

  it("should support the refs alias via CLI entrypoint", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await runCli(["refs", "RULE-25"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: process.cwd(),
    });

    expect(exitCode).toBe(0);
    expect(stderrOutput).toContain("Target: RULE-25");
    expect(stderrOutput).toContain("[Found In]");
  });

  it("should support --to flag to show only outbound declared links", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-31", "--to"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: process.cwd(),
    });

    expect(exitCode).toBe(0);
    expect(stderrOutput).toContain("[Links To]");
    expect(stderrOutput).not.toContain("[Found In]");
    expect(stderrOutput).toContain("ADR-4");
  });

  it("should support --by flag to show only citations found across workspace", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-25", "--by", "--governance-only"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: process.cwd(),
    });

    expect(exitCode).toBe(0);
    expect(stderrOutput).toContain("[Found In]");
    expect(stderrOutput).toContain("Governance Links");
    expect(stderrOutput).not.toContain("[Links To]");
  });

  it("[RULE-27] should emit help to stderr with exit code 0 when --help is passed", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["--help"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
    });

    expect(exitCode).toBe(0);
    expect(stdoutOutput).toBe("");
    expect(stderrOutput).toContain("Usage: modie references <tag> [options]");
    expect(stderrOutput).toContain("--by, --found-in");
    expect(stderrOutput).toContain("--to, --links-to");
  });

  it("[RULE-27] should report error to stderr when required tag argument is missing", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences([], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
    });

    expect(exitCode).toBe(1);
    expect(stdoutOutput).toBe("");
    expect(stderrOutput).toContain("Missing required artifact identifier.");
  });

  it("[RULE-27] should report error to stderr when querying non-existent artifact", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-9999"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
    });

    expect(exitCode).toBe(1);
    expect(stdoutOutput).toBe("");
    expect(stderrOutput).toContain('Artifact "RULE-9999" was not found');
  });

  it("[RULE-25][RULE-27] should execute references via bin.ts subprocess", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "./src/interfaces/cli/bin.ts",
      "references",
      "RULE-25",
      "--json",
    ]);

    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout);
    expect(parsed.target.tag).toBe("RULE-25");
    expect(parsed.foundIn.total).toBeGreaterThan(0);
  });
});

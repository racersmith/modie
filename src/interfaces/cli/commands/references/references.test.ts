/**
 * Integration tests for declarative CLI references command and stream separation.
 * Enforces RULE-25 (interface core decoupling), RULE-27 (stream separation), RULE-31 (archival guard), and RULE-34 (fixture-based test isolation).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { runCli } from "../../cli.ts";
import { handleReferences } from "./references.ts";

const execFileAsync = promisify(execFile);

describe("CLI References Command - Execution & Stream Separation (RULE-25, RULE-27, RULE-31, RULE-34)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-cli-refs-"));

    // 1. Target and related ADRs
    await writeFile(
      join(tempDir, "architecture.ADR-1.md"),
      `---
links:
  - ADR-4
---

# Context
ADR defining upward linking.
`,
      "utf8",
    );

    await writeFile(
      join(tempDir, "foundation.ADR-4.md"),
      `---
links: []
---

# Context
Foundational ADR.
`,
      "utf8",
    );

    // 2. Rules linking to ADR-4
    await writeFile(
      join(tempDir, "interface-core-decoupling.RULE-25.md"),
      `---
links:
  - ADR-4
---

# Invariant
Decouple interfaces from core logic.
`,
      "utf8",
    );

    await writeFile(
      join(tempDir, "archival-guard.RULE-31.md"),
      `---
links:
  - ADR-4
---

# Invariant
Archival reference invariance.
`,
      "utf8",
    );

    // 3. Source and test code citing RULE-25 and ADR-1
    await writeFile(
      join(tempDir, "component.ts"),
      `// Implements RULE-25 and references ADR-1
export function run() {
  return "RULE-25";
}
`,
      "utf8",
    );

    await writeFile(
      join(tempDir, "component.test.ts"),
      `// Tests RULE-25
`,
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("[RULE-25][RULE-27][RULE-34] should emit human formatted output to stderr and exit code 0", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-25"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: tempDir,
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

  it("[RULE-27][RULE-34] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-25", "--json"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: tempDir,
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

  it("[RULE-34] should support the refs alias via CLI entrypoint in fixture workspace", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await runCli(["refs", "RULE-25"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: tempDir,
    });

    expect(exitCode).toBe(0);
    expect(stderrOutput).toContain("Target: RULE-25");
    expect(stderrOutput).toContain("[Found In]");
  });

  it("[RULE-34] should support --to flag to show only outbound declared links in fixture workspace", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["RULE-31", "--to"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: tempDir,
    });

    expect(exitCode).toBe(0);
    expect(stderrOutput).toContain("[Links To]");
    expect(stderrOutput).toContain("ADR-4");
    expect(stderrOutput).not.toContain("[Found In]");
  });

  it("[RULE-34] should support --by flag to show only citations found across workspace", async () => {
    let stdoutOutput = "";
    let stderrOutput = "";

    const exitCode = await handleReferences(["ADR-4", "--by", "--governance-only"], {
      stdout: (msg) => {
        stdoutOutput += msg + "\n";
      },
      stderr: (msg) => {
        stderrOutput += msg + "\n";
      },
      cwd: tempDir,
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
      cwd: tempDir,
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
      cwd: tempDir,
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
      cwd: tempDir,
    });

    expect(exitCode).toBe(1);
    expect(stdoutOutput).toBe("");
    expect(stderrOutput).toContain('Artifact "RULE-9999" was not found');
  });

  it("[RULE-25][RULE-27][RULE-34] should execute references via bin.ts subprocess against fixture workspace", async () => {
    const binPath = join(process.cwd(), "src/interfaces/cli/bin.ts");
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [binPath, "references", "RULE-25", "--json"],
      { cwd: tempDir },
    );

    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout);
    expect(parsed.target.tag).toBe("RULE-25");
    expect(parsed.foundIn.total).toBeGreaterThan(0);
  });
});


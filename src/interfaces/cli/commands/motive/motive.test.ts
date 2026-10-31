/**
 * CLI integration tests for `modie motive create`.
 * Verifies RULE-8, RULE-10, RULE-25, RULE-27, RULE-34, RULE-35, ADR-2, ADR-4, and ADR-10.
 */

import { describe, expect, it } from "bun:test";
import { captureCli, createTestWorkspace, makeTestTag } from "../../test-utils.ts";

describe("CLI Command: modie motive create (RULE-8, RULE-10, RULE-25, RULE-27, RULE-34, ADR-10)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit help to stderr with exit code 0 for motive namespace and motive create", async () => {
    const nsHelp = await captureCli(["motive", "--help"]);
    expect(nsHelp.exitCode).toBe(0);
    expect(nsHelp.stdout).toBe("");
    expect(nsHelp.stderr).toContain("Usage: modie motive <subcommand>");
    expect(nsHelp.stderr).toContain("create [content] [options]");

    const cmdHelp = await captureCli(["motive", "create", "--help"]);
    expect(cmdHelp.exitCode).toBe(0);
    expect(cmdHelp.stdout).toBe("");
    expect(cmdHelp.stderr).toContain(
      "Usage: modie motive create [content] [options]",
    );
    expect(cmdHelp.stderr).toContain("--overwrite");
  });

  // @verifies ADR-2, ADR-10, RULE-8, RULE-25, RULE-27, RULE-34
  it("[ADR-2][ADR-10][RULE-8][RULE-25][RULE-27][RULE-34] should create MOTIVE.md from positional content or --content flag and scaffold template when omitted", async () => {
    const workspace = await createTestWorkspace("modie-cli-motive-create-");

    try {
      // 1. Positional content in nested scope
      const posRes = await workspace.captureCli([
        "motive",
        "create",
        "Provide domain logic free of transport coupling.",
        "--scope",
        "src/core",
      ]);
      expect(posRes.exitCode).toBe(0);
      expect(posRes.stdout).toBe("src/core/.modie/MOTIVE.md");
      expect(posRes.stderr).toContain(
        '✓ Created motive for scope "src/core": src/core/.modie/MOTIVE.md',
      );
      expect(await workspace.readFile("src/core/.modie/MOTIVE.md")).toBe(
        "Provide domain logic free of transport coupling.\n",
      );

      // 2. Template scaffolding at root with --json output
      const jsonRes = await workspace.captureCli([
        "motive",
        "create",
        "--json",
      ]);
      expect(jsonRes.exitCode).toBe(0);
      const payload = JSON.parse(jsonRes.stdout);
      expect(payload.scope).toBe(".");
      expect(payload.relativePath).toBe(".modie/MOTIVE.md");
      expect(payload.scaffolded).toBe(true);
      expect(payload.overwritten).toBe(false);
      expect(jsonRes.stderr).toContain(
        '✓ Scaffolded motive for scope "." (.modie/MOTIVE.md)',
      );
    } finally {
      await workspace.cleanup();
    }
  });

  // @verifies ADR-10, RULE-8, RULE-10, RULE-27, RULE-34, RULE-35
  it("[ADR-10][RULE-8][RULE-10][RULE-27][RULE-34][RULE-35] should enforce singleton collision protection and RULE-10 reference prohibition on CLI", async () => {
    const workspace = await createTestWorkspace("modie-cli-motive-guards-");
    const forbiddenTag = makeTestTag("RULE", 10);

    try {
      await workspace.captureCli([
        "motive",
        "create",
        "--scope",
        "src/interfaces",
        "--content",
        "Initial interface layer purpose.",
      ]);

      // Reject duplicate creation without --overwrite
      const dupRes = await workspace.captureCli([
        "motive",
        "create",
        "--scope",
        "src/interfaces",
        "--content",
        "Attempted overwrite without flag.",
      ]);
      expect(dupRes.exitCode).toBe(1);
      expect(dupRes.stdout).toBe("");
      expect(dupRes.stderr).toContain("MOTIVE.md already exists");

      // Succeed with --overwrite
      const overwriteRes = await workspace.captureCli([
        "motive",
        "create",
        "--scope",
        "src/interfaces",
        "--content",
        "Updated interface layer purpose.",
        "--overwrite",
      ]);
      expect(overwriteRes.exitCode).toBe(0);
      expect(overwriteRes.stdout).toBe("src/interfaces/.modie/MOTIVE.md");
      expect(overwriteRes.stderr).toContain(
        '✓ Updated motive for scope "src/interfaces"',
      );

      // Reject content violating RULE-10
      const rule10Res = await workspace.captureCli([
        "motive",
        "create",
        "--scope",
        "src/core",
        "--content",
        `Enforces ${forbiddenTag} in core.`,
      ]);
      expect(rule10Res.exitCode).toBe(1);
      expect(rule10Res.stdout).toBe("");
      expect(rule10Res.stderr).toContain("prohibited in MOTIVE.md per RULE-10");
      expect(await workspace.fileExists("src/core/.modie/MOTIVE.md")).toBe(
        false,
      );
    } finally {
      await workspace.cleanup();
    }
  });
});


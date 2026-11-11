/**
 * CLI integration tests for spark commands (`modie spark add|list|promote|reject`).
 * Verifies RULE-25, RULE-27, and RULE-34.
 */

import { describe, expect, it } from "bun:test";
import { createFixtureWorkspace } from "../../../../core/platform/testing/index.ts";
import { captureCli } from "../../test-utils.ts";

describe("CLI Commands: modie spark (RULE-25, RULE-27, RULE-34)", () => {
  // @verifies RULE-27
  it("[RULE-27] should emit help to stderr with exit code 0 for spark namespace", async () => {
    const helpRes = await captureCli(["spark", "--help"]);
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.stdout).toBe("");
    expect(helpRes.stderr).toContain("Usage: modie spark <subcommand>");
    expect(helpRes.stderr).toContain("add <title> [body]");
    expect(helpRes.stderr).toContain("list [options]");
    expect(helpRes.stderr).toContain("promote <handle> [slug]");
    expect(helpRes.stderr).toContain("reject <handle> [reason]");
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should add sparks via CLI and observe stream separation", async () => {
    await using workspace = await createFixtureWorkspace("spark-cli-add-");

    const addRes = await captureCli(
      ["spark", "add", "CLI Test Spark", "This is the body."],
      workspace.cwd,
    );

    expect(addRes.exitCode).toBe(0);
    // Machine-readable handle to stdout per RULE-27
    const handle = addRes.stdout.trim();
    expect(handle).toMatch(/^[a-f0-9]{4}$/);
    // Human confirmation to stderr
    expect(addRes.stderr).toContain(
      `✓ Added spark [${handle}]: "CLI Test Spark" in .modie/ideas/SPARKS.md`,
    );

    const content = await workspace.readFile(".modie/ideas/SPARKS.md");
    expect(content).toContain(`# [${handle}] CLI Test Spark`);
    expect(content).toContain("This is the body.");
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should list active sparks and format table to stderr", async () => {
    await using workspace = await createFixtureWorkspace("spark-cli-list-");

    // Add two sparks
    const add1 = await captureCli(["spark", "add", "Alpha Spark"], workspace.cwd);
    const add2 = await captureCli(["spark", "add", "Beta Spark"], workspace.cwd);
    const handle1 = add1.stdout.trim();
    const handle2 = add2.stdout.trim();

    // Run modie spark list
    const listRes = await captureCli(["spark", "list"], workspace.cwd);
    expect(listRes.exitCode).toBe(0);

    // stdout contains handles line-by-line
    expect(listRes.stdout).toContain(handle1);
    expect(listRes.stdout).toContain(handle2);

    // stderr contains human aligned table
    expect(listRes.stderr).toContain("HANDLE");
    expect(listRes.stderr).toContain("TITLE");
    expect(listRes.stderr).toContain(`[${handle1}]`);
    expect(listRes.stderr).toContain(`[${handle2}]`);
    expect(listRes.stderr).toContain("Alpha Spark");
    expect(listRes.stderr).toContain("Beta Spark");

    // Root alias 'modie sparks' should also work
    const sparksAlias = await captureCli(["sparks"], workspace.cwd);
    expect(sparksAlias.exitCode).toBe(0);
    expect(sparksAlias.stdout).toContain(handle1);
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should promote spark to dedicated IDEA.md file", async () => {
    await using workspace = await createFixtureWorkspace("spark-cli-promote-");

    const addRes = await captureCli(
      ["spark", "add", "Promote Me", "Detailed design background."],
      workspace.cwd,
    );
    const handle = addRes.stdout.trim();

    const promoRes = await captureCli(
      ["spark", "promote", handle, "promote-me-idea"],
      workspace.cwd,
    );
    expect(promoRes.exitCode).toBe(0);

    // stdout has relative path
    expect(promoRes.stdout.trim()).toBe(".modie/ideas/promote-me-idea.IDEA.md");
    expect(promoRes.stderr).toContain(
      `✓ Promoted spark [${handle}] to idea "promote-me-idea": .modie/ideas/promote-me-idea.IDEA.md`,
    );

    const ideaFile = await workspace.readFile(
      ".modie/ideas/promote-me-idea.IDEA.md",
    );
    expect(ideaFile).toContain("# Promote Me");
    expect(ideaFile).toContain("## Problem & Motivation");
    expect(ideaFile).toContain("Detailed design background.");

    // SPARKS.md should now be empty of this spark
    const sparksContent = await workspace.readFile(".modie/ideas/SPARKS.md");
    expect(sparksContent).not.toContain(handle);
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should reject spark and append to .rejected/SPARKS.md", async () => {
    await using workspace = await createFixtureWorkspace("spark-cli-reject-");

    const addRes = await captureCli(
      ["spark", "add", "Discard Me", "Discardable body."],
      workspace.cwd,
    );
    const handle = addRes.stdout.trim();

    const rejectRes = await captureCli(
      ["spark", "reject", handle, "Out of scope for v1"],
      workspace.cwd,
    );
    expect(rejectRes.exitCode).toBe(0);
    expect(rejectRes.stdout.trim()).toBe(handle);
    expect(rejectRes.stderr).toContain(
      `✓ Rejected spark [${handle}] ("Discard Me"): archived to .modie/ideas/.rejected/SPARKS.md`,
    );

    const rejectedContent = await workspace.readFile(
      ".modie/ideas/.rejected/SPARKS.md",
    );
    expect(rejectedContent).toContain(`# [${handle}] Discard Me`);
    expect(rejectedContent).toContain("> **Rejected");
    expect(rejectedContent).toContain("Out of scope for v1");
    expect(rejectedContent).toContain("Discardable body.");

    // SPARKS.md should now be empty
    const sparksContent = await workspace.readFile(".modie/ideas/SPARKS.md");
    expect(sparksContent).not.toContain(handle);
  });
});


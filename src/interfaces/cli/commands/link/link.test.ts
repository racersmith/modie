/**
 * Integration tests for `modie link` and `modie unlink` CLI commands.
 * Verifies ADR-5, RULE-13, RULE-15, RULE-16, RULE-17, RULE-18, RULE-19,
 * RULE-25, RULE-27, RULE-34, RULE-35, and RULE-36.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../../../../core/testing/index.ts";
import { runCli } from "../../cli.ts";

describe("CLI `modie link` and `modie unlink` Commands (ADR-5, RULE-27, RULE-36)", () => {
  let workspace: FixtureWorkspace;
  let stdoutLines: string[];
  let stderrLines: string[];

  const rootAdrTag = makeTestTag("ADR", 601);
  const subAdrTag = makeTestTag("ADR", 602);
  const rootRuleTag = makeTestTag("RULE", 601);
  const subRuleTag = makeTestTag("RULE", 602);
  const task1Tag = makeTestTag("TASK", 601);
  const task2Tag = makeTestTag("TASK", 602);

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-cli-link-");
    stdoutLines = [];
    stderrLines = [];

    await workspace.createAdr({
      id: 601,
      slug: "root-adr",
      links: [],
      context: "Root ADR context.",
    });
    await workspace.createAdr({
      id: 602,
      slug: "sub-adr",
      subDir: "src/core/.modie/adrs",
      links: [],
      context: "Sub ADR context.",
    });

    await workspace.createRule({
      id: 601,
      slug: "root-rule",
      links: [],
      body: "Root rule assertion.",
    });
    await workspace.createRule({
      id: 602,
      slug: "sub-rule",
      subDir: "src/core/.modie/rules",
      links: [],
      body: "Sub rule assertion.",
    });

    await workspace.createTask({
      id: 601,
      slug: "first-task",
      title: "First Task",
      criteria: ["Item 1"],
    });
    await workspace.createTask({
      id: 602,
      slug: "second-task",
      title: "Second Task",
      criteria: ["Item 2"],
    });
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  function execCli(args: string[]): Promise<number> {
    stdoutLines = [];
    stderrLines = [];
    return runCli(args, {
      cwd: workspace.cwd,
      stdout: (msg) => stdoutLines.push(msg),
      stderr: (msg) => stderrLines.push(msg),
    });
  }

  // @verifies ADR-5, RULE-16, RULE-27, RULE-36
  it("[ADR-5][RULE-16][RULE-27][RULE-36] should link and unlink governance artifacts with stdout/stderr separation and --json output", async () => {
    // 1. Link subRule -> rootAdr (standard output mode)
    const linkCode = await execCli(["link", subRuleTag, rootAdrTag]);
    expect(linkCode).toBe(0);
    expect(stdoutLines).toEqual([
      `src/core/.modie/rules/sub-rule.${subRuleTag}.md`,
    ]);
    expect(stderrLines.join("\n")).toContain(
      `✓ Linked ${subRuleTag} -> ${rootAdrTag} (links)`,
    );

    // 2. Link task1 -> task2 with --json (automatic depends_on inference)
    const jsonLinkCode = await execCli([
      "link",
      task1Tag,
      task2Tag,
      "--json",
    ]);
    expect(jsonLinkCode).toBe(0);
    const parsedLink = JSON.parse(stdoutLines.join("\n"));
    expect(parsedLink.action).toBe("link");
    expect(parsedLink.relationship).toBe("depends_on");
    expect(parsedLink.changed).toBe(true);
    expect(parsedLink.depends_on).toEqual([task2Tag]);

    // 3. Unlink subRule -> rootAdr with --json
    const unlinkCode = await execCli([
      "unlink",
      subRuleTag,
      rootAdrTag,
      "--json",
    ]);
    expect(unlinkCode).toBe(0);
    const parsedUnlink = JSON.parse(stdoutLines.join("\n"));
    expect(parsedUnlink.action).toBe("unlink");
    expect(parsedUnlink.relationship).toBe("links");
    expect(parsedUnlink.changed).toBe(true);
    expect(parsedUnlink.links).toEqual([]);
  });

  // @verifies RULE-16, RULE-18, RULE-27, RULE-36
  it("[RULE-16][RULE-18][RULE-27][RULE-36] should report clear constraint violation errors to stderr and exit non-zero", async () => {
    // 1. Spatial ancestry violation: rootRule cannot link to descendant subAdr (RULE-16)
    const scopeFailCode = await execCli(["link", rootRuleTag, subAdrTag]);
    expect(scopeFailCode).toBe(1);
    expect(stdoutLines).toEqual([]);
    expect(stderrLines.join("\n")).toContain("RULE-16");

    // 2. Circular dependency violation: task1 -> task2, then task2 -> task1 (RULE-18)
    await execCli(["link", task1Tag, task2Tag]);
    const cycleFailCode = await execCli(["link", task2Tag, task1Tag]);
    expect(cycleFailCode).toBe(1);
    expect(stdoutLines).toEqual([]);
    expect(stderrLines.join("\n")).toContain("Circular task dependency detected");
    expect(stderrLines.join("\n")).toContain("RULE-18");

    // 3. Explicit --type override violation: task1 -> task2 with --type links (RULE-15)
    const overrideFailCode = await execCli([
      "link",
      task1Tag,
      task2Tag,
      "--type",
      "links",
    ]);
    expect(overrideFailCode).toBe(1);
    expect(stdoutLines).toEqual([]);
    expect(stderrLines.join("\n")).toContain("RULE-15");
  });

  // @verifies RULE-27
  it("[RULE-27] should emit help to stderr for modie link --help and modie unlink --help", async () => {
    const linkHelpCode = await execCli(["link", "--help"]);
    expect(linkHelpCode).toBe(0);
    expect(stdoutLines).toEqual([]);
    expect(stderrLines.join("\n")).toContain(
      "Usage: modie link <source> <target> [options]",
    );

    const unlinkHelpCode = await execCli(["unlink", "--help"]);
    expect(unlinkHelpCode).toBe(0);
    expect(stdoutLines).toEqual([]);
    expect(stderrLines.join("\n")).toContain(
      "Usage: modie unlink <source> <target> [options]",
    );
  });
});

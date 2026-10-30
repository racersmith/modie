/**
 * Integration and unit tests for `modie task create`.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createTestWorkspace,
  makeTestTag,
  type TestWorkspace,
} from "../../test-utils.ts";

describe("CLI Task Creation - Execution & Stream Separation (RULE-1, RULE-25, RULE-27, RULE-34, RULE-35, ADR-1, ADR-6, ADR-9)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-task-create-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-1, RULE-25, RULE-27, RULE-34, RULE-35, ADR-1, ADR-6, ADR-9
  it("[RULE-1][RULE-25][RULE-27][RULE-34][RULE-35][ADR-1][ADR-6][ADR-9] should create a task with machine path to stdout and status to stderr", async () => {
    const depTask = makeTestTag("TASK", 1);
    const linkAdr = makeTestTag("ADR", 1);
    const linkRule = makeTestTag("RULE", 27);

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
      "CLI Stream Verification Task",
      "--scope",
      workspace.cwd,
      "--context",
      "Verifying CLI stream output separation",
      "--depends-on",
      depTask,
      "--links",
      `${linkAdr},${linkRule}`,
      "--criteria",
      "Verify stdout path,Verify stderr log",
      "--branch",
      "dev",
    ]);

    expect(exitCode).toBe(0);

    // RULE-27: stdout must strictly contain the machine-parsable relative file path
    expect(stdout).toContain(".modie/tasks/cli-stream-verification-task.");
    expect(stdout).toContain(".md");
    expect(stdout).not.toContain("✓");

    // RULE-27: stderr must strictly contain human status and diagnostics
    expect(stderr).toContain("✓ Created task");
  });

  // @verifies RULE-27, RULE-34
  it("[RULE-27][RULE-34] should emit machine-parsable JSON to stdout when --json is passed", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
      "JSON Output Mode Task",
      "--scope",
      workspace.cwd,
      "--branch",
      "dev",
      "--json",
    ]);

    expect(exitCode).toBe(0);

    // RULE-27: stdout must be valid parseable JSON
    const parsed = JSON.parse(stdout);
    expect(parsed.slug).toBe("json-output-mode-task");
    expect(parsed.filename).toContain("json-output-mode-task.");
    expect(parsed.filename).toContain(".md");
    expect(parsed.relativePath).toContain(".modie/tasks");

    // Status diagnostics emitted to stderr
    expect(stderr).toContain("✓ Created task");
  });

  // @verifies ADR-9, RULE-34, RULE-35
  it("[ADR-9][RULE-34][RULE-35] should support prefix tag via --prefix flag", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
      "Prefixed CLI Task",
      "--scope",
      workspace.cwd,
      "--prefix",
      "C",
      "--branch",
      "feature/new-command",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    const expectedTag = makeTestTag("TASK", "C1");
    expect(parsed.id).toBe("C1");
    expect(parsed.filename).toBe(`prefixed-cli-task.${expectedTag}.md`);
  });
});

describe("CLI Task Creation - Validation & Errors (RULE-15, RULE-18, RULE-27, RULE-35)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-task-errors-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr when title is omitted", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: Missing required task title");
  });

  // @verifies RULE-27
  it("[RULE-27] should report error to stderr on unknown flags", async () => {
    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
      "Some Title",
      "--unknown-flag",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Error: Unknown flag "--unknown-flag"');
  });

  // @verifies RULE-15, RULE-27, RULE-35
  it("[RULE-15][RULE-27][RULE-35] should report domain link validation error to stderr with exit code 1", async () => {
    const illegalLink = makeTestTag("TASK", 1);
    const rule15Tag = makeTestTag("RULE", 15);

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
      "Invalid Links Test",
      "--links",
      illegalLink,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Invalid task link target");
    expect(stderr).toContain(rule15Tag);
  });
});

describe("CLI Task Creation - Repeated Flags & Punctuation Support (RULE-15, RULE-25, RULE-27, RULE-34, RULE-35)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-task-flags-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34, RULE-35
  it("[RULE-25][RULE-27][RULE-34][RULE-35] should preserve criteria with punctuation verbatim when using -a or --criterion", async () => {
    const rule27Tag = makeTestTag("RULE", 27);

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
      "Verbatim Criteria Test",
      "--scope",
      workspace.cwd,
      "--branch",
      "dev",
      "-a",
      "Export checkTaskItem from index.ts, including all types",
      "--criterion",
      `Ensure stdout and stderr separation, per ${rule27Tag}`,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.acceptanceCriteria.length).toBe(3);
    expect(parsed.acceptanceCriteria[0].text).toBe(
      "Export checkTaskItem from index.ts, including all types",
    );
    expect(parsed.acceptanceCriteria[1].text).toBe(
      `Ensure stdout and stderr separation, per ${rule27Tag}`,
    );
    expect(parsed.acceptanceCriteria[2].text).toBe("User Review");
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should omit User Review criterion when --no-review is passed", async () => {
    const { exitCode, stdout } = await workspace.captureCli([
      "task",
      "create",
      "No Review CLI Task",
      "--scope",
      workspace.cwd,
      "--branch",
      "dev",
      "--no-review",
      "-a",
      "Automated step only",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.acceptanceCriteria.length).toBe(1);
    expect(parsed.acceptanceCriteria[0].text).toBe("Automated step only");
  });

  // @verifies RULE-15, RULE-25, RULE-34, RULE-35
  it("[RULE-15][RULE-25][RULE-34][RULE-35] should support repeated -l / --link flags without comma splitting", async () => {
    const linkAdr6 = makeTestTag("ADR", 6);
    const linkRule25 = makeTestTag("RULE", 25);

    const { exitCode, stdout, stderr } = await workspace.captureCli([
      "task",
      "create",
      "Repeated Links Test",
      "--scope",
      workspace.cwd,
      "--branch",
      "dev",
      "--link",
      linkAdr6,
      "-l",
      linkRule25,
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.links).toEqual([linkAdr6, linkRule25]);
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should support planned governance flags --plan-rule and --plan-adr", async () => {
    const { exitCode, stdout } = await workspace.captureCli([
      "task",
      "create",
      "Planned Governance CLI Task",
      "--scope",
      workspace.cwd,
      "--branch",
      "dev",
      "--plan-rule",
      "Multi-Branch Guard Rule",
      "--plan-adr",
      "Unified Storage Architecture",
      "--json",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.plannedGovernance).toBeDefined();
    expect(parsed.plannedGovernance.rules).toHaveLength(1);
    expect(parsed.plannedGovernance.rules[0].text).toBe(
      "Multi-Branch Guard Rule",
    );
    expect(parsed.plannedGovernance.adrs).toHaveLength(1);
    expect(parsed.plannedGovernance.adrs[0].text).toBe(
      "Unified Storage Architecture",
    );
  });
});

describe("CLI Task Creation - Subprocess Execution (RULE-25, RULE-27, RULE-34)", () => {
  let workspace: TestWorkspace;

  beforeEach(async () => {
    workspace = await createTestWorkspace("modie-cli-task-subproc-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-27, RULE-34
  it("[RULE-25][RULE-27][RULE-34] should execute bin.ts as a child process and return valid output", async () => {
    const { stdout, stderr } = await workspace.execBin([
      "task",
      "create",
      "Subprocess Verification Task",
      "--scope",
      workspace.cwd,
      "--branch",
      "dev",
      "--json",
    ]);

    expect(stderr).toContain("✓ Created task");
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.slug).toBe("subprocess-verification-task");
    expect(parsed.filename).toContain("subprocess-verification-task.");
    expect(parsed.filename).toContain(".md");
  });
});

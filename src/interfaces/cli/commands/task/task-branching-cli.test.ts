import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { runCli } from "../../cli.ts";

const execFileAsync = promisify(execFile);

async function captureCli(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";

  const exitCode = await runCli(args, {
    stdout: (msg) => {
      stdout += msg + "\n";
    },
    stderr: (msg) => {
      stderr += msg + "\n";
    },
    cwd,
  });

  return { exitCode, stdout, stderr };
}

describe("CLI Task Start & Merge - Execution & Stream Separation (RULE-25, RULE-27, RULE-28)", () => {
  let gitDir: string;

  beforeEach(async () => {
    gitDir = await mkdtemp(join(tmpdir(), "modie-cli-branch-"));
    await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.name", "CLI Tester"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.email", "tester@modie.dev"], { cwd: gitDir });

    // Initial commit on main
    await writeFile(join(gitDir, "README.md"), "# Branch CLI\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore: initial commit"], { cwd: gitDir });

    // Create dev trunk branch
    await execFileAsync("git", ["checkout", "-b", "dev"], { cwd: gitDir });

    // Create .modie/config.json with protected: ["main"], trunk: "dev"
    const modieDir = join(gitDir, ".modie");
    await mkdir(modieDir, { recursive: true });
    await writeFile(
      join(modieDir, "config.json"),
      JSON.stringify({
        git: {
          trunk: "dev",
          protectedBranches: ["main"],
        },
      }),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(gitDir, { recursive: true, force: true });
  });

  it("[RULE-27] should emit help for task start and task merge to stderr with exitCode 0", async () => {
    const startHelp = await captureCli(["task", "start", "--help"], gitDir);
    expect(startHelp.exitCode).toBe(0);
    expect(startHelp.stdout).toBe("");
    expect(startHelp.stderr).toContain("Usage: modie task start");

    const mergeHelp = await captureCli(["task", "merge", "--help"], gitDir);
    expect(mergeHelp.exitCode).toBe(0);
    expect(mergeHelp.stdout).toBe("");
    expect(mergeHelp.stderr).toContain("Usage: modie task merge");
  });

  it("[RULE-27] should report error to stderr when identifier argument is missing", async () => {
    const startRes = await captureCli(["task", "start"], gitDir);
    expect(startRes.exitCode).toBe(1);
    expect(startRes.stdout).toBe("");
    expect(startRes.stderr).toContain("Error: Missing required task identifier");

    const mergeRes = await captureCli(["task", "merge"], gitDir);
    expect(mergeRes.exitCode).toBe(1);
    expect(mergeRes.stdout).toBe("");
    expect(mergeRes.stderr).toContain("Error: Missing required task identifier");
  });

  it("[RULE-25][RULE-27][RULE-28] should start task branch with machine name to stdout and status to stderr", async () => {
    const taskPath = join(gitDir, "cli-feat.TASK-200.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nTest\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "start", "TASK-200"],
      gitDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("task/200-cli-feat");
    expect(stderr).toContain('✓ Switched to branch "task/200-cli-feat"');

    // Verify git branch is currently task/200-cli-feat
    const { stdout: curBranch } = await execFileAsync("git", ["branch", "--show-current"], {
      cwd: gitDir,
    });
    expect(curBranch.trim()).toBe("task/200-cli-feat");
  });

  it("[RULE-27] should emit machine JSON to stdout when --json is passed to task start", async () => {
    const taskPath = join(gitDir, "json-feat.TASK-201.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nJSON\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "start", "TASK-201", "--json"],
      gitDir,
    );

    expect(exitCode).toBe(0);
    expect(stderr).toContain('✓ Switched to branch "task/201-json-feat"');
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.branchName).toBe("task/201-json-feat");
    expect(parsed.baseBranch).toBe("dev");
    expect(parsed.created).toBe(true);
  });

  it("[RULE-28] should reject starting a task from a protected branch", async () => {
    const taskPath = join(gitDir, "prot.TASK-202.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nProt\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );

    // Switch to main (protected)
    await execFileAsync("git", ["checkout", "main"], { cwd: gitDir });

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "start", "TASK-202"],
      gitDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Cannot start task from protected branch "main"');
  });

  it("[RULE-25][RULE-27][RULE-28] should merge a completed subtask back into parent branch", async () => {
    const parentPath = join(gitDir, "parent.TASK-203.md");
    await writeFile(parentPath, "---\ndepends_on: []\nlinks: []\n---\n# Context\nP\n# Acceptance Criteria\n- [ ] Item\n", "utf8");
    await execFileAsync("git", ["add", "parent.TASK-203.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: parent"], { cwd: gitDir });
    await captureCli(["task", "start", "TASK-203"], gitDir);

    const subPath = join(gitDir, "sub.TASK-203-1.md");
    await writeFile(subPath, "---\ndepends_on: [TASK-203]\nlinks: []\n---\n# Context\nS\n# Acceptance Criteria\n- [x] Item\n", "utf8");
    await execFileAsync("git", ["add", "sub.TASK-203-1.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-203-1): sub"], { cwd: gitDir });
    await captureCli(["task", "start", "TASK-203-1"], gitDir);

    // Code mutation and artifact deletion on subtask branch
    await writeFile(join(gitDir, "code.txt"), "hello world\n", "utf8");
    await execFileAsync("git", ["add", "code.txt"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: code"], { cwd: gitDir });
    await rm(subPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore(task): delete completed TASK-203-1 artifact"], { cwd: gitDir });

    // Execute CLI task merge
    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "merge", "TASK-203-1"],
      gitDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("task/203-parent");
    expect(stderr).toContain('✓ Merged task branch "task/203-1-sub" into "task/203-parent"');

    // Subtask branch deleted
    const { stdout: bList } = await execFileAsync("git", ["branch", "--list", "task/203-1-sub"], { cwd: gitDir });
    expect(bList.trim()).toBe("");
  });

  it("[RULE-28] should reject merging subtask directly into trunk dev via CLI", async () => {
    const parentPath = join(gitDir, "parent.TASK-204.md");
    await writeFile(parentPath, "---\ndepends_on: []\nlinks: []\n---\n# Context\nP\n# Acceptance Criteria\n- [ ] Item\n", "utf8");
    await execFileAsync("git", ["add", "parent.TASK-204.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: parent"], { cwd: gitDir });
    await captureCli(["task", "start", "TASK-204"], gitDir);

    const subPath = join(gitDir, "sub.TASK-204-1.md");
    await writeFile(subPath, "---\ndepends_on: [TASK-204]\nlinks: []\n---\n# Context\nS\n# Acceptance Criteria\n- [x] Item\n", "utf8");
    await execFileAsync("git", ["add", "sub.TASK-204-1.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-204-1): sub"], { cwd: gitDir });
    await captureCli(["task", "start", "TASK-204-1"], gitDir);

    await rm(subPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore(task): delete completed TASK-204-1 artifact"], { cwd: gitDir });

    const { exitCode, stdout, stderr } = await captureCli(
      ["task", "merge", "TASK-204-1", "--target", "dev"],
      gitDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('Subtask branch "task/204-1-sub" cannot be merged directly into trunk branch "dev" per RULE-28');
  });
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  computeTaskBranchTopology,
  formatTaskBranchName,
  mergeTaskBranch,
  parseSubtaskId,
  startTaskBranch,
} from "./branching.ts";

const execFileAsync = promisify(execFile);

describe("Task Branching Service (ADR-9, ADR-10, RULE-28)", () => {
  let gitDir: string;

  beforeEach(async () => {
    gitDir = await mkdtemp(join(tmpdir(), "modie-branching-test-"));
    await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.name", "Branch Tester"], { cwd: gitDir });
    await execFileAsync("git", ["config", "user.email", "branch@modie.dev"], { cwd: gitDir });

    // Initial commit on main
    await writeFile(join(gitDir, "README.md"), "# Branch Test\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore: initial commit"], { cwd: gitDir });

    // Create dev trunk branch
    await execFileAsync("git", ["checkout", "-b", "dev"], { cwd: gitDir });

    // Create .modie/config.json with protected branches: ["main"] and trunk: "dev"
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

  it("should format canonical task branch names", () => {
    expect(formatTaskBranchName("11", "branching-automation")).toBe(
      "task/11-branching-automation",
    );
    expect(formatTaskBranchName("TASK-2-1", "create-template")).toBe(
      "task/2-1-create-template",
    );
  });

  it("should parse subtask parent ID and sequence tokens per ADR-9", () => {
    expect(parseSubtaskId("2-1")).toEqual({ parentId: "2", sequence: "1" });
    expect(parseSubtaskId("TASK-11-2")).toEqual({ parentId: "11", sequence: "2" });
    expect(parseSubtaskId("TASK-J101-3")).toEqual({ parentId: "J101", sequence: "3" });
    expect(parseSubtaskId("11")).toBeNull();
    expect(parseSubtaskId("TASK-11")).toBeNull();
  });

  it("should compute topology for a root task from trunk", async () => {
    const taskPath = join(gitDir, "root-feat.TASK-100.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nRoot\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );

    const topo = await computeTaskBranchTopology("TASK-100", { cwd: gitDir });
    expect(topo.taskId).toBe("100");
    expect(topo.slug).toBe("root-feat");
    expect(topo.branchName).toBe("task/100-root-feat");
    expect(topo.isSubtask).toBe(false);
    expect(topo.expectedBaseBranch).toBe("dev");
    expect(topo.isCurrentBranchProtected).toBe(false);
    expect(topo.trunkBranch).toBe("dev");
    expect(topo.protectedBranches).toEqual(["main"]);
  });

  it("should guard against starting a task from a protected branch", async () => {
    const taskPath = join(gitDir, "protected-test.TASK-101.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nProtected\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );

    // Switch to protected branch 'main'
    await execFileAsync("git", ["checkout", "main"], { cwd: gitDir });

    await expect(startTaskBranch("TASK-101", { cwd: gitDir })).rejects.toThrow(
      /Cannot start task from protected branch "main"/,
    );
  });

  it("should create and checkout a root task branch from trunk", async () => {
    const taskPath = join(gitDir, "feat.TASK-102.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nFeat\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );

    const res = await startTaskBranch("TASK-102", { cwd: gitDir });
    expect(res.branchName).toBe("task/102-feat");
    expect(res.baseBranch).toBe("dev");
    expect(res.created).toBe(true);

    // Verify current branch is now task/102-feat
    const { stdout: current } = await execFileAsync("git", ["branch", "--show-current"], {
      cwd: gitDir,
    });
    expect(current.trim()).toBe("task/102-feat");
  });

  it("should prevent starting a subtask if the parent task branch does not exist", async () => {
    const parentPath = join(gitDir, "feat.TASK-102.md");
    await writeFile(
      parentPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nFeat\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );
    const subtaskPath = join(gitDir, "child.TASK-102-1.md");
    await writeFile(
      subtaskPath,
      "---\ndepends_on: [TASK-102]\nlinks: []\n---\n# Context\nChild\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );

    await expect(startTaskBranch("TASK-102-1", { cwd: gitDir })).rejects.toThrow(
      /Parent task branch "task\/102-feat" does not exist in local git branches.*RULE-28/,
    );
  });

  it("should branch a subtask directly from its parent task branch per RULE-28", async () => {
    const parentPath = join(gitDir, "parent.TASK-103.md");
    await writeFile(
      parentPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nParent\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "parent.TASK-103.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: add parent task"], { cwd: gitDir });

    // Start parent branch
    await startTaskBranch("TASK-103", { cwd: gitDir });

    // Create subtask file
    const subtaskPath = join(gitDir, "sub.TASK-103-1.md");
    await writeFile(
      subtaskPath,
      "---\ndepends_on: [TASK-103]\nlinks: []\n---\n# Context\nSub\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "sub.TASK-103-1.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: add subtask"], { cwd: gitDir });

    // Start subtask branch
    const res = await startTaskBranch("TASK-103-1", { cwd: gitDir });
    expect(res.branchName).toBe("task/103-1-sub");
    expect(res.baseBranch).toBe("task/103-parent");
    expect(res.isSubtask).toBe(true);

    const { stdout: current } = await execFileAsync("git", ["branch", "--show-current"], {
      cwd: gitDir,
    });
    expect(current.trim()).toBe("task/103-1-sub");
  });

  it("should reject merging a subtask directly into trunk dev per RULE-28", async () => {
    const parentPath = join(gitDir, "parent.TASK-104.md");
    await writeFile(parentPath, "---\ndepends_on: []\nlinks: []\n---\n# Context\nParent\n# Acceptance Criteria\n- [ ] Item\n", "utf8");
    await execFileAsync("git", ["add", "parent.TASK-104.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: parent"], { cwd: gitDir });
    await startTaskBranch("TASK-104", { cwd: gitDir });

    const subPath = join(gitDir, "sub.TASK-104-1.md");
    await writeFile(subPath, "---\ndepends_on: [TASK-104]\nlinks: []\n---\n# Context\nSub\n# Acceptance Criteria\n- [x] Item\n", "utf8");
    await execFileAsync("git", ["add", "sub.TASK-104-1.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-104-1): sub"], { cwd: gitDir });
    await startTaskBranch("TASK-104-1", { cwd: gitDir });

    // Mark completed in git
    await rm(subPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore(task): delete completed TASK-104-1 artifact"], { cwd: gitDir });

    // Attempting to merge subtask into dev trunk must be rejected per RULE-28
    await expect(
      mergeTaskBranch("TASK-104-1", { target: "dev", cwd: gitDir }),
    ).rejects.toThrow(
      /Subtask branch "task\/104-1-sub" cannot be merged directly into trunk branch "dev" per RULE-28/,
    );
  });

  it("should reject merging any task branch into a protected branch", async () => {
    const taskPath = join(gitDir, "root.TASK-105.md");
    await writeFile(taskPath, "---\ndepends_on: []\nlinks: []\n---\n# Context\nRoot\n# Acceptance Criteria\n- [x] Item\n", "utf8");
    await execFileAsync("git", ["add", "root.TASK-105.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-105): root"], { cwd: gitDir });
    await startTaskBranch("TASK-105", { cwd: gitDir });

    // Complete in git
    await rm(taskPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore(task): delete completed TASK-105 artifact"], { cwd: gitDir });

    // Attempting to merge into protected branch "main" must be rejected
    await expect(
      mergeTaskBranch("TASK-105", { target: "main", cwd: gitDir }),
    ).rejects.toThrow(/Cannot merge root task branch.*directly into protected branch "main"/);
  });

  it("should successfully merge a subtask back into its parent branch and delete the subtask branch", async () => {
    const parentPath = join(gitDir, "parent.TASK-106.md");
    await writeFile(parentPath, "---\ndepends_on: []\nlinks: []\n---\n# Context\nParent\n# Acceptance Criteria\n- [ ] Item\n", "utf8");
    await execFileAsync("git", ["add", "parent.TASK-106.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: parent"], { cwd: gitDir });
    await startTaskBranch("TASK-106", { cwd: gitDir });

    const subPath = join(gitDir, "sub.TASK-106-1.md");
    await writeFile(subPath, "---\ndepends_on: [TASK-106]\nlinks: []\n---\n# Context\nSub\n# Acceptance Criteria\n- [x] Item\n", "utf8");
    await execFileAsync("git", ["add", "sub.TASK-106-1.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-106-1): sub"], { cwd: gitDir });
    await startTaskBranch("TASK-106-1", { cwd: gitDir });

    // Code mutation on subtask branch
    await writeFile(join(gitDir, "subtask.txt"), "subtask code\n", "utf8");
    await execFileAsync("git", ["add", "subtask.txt"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: subtask implementation"], { cwd: gitDir });

    // Complete subtask artifact per RULE-21
    await rm(subPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore(task): delete completed TASK-106-1 artifact"], { cwd: gitDir });

    // Merge subtask branch back into parent
    const mergeRes = await mergeTaskBranch("TASK-106-1", { cwd: gitDir });
    expect(mergeRes.sourceBranch).toBe("task/106-1-sub");
    expect(mergeRes.targetBranch).toBe("task/106-parent");
    expect(mergeRes.deletedSourceBranch).toBe(true);

    // Current branch should now be parent task branch
    const { stdout: curBranch } = await execFileAsync("git", ["branch", "--show-current"], { cwd: gitDir });
    expect(curBranch.trim()).toBe("task/106-parent");

    // Subtask branch should no longer exist locally
    const { stdout: branchList } = await execFileAsync("git", ["branch", "--list", "task/106-1-sub"], { cwd: gitDir });
    expect(branchList.trim()).toBe("");
  });
});

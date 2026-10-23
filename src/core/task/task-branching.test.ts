import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  computeTaskBranchTopology,
  detectArtifactCollisions,
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
    await execFileAsync("git", ["config", "user.name", "Branch Tester"], {
      cwd: gitDir,
    });
    await execFileAsync("git", ["config", "user.email", "branch@modie.dev"], {
      cwd: gitDir,
    });

    // Initial commit on main
    await writeFile(join(gitDir, "README.md"), "# Branch Test\n", "utf8");
    await execFileAsync("git", ["add", "README.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore: initial commit"], {
      cwd: gitDir,
    });

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
    expect(parseSubtaskId("TASK-11-2")).toEqual({
      parentId: "11",
      sequence: "2",
    });
    expect(parseSubtaskId("TASK-J101-3")).toEqual({
      parentId: "J101",
      sequence: "3",
    });
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
    const { stdout: current } = await execFileAsync(
      "git",
      ["branch", "--show-current"],
      {
        cwd: gitDir,
      },
    );
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

    await expect(
      startTaskBranch("TASK-102-1", { cwd: gitDir }),
    ).rejects.toThrow(
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
    await execFileAsync("git", ["commit", "-m", "docs: add parent task"], {
      cwd: gitDir,
    });

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
    await execFileAsync("git", ["commit", "-m", "docs: add subtask"], {
      cwd: gitDir,
    });

    // Start subtask branch
    const res = await startTaskBranch("TASK-103-1", { cwd: gitDir });
    expect(res.branchName).toBe("task/103-1-sub");
    expect(res.baseBranch).toBe("task/103-parent");
    expect(res.isSubtask).toBe(true);

    const { stdout: current } = await execFileAsync(
      "git",
      ["branch", "--show-current"],
      {
        cwd: gitDir,
      },
    );
    expect(current.trim()).toBe("task/103-1-sub");
  });

  it("should reject merging a subtask directly into trunk dev per RULE-28", async () => {
    const parentPath = join(gitDir, "parent.TASK-104.md");
    await writeFile(
      parentPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nParent\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "parent.TASK-104.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: parent"], {
      cwd: gitDir,
    });
    await startTaskBranch("TASK-104", { cwd: gitDir });

    const subPath = join(gitDir, "sub.TASK-104-1.md");
    await writeFile(
      subPath,
      "---\ndepends_on: [TASK-104]\nlinks: []\n---\n# Context\nSub\n# Acceptance Criteria\n- [x] Item\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "sub.TASK-104-1.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-104-1): sub"], {
      cwd: gitDir,
    });
    await startTaskBranch("TASK-104-1", { cwd: gitDir });

    // Mark completed in git
    await rm(subPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "chore(task): delete completed TASK-104-1 artifact"],
      { cwd: gitDir },
    );

    // Attempting to merge subtask into dev trunk must be rejected per RULE-28
    await expect(
      mergeTaskBranch("TASK-104-1", { target: "dev", cwd: gitDir }),
    ).rejects.toThrow(
      /Subtask branch "task\/104-1-sub" cannot be merged directly into trunk branch "dev" per RULE-28/,
    );
  });

  it("should reject merging any task branch into a protected branch", async () => {
    const taskPath = join(gitDir, "root.TASK-105.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nRoot\n# Acceptance Criteria\n- [x] Item\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "root.TASK-105.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-105): root"], {
      cwd: gitDir,
    });
    await startTaskBranch("TASK-105", { cwd: gitDir });

    // Complete in git
    await rm(taskPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "chore(task): delete completed TASK-105 artifact"],
      { cwd: gitDir },
    );

    // Attempting to merge into protected branch "main" must be rejected
    await expect(
      mergeTaskBranch("TASK-105", { target: "main", cwd: gitDir }),
    ).rejects.toThrow(
      /Cannot merge root task branch.*directly into protected branch "main"/,
    );
  });

  it("should successfully merge a subtask back into its parent branch and delete the subtask branch", async () => {
    const parentPath = join(gitDir, "parent.TASK-106.md");
    await writeFile(
      parentPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nParent\n# Acceptance Criteria\n- [ ] Item\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "parent.TASK-106.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "docs: parent"], {
      cwd: gitDir,
    });
    await startTaskBranch("TASK-106", { cwd: gitDir });

    const subPath = join(gitDir, "sub.TASK-106-1.md");
    await writeFile(
      subPath,
      "---\ndepends_on: [TASK-106]\nlinks: []\n---\n# Context\nSub\n# Acceptance Criteria\n- [x] Item\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "sub.TASK-106-1.md"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat(TASK-106-1): sub"], {
      cwd: gitDir,
    });
    await startTaskBranch("TASK-106-1", { cwd: gitDir });

    // Code mutation on subtask branch
    await writeFile(join(gitDir, "subtask.txt"), "subtask code\n", "utf8");
    await execFileAsync("git", ["add", "subtask.txt"], { cwd: gitDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "feat: subtask implementation"],
      { cwd: gitDir },
    );

    // Complete subtask artifact per RULE-21
    await rm(subPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "chore(task): delete completed TASK-106-1 artifact"],
      { cwd: gitDir },
    );

    // Merge subtask branch back into parent
    const mergeRes = await mergeTaskBranch("TASK-106-1", { cwd: gitDir });
    expect(mergeRes.sourceBranch).toBe("task/106-1-sub");
    expect(mergeRes.targetBranch).toBe("task/106-parent");
    expect(mergeRes.deletedSourceBranch).toBe(true);

    // Current branch should now be parent task branch
    const { stdout: curBranch } = await execFileAsync(
      "git",
      ["branch", "--show-current"],
      { cwd: gitDir },
    );
    expect(curBranch.trim()).toBe("task/106-parent");

    // Subtask branch should no longer exist locally
    const { stdout: branchList } = await execFileAsync(
      "git",
      ["branch", "--list", "task/106-1-sub"],
      { cwd: gitDir },
    );
    expect(branchList.trim()).toBe("");
  });

  // @verifies RULE-33
  it("[RULE-33] should detect artifact collisions when concurrent branches introduce the same artifact tag", async () => {
    // On dev, create and commit RULE-99
    await mkdir(join(gitDir, ".modie", "rules"), { recursive: true });
    await writeFile(
      join(gitDir, ".modie", "rules", "rule-a.RULE-99.md"),
      "# Rule 99 on Dev\n",
    );
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: add RULE-99 on dev"], {
      cwd: gitDir,
    });

    // Create branch feature/concurrent from HEAD~1
    await execFileAsync(
      "git",
      ["checkout", "-b", "feature/concurrent", "HEAD~1"],
      { cwd: gitDir },
    );
    await mkdir(join(gitDir, ".modie", "rules"), { recursive: true });
    await writeFile(
      join(gitDir, ".modie", "rules", "rule-b.RULE-99.md"),
      "# Rule 99 on Feature\n",
    );
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "feat: add RULE-99 on feature"],
      { cwd: gitDir },
    );

    const collisions = await detectArtifactCollisions(
      "feature/concurrent",
      "dev",
      gitDir,
    );
    expect(collisions.length).toBe(1);
    expect(collisions[0]?.tag).toBe("RULE-99");
    expect(collisions[0]?.reason).toBe("duplicate_tag");
  });

  // @verifies RULE-28, RULE-33
  it("[RULE-28][RULE-33] should reject task branch merge when artifact collision exists on target branch", async () => {
    // 1. On dev, create and commit ADR-50
    await mkdir(join(gitDir, ".modie", "adrs"), { recursive: true });
    await writeFile(
      join(gitDir, ".modie", "adrs", "adr-a.ADR-50.md"),
      "# ADR 50 on Dev\n",
    );
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: add ADR-50 on dev"], {
      cwd: gitDir,
    });

    // 2. Branch task/107-test from before ADR-50 was added
    await execFileAsync("git", ["checkout", "-b", "task/107-test", "HEAD~1"], {
      cwd: gitDir,
    });

    // Create completed task artifact so completion check passes
    const taskPath = join(gitDir, "test.TASK-107.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nTest\n# Acceptance Criteria\n- [x] Item\n",
    );
    // And introduce conflicting ADR-50
    await mkdir(join(gitDir, ".modie", "adrs"), { recursive: true });
    await writeFile(
      join(gitDir, ".modie", "adrs", "adr-b.ADR-50.md"),
      "# ADR 50 on Task Branch\n",
    );
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "feat(TASK-107): task and conflicting ADR-50"],
      { cwd: gitDir },
    );

    // Delete task artifact per RULE-21 completion record
    await rm(taskPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync(
      "git",
      ["commit", "-m", "chore(task): delete completed TASK-107 artifact"],
      { cwd: gitDir },
    );

    // 3. Merging task/107-test-task into dev must throw artifact collision error
    await expect(
      mergeTaskBranch("TASK-107", { target: "dev", cwd: gitDir }),
    ).rejects.toThrow(/artifact collision\(s\) detected/);

    // 4. Passing force should allow bypassing the collision guard
    const result = await mergeTaskBranch("TASK-107", {
      target: "dev",
      force: true,
      cwd: gitDir,
    });
    expect(result.sourceBranch).toBe("task/107-test");
    expect(result.targetBranch).toBe("dev");
  });

  // @verifies RULE-33
  it("[RULE-33] should allow merge when task branch archives an artifact without target branch conflict", async () => {
    // 1. Commit active RULE-24 on dev before branching
    await mkdir(join(gitDir, ".modie", "rules"), { recursive: true });
    await writeFile(
      join(gitDir, ".modie", "rules", "explore.RULE-24.md"),
      "# Active Rule 24\n",
    );
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: add RULE-24 on dev"], { cwd: gitDir });

    // 2. Create task branch task/108-archive from dev
    await execFileAsync("git", ["checkout", "-b", "task/108-archive"], { cwd: gitDir });

    // Create completed task artifact
    const taskPath = join(gitDir, "archive.TASK-108.md");
    await writeFile(
      taskPath,
      "---\ndepends_on: []\nlinks: []\n---\n# Context\nArchive test\n# Acceptance Criteria\n- [x] Item\n",
    );
    // Archive RULE-24 on task branch
    await execFileAsync("git", ["mv", ".modie/rules/explore.RULE-24.md", ".modie/rules/explore.RULE-24.ARCHIVED.md"], { cwd: gitDir });
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "refactor: archive RULE-24"], { cwd: gitDir });

    // Complete task artifact
    await rm(taskPath);
    await execFileAsync("git", ["add", "-u"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "chore(task): delete completed TASK-108 artifact"], { cwd: gitDir });

    // 3. Merging should succeed without collision because dev did not rename RULE-24
    const collisions = await detectArtifactCollisions("task/108-archive", "dev", gitDir);
    expect(collisions.length).toBe(0);

    const mergeResult = await mergeTaskBranch("TASK-108", { target: "dev", cwd: gitDir });
    expect(mergeResult.sourceBranch).toBe("task/108-archive");
    expect(mergeResult.targetBranch).toBe("dev");
  });

  // @verifies RULE-33
  it("[RULE-33] should detect divergent_filepath collision when both branches rename the same artifact to different paths", async () => {
    // 1. Commit active RULE-30 at base
    await mkdir(join(gitDir, ".modie", "rules"), { recursive: true });
    await writeFile(
      join(gitDir, ".modie", "rules", "rule.RULE-30.md"),
      "# Base Rule 30\n",
    );
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "feat: add RULE-30 at base"], { cwd: gitDir });

    // 2. On dev, rename RULE-30 to dev-location
    await execFileAsync("git", ["mv", ".modie/rules/rule.RULE-30.md", ".modie/rules/rule-dev.RULE-30.md"], { cwd: gitDir });
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "refactor: move RULE-30 on dev"], { cwd: gitDir });

    // 3. Branch from HEAD~1 (base) and rename to feature-location
    await execFileAsync("git", ["checkout", "-b", "feature/divergent", "HEAD~1"], { cwd: gitDir });
    await execFileAsync("git", ["mv", ".modie/rules/rule.RULE-30.md", ".modie/rules/rule-feature.RULE-30.md"], { cwd: gitDir });
    await execFileAsync("git", ["add", "-A"], { cwd: gitDir });
    await execFileAsync("git", ["commit", "-m", "refactor: move RULE-30 on feature"], { cwd: gitDir });

    // 4. Collision guard should detect divergent_filepath
    const collisions = await detectArtifactCollisions("feature/divergent", "dev", gitDir);
    expect(collisions.length).toBe(1);
    expect(collisions[0]?.tag).toBe("RULE-30");
    expect(collisions[0]?.reason).toBe("divergent_filepath");
  });
});

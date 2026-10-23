/**
 * Unit tests for IVcsAdapter, GitCliAdapter, and MockVcsAdapter.
 * @verifies ADR-6, RULE-25, RULE-28, RULE-34
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitCliAdapter } from "./git-cli-adapter.ts";
import { MockVcsAdapter } from "./mock-adapter.ts";
import { completeTask } from "../task/completion.ts";
import { startTaskBranch, mergeTaskBranch } from "../task/branching.ts";
import { resolveWatermark } from "../resolver/watermark.ts";

describe("GitCliAdapter - Real Subprocess Fixture Tests", () => {
  let tempDir: string;
  let adapter: GitCliAdapter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-vcs-test-"));
    adapter = new GitCliAdapter();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should detect whether directory is inside a git work tree", async () => {
    expect(await adapter.isInsideWorkTree(tempDir)).toBe(false);

    await adapter.runCommand(["init", "-q", "-b", "main"], tempDir);
    expect(await adapter.isInsideWorkTree(tempDir)).toBe(true);
  });

  it("should manage branches, commits, and detect active branch", async () => {
    await adapter.runCommand(["init", "-q", "-b", "main"], tempDir);
    await adapter.runCommand(["config", "user.name", "Tester"], tempDir);
    await adapter.runCommand(["config", "user.email", "test@modie.dev"], tempDir);

    expect(await adapter.detectCurrentBranch(tempDir)).toBe("main");
    expect(await adapter.branchExists("dev", tempDir)).toBe(false);

    // Create an initial commit
    await writeFile(join(tempDir, "README.md"), "# Modie VCS Test", "utf8");
    expect(await adapter.hasWorkingTreeChanges(tempDir)).toBe(true);

    await adapter.stageAll(tempDir);
    const staged = await adapter.getStagedFiles(tempDir);
    expect(staged).toContain("README.md");

    const commitHash = await adapter.commit("chore: init", tempDir);
    expect(commitHash).toBeTruthy();
    expect(await adapter.hasWorkingTreeChanges(tempDir)).toBe(false);
    expect(await adapter.branchExists("main", tempDir)).toBe(true);

    // Create a new branch
    await adapter.checkoutNewBranch("feature/vcs", "main", tempDir);
    expect(await adapter.detectCurrentBranch(tempDir)).toBe("feature/vcs");
    expect(await adapter.branchExists("feature/vcs", tempDir)).toBe(true);

    const branches = await adapter.listBranches(tempDir);
    expect(branches).toContain("main");
    expect(branches).toContain("feature/vcs");

    // Checkout main and delete feature branch
    await adapter.checkout("main", tempDir);
    expect(await adapter.detectCurrentBranch(tempDir)).toBe("main");

    await adapter.deleteBranch("feature/vcs", tempDir);
    expect(await adapter.branchExists("feature/vcs", tempDir)).toBe(false);
  });

  it("should inspect tracked tree artifacts and git configs", async () => {
    await adapter.runCommand(["init", "-q", "-b", "main"], tempDir);
    await adapter.runCommand(["config", "user.name", "Tester"], tempDir);
    await adapter.runCommand(["config", "user.email", "test@modie.dev"], tempDir);
    await adapter.runCommand(["config", "modie.prefix", "MYPREFIX"], tempDir);

    expect(await adapter.getConfig("modie.prefix", tempDir)).toBe("MYPREFIX");
    expect(await adapter.getConfig("non.existent", tempDir)).toBeNull();

    // Create and commit a rule artifact
    await writeFile(
      join(tempDir, "sample-rule.RULE-10.md"),
      "---\nlinks: []\n---\nRule test",
      "utf8",
    );
    await adapter.stageAll(tempDir);
    await adapter.commit("feat: add rule 10", tempDir);

    const treeArts = await adapter.inspectTreeArtifacts("main", tempDir);
    expect(treeArts.length).toBe(1);
    expect(treeArts[0]?.id).toBe("10");
    expect(treeArts[0]?.subtype).toBe("RULE");
    expect(treeArts[0]?.tag).toBe("RULE-10");
  });
});

describe("MockVcsAdapter - In-Memory Unit Tests", () => {
  it("should simulate branch operations and track invocation history", async () => {
    const mock = new MockVcsAdapter({
      currentBranch: "main",
      branches: ["main", "dev"],
    });

    expect(await mock.isInsideWorkTree()).toBe(true);
    expect(await mock.detectCurrentBranch()).toBe("main");
    expect(await mock.branchExists("dev")).toBe(true);
    expect(await mock.branchExists("nonexistent")).toBe(false);

    await mock.checkout("dev");
    expect(await mock.detectCurrentBranch()).toBe("dev");
    expect(mock.history.checkouts).toEqual(["dev"]);

    await mock.checkoutNewBranch("task/99-test", "dev");
    expect(await mock.detectCurrentBranch()).toBe("task/99-test");
    expect(await mock.branchExists("task/99-test")).toBe(true);
    expect(mock.history.checkoutNewBranches).toEqual([
      { branch: "task/99-test", base: "dev" },
    ]);

    await mock.deleteBranch("task/99-test");
    expect(await mock.branchExists("task/99-test")).toBe(false);
    expect(mock.history.deletedBranches).toEqual([
      { branch: "task/99-test", force: undefined },
    ]);
  });

  it("should simulate staging, commits, and merges", async () => {
    const mock = new MockVcsAdapter({
      workingTreeChanged: true,
      branches: ["main", "dev", "task/1-sample"],
      currentBranch: "task/1-sample",
    });

    expect(await mock.hasWorkingTreeChanges()).toBe(true);

    await mock.stageAll();
    expect(mock.history.stagedAllCount).toBe(1);

    await mock.stageFiles(["path/to/file.md"], undefined, { updateOnly: true });
    expect(mock.history.stagedFileCalls).toEqual([
      { files: ["path/to/file.md"], updateOnly: true },
    ]);

    const hash1 = await mock.commit("feat(TASK-1): sample");
    expect(hash1).toBe("hash1");
    expect(mock.history.commits.length).toBe(1);
    expect(mock.history.commits[0]?.message).toBe("feat(TASK-1): sample");

    const mergeHash = await mock.merge("task/1-sample", "dev", "merge: task into dev");
    expect(mergeHash).toBe("merge2");
    expect(await mock.detectCurrentBranch()).toBe("dev");
    expect(mock.history.merges).toEqual([
      {
        source: "task/1-sample",
        target: "dev",
        message: "merge: task into dev",
        hash: "merge2",
      },
    ]);
  });
});

describe("Hermetic Core Domain Injections with MockVcsAdapter", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-hermetic-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should execute completeTask two-phase commit hermetically via MockVcsAdapter", async () => {
    const taskPath = join(tempDir, "sample-task.TASK-200.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Hermetic completion test.

# Acceptance Criteria
- [x] Done item 1
- [x] Done item 2
`,
      "utf8",
    );

    const mockVcs = new MockVcsAdapter({
      insideWorkTree: true,
      workingTreeChanged: true,
      stagedFiles: ["code.ts"],
    });

    const result = await completeTask(taskPath, {
      cwd: tempDir,
      commit: true,
      vcs: mockVcs,
    });

    expect(result.deleted).toBe(true);
    expect(result.taskId).toBe("200");
    expect(result.commits).toBeDefined();
    expect(result.commits?.phase1).toBe("hash1");
    expect(result.commits?.phase2).toBe("hash2");

    // Verify MockVcs recorded the exact two-phase lifecycle
    expect(mockVcs.history.stagedAllCount).toBe(1);
    expect(mockVcs.history.commits.length).toBe(2);
    expect(mockVcs.history.commits[0]?.message).toBe("feat(TASK-200): sample-task");
    expect(mockVcs.history.commits[1]?.message).toBe(
      "chore(task): delete completed TASK-200 artifact",
    );
  });

  it("should execute startTaskBranch and mergeTaskBranch hermetically via MockVcsAdapter", async () => {
    const taskPath = join(tempDir, "branch-feature.TASK-201.md");
    await writeFile(
      taskPath,
      `---
depends_on: []
links: []
---

# Context
Hermetic branching test.

# Acceptance Criteria
- [x] Requirement
`,
      "utf8",
    );

    const mockVcs = new MockVcsAdapter({
      insideWorkTree: true,
      currentBranch: "dev",
      branches: ["dev", "main"],
      deletedArtifacts: [],
    });

    // 1. Start task branch
    const startResult = await startTaskBranch("TASK-201", {
      cwd: tempDir,
      vcs: mockVcs,
    });

    expect(startResult.branchName).toBe("task/201-branch-feature");
    expect(startResult.created).toBe(true);
    expect(mockVcs.history.checkoutNewBranches).toEqual([
      { branch: "task/201-branch-feature", base: "dev" },
    ]);
    expect(mockVcs.branches.has("task/201-branch-feature")).toBe(true);

    // 2. Complete task (delete file in mock)
    await rm(taskPath);
    mockVcs.deletedArtifacts.push({
      id: "201",
      subtype: "TASK",
      tag: "TASK-201",
      slug: "branch-feature",
      filename: "branch-feature.TASK-201.md",
      filepath: "branch-feature.TASK-201.md",
      isArchived: false,
      status: "deleted",
    });

    // 3. Merge task branch
    const mergeResult = await mergeTaskBranch("TASK-201", {
      cwd: tempDir,
      vcs: mockVcs,
    });

    expect(mergeResult.targetBranch).toBe("dev");
    expect(mergeResult.sourceBranch).toBe("task/201-branch-feature");
    expect(mergeResult.deletedSourceBranch).toBe(true);
    expect(mockVcs.branches.has("task/201-branch-feature")).toBe(false);
    expect(mockVcs.history.merges.length).toBe(1);
    expect(mockVcs.history.merges[0]?.source).toBe("task/201-branch-feature");
    expect(mockVcs.history.merges[0]?.target).toBe("dev");
  });

  it("should resolve watermark with MockVcsAdapter for deleted and other branch IDs", async () => {
    const mockVcs = new MockVcsAdapter({
      insideWorkTree: true,
      currentBranch: "task/250-parent-feature",
      branches: ["dev", "task/250-parent-feature"],
      deletedArtifacts: [
        {
          id: "250-1",
          subtype: "TASK",
          tag: "TASK-250-1",
          slug: "first-subtask",
          filename: "first-subtask.TASK-250-1.md",
          filepath: "first-subtask.TASK-250-1.md",
          isArchived: false,
          status: "deleted",
        },
      ],
    });

    // Subtask watermark should detect existing 250-1 in mock deleted history and allocate 250-2
    const wmTask = await resolveWatermark({
      subtype: "TASK",
      cwd: tempDir,
      vcs: mockVcs,
    });

    expect(wmTask.strategy).toBe("subtask");
    expect(wmTask.parentId).toBe("250");
    expect(wmTask.sequence).toBe(2);
    expect(wmTask.nextId).toBe("250-2");

    // Rule watermark should detect highest integer in mock deleted history
    mockVcs.deletedArtifacts.push({
      id: "77",
      subtype: "RULE",
      tag: "RULE-77",
      slug: "sample-rule",
      filename: "sample-rule.RULE-77.md",
      filepath: "sample-rule.RULE-77.md",
      isArchived: false,
      status: "deleted",
    });

    const wmRule = await resolveWatermark({
      subtype: "RULE",
      cwd: tempDir,
      vcs: mockVcs,
    });

    expect(wmRule.subtype).toBe("RULE");
    expect(wmRule.nextId).toBe("78");
  });
});

/**
 * Unit tests for IVcsAdapter, GitCliAdapter, and MockVcsAdapter.
 * @verifies ADR-6, RULE-25, RULE-28, RULE-34
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createFixtureWorkspace, makeTestTag, type FixtureWorkspace } from "../testing/index.ts";
import { GitCliAdapter } from "./git-cli-adapter.ts";
import { MockVcsAdapter } from "./mock-adapter.ts";
import { completeTask } from "../task/completion.ts";
import { startTaskBranch, mergeTaskBranch } from "../task/branching.ts";
import { resolveWatermark } from "../resolver/watermark.ts";

describe("GitCliAdapter - Real Subprocess Fixture Tests", () => {
  let workspace: FixtureWorkspace;
  let adapter: GitCliAdapter;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-vcs-test-");
    adapter = new GitCliAdapter();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("should detect whether directory is inside a git work tree", async () => {
    expect(await adapter.isInsideWorkTree(workspace.cwd)).toBe(false);

    await adapter.runCommand(["init", "-q", "-b", "main"], workspace.cwd);
    expect(await adapter.isInsideWorkTree(workspace.cwd)).toBe(true);
  });

  it("should manage branches, commits, and detect active branch", async () => {
    await adapter.runCommand(["init", "-q", "-b", "main"], workspace.cwd);
    await adapter.runCommand(["config", "user.name", "Tester"], workspace.cwd);
    await adapter.runCommand(["config", "user.email", "test@modie.dev"], workspace.cwd);

    expect(await adapter.detectCurrentBranch(workspace.cwd)).toBe("main");
    expect(await adapter.branchExists("dev", workspace.cwd)).toBe(false);

    // Create an initial commit
    await workspace.writeFile("README.md", "# Modie VCS Test");
    expect(await adapter.hasWorkingTreeChanges(workspace.cwd)).toBe(true);

    await adapter.stageAll(workspace.cwd);
    const staged = await adapter.getStagedFiles(workspace.cwd);
    expect(staged).toContain("README.md");

    const commitHash = await adapter.commit("chore: init", workspace.cwd);
    expect(commitHash).toBeTruthy();
    expect(await adapter.hasWorkingTreeChanges(workspace.cwd)).toBe(false);
    expect(await adapter.branchExists("main", workspace.cwd)).toBe(true);

    // Create a new branch
    await adapter.checkoutNewBranch("feature/vcs", "main", workspace.cwd);
    expect(await adapter.detectCurrentBranch(workspace.cwd)).toBe("feature/vcs");
    expect(await adapter.branchExists("feature/vcs", workspace.cwd)).toBe(true);

    const branches = await adapter.listBranches(workspace.cwd);
    expect(branches).toContain("main");
    expect(branches).toContain("feature/vcs");

    // Checkout main and delete feature branch
    await adapter.checkout("main", workspace.cwd);
    expect(await adapter.detectCurrentBranch(workspace.cwd)).toBe("main");

    await adapter.deleteBranch("feature/vcs", workspace.cwd);
    expect(await adapter.branchExists("feature/vcs", workspace.cwd)).toBe(false);
  });

  it("should inspect tracked tree artifacts and git configs", async () => {
    await adapter.runCommand(["init", "-q", "-b", "main"], workspace.cwd);
    await adapter.runCommand(["config", "user.name", "Tester"], workspace.cwd);
    await adapter.runCommand(["config", "user.email", "test@modie.dev"], workspace.cwd);
    await adapter.runCommand(["config", "modie.prefix", "MYPREFIX"], workspace.cwd);

    expect(await adapter.getConfig("modie.prefix", workspace.cwd)).toBe("MYPREFIX");
    expect(await adapter.getConfig("non.existent", workspace.cwd)).toBeNull();

    // Create and commit a rule artifact
    const rule10Tag = makeTestTag("RULE", 10);
    await workspace.createRule({
      id: 10,
      slug: "sample-rule",
      title: "Sample Rule",
      body: "Rule test",
      subDir: "",
    });
    await adapter.stageAll(workspace.cwd);
    await adapter.commit("feat: add rule 10", workspace.cwd);

    const treeArts = await adapter.inspectTreeArtifacts("main", workspace.cwd);
    expect(treeArts.length).toBe(1);
    expect(treeArts[0]?.id).toBe("10");
    expect(treeArts[0]?.subtype).toBe("RULE");
    expect(treeArts[0]?.tag).toBe(rule10Tag);
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
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-hermetic-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("should execute completeTask two-phase commit hermetically via MockVcsAdapter", async () => {
    const task200Tag = makeTestTag("TASK", 200);
    const task = await workspace.createTask({
      id: 200,
      slug: "sample-task",
      context: "Hermetic completion test.",
      criteria: [
        { text: "Done item 1", completed: true },
        { text: "Done item 2", completed: true },
      ],
    });

    const mockVcs = new MockVcsAdapter({
      insideWorkTree: true,
      workingTreeChanged: true,
      stagedFiles: ["code.ts"],
    });

    const result = await completeTask(task.filepath, {
      cwd: workspace.cwd,
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
    expect(mockVcs.history.commits[0]?.message).toBe(`feat(${task200Tag}): sample-task`);
    expect(mockVcs.history.commits[1]?.message).toBe(
      `chore(task): delete completed ${task200Tag} artifact`,
    );
  });

  it("should execute startTaskBranch and mergeTaskBranch hermetically via MockVcsAdapter", async () => {
    const task201Tag = makeTestTag("TASK", 201);
    const task = await workspace.createTask({
      id: 201,
      slug: "branch-feature",
      context: "Hermetic branching test.",
      criteria: [{ text: "Requirement", completed: true }],
    });

    const mockVcs = new MockVcsAdapter({
      insideWorkTree: true,
      currentBranch: "dev",
      branches: ["dev", "main"],
      deletedArtifacts: [],
    });

    // 1. Start task branch
    const startResult = await startTaskBranch(task.tag, {
      cwd: workspace.cwd,
      vcs: mockVcs,
    });

    expect(startResult.branchName).toBe(`task/201-${task.slug}`);
    expect(startResult.created).toBe(true);
    expect(mockVcs.history.checkoutNewBranches).toEqual([
      { branch: `task/201-${task.slug}`, base: "dev" },
    ]);
    expect(mockVcs.branches.has(`task/201-${task.slug}`)).toBe(true);

    // 2. Complete task (delete file in mock)
    await workspace.remove(task);
    mockVcs.deletedArtifacts.push({
      id: "201",
      subtype: "TASK",
      tag: task201Tag,
      slug: task.slug,
      filename: task.filename,
      filepath: task.filename,
      isArchived: false,
      status: "deleted",
    });

    // 3. Merge task branch
    const mergeResult = await mergeTaskBranch(task.tag, {
      cwd: workspace.cwd,
      vcs: mockVcs,
    });

    expect(mergeResult.targetBranch).toBe("dev");
    expect(mergeResult.sourceBranch).toBe(`task/201-${task.slug}`);
    expect(mergeResult.deletedSourceBranch).toBe(true);
    expect(mockVcs.branches.has(`task/201-${task.slug}`)).toBe(false);
    expect(mockVcs.history.merges.length).toBe(1);
    expect(mockVcs.history.merges[0]?.source).toBe(`task/201-${task.slug}`);
    expect(mockVcs.history.merges[0]?.target).toBe("dev");
  });

  it("should resolve watermark with MockVcsAdapter for deleted and other branch IDs", async () => {
    const task250_1Tag = makeTestTag("TASK", "250-1");
    const rule77Tag = makeTestTag("RULE", 77);

    const mockVcs = new MockVcsAdapter({
      insideWorkTree: true,
      currentBranch: "task/250-parent-feature",
      branches: ["dev", "task/250-parent-feature"],
      deletedArtifacts: [
        {
          id: "250-1",
          subtype: "TASK",
          tag: task250_1Tag,
          slug: "first-subtask",
          filename: `first-subtask.${task250_1Tag}.md`,
          filepath: `first-subtask.${task250_1Tag}.md`,
          isArchived: false,
          status: "deleted",
        },
      ],
    });

    // Subtask watermark should detect existing 250-1 in mock deleted history and allocate 250-2
    const wmTask = await resolveWatermark({
      subtype: "TASK",
      cwd: workspace.cwd,
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
      tag: rule77Tag,
      slug: "sample-rule",
      filename: `sample-rule.${rule77Tag}.md`,
      filepath: `sample-rule.${rule77Tag}.md`,
      isArchived: false,
      status: "deleted",
    });

    const wmRule = await resolveWatermark({
      subtype: "RULE",
      cwd: workspace.cwd,
      vcs: mockVcs,
    });

    expect(wmRule.subtype).toBe("RULE");
    expect(wmRule.nextId).toBe("78");
  });
});

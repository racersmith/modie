/**
 * Integration tests for Cluster 2: Task Lifecycle State Machine MCP Tools.
 * @verifies RULE-21, RULE-22, RULE-25, RULE-26, RULE-28, RULE-32, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../core/index.ts";
import {
  createMcpTestHarness,
  getStructuredContent,
  getTextContent,
  type McpTestHarness,
} from "./test-utils.ts";

describe("Cluster 2: Task Lifecycle State Machine Tools", () => {
  let harness: McpTestHarness;

  beforeEach(async () => {
    harness = await createMcpTestHarness("modie-mcp-lifecycle-");
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // @verifies RULE-28, RULE-26
  it("start_task should switch to hierarchical task branch and return Mission Brief", async () => {
    const res = await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: harness.task101Id },
    });

    expect(res.isError).toBeFalsy();
    const text = getTextContent(res);
    expect(text).toContain(`# Mission Brief: ${harness.task101Tag}`);
    expect(text).toContain("**Active Branch**: `task/101-sample-ready`");
  });

  // @verifies RULE-22, RULE-26
  it("check_criteria should atomically toggle criteria and return updated checklist status", async () => {
    const checkRes = await harness.client.callTool({
      name: "check_criteria",
      arguments: {
        task_id: harness.task101Id,
        items: [1, 2],
      },
    });

    expect(checkRes.isError).toBeFalsy();
    const content = getStructuredContent(checkRes);
    expect(content.taskId).toBe(harness.task101Tag);
    expect(content.checkedItems).toEqual([1, 2]);
    expect(content.progress).toBe("2/3");
    expect(content.allCriteriaSatisfied).toBe(false);
    expect(content.acceptanceCriteria[0].completed).toBe(true);
    expect(content.acceptanceCriteria[1].completed).toBe(true);
    expect(content.acceptanceCriteria[2].completed).toBe(false);

    const uncheckRes = await harness.client.callTool({
      name: "check_criteria",
      arguments: {
        task_id: harness.task101Id,
        items: [1],
        uncheck: true,
      },
    });

    const uncheckContent = getStructuredContent(uncheckRes);
    expect(uncheckContent.progress).toBe("1/3");
    expect(uncheckContent.acceptanceCriteria[0].completed).toBe(false);
    expect(uncheckContent.acceptanceCriteria[1].completed).toBe(true);
  });

  // @verifies RULE-21, RULE-22, RULE-32
  it("complete_task should fail when criteria are incomplete and succeed when satisfied", async () => {
    await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: harness.task101Id },
    });

    const failRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: harness.task101Id },
    });

    expect(failRes.isError).toBe(true);
    const errContent = getStructuredContent(failRes);
    expect(errContent.code).toBe("CRITERIA_INCOMPLETE");
    expect(errContent.recovery.tool).toBe("check_criteria");

    await harness.client.callTool({
      name: "check_criteria",
      arguments: {
        task_id: harness.task101Id,
        items: [1, 2, 3],
      },
    });

    const successRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: harness.task101Id },
    });

    expect(successRes.isError).toBeFalsy();
    const successContent = getStructuredContent(successRes);
    expect(successContent.taskId).toBe(harness.task101Tag);
    expect(successContent.merged).toBe(true);
    expect(successContent.targetBranch).toBe("dev");
  });

  // @verifies RULE-28, RULE-34, RULE-35
  it("start_task and complete_task should support feature-branch origin tracking, overrides, cross-task rejection, and subtask invariance", async () => {
    await harness.workspace.gitCheckout("feat/mcp-origin", { create: true });

    const featTaskTag = formatArtifactTag("TASK", 103);
    await harness.workspace.createTask({
      id: 103,
      slug: "mcp-feature-root",
      title: "MCP Feature Root",
      criteria: ["Implement feature", "User Review"],
    });
    const extraTaskTag = formatArtifactTag("TASK", 104);
    await harness.workspace.createTask({
      id: 104,
      slug: "mcp-extra-root",
      title: "MCP Extra Root",
      criteria: ["Extra item", "User Review"],
    });
    await harness.workspace.gitCommit(
      `docs: add ${featTaskTag} and ${extraTaskTag}`,
    );

    const startRes = await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: featTaskTag },
    });
    expect(startRes.isError).toBeFalsy();
    const brief = getTextContent(startRes);
    expect(brief).toContain("**Active Branch**: `task/103-mcp-feature-root`");
    expect(brief).toContain("**Origin / Merge Target**: `feat/mcp-origin`");

    const crossReject = await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: extraTaskTag },
    });
    expect(crossReject.isError).toBe(true);
    expect(getTextContent(crossReject)).toContain(
      "while checked out on active task branch",
    );

    const subCreateRes = await harness.client.callTool({
      name: "create_task",
      arguments: {
        title: "MCP Feature Subtask",
        acceptance_criteria: ["Sub criterion"],
      },
    });
    expect(subCreateRes.isError).toBeFalsy();
    const subTag = getStructuredContent(subCreateRes).tag;
    await harness.workspace.gitCommit(`docs: add ${subTag}`);

    const subStartRes = await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: subTag },
    });
    expect(subStartRes.isError).toBeFalsy();
    expect(getTextContent(subStartRes)).toContain(
      "**Origin / Merge Target**: `task/103-mcp-feature-root`",
    );

    await harness.client.callTool({
      name: "check_criteria",
      arguments: { task_id: subTag, items: [1, 2] },
    });
    const subCompleteRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: subTag },
    });
    expect(subCompleteRes.isError).toBeFalsy();
    expect(getStructuredContent(subCompleteRes).targetBranch).toBe(
      "task/103-mcp-feature-root",
    );

    await harness.client.callTool({
      name: "check_criteria",
      arguments: { task_id: featTaskTag, items: [1, 2] },
    });
    await harness.workspace.gitCommit("feat: verify criteria on root task");
    await Bun.$`git branch -D feat/mcp-origin`
      .cwd(harness.workspace.cwd)
      .quiet();
    const headBeforeMissingTarget = (
      await Bun.$`git rev-parse HEAD`.cwd(harness.workspace.cwd).text()
    ).trim();

    const missingTargetRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: featTaskTag },
    });
    expect(missingTargetRes.isError).toBe(true);
    expect(getTextContent(missingTargetRes)).toContain(
      "Cannot merge into recorded origin branch",
    );
    expect(
      (await Bun.$`git rev-parse HEAD`.cwd(harness.workspace.cwd).text()).trim(),
    ).toBe(headBeforeMissingTarget);

    const stillOnDisk = await harness.workspace.readFile(
      `.modie/tasks/mcp-feature-root.${featTaskTag}.md`,
    );
    expect(stillOnDisk).toContain("MCP Feature Root");

    const overrideCompleteRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: featTaskTag, target: "dev" },
    });
    expect(overrideCompleteRes.isError).toBeFalsy();
    expect(getStructuredContent(overrideCompleteRes).targetBranch).toBe("dev");

    await harness.workspace.gitCheckout("feat/second-origin", { create: true });
    const baseStartRes = await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: extraTaskTag, base: "dev" },
    });
    expect(baseStartRes.isError).toBeFalsy();
    expect(getTextContent(baseStartRes)).toContain(
      "**Origin / Merge Target**: `dev`",
    );
  });

  // @verifies RULE-21, RULE-22, RULE-28, RULE-32, RULE-34, RULE-35
  it("complete_task should abort atomically without deleting artifact or creating commits on active subtask, foreign ancestry, or missing source branch", async () => {
    const getHead = async () =>
      (await Bun.$`git rev-parse HEAD`.cwd(harness.workspace.cwd).text()).trim();

    // 1. Missing source branch: calling complete_task before starting the task branch
    const unstartedTag = formatArtifactTag("TASK", 105);
    const unstartedTask = await harness.workspace.createTask({
      id: 105,
      slug: "mcp-unstarted",
      title: "MCP Unstarted",
      criteria: [{ text: "Done", completed: true }],
    });
    await harness.workspace.gitCommit(`docs: add ${unstartedTag}`);
    const headBeforeUnstarted = await getHead();

    const unstartedRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: unstartedTag },
    });
    expect(unstartedRes.isError).toBe(true);
    expect(getTextContent(unstartedRes)).toContain("does not exist");
    expect(await getHead()).toBe(headBeforeUnstarted);
    expect(await harness.workspace.fileExists(unstartedTask.filepath)).toBe(true);

    // 2. Active child subtask blocks parent complete_task atomically and allows clean retry
    const parentTag = formatArtifactTag("TASK", 106);
    const parentTask = await harness.workspace.createTask({
      id: 106,
      slug: "mcp-preflight-parent",
      title: "MCP Preflight Parent",
      criteria: ["Parent criterion", "User Review"],
    });
    await harness.workspace.gitCommit(`docs: add ${parentTag}`);

    const startParentRes = await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: parentTag },
    });
    expect(startParentRes.isError).toBeFalsy();

    const createSubRes = await harness.client.callTool({
      name: "create_task",
      arguments: {
        title: "MCP Preflight Child",
        acceptance_criteria: ["Child criterion"],
      },
    });
    expect(createSubRes.isError).toBeFalsy();
    const childTag = getStructuredContent(createSubRes).tag;
    await harness.workspace.gitCommit(`docs: add ${childTag}`);

    const startChildRes = await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: childTag },
    });
    expect(startChildRes.isError).toBeFalsy();

    await Bun.$`git checkout task/106-mcp-preflight-parent`
      .cwd(harness.workspace.cwd)
      .quiet();
    await harness.client.callTool({
      name: "check_criteria",
      arguments: { task_id: parentTag, items: [1, 2] },
    });
    const headBeforeActiveSubtask = await getHead();

    const blockedParentRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: parentTag },
    });
    expect(blockedParentRes.isError).toBe(true);
    expect(getTextContent(blockedParentRes)).toContain(
      "Active child subtask branch",
    );
    expect(await getHead()).toBe(headBeforeActiveSubtask);
    expect(await harness.workspace.fileExists(parentTask.filepath)).toBe(true);

    // Commit criteria check, complete child subtask, then retry parent complete_task cleanly
    await harness.workspace.gitCommit("chore: check parent criteria");
    await Bun.$`git checkout task/106-1-mcp-preflight-child`
      .cwd(harness.workspace.cwd)
      .quiet();
    await harness.client.callTool({
      name: "check_criteria",
      arguments: { task_id: childTag, items: [1, 2] },
    });
    const completeChildRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: childTag },
    });
    expect(completeChildRes.isError).toBeFalsy();

    const retryParentRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: parentTag },
    });
    expect(retryParentRes.isError).toBeFalsy();
    expect(getStructuredContent(retryParentRes).targetBranch).toBe("dev");

    // 3. Foreign task ancestry blocks complete_task atomically without committing or deleting artifact
    const foreignTag = formatArtifactTag("TASK", 107);
    await harness.workspace.createTask({
      id: 107,
      slug: "mcp-foreign",
      title: "MCP Foreign",
      criteria: ["Foreign item", "User Review"],
    });
    await harness.workspace.gitCommit(`docs: add ${foreignTag}`);
    await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: foreignTag },
    });
    await harness.workspace.writeFile("foreign-mcp.txt", "foreign work\n");
    await harness.workspace.gitCommit("feat: foreign unmerged work");

    const leakedTag = formatArtifactTag("TASK", 108);
    const leakedTask = await harness.workspace.createTask({
      id: 108,
      slug: "mcp-leaked",
      title: "MCP Leaked",
      criteria: [{ text: "Done", completed: true }],
    });
    await Bun.$`git checkout -b task/108-mcp-leaked`
      .cwd(harness.workspace.cwd)
      .quiet();
    await harness.workspace.gitCommit(`docs: add ${leakedTag}`);
    await harness.workspace.writeFile("leaked-mcp-dirty.txt", "dirty work\n");
    const headBeforeForeign = await getHead();

    const foreignBlockedRes = await harness.client.callTool({
      name: "complete_task",
      arguments: { task_id: leakedTag },
    });
    expect(foreignBlockedRes.isError).toBe(true);
    expect(getTextContent(foreignBlockedRes)).toContain(
      "contains unmerged commit",
    );
    expect(await getHead()).toBe(headBeforeForeign);
    expect(await harness.workspace.fileExists(leakedTask.filepath)).toBe(true);
    expect(await harness.workspace.readFile("leaked-mcp-dirty.txt")).toBe(
      "dirty work\n",
    );
  });
});

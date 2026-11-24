/**
 * Integration tests for MCP server tool registration, diagnostics, and per-call workspace isolation.
 * @verifies RULE-25, RULE-26, RULE-34, RULE-35, RULE-37
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { formatArtifactTag } from "../../core/index.ts";
import { createFixtureWorkspace } from "../../core/platform/testing/index.ts";
import { createModieMcpServer } from "./server.ts";
import {
  createMcpTestHarness,
  getTextContent,
  type McpTestHarness,
} from "./test-utils.ts";

describe("Modie MCP Server - Registration, Diagnostics & Isolation", () => {
  let harness: McpTestHarness;

  beforeEach(async () => {
    harness = await createMcpTestHarness("modie-mcp-server-");
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // @verifies RULE-25, RULE-26
  it("should register exactly the 13 singular tools with outputSchema and behavioral annotations", async () => {
    const response = await harness.client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames.sort()).toEqual([
      "archive_artifact",
      "check_criteria",
      "complete_task",
      "create_adr",
      "create_motive",
      "create_rule",
      "create_task",
      "directory_context",
      "link_artifacts",
      "read_artifact",
      "spark_add",
      "start_task",
      "task_context",
    ]);

    expect(toolNames).not.toContain("ls_better");
    expect(toolNames).not.toContain("modie_compile_context");
    expect(toolNames).not.toContain("modie_task_lifecycle");
    expect(toolNames).not.toContain("modie_create_artifact");
    expect(toolNames).not.toContain("modie_mutate_governance");

    const dirContextTool = response.tools.find(
      (t) => t.name === "directory_context",
    )!;
    expect(dirContextTool.annotations?.readOnlyHint).toBe(true);
    expect(dirContextTool.annotations?.idempotentHint).toBe(true);
    expect(dirContextTool.annotations?.destructiveHint).toBe(false);

    const readTool = response.tools.find((t) => t.name === "read_artifact")!;
    expect(readTool.annotations?.readOnlyHint).toBe(true);
    expect(readTool.annotations?.idempotentHint).toBe(true);
    expect(readTool.annotations?.destructiveHint).toBe(false);

    const contextTool = response.tools.find((t) => t.name === "task_context")!;
    expect(contextTool.annotations?.readOnlyHint).toBe(true);
    expect(contextTool.annotations?.idempotentHint).toBe(true);
    expect(contextTool.annotations?.destructiveHint).toBe(false);

    const startTool = response.tools.find((t) => t.name === "start_task")!;
    expect(startTool.annotations?.readOnlyHint).toBe(false);
    expect(startTool.annotations?.idempotentHint).toBe(true);
    expect(startTool.annotations?.destructiveHint).toBe(false);

    const checkTool = response.tools.find((t) => t.name === "check_criteria")!;
    expect(checkTool.annotations?.readOnlyHint).toBe(false);
    expect(checkTool.annotations?.idempotentHint).toBe(true);
    expect(checkTool.annotations?.destructiveHint).toBe(false);
    expect(checkTool.outputSchema).toBeDefined();

    const completeTool = response.tools.find(
      (t) => t.name === "complete_task",
    )!;
    expect(completeTool.annotations?.readOnlyHint).toBe(false);
    expect(completeTool.annotations?.idempotentHint).toBe(false);
    expect(completeTool.annotations?.destructiveHint).toBe(true);
    expect(completeTool.outputSchema).toBeDefined();

    const ruleTool = response.tools.find((t) => t.name === "create_rule")!;
    expect(ruleTool.outputSchema).toBeDefined();
    expect(ruleTool.description).toContain("LITMUS TEST:");

    const adrTool = response.tools.find((t) => t.name === "create_adr")!;
    expect(adrTool.outputSchema).toBeDefined();
    expect(adrTool.description).toContain("LITMUS TEST:");

    const taskTool = response.tools.find((t) => t.name === "create_task")!;
    expect(taskTool.outputSchema).toBeDefined();
    expect(taskTool.description).toContain("LITMUS TEST:");

    const motiveTool = response.tools.find((t) => t.name === "create_motive")!;
    expect(motiveTool.annotations?.readOnlyHint).toBe(false);
    expect(motiveTool.annotations?.idempotentHint).toBe(false);
    expect(motiveTool.annotations?.destructiveHint).toBe(false);
    expect(motiveTool.outputSchema).toBeDefined();
    expect(motiveTool.description).toContain("LITMUS TEST:");

    const sparkTool = response.tools.find((t) => t.name === "spark_add")!;
    expect(sparkTool.description).toContain("LITMUS TEST:");

    const linkTool = response.tools.find((t) => t.name === "link_artifacts")!;
    expect(linkTool.outputSchema).toBeDefined();

    const archiveTool = response.tools.find(
      (t) => t.name === "archive_artifact",
    )!;
    expect(archiveTool.annotations?.destructiveHint).toBe(true);
    expect(archiveTool.outputSchema).toBeDefined();
  });

  // @verifies RULE-26
  it("should not expose prompts capability per YAGNI", async () => {
    try {
      const response = await harness.client.listPrompts();
      expect(response.prompts).toHaveLength(0);
    } catch (err: any) {
      expect(err.message).toContain("Method not found");
    }
  });

  it("should emit diagnostic to stderr on tool error without corrupting result", async () => {
    let stderrOutput = "";
    const customServer = createModieMcpServer({
      cwd: harness.workspace.cwd,
      stderr: (msg: string) => {
        stderrOutput += msg + "\n";
      },
    });

    const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
    await customServer.connect(sTrans);
    const customClient = new Client(
      { name: "test-err-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await customClient.connect(cTrans);

    const res = await customClient.callTool({
      name: "read_artifact",
      arguments: { tag: formatArtifactTag("RULE", 9999) },
    });

    expect(res.isError).toBe(true);
    expect(stderrOutput).toContain("[read_artifact]");
    expect(stderrOutput).toContain("ARTIFACT_NOT_FOUND");

    await customClient.close();
    await customServer.close();
  });

  // @verifies RULE-34, RULE-35, RULE-37
  it("should expose optional workspace parameter on all 13 MCP tools", async () => {
    const response = await harness.client.listTools();
    expect(response.tools).toHaveLength(13);
    for (const tool of response.tools) {
      const props = (tool.inputSchema as any)?.properties ?? {};
      expect(props.workspace).toBeDefined();
    }
  });

  // @verifies RULE-34, RULE-35, RULE-37
  it("should resolve reads and writes against explicit per-call workspace without mutating server-wide state", async () => {
    const secondWorkspace = await createFixtureWorkspace(
      "modie-mcp-second-ws-",
    );
    const secondRuleTag = formatArtifactTag("RULE", 202);

    try {
      await secondWorkspace.initGit({
        defaultBranch: "dev",
        initialCommit: true,
      });
      await secondWorkspace.createRule({
        id: 202,
        slug: "second-ws-rule",
        title: "Second Workspace Rule",
        body: "Rule scoped exclusively to the second workspace.",
      });
      await secondWorkspace.gitCommit("chore: seed second workspace");

      const readRes = await harness.client.callTool({
        name: "read_artifact",
        arguments: {
          tag: secondRuleTag,
          workspace: secondWorkspace.cwd,
        },
      });
      expect(readRes.isError).toBeFalsy();
      expect(getTextContent(readRes)).toContain(
        "Rule scoped exclusively to the second workspace.",
      );

      const sparkRes = await harness.client.callTool({
        name: "spark_add",
        arguments: {
          title: "Second Repo Spark",
          workspace: secondWorkspace.cwd,
        },
      });
      expect(sparkRes.isError).toBeFalsy();
      const secondSparks = await secondWorkspace.readFile(
        ".modie/ideas/SPARKS.md",
      );
      expect(secondSparks).toContain("Second Repo Spark");

      const primaryRead = await harness.client.callTool({
        name: "read_artifact",
        arguments: { tag: harness.ruleTag },
      });
      expect(primaryRead.isError).toBeFalsy();
      expect(getTextContent(primaryRead)).toContain(
        "All code must be tested with isolated fixtures.",
      );

      const crossCheck = await harness.client.callTool({
        name: "read_artifact",
        arguments: { tag: secondRuleTag },
      });
      expect(crossCheck.isError).toBe(true);
    } finally {
      await secondWorkspace.cleanup();
    }
  });
});

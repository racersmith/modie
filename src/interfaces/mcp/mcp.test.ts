/**
 * Integration and unit tests for Modie Model Context Protocol (MCP) server.
 * Verifies the 11 Singular Agent Tools, Frontmatter-to-Markdown rendering engine,
 * RULE-25 (interface-core decoupling), RULE-26 (token economy), and RULE-27 (stream separation).
 * @verifies RULE-6, RULE-21, RULE-22, RULE-25, RULE-26, RULE-27, RULE-28, RULE-30, RULE-31, RULE-32, RULE-36
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { formatArtifactFilename } from "../../core/index.ts";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../../core/testing/index.ts";
import { createModieMcpServer } from "./server.ts";

function getTextContent(result: any): string {
  const item = result?.content?.[0];
  return item && typeof item === "object" && "text" in item
    ? (item.text as string)
    : "";
}

function getStructuredContent(result: any): any {
  return result?.structuredContent ?? JSON.parse(getTextContent(result));
}

describe("Modie MCP Server - 11 Singular Agent Tools Suite", () => {
  let workspace: FixtureWorkspace;
  let server: ReturnType<typeof createModieMcpServer>;
  let client: Client;
  const ruleTag = makeTestTag("RULE", 101);
  const adrTag = makeTestTag("ADR", 101);
  const task101Id = "101";
  const task101Tag = makeTestTag("TASK", task101Id);
  const task102Id = "102";
  const task102Tag = makeTestTag("TASK", task102Id);

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-mcp-test-");
    await workspace.initGit({ defaultBranch: "dev", initialCommit: true });

    // Set up a sample rule in workspace
    await workspace.createRule({
      id: 101,
      slug: "sample-rule",
      title: "Sample Rule",
      body: "All code must be tested with isolated fixtures.",
    });

    // Set up a sample ADR in workspace
    await (workspace.createAdr as any)({
      id: 101,
      slug: "sample-decision",
      title: "Sample Decision",
      summary: "Decision to use 11 singular MCP tools.",
      context: "Context for decision.",
      decision: "We adopt 11 singular purpose tools.",
      consequences: "Greatly reduced preamble tokens and zero polymorphic confusion.",
      links: [ruleTag],
    });

    // Set up sample tasks in workspace
    await workspace.createTask({
      id: 101,
      slug: "sample-ready",
      title: "Sample Ready",
      context: "Ready task context.",
      criteria: ["First criterion", "Second criterion", "User Review"],
      links: [ruleTag, adrTag],
    });
    await workspace.createTask({
      id: 102,
      slug: "sample-blocked",
      title: "Sample Blocked",
      context: "Blocked task context.",
      criteria: ["Dependent item", "User Review"],
      depends_on: [task101Tag],
    });

    await workspace.gitCommit("chore: setup sample fixtures");

    server = createModieMcpServer({ cwd: workspace.cwd });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client(
      { name: "modie-test-client", version: "0.0.1" },
      { capabilities: {} },
    );
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    await workspace.cleanup();
  });

  // @verifies RULE-25, RULE-26
  it("should register exactly the 11 singular tools with outputSchema and behavioral annotations", async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames.sort()).toEqual([
      "archive_artifact",
      "check_criteria",
      "complete_task",
      "create_adr",
      "create_rule",
      "create_task",
      "link_artifacts",
      "ls_better",
      "read_artifact",
      "start_task",
      "task_context",
    ]);

    // Ensure deprecated consolidated mega-tools are not registered
    expect(toolNames).not.toContain("modie_compile_context");
    expect(toolNames).not.toContain("modie_task_lifecycle");
    expect(toolNames).not.toContain("modie_create_artifact");
    expect(toolNames).not.toContain("modie_mutate_governance");

    // Verify behavioral annotations & output schemas
    const lsTool = response.tools.find((t) => t.name === "ls_better")!;
    expect(lsTool.annotations?.readOnlyHint).toBe(true);
    expect(lsTool.annotations?.idempotentHint).toBe(true);
    expect(lsTool.annotations?.destructiveHint).toBe(false);

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

    const completeTool = response.tools.find((t) => t.name === "complete_task")!;
    expect(completeTool.annotations?.readOnlyHint).toBe(false);
    expect(completeTool.annotations?.idempotentHint).toBe(false);
    expect(completeTool.annotations?.destructiveHint).toBe(true);
    expect(completeTool.outputSchema).toBeDefined();

    const ruleTool = response.tools.find((t) => t.name === "create_rule")!;
    expect(ruleTool.outputSchema).toBeDefined();

    const adrTool = response.tools.find((t) => t.name === "create_adr")!;
    expect(adrTool.outputSchema).toBeDefined();

    const taskTool = response.tools.find((t) => t.name === "create_task")!;
    expect(taskTool.outputSchema).toBeDefined();

    const linkTool = response.tools.find((t) => t.name === "link_artifacts")!;
    expect(linkTool.outputSchema).toBeDefined();

    const archiveTool = response.tools.find((t) => t.name === "archive_artifact")!;
    expect(archiveTool.annotations?.destructiveHint).toBe(true);
    expect(archiveTool.outputSchema).toBeDefined();
  });

  // @verifies RULE-26
  it("should not expose prompts capability per YAGNI", async () => {
    try {
      const response = await client.listPrompts();
      expect(response.prompts).toHaveLength(0);
    } catch (err: any) {
      expect(err.message).toContain("Method not found");
    }
  });

  describe("Cluster 1: Spatial & Artifact Exploration Tools", () => {
    // @verifies RULE-26
    it("ls_better should return clean plaintext tab-separated listing with Unix ls -F conventions", async () => {
      // Create a real file and directory in workspace
      await workspace.writeFile("sample.ts", "export const x = 1;\n");
      await workspace.mkdir("src");

      // Create a file GIST for sample.ts
      await workspace.createGist({
        filename: "sample.ts",
        content: "Sample TypeScript module utility functions.",
      });

      const res = await client.callTool({
        name: "ls_better",
        arguments: { path: "." },
      });

      expect(res.isError).toBeFalsy();
      const text = getTextContent(res);
      expect(typeof text).toBe("string");
      expect(text.startsWith(".:")).toBe(true);

      // Trailing slash on directories
      expect(text).toContain("src/\t");
      // File with gist summary
      expect(text).toContain("sample.ts\tSample TypeScript module utility functions.");
    });

    // @verifies RULE-26, RULE-36
    it("read_artifact should return pure Markdown with location header and semantic Appendix", async () => {
      const res = await client.callTool({
        name: "read_artifact",
        arguments: { tag: task101Tag },
      });

      expect(res.isError).toBeFalsy();
      const text = getTextContent(res);
      expect(typeof text).toBe("string");

      // File & scope header comments
      expect(text).toContain("<!-- File:");
      expect(text).toContain("<!-- Scope:");

      // Stripped body content without raw frontmatter
      expect(text).not.toContain("---\nlinks:\n");
      expect(text).toContain("# Context");
      expect(text).toContain("Ready task context.");

      // Appendix section
      expect(text).toContain("## Appendix: Relationships & Governance");
      expect(text).toContain("### Governing Rules & Constraints");
      expect(text).toContain(ruleTag);
      expect(text).toContain("All code must be tested with isolated fixtures.");
      expect(text).toContain(adrTag);
    });

    // @verifies RULE-6, RULE-26
    it("task_context should return actionable Markdown Mission Brief with elevated blast radius alert", async () => {
      const res = await client.callTool({
        name: "task_context",
        arguments: { task_id: task101Id },
      });

      expect(res.isError).toBeFalsy();
      const text = getTextContent(res);
      expect(typeof text).toBe("string");

      expect(text).toContain(`# Mission Brief: ${task101Tag}`);
      expect(text).toContain("BLAST RADIUS CONSTRAINT");
      expect(text).toContain("## Acceptance Criteria");
      expect(text).toContain("- [ ] 1. First criterion");
      expect(text).toContain("- [ ] 2. Second criterion");
      expect(text).toContain("- [ ] 3. User Review");
      expect(text).toContain("## Governing Architectural Invariants");
      expect(text).toContain(ruleTag);
      expect(text).toContain("All code must be tested with isolated fixtures.");
    });
  });

  describe("Cluster 2: Task Lifecycle State Machine Tools", () => {
    // @verifies RULE-28, RULE-26
    it("start_task should switch to hierarchical task branch and return Mission Brief", async () => {
      const res = await client.callTool({
        name: "start_task",
        arguments: { task_id: task101Id },
      });

      expect(res.isError).toBeFalsy();
      const text = getTextContent(res);
      expect(text).toContain(`# Mission Brief: ${task101Tag}`);
      expect(text).toContain("**Active Branch**: `task/101-sample-ready`");
    });

    // @verifies RULE-22, RULE-26
    it("check_criteria should atomically toggle criteria and return updated checklist status", async () => {
      // Check items 1 and 2
      const checkRes = await client.callTool({
        name: "check_criteria",
        arguments: {
          task_id: task101Id,
          items: [1, 2],
        },
      });

      expect(checkRes.isError).toBeFalsy();
      const content = getStructuredContent(checkRes);
      expect(content.taskId).toBe(task101Tag);
      expect(content.checkedItems).toEqual([1, 2]);
      expect(content.progress).toBe("2/3");
      expect(content.allCriteriaSatisfied).toBe(false);
      expect(content.acceptanceCriteria[0].completed).toBe(true);
      expect(content.acceptanceCriteria[1].completed).toBe(true);
      expect(content.acceptanceCriteria[2].completed).toBe(false);

      // Uncheck item 1
      const uncheckRes = await client.callTool({
        name: "check_criteria",
        arguments: {
          task_id: task101Id,
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
      // Switch to task branch
      await client.callTool({
        name: "start_task",
        arguments: { task_id: task101Id },
      });

      // Try completing with criteria unchecked
      const failRes = await client.callTool({
        name: "complete_task",
        arguments: { task_id: task101Id },
      });

      expect(failRes.isError).toBe(true);
      const errContent = getStructuredContent(failRes);
      expect(errContent.code).toBe("CRITERIA_INCOMPLETE");
      expect(errContent.recovery.tool).toBe("check_criteria");

      // Check all criteria
      await client.callTool({
        name: "check_criteria",
        arguments: {
          task_id: task101Id,
          items: [1, 2, 3],
        },
      });

      // Now complete task
      const successRes = await client.callTool({
        name: "complete_task",
        arguments: { task_id: task101Id },
      });

      expect(successRes.isError).toBeFalsy();
      const successContent = getStructuredContent(successRes);
      expect(successContent.taskId).toBe(task101Tag);
      expect(successContent.merged).toBe(true);
      expect(successContent.targetBranch).toBe("dev");
    });
  });

  describe("Cluster 3: Dedicated Artifact Authoring Tools", () => {
    // @verifies RULE-1, RULE-16, RULE-26
    it("create_rule should author rule with typed invariant assertion and validating links", async () => {
      const res = await client.callTool({
        name: "create_rule",
        arguments: {
          title: "New Governance Policy",
          invariant: "All interfaces must be decoupled from internal storage representations.",
          links: [adrTag],
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("RULE");
      expect(content.tag).toMatch(/^RULE-\d+$/);
      expect(content.validatedLinks).toContain(adrTag);
    });

    // @verifies RULE-4, RULE-26
    it("create_adr should author ADR with typed context, decision, consequences, and links", async () => {
      const res = await client.callTool({
        name: "create_adr",
        arguments: {
          title: "Adoption of Modular Micro-Interfaces",
          decision: "We decompose polymorphic mega-tools into singular purpose tools.",
          context: "Mega tools caused cognitive overhead for LLMs.",
          consequences: "Simpler schemas and predictable agent tool invocation.",
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("ADR");
      expect(content.tag).toMatch(/^ADR-\d+$/);
    });

    // @verifies RULE-30, RULE-26
    it("create_task should author task with acceptance criteria ending with User Review", async () => {
      const res = await client.callTool({
        name: "create_task",
        arguments: {
          title: "Refactor Storage Pipeline",
          acceptance_criteria: [
            "Implement typed file writer",
            "Verify zero data loss",
          ],
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("TASK");
      expect(content.tag).toMatch(/^TASK-\d+$/);

      // Verify that User Review was auto-appended
      const readRes = await client.callTool({
        name: "read_artifact",
        arguments: { tag: content.tag },
      });
      const markdown = getTextContent(readRes);
      expect(markdown).toContain("User Review");
    });
  });

  describe("Cluster 4: Graph Mutation Tools", () => {
    // @verifies RULE-36, RULE-26
    it("link_artifacts should mutate YAML frontmatter links byte-safely", async () => {
      // Create a new rule
      const ruleRes = await client.callTool({
        name: "create_rule",
        arguments: {
          title: "Isolated Execution Rule",
          invariant: "Execution environments must remain strictly isolated.",
        },
      });
      const newRuleTag = getStructuredContent(ruleRes).tag;

      // Link task101 to the new rule
      const linkRes = await client.callTool({
        name: "link_artifacts",
        arguments: {
          source: task101Tag,
          targets: [newRuleTag],
        },
      });

      expect(linkRes.isError).toBeFalsy();
      const linkContent = getStructuredContent(linkRes);
      expect(linkContent.source).toBe(task101Tag);
      expect(linkContent.added).toContain(newRuleTag);

      // Verify via read_artifact
      const verifyRes = await client.callTool({
        name: "read_artifact",
        arguments: { tag: task101Tag },
      });
      const markdown = getTextContent(verifyRes);
      expect(markdown).toContain(newRuleTag);
    });

    // @verifies RULE-31, RULE-26
    it("archive_artifact should archive obsolete artifact safely", async () => {
      // Create a standalone rule with no incoming references
      const ruleRes = await client.callTool({
        name: "create_rule",
        arguments: {
          title: "Temporary Rule",
          invariant: "Temporary rule to be archived.",
        },
      });
      const tempRuleTag = getStructuredContent(ruleRes).tag;

      const archiveRes = await client.callTool({
        name: "archive_artifact",
        arguments: {
          tag: tempRuleTag,
          reason: "No longer needed.",
        },
      });

      expect(archiveRes.isError).toBeFalsy();
      const content = getStructuredContent(archiveRes);
      expect(content.tag).toBe(tempRuleTag);
      expect(content.archivedPath).toContain(".ARCHIVED.md");
    });
  });

  describe("Stream Separation & Stdio Diagnostics (RULE-27)", () => {
    // @verifies RULE-27
    it("should emit diagnostic to stderr on tool error without corrupting result", async () => {
      let stderrOutput = "";
      const customServer = createModieMcpServer({
        cwd: workspace.cwd,
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
        arguments: { tag: makeTestTag("RULE", 9999) },
      });

      expect(res.isError).toBe(true);
      expect(stderrOutput).toContain("[read_artifact]");
      expect(stderrOutput).toContain("ARTIFACT_NOT_FOUND");

      await customClient.close();
      await customServer.close();
    });
  });
});

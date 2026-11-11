/**
 * Integration and unit tests for Modie Model Context Protocol (MCP) server.
 * Verifies the 12 Singular Agent Tools, Frontmatter-to-Markdown rendering engine,
 * RULE-25 (interface-core decoupling), RULE-26 (token economy), and RULE-27 (stream separation).
 * @verifies RULE-6, RULE-21, RULE-22, RULE-25, RULE-26, RULE-27, RULE-28, RULE-30, RULE-31, RULE-32, RULE-36
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { formatArtifactFilename, formatArtifactTag } from "../../core/index.ts";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../core/platform/testing/index.ts";
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

describe("Modie MCP Server - 12 Singular Agent Tools Suite", () => {
  let workspace: FixtureWorkspace;
  let server: ReturnType<typeof createModieMcpServer>;
  let client: Client;
  const ruleTag = formatArtifactTag("RULE", 101);
  const adrTag = formatArtifactTag("ADR", 101);
  const task101Id = "101";
  const task101Tag = formatArtifactTag("TASK", task101Id);
  const task102Id = "102";
  const task102Tag = formatArtifactTag("TASK", task102Id);

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
      consequences:
        "Greatly reduced preamble tokens and zero polymorphic confusion.",
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
  it("should register exactly the 12 singular tools with outputSchema and behavioral annotations", async () => {
    const response = await client.listTools();
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
      "start_task",
      "task_context",
    ]);

    // Ensure deprecated consolidated mega-tools and retired tools are not registered
    expect(toolNames).not.toContain("ls_better");
    expect(toolNames).not.toContain("modie_compile_context");
    expect(toolNames).not.toContain("modie_task_lifecycle");
    expect(toolNames).not.toContain("modie_create_artifact");
    expect(toolNames).not.toContain("modie_mutate_governance");

    // Verify behavioral annotations & output schemas
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

    const adrTool = response.tools.find((t) => t.name === "create_adr")!;
    expect(adrTool.outputSchema).toBeDefined();

    const taskTool = response.tools.find((t) => t.name === "create_task")!;
    expect(taskTool.outputSchema).toBeDefined();

    const motiveTool = response.tools.find((t) => t.name === "create_motive")!;
    expect(motiveTool.annotations?.readOnlyHint).toBe(false);
    expect(motiveTool.annotations?.idempotentHint).toBe(false);
    expect(motiveTool.annotations?.destructiveHint).toBe(false);
    expect(motiveTool.outputSchema).toBeDefined();

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
      const response = await client.listPrompts();
      expect(response.prompts).toHaveLength(0);
    } catch (err: any) {
      expect(err.message).toContain("Method not found");
    }
  });

  describe("Cluster 1: Spatial & Artifact Exploration Tools", () => {
    // @verifies RULE-26
    it("directory_context should return token-conscious architectural context in summary and detailed modes", async () => {
      // Create root motive and child motive
      await workspace.createMotive({
        content: "Root workspace intent and system purpose.",
      });
      await workspace.createMotive({
        scopeDir: "src",
        content: "Source modules and services.",
      });

      // 1. Summary mode (default)
      const summaryRes = await client.callTool({
        name: "directory_context",
        arguments: { path: "." },
      });

      expect(summaryRes.isError).toBeFalsy();
      const summaryText = getTextContent(summaryRes);
      expect(typeof summaryText).toBe("string");
      expect(summaryText).toContain("# Directory Context: .");
      expect(summaryText).toContain("- **Scope**: `.`");
      expect(summaryText).toContain("## Motive (`.`)");
      expect(summaryText).toContain("Root workspace intent and system purpose.");
      expect(summaryText).toContain("## Governing Rules");
      expect(summaryText).toContain("## Child Directory Motives");
      expect(summaryText).toContain("src/");

      // 2. Detailed mode
      const detailedRes = await client.callTool({
        name: "directory_context",
        arguments: { path: ".", mode: "detailed" },
      });

      expect(detailedRes.isError).toBeFalsy();
      const detailedText = getTextContent(detailedRes);
      expect(detailedText).toContain("# Directory Context: .");
      expect(detailedText).toContain("## Upward Motives");
      expect(detailedText).toContain("## Governing Rules");
      expect(detailedText).toContain("## Architectural Decisions");
      expect(detailedText).toContain("## Child Directory Motives");
      expect(detailedText).toContain("Source modules and services.");
    });

    // @verifies RULE-26, RULE-36
    it("read_artifact should return pure Markdown with tag, title, scope header and semantic Appendix", async () => {
      const res = await client.callTool({
        name: "read_artifact",
        arguments: { tag: task101Tag },
      });

      expect(res.isError).toBeFalsy();
      const text = getTextContent(res);
      expect(typeof text).toBe("string");

      // Tag, Title, and Scope directory header
      expect(text).toContain(`# ${task101Tag}: Sample Ready`);
      expect(text).toContain("**Scope**: `./`");
      expect(text).not.toContain("<!-- File:");
      expect(text).not.toContain("<!-- Scope:");

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
          invariant:
            "All interfaces must be decoupled from internal storage representations.",
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
          decision:
            "We decompose polymorphic mega-tools into singular purpose tools.",
          context: "Mega tools caused cognitive overhead for LLMs.",
          consequences:
            "Simpler schemas and predictable agent tool invocation.",
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("ADR");
      expect(content.tag).toMatch(/^ADR-\d+$/);
    });

    // @verifies RULE-30, RULE-26
    it("create_task should author task with acceptance criteria ending with User Review and persist summary", async () => {
      const summaryText = "Decompose legacy mega-tools into 11 singular tools";
      const res = await client.callTool({
        name: "create_task",
        arguments: {
          title: "Refactor Storage Pipeline",
          summary: summaryText,
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

      // Verify that User Review was auto-appended and summary is in frontmatter on disk
      const fileContents = await workspace.readFile(content.filepath);
      expect(fileContents).toContain(`summary: ${summaryText}`);

      const readRes = await client.callTool({
        name: "read_artifact",
        arguments: { tag: content.tag },
      });
      const markdown = getTextContent(readRes);
      expect(markdown).toContain("User Review");

      // Verify task summary appears in ambient ready tasks queue resource
      const readyRes = await client.readResource({
        uri: "modie://tasks/ready",
      });
      const readyMarkdown = (readyRes.contents[0] as any).text;
      expect(readyMarkdown).toContain(summaryText);
    });

    // @verifies RULE-25, RULE-26
    it("create_motive should author MOTIVE.md with explicit prose in target scope directory", async () => {
      const res = await client.callTool({
        name: "create_motive",
        arguments: {
          scope_dir: "src/domain",
          content: "Domain layer providing architectural invariants and entities.",
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("MOTIVE");
      expect(content.scope).toBe("src/domain");
      expect(content.filename).toBe("MOTIVE.md");
      expect(content.relativePath).toBe("src/domain/.modie/MOTIVE.md");
      expect(content.overwritten).toBe(false);
      expect(content.scaffolded).toBe(false);
      // Verify token economy: unsolicited raw document content omitted from response payload
      expect(content.content).toBeUndefined();

      // Verify file exists on disk with rendered prose
      const diskContent = await workspace.readFile(
        "src/domain/.modie/MOTIVE.md",
      );
      expect(diskContent).toBe(
        "Domain layer providing architectural invariants and entities.\n",
      );
    });

    // @verifies RULE-25, RULE-26
    it("create_motive should scaffold default template when content is omitted", async () => {
      const res = await client.callTool({
        name: "create_motive",
        arguments: {
          scope_dir: "src/adapters",
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("MOTIVE");
      expect(content.scope).toBe("src/adapters");
      expect(content.scaffolded).toBe(true);
      expect(content.overwritten).toBe(false);

      const diskContent = await workspace.readFile(
        "src/adapters/.modie/MOTIVE.md",
      );
      expect(diskContent).toContain(
        "core architectural purpose and domain responsibility",
      );
    });

    // @verifies RULE-25, RULE-26
    it("create_motive should reject overwriting existing file unless overwrite is true", async () => {
      // First creation
      await client.callTool({
        name: "create_motive",
        arguments: {
          scope_dir: "src/collision",
          content: "Initial intent.",
        },
      });

      // Second creation without overwrite flag should fail
      const failedRes = await client.callTool({
        name: "create_motive",
        arguments: {
          scope_dir: "src/collision",
          content: "Updated intent.",
        },
      });

      expect(failedRes.isError).toBe(true);

      // Third creation with overwrite: true should succeed
      const successRes = await client.callTool({
        name: "create_motive",
        arguments: {
          scope_dir: "src/collision",
          content: "Updated intent.",
          overwrite: true,
        },
      });

      expect(successRes.isError).toBeFalsy();
      const content = getStructuredContent(successRes);
      expect(content.overwritten).toBe(true);

      const diskContent = await workspace.readFile(
        "src/collision/.modie/MOTIVE.md",
      );
      expect(diskContent).toContain("Updated intent.");
    });

    // @verifies RULE-25, RULE-26
    it("create_motive should reject content containing cross-document artifact citations", async () => {
      const invalidTag = formatArtifactTag("RULE", 999);
      const res = await client.callTool({
        name: "create_motive",
        arguments: {
          scope_dir: "src/prohibited",
          content: `Intent illegally citing ${invalidTag} directly.`,
        },
      });

      expect(res.isError).toBe(true);
      const err = getStructuredContent(res);
      expect(err.message).toMatch(
        /RULE-10|cross-document references|cannot cite/i,
      );
    });

    // @verifies RULE-25, RULE-26
    it("create_motive should infer target scope from active task branch when scope_dir is omitted", async () => {
      const scopedTaskId = "201";
      await workspace.createTask({
        id: scopedTaskId,
        slug: "subscope-task",
        title: "Subscope Task",
        context: "Subscope task context.",
        criteria: ["Work on subscope", "User Review"],
        scopeDir: "src/subscope",
      });

      // Switch to the task branch via start_task
      await client.callTool({
        name: "start_task",
        arguments: { task_id: scopedTaskId },
      });

      // Call create_motive without scope_dir
      const res = await client.callTool({
        name: "create_motive",
        arguments: {
          content: "Inferred subscope motive intent.",
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.scope).toBe("src/subscope");
      expect(content.relativePath).toBe("src/subscope/.modie/MOTIVE.md");

      const diskContent = await workspace.readFile(
        "src/subscope/.modie/MOTIVE.md",
      );
      expect(diskContent).toContain("Inferred subscope motive intent.");
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
        arguments: { tag: formatArtifactTag("RULE", 9999) },
      });

      expect(res.isError).toBe(true);
      expect(stderrOutput).toContain("[read_artifact]");
      expect(stderrOutput).toContain("ARTIFACT_NOT_FOUND");

      await customClient.close();
      await customServer.close();
    });
  });
});

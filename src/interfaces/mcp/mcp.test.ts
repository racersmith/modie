/**
 * Integration and unit tests for Modie Model Context Protocol (MCP) server.
 * Verifies Consolidated 5-Tool Architecture,
 * RULE-25 (interface-core decoupling), RULE-26 (token economy), and RULE-27 (stream separation).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
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

function getResourceText(readRes: any): string {
  const item = readRes?.contents?.[0];
  return item && typeof item === "object" && "text" in item
    ? (item.text as string)
    : "";
}

describe("Modie MCP Server - Consolidated Five-Tool Architecture", () => {
  let workspace: FixtureWorkspace;
  let server: ReturnType<typeof createModieMcpServer>;
  let client: Client;
  const ruleTag = makeTestTag("RULE", 101);
  const adrTag = makeTestTag("ADR", 101);
  const task101Id = "101";
  const task101Tag = makeTestTag("TASK", task101Id);
  const task102Id = "102";
  const task102Tag = makeTestTag("TASK", task102Id);
  const rule6Tag = makeTestTag("RULE", 6);
  const sampleReadyTaskFilename = formatArtifactFilename({
    slug: "sample-ready",
    subtype: "TASK",
    id: task101Id,
  });

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-mcp-test-");
    await workspace.initGit({ defaultBranch: "dev", initialCommit: true });

    // Set up a sample rule in workspace
    await workspace.createRule({
      id: 101,
      slug: "sample-rule",
      title: "Sample Rule",
      body: "All code must be tested.",
    });

    // Set up a sample ADR in workspace
    await workspace.createAdr({
      id: 101,
      slug: "sample-decision",
      title: "Sample Decision",
      summary: "Decision to use consolidated MCP tools.",
      context: "Context for decision.",
      decision: "We adopt 5 consolidated tools.",
      consequences: "Greatly reduced preamble tokens.",
      links: [ruleTag],
    });

    // Set up sample tasks in workspace
    await workspace.createTask({
      id: 101,
      slug: "sample-ready",
      title: "Sample Ready",
      context: "Ready task context.",
      criteria: ["First criterion", "Second criterion", "Third criterion"],
      links: [ruleTag, adrTag],
    });
    await workspace.createTask({
      id: 102,
      slug: "sample-blocked",
      title: "Sample Blocked",
      context: "Blocked task context.",
      criteria: ["Dependent item"],
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

  it("should register exactly the 5 consolidated tools with outputSchema and behavioral annotations", async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    // Verify exactly the 5 consolidated tools are exposed
    expect(toolNames.sort()).toEqual([
      "modie_compile_context",
      "modie_create_artifact",
      "modie_mutate_governance",
      "modie_query_catalog",
      "modie_task_lifecycle",
    ]);

    // Ensure deprecated 1:1 CLI wrappers are no longer registered
    expect(toolNames).not.toContain("find");
    expect(toolNames).not.toContain("read");
    expect(toolNames).not.toContain("show");
    expect(toolNames).not.toContain("scope");
    expect(toolNames).not.toContain("context");
    expect(toolNames).not.toContain("references");
    expect(toolNames).not.toContain("archive");
    expect(toolNames).not.toContain("link_artifact");
    expect(toolNames).not.toContain("unlink_artifact");
    expect(toolNames).not.toContain("rule_create");
    expect(toolNames).not.toContain("rule_list");
    expect(toolNames).not.toContain("rule_archive");
    expect(toolNames).not.toContain("adr_create");
    expect(toolNames).not.toContain("adr_list");
    expect(toolNames).not.toContain("adr_archive");
    expect(toolNames).not.toContain("task_create");
    expect(toolNames).not.toContain("task_list");
    expect(toolNames).not.toContain("task_status");
    expect(toolNames).not.toContain("task_check");
    expect(toolNames).not.toContain("task_start");
    expect(toolNames).not.toContain("task_complete");
    expect(toolNames).not.toContain("task_merge");

    // Verify behavioral annotations & output schemas on each tool (Criterion 2, 3)
    const compileTool = response.tools.find(
      (t) => t.name === "modie_compile_context",
    )!;
    expect(compileTool).toBeDefined();
    expect(compileTool.annotations?.readOnlyHint).toBe(true);
    expect(compileTool.annotations?.idempotentHint).toBe(true);
    expect(compileTool.annotations?.destructiveHint).toBe(false);
    expect(compileTool.outputSchema).toBeDefined();

    const queryTool = response.tools.find(
      (t) => t.name === "modie_query_catalog",
    )!;
    expect(queryTool).toBeDefined();
    expect(queryTool.annotations?.readOnlyHint).toBe(true);
    expect(queryTool.annotations?.idempotentHint).toBe(true);
    expect(queryTool.annotations?.destructiveHint).toBe(false);
    expect(queryTool.outputSchema).toBeDefined();

    const lifecycleTool = response.tools.find(
      (t) => t.name === "modie_task_lifecycle",
    )!;
    expect(lifecycleTool).toBeDefined();
    expect(lifecycleTool.annotations?.readOnlyHint).toBe(false);
    expect(lifecycleTool.annotations?.destructiveHint).toBe(true);
    expect(lifecycleTool.outputSchema).toBeDefined();

    const createTool = response.tools.find(
      (t) => t.name === "modie_create_artifact",
    )!;
    expect(createTool).toBeDefined();
    expect(createTool.annotations?.readOnlyHint).toBe(false);
    expect(createTool.annotations?.destructiveHint).toBe(false);
    expect(createTool.outputSchema).toBeDefined();

    const mutateTool = response.tools.find(
      (t) => t.name === "modie_mutate_governance",
    )!;
    expect(mutateTool).toBeDefined();
    expect(mutateTool.annotations?.readOnlyHint).toBe(false);
    expect(mutateTool.annotations?.destructiveHint).toBe(true);
    expect(mutateTool.outputSchema).toBeDefined();
  });

  describe("Tool 1: modie_compile_context", () => {
    it("should compile architectural cone context with compact GIST signposts by default", async () => {
      const res = await client.callTool({
        name: "modie_compile_context",
        arguments: { target: "." },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.mode).toBe("context");
      expect(content.scope).toBe(".");
      expect(Array.isArray(content.governingRules)).toBe(true);
      expect(content.governingRules.length).toBeGreaterThan(0);
      expect(content.governingRules[0].tag).toBe(ruleTag);
      expect(content.governingRules[0].invariant).toBeDefined();
      expect(content.governingRules[0].body).toBeUndefined(); // GIST mode omits full markdown body
    });

    it("should support mode='inspect' to combine find + read + references in 1 turn", async () => {
      const res = await client.callTool({
        name: "modie_compile_context",
        arguments: { target: ruleTag, mode: "inspect" },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.mode).toBe("inspect");
      expect(content.tag).toBe(ruleTag);
      expect(content.filepath).toContain(ruleTag);
      expect(content.relativePath).toBeDefined();
      expect(Array.isArray(content.referencedBy)).toBe(true);
      // Inbound reference from adrTag and task101Tag
      const referencingTags = content.referencedBy.map((r: any) => r.tag);
      expect(referencingTags).toContain(adrTag);
      expect(referencingTags).toContain(task101Tag);
    });

    it("should support mode='scope' for spatial directory resolution", async () => {
      const res = await client.callTool({
        name: "modie_compile_context",
        arguments: { target: ".", mode: "scope" },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.mode).toBe("scope");
      expect(content.scope).toBe(".");
      expect(content.scopeDir).toBeDefined();
      expect(Array.isArray(content.ancestralChain)).toBe(true);
    });
  });

  describe("Tool 2: modie_query_catalog", () => {
    it("should query task catalog with DAG readiness filtering", async () => {
      const res = await client.callTool({
        name: "modie_query_catalog",
        arguments: { kind: "TASK", ready_only: true },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("TASK");
      expect(content.totalTasks).toBe(2);
      expect(content.readyCount).toBe(1);
      expect(content.blockedCount).toBe(1);
      expect(content.items).toHaveLength(1);
      expect(content.items[0].tag).toBe(task101Tag);
      expect(content.items[0].readiness).toBe("READY");
    });

    it("should query backlog tasks when kind='BACKLOG'", async () => {
      const res = await client.callTool({
        name: "modie_query_catalog",
        arguments: { kind: "BACKLOG" },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("BACKLOG");
      expect(content.blockedCount).toBe(1);
      expect(content.items[0].tag).toBe(task102Tag);
      expect(content.items[0].blockedBy).toContain(task101Tag);
    });

    it("should query rules and adrs with 1-line invariants and summaries", async () => {
      const ruleRes = await client.callTool({
        name: "modie_query_catalog",
        arguments: { kind: "RULE" },
      });
      const ruleContent = getStructuredContent(ruleRes);
      expect(ruleContent.kind).toBe("RULE");
      expect(ruleContent.totalCount).toBeGreaterThan(0);
      expect(ruleContent.items[0].tag).toBe(ruleTag);

      const adrRes = await client.callTool({
        name: "modie_query_catalog",
        arguments: { kind: "ADR" },
      });
      const adrContent = getStructuredContent(adrRes);
      expect(adrContent.kind).toBe("ADR");
      expect(adrContent.totalCount).toBe(1);
      expect(adrContent.items[0].tag).toBe(adrTag);
      expect(adrContent.items[0].summary).toContain("consolidated MCP tools");
    });
  });

  describe("Tool 3: modie_task_lifecycle", () => {
    it("should auto-inject Mission Brief, checklist, blast radius constraint, and ambient guardrails on start", async () => {
      const res = await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "start",
          task_id: task101Id,
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.action).toBe("start");
      expect(content.taskId).toBe(task101Id);
      expect(content.branch).toContain(`task/${task101Id}-`);

      // Verify Mission Brief auto-injection
      expect(content.mission).toBeDefined();
      expect(content.mission.title.toLowerCase()).toBe("sample ready");
      expect(content.mission.scope).toBe(".");
      expect(content.mission.blastRadius?.constraint).toContain(rule6Tag);
      expect(content.mission.acceptanceCriteria).toHaveLength(3);

      // Verify ambient guardrails (governing rules & linked ADRs)
      expect(content.ambientGuardrails).toBeDefined();
      expect(content.ambientGuardrails.governingRules).toBeDefined();
      const ruleTags = content.ambientGuardrails.governingRules.map(
        (r: any) => r.tag,
      );
      expect(ruleTags).toContain(ruleTag);
      const adrTags = content.ambientGuardrails.linkedAdrs.map(
        (a: any) => a.tag,
      );
      expect(adrTags).toContain(adrTag);
    });

    it("should support batched acceptance criteria verification in a single call", async () => {
      const res = await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "check",
          task_id: task101Id,
          check_items: [1, 2],
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.action).toBe("check");
      expect(content.checkedItems).toEqual([1, 2]);
      expect(content.progress).toContain("2/3 completed (67%)");
      expect(content.remainingCriteria).toHaveLength(1);
      expect(content.remainingCriteria[0].item).toBe(3);
    });

    it("should inspect task status via action='status'", async () => {
      const res = await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "status",
          task_id: task101Id,
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.action).toBe("status");
      expect(content.title.toLowerCase()).toBe("sample ready");
      expect(content.acceptanceCriteria).toHaveLength(3);
    });

    it("should support atomic complete_and_merge ceremony", async () => {
      // 1. Start task branch
      await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "start",
          task_id: task101Id,
        },
      });

      // 2. Check all items
      await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "check",
          task_id: task101Id,
          check_items: [1, 2, 3],
        },
      });

      // 3. Complete and merge
      const res = await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "complete_and_merge",
          task_id: task101Id,
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.action).toBe("complete_and_merge");
      expect(content.phase2Commit).toBeDefined();
      expect(content.deletedTaskPath).toContain(sampleReadyTaskFilename);
      expect(content.merged).toBe(true);
    });
  });

  describe("Tool 4: modie_create_artifact", () => {
    it("should return blueprint skeleton without writing to disk when scaffold_only=true", async () => {
      const res = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "ADR",
          title: "Blueprint Decision",
          scaffold_only: true,
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("ADR");
      expect(content.requiredSections).toEqual([
        "Context",
        "Alternatives Considered",
        "Decision",
        "Consequences",
      ]);
      expect(content.allowedFrontmatter).toContain("links");
      expect(content.allowedFrontmatter).toContain("supersedes");
      expect(content.allowedFrontmatter).toContain("summary");
      expect(content.template).toContain("# Context");
      expect(content.template).toContain("# Decision");
      expect(content.template).toContain("# Consequences");
    });

    it("should atomically create artifact with initial_links in a single turn", async () => {
      const res = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "RULE",
          title: "Atomic Linking Rule",
          sections: {
            Invariant: "Every artifact must link to its justifying ancestor.",
          },
          initial_links: [adrTag],
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("RULE");
      expect(content.tag.startsWith(makeTestTag("RULE", ""))).toBe(true);
      expect(content.validatedLinks).toContain(adrTag);
      expect(content.filepath).toBeDefined();
    });

    it("should create ADR with first-class summary frontmatter and consequences section", async () => {
      const res = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "ADR",
          title: "First Class Consequences Architecture",
          sections: {
            Summary: "Provide rapid discovery summary in frontmatter.",
            Context:
              "ADR bodies need clear distinction between decision and trade-offs.",
            "Alternatives Considered":
              "- Decision string concatenation\n- Separate file format",
            Decision: "Adopt distinct consequences section.",
            Consequences:
              "- Clear semantic separation.\n- No fragile string concatenation.",
          },
          initial_links: [adrTag],
        },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.kind).toBe("ADR");
      expect(content.tag.startsWith(makeTestTag("ADR", ""))).toBe(true);

      const fileContent = await workspace.readFile(content.filepath);
      expect(fileContent).toContain(
        "summary: Provide rapid discovery summary in frontmatter.",
      );
      expect(fileContent).toContain(
        "# Context\n\nADR bodies need clear distinction between decision and trade-offs.",
      );
      expect(fileContent).toContain(
        "# Alternatives Considered\n\n- Decision string concatenation\n- Separate file format",
      );
      expect(fileContent).toContain(
        "# Decision\n\nAdopt distinct consequences section.",
      );
      expect(fileContent).toContain(
        "# Consequences\n\n- Clear semantic separation.\n- No fragile string concatenation.",
      );
      expect(fileContent).not.toContain("## Consequences");
    });
  });

  describe("Tool 5: modie_mutate_governance", () => {
    it("should batch link and unlink relationships in a single turn", async () => {
      // Create a second rule to link
      const rule2Res = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "RULE",
          title: "Second Target Rule",
          sections: { Invariant: "Second invariant." },
        },
      });
      const rule2Tag = getStructuredContent(rule2Res).tag;

      // Batch link
      const linkRes = await client.callTool({
        name: "modie_mutate_governance",
        arguments: {
          action: "link",
          target: adrTag,
          targets: [ruleTag, rule2Tag],
        },
      });

      expect(linkRes.isError).toBeFalsy();
      const linkContent = getStructuredContent(linkRes);
      expect(linkContent.action).toBe("link");
      expect(linkContent.alreadyPresent).toContain(ruleTag);
      expect(linkContent.added).toContain(rule2Tag);

      // Batch unlink
      const unlinkRes = await client.callTool({
        name: "modie_mutate_governance",
        arguments: {
          action: "unlink",
          target: adrTag,
          targets: [rule2Tag],
        },
      });

      expect(unlinkRes.isError).toBeFalsy();
      const unlinkContent = getStructuredContent(unlinkRes);
      expect(unlinkContent.action).toBe("unlink");
      expect(unlinkContent.removed).toContain(rule2Tag);
    });

    it("should archive an unreferenced rule via unified archive action", async () => {
      // Create a rule without references
      const unlinkedRes = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "RULE",
          title: "Standalone Rule For Archival",
          sections: { Invariant: "Temporary invariant." },
        },
      });
      const unlinkedTag = getStructuredContent(unlinkedRes).tag;

      const archiveRes = await client.callTool({
        name: "modie_mutate_governance",
        arguments: {
          action: "archive",
          target: unlinkedTag,
        },
      });

      expect(archiveRes.isError).toBeFalsy();
      const archiveContent = getStructuredContent(archiveRes);
      expect(archiveContent.action).toBe("archive");
      expect(archiveContent.tag).toBe(unlinkedTag);
      expect(archiveContent.archivedPath).toContain(".ARCHIVED.md");
    });
  });

  describe("Ambient Governance Resources & Protocols", () => {
    it("should list ready tasks, all tasks, and active rules resources", async () => {
      const response = await client.listResources();
      const uris = response.resources.map((r) => r.uri);

      expect(uris).toContain("modie://tasks/ready");
      expect(uris).toContain("modie://tasks");
      expect(uris).toContain("modie://task/current");
      expect(uris).toContain("modie://rules");
      expect(uris).toContain("modie://instructions");
    });

    it("should read modie://tasks/ready and return only unblocked ready tasks", async () => {
      const readRes = await client.readResource({ uri: "modie://tasks/ready" });
      const text = getResourceText(readRes);
      const tasks = JSON.parse(text);

      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].fullTaskId).toBe(task101Tag);
    });

    it("should read modie://rules and return active governance rules with details", async () => {
      const readRes = await client.readResource({ uri: "modie://rules" });
      const text = getResourceText(readRes);
      const rules = JSON.parse(text);

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].tag).toBe(ruleTag);
    });

    it("should read modie://instructions and return agent authoring guidance", async () => {
      const readRes = await client.readResource({
        uri: "modie://instructions",
      });
      const text = getResourceText(readRes);

      expect(text).toContain("Modie Agent Instructions");
      expect(text).toContain("Ephemeral Task Decoupling");
      expect(text).toContain("Contract-Based Acceptance Criteria");
    });

    it("should exchange JSON-RPC protocol messages over standard I/O via bin.ts", async () => {
      const binPath = `${import.meta.dir}/bin.ts`;
      const child = spawn("bun", [binPath], {
        cwd: workspace.cwd,
        env: { ...process.env, MODIE_CWD: workspace.cwd },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let buffer = "";
      child.stdout.on("data", (data) => {
        buffer += data.toString("utf8");
      });

      const initMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      };

      child.stdin.write(JSON.stringify(initMessage) + "\n");

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error("Timeout waiting for initialize response from bin.ts"),
          );
        }, 5000);

        const checkInterval = setInterval(() => {
          if (buffer.includes('"jsonrpc":"2.0"') && buffer.includes('"id":1')) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 50);
      });

      const lines = buffer.split("\n").filter((l) => l.trim().length > 0);
      const initLine = lines.find((l) => l.includes('"id":1'));
      expect(initLine).toBeDefined();

      const response = JSON.parse(initLine!);
      expect(response.result?.serverInfo?.name).toBe("modie");

      child.kill("SIGTERM");
    });
  });
});

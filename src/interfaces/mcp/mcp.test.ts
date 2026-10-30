/**
 * Integration and unit tests for Modie Model Context Protocol (MCP) server.
 * Verifies RULE-25 (interface-core decoupling), RULE-26 (token economy), and RULE-27 (stream separation).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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

function getResourceText(readRes: any): string {
  const item = readRes?.contents?.[0];
  return item && typeof item === "object" && "text" in item
    ? (item.text as string)
    : "";
}

describe("Modie MCP Server - Tool Registration & Protocol Interface (RULE-25, RULE-26)", () => {
  let workspace: FixtureWorkspace;
  let server: ReturnType<typeof createModieMcpServer>;
  let client: Client;
  const ruleTag = makeTestTag("RULE", 101);
  const task101Tag = makeTestTag("TASK", 101);
  const task102Tag = makeTestTag("TASK", 102);

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-mcp-test-");

    // Set up a sample rule in workspace
    await workspace.createRule({
      id: 101,
      slug: "sample-rule",
      title: "Sample Rule",
      body: "All code must be tested.",
    });

    // Set up sample tasks in workspace
    await workspace.createTask({
      id: 101,
      slug: "sample-ready",
      title: "Sample Ready",
      context: "Ready task context.",
      criteria: ["First criterion", "Second criterion"],
      links: [ruleTag],
    });
    await workspace.createTask({
      id: 102,
      slug: "sample-blocked",
      title: "Sample Blocked",
      context: "Blocked task context.",
      criteria: ["Dependent item"],
      depends_on: [task101Tag],
    });

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

  it("[RULE-25] should register all 12 core CLI commands as typed MCP tools", async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames).toContain("find");
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("scope");
    expect(toolNames).not.toContain("show");
    expect(toolNames).toContain("references");
    expect(toolNames).toContain("archive");
    expect(toolNames).toContain("link_artifact");
    expect(toolNames).toContain("unlink_artifact");
    expect(toolNames).toContain("rule_create");
    expect(toolNames).toContain("rule_list");
    expect(toolNames).toContain("rule_archive");
    expect(toolNames).toContain("adr_create");
    expect(toolNames).toContain("adr_list");
    expect(toolNames).toContain("adr_archive");
    expect(toolNames).toContain("task_create");
    expect(toolNames).toContain("task_list");
    expect(toolNames).toContain("task_status");
    expect(toolNames).toContain("task_check");
    expect(toolNames).toContain("task_start");
    expect(toolNames).toContain("task_complete");
    expect(toolNames).toContain("task_merge");

    // Verify tool metadata and input schemas
    const checkTool = response.tools.find((t) => t.name === "task_check");
    expect(checkTool).toBeDefined();
    expect(checkTool?.description).toContain("acceptance criteria item");
    expect((checkTool?.inputSchema as any)?.properties?.id).toBeDefined();
    expect((checkTool?.inputSchema as any)?.properties?.item).toBeDefined();

    // Verify injected agent guidance and anti-pattern warnings (TASK-35)
    const createTool = response.tools.find((t) => t.name === "task_create");
    expect(createTool?.description).toContain(
      "Contract-Based Acceptance Criteria (RULE-30)",
    );
    expect(createTool?.description).toContain("Ephemeral Task Decoupling");
    expect(createTool?.description).toContain("Upfront Planned Governance");
    expect(createTool?.description).toContain("Human-in-the-Loop Review Gate");

    const completeTool = response.tools.find((t) => t.name === "task_complete");
    expect(completeTool?.description).toContain("EPHEMERAL TASK INVARIANT");
    expect(completeTool?.description).toContain("CRITICAL: Do NOT invoke this tool autonomously");

    expect(checkTool?.description).toContain("Do not check items designated for human sign-off");

    const mergeTool = response.tools.find((t) => t.name === "task_merge");
    expect(mergeTool?.description).toContain("Call this tool only when the task has been completed and the user explicitly requests");
  });

  it("[RULE-26] should execute task_list tool and return strictly actionable schema payloads", async () => {
    const result = await client.callTool({
      name: "task_list",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const text = getTextContent(result);

    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);

    const task101 = parsed.find((t: any) => t.fullTaskId === task101Tag);
    expect(task101).toBeDefined();
    expect(task101.readiness).toBe("READY");
    expect(task101.criteriaProgress).toBe("0/2");

    // Enforce RULE-26: No decorative formatting or ANSI escapes
    expect(text).not.toContain("\u001b[");
    expect(text).not.toContain("---");
  });

  it("[RULE-26] should execute task_status for a specific task and inspect progress", async () => {
    const result = await client.callTool({
      name: "task_status",
      arguments: { id: task101Tag },
    });

    expect(result.isError).toBeFalsy();
    const status = JSON.parse(getTextContent(result));
    expect(status.fullTaskId).toBe(task101Tag);
    expect(status.readiness).toBe("READY");
    expect(status.acceptanceCriteria).toHaveLength(2);
    expect(status.acceptanceCriteria[0].completed).toBe(false);
  });

  it("[RULE-26] should check task criteria item via task_check tool", async () => {
    const checkResult = await client.callTool({
      name: "task_check",
      arguments: { id: task101Tag, item: 1 },
    });

    expect(checkResult.isError).toBeFalsy();
    const payload = JSON.parse(getTextContent(checkResult));
    expect(payload.completed).toBe(true);
    expect(payload.itemIndex).toBe(1);

    // Verify task status reflects updated item
    const statusResult = await client.callTool({
      name: "task_status",
      arguments: { id: task101Tag },
    });
    const status = JSON.parse(getTextContent(statusResult));
    expect(status.acceptanceCriteria[0].completed).toBe(true);
    expect(status.criteriaProgress).toBe("1/2");
  });

  it("[RULE-26] should enforce token economy by omitting unsolicited rawContent and delivering scope in read tool", async () => {
    // 1. Without raw flag: rawContent must be omitted, scope must be present
    const normalRead = await client.callTool({
      name: "read",
      arguments: { tag: task101Tag },
    });

    expect(normalRead.isError).toBeFalsy();
    const normalData = JSON.parse(getTextContent(normalRead));
    expect(normalData.tag).toBe(task101Tag);
    expect(normalData.slug).toBe("sample-ready");
    expect(normalData.scope).toBe(".");
    expect(normalData.rawContent).toBeUndefined(); // Token economy enforced!

    // 2. With raw flag: rawContent is solicited, therefore returned
    const rawRead = await client.callTool({
      name: "read",
      arguments: { tag: task101Tag, raw: true },
    });

    expect(rawRead.isError).toBeFalsy();
    const rawData = JSON.parse(getTextContent(rawRead));
    expect(rawData.rawContent).toBeDefined();
    expect(rawData.rawContent).toContain("# Acceptance Criteria");
  });

  it("[RULE-25][RULE-26] should execute scope tool and resolve boundaries and rules via MCP", async () => {
    const scopeResult = await client.callTool({
      name: "scope",
      arguments: { target: ruleTag },
    });
    expect(scopeResult.isError).toBeFalsy();
    const data = JSON.parse(getTextContent(scopeResult));
    expect(data.type).toBe("artifact");
    expect(data.scope).toBe(".");
    expect(data.enclosingModieDir).toBe(".modie");
    expect(data.rules.length).toBeGreaterThanOrEqual(1);
  });

  it("[RULE-26] should return isError: true on input validation failure or unknown artifact", async () => {
    // Missing required field or invalid index
    const invalidCall = await client.callTool({
      name: "task_check",
      arguments: { id: task101Tag, item: -5 },
    });
    expect(invalidCall.isError).toBe(true);

    // Unknown artifact tag
    const notFoundTag = makeTestTag("TASK", 99999);
    const notFoundCall = await client.callTool({
      name: "find",
      arguments: { tag: notFoundTag },
    });
    expect(notFoundCall.isError).toBe(true);
    expect(getTextContent(notFoundCall)).toContain(notFoundTag);
  });

  it("[RULE-25] should create a new task via task_create tool", async () => {
    const createResult = await client.callTool({
      name: "task_create",
      arguments: {
        title: "Agent Created Task",
        criteria: ["Item A", "Item B"],
        links: [ruleTag],
      },
    });

    expect(createResult.isError).toBeFalsy();
    const created = JSON.parse(getTextContent(createResult));
    expect(created.id).toBeDefined();
    expect(created.slug).toBe("agent-created-task");
    expect(created.acceptanceCriteria).toHaveLength(3);
    expect(created.acceptanceCriteria[2].text).toBe("User Review");
  });

  it("[RULE-25] should create a new task with noReview via task_create tool", async () => {
    const createResult = await client.callTool({
      name: "task_create",
      arguments: {
        title: "Agent Automated Task",
        criteria: ["Item A", "Item B"],
        noReview: true,
      },
    });

    expect(createResult.isError).toBeFalsy();
    const created = JSON.parse(getTextContent(createResult));
    expect(created.acceptanceCriteria).toHaveLength(2);
  });

  // @verifies ADR-4, RULE-9, RULE-25, RULE-26, RULE-34, RULE-35
  it("[ADR-4][RULE-9][RULE-25][RULE-26][RULE-34][RULE-35] should execute rule_list and adr_list tools with ancestral scope filtering and token economy", async () => {
    const adr101Tag = makeTestTag("ADR", 101);
    const adr102Tag = makeTestTag("ADR", 102);
    const rule102Tag = makeTestTag("RULE", 102);
    const rule103Tag = makeTestTag("RULE", 103);

    await workspace.createAdr({
      id: 101,
      slug: "root-architecture-decision",
      links: [ruleTag],
      context: "Root decision context.",
    });
    await workspace.createAdr({
      id: 102,
      slug: "mcp-subsystem-decision",
      subDir: "src/interfaces/mcp/.modie/adrs",
      links: [],
      context: "MCP decision context.",
    });

    await workspace.createRule({
      id: 102,
      slug: "mcp-subsystem-rule",
      subDir: "src/interfaces/mcp/.modie/rules",
      links: [adr101Tag],
      body: "MCP subsystem rule body.",
    });
    await workspace.createRule({
      id: 103,
      slug: "cli-sibling-rule",
      subDir: "src/interfaces/cli/.modie/rules",
      links: [],
      body: "CLI sibling rule body.",
    });

    // 1. rule_list with ancestral scope filtering
    const ruleListRes = await client.callTool({
      name: "rule_list",
      arguments: { scope: "src/interfaces/mcp" },
    });
    expect(ruleListRes.isError).toBeFalsy();
    const rules = JSON.parse(getTextContent(ruleListRes));
    expect(rules.map((r: any) => r.tag)).toEqual([ruleTag, rule102Tag]);
    expect(rules[1].title).toBe("mcp subsystem rule");
    expect(rules[1].links).toEqual([adr101Tag]);
    expect(rules[1].relativePath).toBe(
      `src/interfaces/mcp/.modie/rules/mcp-subsystem-rule.${rule102Tag}.md`,
    );
    // Enforce RULE-26 token economy: no unsolicited rawContent or body in list responses
    expect(rules[0].rawContent).toBeUndefined();
    expect(rules[0].body).toBeUndefined();

    // 2. adr_list with ancestral scope filtering
    const adrListRes = await client.callTool({
      name: "adr_list",
      arguments: { scope: "src/interfaces/cli" },
    });
    expect(adrListRes.isError).toBeFalsy();
    const adrs = JSON.parse(getTextContent(adrListRes));
    expect(adrs.map((a: any) => a.tag)).toEqual([adr101Tag]);
    expect(adrs[0].title).toBe("root architecture decision");
    expect(adrs[0].links).toEqual([ruleTag]);
    expect(adrs[0].rawContent).toBeUndefined();
    expect(adrs[0].body).toBeUndefined();

    // 3. Error convention on invalid scope outside workspace
    const invalidScopeRes = await client.callTool({
      name: "rule_list",
      arguments: { scope: "../outside-workspace" },
    });
    expect(invalidScopeRes.isError).toBe(true);
    expect(getTextContent(invalidScopeRes)).toContain(
      "scope path must reside within the workspace root",
    );
  });

  // @verifies ADR-5, RULE-13, RULE-16, RULE-18, RULE-25, RULE-26, RULE-36
  it("[ADR-5][RULE-13][RULE-16][RULE-18][RULE-25][RULE-26][RULE-36] should execute link_artifact and unlink_artifact tools and return informative validation errors on violations", async () => {
    const adr105Tag = makeTestTag("ADR", 105);
    await workspace.createAdr({
      id: 105,
      slug: "root-linking-adr",
      links: [],
      context: "Root linking ADR.",
    });

    // 1. Valid link_artifact from RULE -> ADR
    const linkRes = await client.callTool({
      name: "link_artifact",
      arguments: {
        source: ruleTag,
        target: adr105Tag,
      },
    });
    expect(linkRes.isError).toBeFalsy();
    const linked = JSON.parse(getTextContent(linkRes));
    expect(linked.action).toBe("link");
    expect(linked.relationship).toBe("links");
    expect(linked.changed).toBe(true);
    expect(linked.links).toEqual([adr105Tag]);

    // 2. Reject circular task dependency via link_artifact (task102 already depends_on task101)
    const cycleRes = await client.callTool({
      name: "link_artifact",
      arguments: {
        source: task101Tag,
        target: task102Tag,
      },
    });
    expect(cycleRes.isError).toBe(true);
    expect(getTextContent(cycleRes)).toContain(
      "Circular task dependency detected",
    );
    expect(getTextContent(cycleRes)).toContain("RULE-18");

    // 3. Valid unlink_artifact removing RULE -> ADR link
    const unlinkRes = await client.callTool({
      name: "unlink_artifact",
      arguments: {
        source: ruleTag,
        target: adr105Tag,
      },
    });
    expect(unlinkRes.isError).toBeFalsy();
    const unlinked = JSON.parse(getTextContent(unlinkRes));
    expect(unlinked.action).toBe("unlink");
    expect(unlinked.relationship).toBe("links");
    expect(unlinked.changed).toBe(true);
    expect(unlinked.links).toEqual([]);
  });
});

describe("Modie MCP Server - Read-Only Resources (Criterion 4)", () => {
  let workspace: FixtureWorkspace;
  let server: ReturnType<typeof createModieMcpServer>;
  let client: Client;
  const rule201Tag = makeTestTag("RULE", 201);
  const task201Tag = makeTestTag("TASK", 201);
  const task202Tag = makeTestTag("TASK", 202);

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-mcp-resources-");

    await workspace.createRule({
      id: 201,
      slug: "governance-rule",
      title: "Governance Rule",
      body: "System integrity rule body.",
    });

    await workspace.createTask({
      id: 201,
      slug: "ready-task",
      title: "Ready Task",
      criteria: ["Task item"],
    });
    await workspace.createTask({
      id: 202,
      slug: "blocked-task",
      title: "Blocked Task",
      criteria: ["Waiting"],
      depends_on: [task201Tag],
    });

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

  it("should list ready tasks, all tasks, and active rules resources", async () => {
    const listRes = await client.listResources();
    const uris = listRes.resources.map((r) => r.uri);

    expect(uris).toContain("modie://tasks/ready");
    expect(uris).toContain("modie://tasks");
    expect(uris).toContain("modie://rules");
    expect(uris).toContain("modie://instructions");

    const readyResource = listRes.resources.find(
      (r) => r.uri === "modie://tasks/ready",
    );
    expect(readyResource?.mimeType).toBe("application/json");

    const instructionsResource = listRes.resources.find(
      (r) => r.uri === "modie://instructions",
    );
    expect(instructionsResource?.mimeType).toBe("text/markdown");
  });

  it("should read modie://tasks/ready and return only unblocked ready tasks", async () => {
    const readRes = await client.readResource({ uri: "modie://tasks/ready" });
    expect(readRes.contents).toHaveLength(1);
    expect(readRes.contents?.[0]?.mimeType).toBe("application/json");

    const text = getResourceText(readRes);
    const tasks = JSON.parse(text);
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].fullTaskId).toBe(task201Tag);
    expect(tasks[0].readiness).toBe("READY");
  });

  it("should read modie://rules and return active governance rules with details", async () => {
    const readRes = await client.readResource({ uri: "modie://rules" });
    expect(readRes.contents).toHaveLength(1);
    expect(readRes.contents?.[0]?.mimeType).toBe("application/json");

    const text = getResourceText(readRes);
    const rules = JSON.parse(text);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules).toHaveLength(1);
    expect(rules[0].tag).toBe(rule201Tag);
    expect(rules[0].body).toContain("System integrity rule body.");
  });

  it("should read modie://instructions and return agent authoring guidance", async () => {
    const readRes = await client.readResource({ uri: "modie://instructions" });
    expect(readRes.contents).toHaveLength(1);
    expect(readRes.contents?.[0]?.mimeType).toBe("text/markdown");

    const text = getResourceText(readRes);
    expect(text).toContain("Ephemeral Task Decoupling");
    expect(text).toContain("Contract-Based Acceptance Criteria");
  });
});

describe("Modie MCP CLI Entrypoint & Stdio Transport (RULE-27, Criterion 5)", () => {
  it("[RULE-27] should emit usage information to stderr when modie mcp --help is run", async () => {
    const proc = Bun.spawn(
      [process.execPath, "./src/interfaces/cli/bin.ts", "mcp", "--help"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toBe(""); // RULE-27: Help must be sent to stderr
    expect(stderr).toContain("Usage: modie mcp [options]");
    expect(stderr).toContain("Launch Model Context Protocol (MCP) server");
  });

  it("should exchange JSON-RPC protocol messages over standard I/O via bin.ts", async () => {
    const proc = Bun.spawn(
      [process.execPath, "./src/interfaces/cli/bin.ts", "mcp"],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    // Send JSON-RPC initialize request
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-cli-client",
          version: "1.0.0",
        },
      },
    };

    proc.stdin.write(JSON.stringify(initRequest) + "\n");
    proc.stdin.flush();

    // Read response line from stdout using reader
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let response: any = null;

    const timeout = setTimeout(() => {
      proc.kill();
      throw new Error(
        `Timed out waiting for initialize response. Received: ${buffer}`,
      );
    }, 5000);

    try {
      while (!response) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 1) {
              response = parsed;
              break;
            }
          } catch {
            // Not a complete JSON line yet
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      proc.kill();
    }

    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.serverInfo.name).toBe("modie");
  });
});

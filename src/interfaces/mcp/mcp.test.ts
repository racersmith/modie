/**
 * Integration and unit tests for Modie Model Context Protocol (MCP) server.
 * Verifies RULE-25 (interface-core decoupling), RULE-26 (token economy), and RULE-27 (stream separation).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createModieMcpServer } from "./server.ts";

function getTextContent(result: any): string {
  const item = result?.content?.[0];
  return item && typeof item === "object" && "text" in item ? (item.text as string) : "";
}

function getResourceText(readRes: any): string {
  const item = readRes?.contents?.[0];
  return item && typeof item === "object" && "text" in item ? (item.text as string) : "";
}

describe("Modie MCP Server - Tool Registration & Protocol Interface (RULE-25, RULE-26)", () => {
  let tempDir: string;
  let server: ReturnType<typeof createModieMcpServer>;
  let client: Client;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-mcp-test-"));

    // Set up a sample rule in tempDir
    const rulesDir = join(tempDir, "src", ".rules");
    await Bun.$`mkdir -p ${rulesDir}`.quiet();
    await writeFile(
      join(rulesDir, "sample-rule.RULE-101.md"),
      `---\nlinks: []\n---\n# Sample Rule\nAll code must be tested.\n`,
      "utf8",
    );

    // Set up sample tasks in tempDir
    const tasksDir = join(tempDir, "src", ".tasks");
    await Bun.$`mkdir -p ${tasksDir}`.quiet();
    await writeFile(
      join(tasksDir, "sample-ready.TASK-101.md"),
      `---\ndepends_on: []\nlinks:\n  - RULE-101\n---\n# Context\nReady task context.\n# Acceptance Criteria\n- [ ] First criterion\n- [ ] Second criterion\n`,
      "utf8",
    );
    await writeFile(
      join(tasksDir, "sample-blocked.TASK-102.md"),
      `---\ndepends_on:\n  - TASK-101\nlinks: []\n---\n# Context\nBlocked task context.\n# Acceptance Criteria\n- [ ] Dependent item\n`,
      "utf8",
    );

    server = createModieMcpServer({ cwd: tempDir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "modie-test-client", version: "0.0.1" }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("[RULE-25] should register all 12 core CLI commands as typed MCP tools", async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames).toContain("find");
    expect(toolNames).toContain("show");
    expect(toolNames).toContain("references");
    expect(toolNames).toContain("archive");
    expect(toolNames).toContain("rule_create");
    expect(toolNames).toContain("rule_archive");
    expect(toolNames).toContain("adr_create");
    expect(toolNames).toContain("adr_archive");
    expect(toolNames).toContain("task_create");
    expect(toolNames).toContain("task_list");
    expect(toolNames).toContain("task_status");
    expect(toolNames).toContain("task_check");
    expect(toolNames).toContain("task_start");
    expect(toolNames).toContain("task_complete");
    expect(toolNames).toContain("task_merge");

    expect(toolNames.length).toBe(15);

    // Verify tool metadata and input schemas
    const checkTool = response.tools.find((t) => t.name === "task_check");
    expect(checkTool).toBeDefined();
    expect(checkTool?.description).toContain("acceptance criteria item");
    expect((checkTool?.inputSchema as any)?.properties?.id).toBeDefined();
    expect((checkTool?.inputSchema as any)?.properties?.item).toBeDefined();
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

    const task101 = parsed.find((t: any) => t.fullTaskId === "TASK-101");
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
      arguments: { id: "TASK-101" },
    });

    expect(result.isError).toBeFalsy();
    const status = JSON.parse(getTextContent(result));
    expect(status.fullTaskId).toBe("TASK-101");
    expect(status.readiness).toBe("READY");
    expect(status.acceptanceCriteria).toHaveLength(2);
    expect(status.acceptanceCriteria[0].completed).toBe(false);
  });

  it("[RULE-26] should check task criteria item via task_check tool", async () => {
    const checkResult = await client.callTool({
      name: "task_check",
      arguments: { id: "TASK-101", item: 1 },
    });

    expect(checkResult.isError).toBeFalsy();
    const payload = JSON.parse(getTextContent(checkResult));
    expect(payload.completed).toBe(true);
    expect(payload.itemIndex).toBe(1);

    // Verify task status reflects updated item
    const statusResult = await client.callTool({
      name: "task_status",
      arguments: { id: "TASK-101" },
    });
    const status = JSON.parse(getTextContent(statusResult));
    expect(status.acceptanceCriteria[0].completed).toBe(true);
    expect(status.criteriaProgress).toBe("1/2");
  });

  it("[RULE-26] should enforce token economy by omitting unsolicited rawContent in show tool", async () => {
    // 1. Without raw flag: rawContent must be omitted
    const normalShow = await client.callTool({
      name: "show",
      arguments: { tag: "TASK-101" },
    });

    expect(normalShow.isError).toBeFalsy();
    const normalData = JSON.parse(getTextContent(normalShow));
    expect(normalData.tag).toBe("TASK-101");
    expect(normalData.slug).toBe("sample-ready");
    expect(normalData.rawContent).toBeUndefined(); // Token economy enforced!

    // 2. With raw flag: rawContent is solicited, therefore returned
    const rawShow = await client.callTool({
      name: "show",
      arguments: { tag: "TASK-101", raw: true },
    });

    expect(rawShow.isError).toBeFalsy();
    const rawData = JSON.parse(getTextContent(rawShow));
    expect(rawData.rawContent).toBeDefined();
    expect(rawData.rawContent).toContain("# Acceptance Criteria");
  });

  it("[RULE-26] should return isError: true on input validation failure or unknown artifact", async () => {
    // Missing required field or invalid index
    const invalidCall = await client.callTool({
      name: "task_check",
      arguments: { id: "TASK-101", item: -5 },
    });
    expect(invalidCall.isError).toBe(true);

    // Unknown artifact tag
    const notFoundCall = await client.callTool({
      name: "find",
      arguments: { tag: "TASK-99999" },
    });
    expect(notFoundCall.isError).toBe(true);
    expect(getTextContent(notFoundCall)).toContain("TASK-99999");
  });

  it("[RULE-25] should create a new task via task_create tool", async () => {
    const createResult = await client.callTool({
      name: "task_create",
      arguments: {
        title: "Agent Created Task",
        criteria: ["Item A", "Item B"],
        links: ["RULE-101"],
      },
    });

    expect(createResult.isError).toBeFalsy();
    const created = JSON.parse(getTextContent(createResult));
    expect(created.id).toBeDefined();
    expect(created.slug).toBe("agent-created-task");
    expect(created.acceptanceCriteria).toHaveLength(2);
  });
});

describe("Modie MCP Server - Read-Only Resources (Criterion 4)", () => {
  let tempDir: string;
  let server: ReturnType<typeof createModieMcpServer>;
  let client: Client;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-mcp-resources-"));

    const rulesDir = join(tempDir, "src", ".rules");
    await Bun.$`mkdir -p ${rulesDir}`.quiet();
    await writeFile(
      join(rulesDir, "governance-rule.RULE-201.md"),
      `---\nlinks: []\n---\n# Governance Rule\nSystem integrity rule body.\n`,
      "utf8",
    );

    const tasksDir = join(tempDir, "src", ".tasks");
    await Bun.$`mkdir -p ${tasksDir}`.quiet();
    await writeFile(
      join(tasksDir, "ready-task.TASK-201.md"),
      `---\ndepends_on: []\nlinks: []\n---\n# Acceptance Criteria\n- [ ] Task item\n`,
      "utf8",
    );
    await writeFile(
      join(tasksDir, "blocked-task.TASK-202.md"),
      `---\ndepends_on:\n  - TASK-201\nlinks: []\n---\n# Acceptance Criteria\n- [ ] Waiting\n`,
      "utf8",
    );

    server = createModieMcpServer({ cwd: tempDir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "modie-test-client", version: "0.0.1" }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should list ready tasks, all tasks, and active rules resources", async () => {
    const listRes = await client.listResources();
    const uris = listRes.resources.map((r) => r.uri);

    expect(uris).toContain("modie://tasks/ready");
    expect(uris).toContain("modie://tasks");
    expect(uris).toContain("modie://rules");

    const readyResource = listRes.resources.find((r) => r.uri === "modie://tasks/ready");
    expect(readyResource?.mimeType).toBe("application/json");
  });

  it("should read modie://tasks/ready and return only unblocked ready tasks", async () => {
    const readRes = await client.readResource({ uri: "modie://tasks/ready" });
    expect(readRes.contents).toHaveLength(1);
    expect(readRes.contents?.[0]?.mimeType).toBe("application/json");

    const text = getResourceText(readRes);
    const tasks = JSON.parse(text);
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].fullTaskId).toBe("TASK-201");
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
    expect(rules[0].tag).toBe("RULE-201");
    expect(rules[0].body).toContain("System integrity rule body.");
  });
});

describe("Modie MCP CLI Entrypoint & Stdio Transport (RULE-27, Criterion 5)", () => {
  it("[RULE-27] should emit usage information to stderr when modie mcp --help is run", async () => {
    const proc = spawn(process.execPath, ["./src/interfaces/cli/bin.ts", "mcp", "--help"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    const exitCode = await new Promise((resolve) => proc.on("close", resolve));

    expect(exitCode).toBe(0);
    expect(stdout).toBe(""); // RULE-27: Help must be sent to stderr
    expect(stderr).toContain("Usage: modie mcp [options]");
    expect(stderr).toContain("Launch Model Context Protocol (MCP) server");
  });

  it("should exchange JSON-RPC protocol messages over standard I/O via bin.ts", async () => {
    const proc = spawn(process.execPath, ["./src/interfaces/cli/bin.ts", "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    proc.stdout.on("data", (d) => {
      buffer += d.toString();
    });

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

    // Wait for response on stdout
    const response = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for initialize response. Received: ${buffer}`));
      }, 5000);

      const check = setInterval(() => {
        const lines = buffer.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 1) {
              clearTimeout(timeout);
              clearInterval(check);
              resolve(parsed);
              return;
            }
          } catch {
            // Not a complete JSON line yet
          }
        }
      }, 50);
    });

    expect(response.result).toBeDefined();
    expect(response.result.serverInfo.name).toBe("modie");

    proc.kill("SIGTERM");
  });
});

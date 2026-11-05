/**
 * Unit and integration tests for Modie Ambient MCP Resources.
 * Verifies strictly 3 parameterless ambient resources (modie://task, modie://tasks/ready, modie://instructions).
 * @verifies RULE-25, RULE-26
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../../core/testing/index.ts";
import { registerAllResources } from "./resources.ts";

describe("Modie Ambient MCP Resources (RULE-25, RULE-26)", () => {
  let workspace: FixtureWorkspace;
  let server: McpServer;
  let client: Client;
  const taskTag = makeTestTag("TASK", 101);

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-resource-test-");
    await workspace.initGit({ defaultBranch: "dev", initialCommit: true });

    // Create a ready task
    await workspace.createTask({
      id: 101,
      slug: "ready-task",
      title: "Ready Task",
      context: "Context for ready task.",
      criteria: ["Criterion 1", "Criterion 2", "User Review"],
    });

    await workspace.gitCommit("chore: setup fixtures");

    server = new McpServer({ name: "test-resource-server", version: "1.0.0" });
    registerAllResources(server, { cwd: workspace.cwd });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    await workspace.cleanup();
  });

  // @verifies RULE-26
  it("should expose strictly 3 ambient resources and no parameterized templates", async () => {
    const res = await client.listResources();
    const uris = res.resources.map((r) => r.uri);

    expect(uris.sort()).toEqual([
      "modie://instructions",
      "modie://task",
      "modie://tasks/ready",
    ]);

    // Ensure legacy bloated resources and templates are pruned
    expect(uris).not.toContain("modie://context");
    expect(uris).not.toContain("modie://rules");
    expect(uris).not.toContain("modie://task/current");
    expect(uris).not.toContain("modie://tasks");

    const templatesRes = await client.listResourceTemplates();
    expect(templatesRes.resourceTemplates).toHaveLength(0);
  });

  // @verifies RULE-26
  it("should serve modie://tasks/ready as JSON unblocked task queue", async () => {
    const res = await client.readResource({ uri: "modie://tasks/ready" });
    expect(res.contents).toBeDefined();
    expect(res.contents.length).toBe(1);

    const item = res.contents[0] as any;
    expect(item.mimeType).toBe("application/json");
    const parsed = JSON.parse(item.text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].slug).toBe("ready-task");
    expect(parsed[0].readiness).toBe("READY");
  });

  // @verifies RULE-26
  it("should serve modie://instructions as unescaped Markdown", async () => {
    const res = await client.readResource({ uri: "modie://instructions" });
    expect(res.contents).toBeDefined();
    expect(res.contents.length).toBe(1);

    const item = res.contents[0] as any;
    expect(item.mimeType).toBe("text/markdown");
    expect(item.text).toContain("# Modie Agent Instructions");
    expect(item.text).toContain("Ephemeral Task Decoupling");
  });

  // @verifies RULE-26
  it("should serve modie://task as Markdown Mission Brief", async () => {
    // When on trunk/dev without active task
    const resNoTask = await client.readResource({ uri: "modie://task" });
    const contentNoTask = resNoTask.contents[0] as any;
    expect(contentNoTask.mimeType).toBe("text/markdown");
    expect(contentNoTask.text).toContain("No Active Task");

    // Checkout task branch
    await workspace.gitCheckout("task/101-ready-task", { create: true });

    const resWithTask = await client.readResource({ uri: "modie://task" });
    const contentWithTask = resWithTask.contents[0] as any;
    expect(contentWithTask.mimeType).toBe("text/markdown");
    expect(contentWithTask.text).toContain("# Mission Brief: TASK-101");
    expect(contentWithTask.text).toContain("BLAST RADIUS CONSTRAINT (RULE-6)");
    expect(contentWithTask.text).toContain("- [ ] 1. Criterion 1");
    expect(contentWithTask.text).toContain("- [ ] 2. Criterion 2");
    expect(contentWithTask.text).toContain("- [ ] 3. User Review");
  });
});

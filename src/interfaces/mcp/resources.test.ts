/**
 * Unit and integration tests for Modie Ambient MCP Resources.
 * Verifies strictly 4 parameterless ambient resources (modie://task, modie://tasks/ready, modie://tasks/all, modie://instructions).
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
} from "../../core/platform/testing/index.ts";
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
  it("should expose strictly 4 ambient resources and no parameterized templates", async () => {
    const res = await client.listResources();
    const uris = res.resources.map((r) => r.uri);

    expect(uris.sort()).toEqual([
      "modie://instructions",
      "modie://task",
      "modie://tasks/all",
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
  it("should serve modie://tasks/ready as condensed Markdown unblocked task queue", async () => {
    const res = await client.readResource({ uri: "modie://tasks/ready" });
    expect(res.contents).toBeDefined();
    expect(res.contents.length).toBe(1);

    const item = res.contents[0] as any;
    expect(item.mimeType).toBe("text/markdown");
    expect(item.text).toContain("# Ready Tasks Queue");
    expect(item.text).toContain(
      "1 task unblocked and ready for execution. Use `start_task` to begin a task.",
    );
    expect(item.text).toContain(`- **${taskTag}** (3 criteria) \`.\``);
    expect(item.text).toContain("*Title*: ready task");
    expect(item.text).toContain("*Summary*: Context for ready task.");
  });

  // @verifies RULE-26
  it("should serve modie://tasks/all as grouped Markdown backlog with dependency leverage", async () => {
    const task102Tag = makeTestTag("TASK", 102);
    await workspace.createTask({
      id: 102,
      slug: "blocked-task",
      title: "Blocked Task",
      depends_on: [taskTag],
      criteria: ["Implement blocked feature", "User Review"],
    });

    // On dev branch: task 101 is READY, task 102 is BLOCKED
    const resDev = await client.readResource({ uri: "modie://tasks/all" });
    const contentDev = resDev.contents[0] as any;
    expect(contentDev.mimeType).toBe("text/markdown");
    expect(contentDev.text).toContain("# Workspace Tasks Backlog");
    expect(contentDev.text).toContain("## Ready (Unblocked)");
    expect(contentDev.text).toContain(`- **${taskTag}** (0/3 criteria)`);
    expect(contentDev.text).toContain(`*Blocks*: ${task102Tag}`);
    expect(contentDev.text).toContain("## Blocked");
    expect(contentDev.text).toContain(`- **${task102Tag}** (0/2 criteria)`);
    expect(contentDev.text).toContain(`*Blocked by*: ${taskTag}`);

    // Switch to task branch: task 101 becomes IN PROGRESS
    await workspace.gitCheckout("task/101-ready-task", { create: true });
    const resBranch = await client.readResource({ uri: "modie://tasks/all" });
    const contentBranch = resBranch.contents[0] as any;
    expect(contentBranch.text).toContain("## In Progress");
    expect(contentBranch.text).toContain(`- **${taskTag}** (0/3 criteria)`);
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
    expect(contentWithTask.text).toContain(`# Mission Brief: ${taskTag}`);
    expect(contentWithTask.text).toContain("BLAST RADIUS CONSTRAINT");
    expect(contentWithTask.text).toContain("- [ ] 1. Criterion 1");
    expect(contentWithTask.text).toContain("- [ ] 2. Criterion 2");
    expect(contentWithTask.text).toContain("- [ ] 3. User Review");
  });
});

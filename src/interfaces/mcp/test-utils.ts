/**
 * Shared test harness and response helpers for isolated MCP integration tests.
 * @verifies RULE-25, RULE-26, RULE-34, RULE-35
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { formatArtifactTag } from "../../core/index.ts";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../core/platform/testing/index.ts";
import { createModieMcpServer } from "./server.ts";

export interface McpTestHarness {
  workspace: FixtureWorkspace;
  server: ReturnType<typeof createModieMcpServer>;
  client: Client;
  ruleTag: string;
  adrTag: string;
  task101Id: string;
  task101Tag: string;
  cleanup: () => Promise<void>;
}

export function getTextContent(result: any): string {
  const item = result?.content?.[0];
  return item && typeof item === "object" && "text" in item
    ? (item.text as string)
    : "";
}

export function getStructuredContent(result: any): any {
  return result?.structuredContent ?? JSON.parse(getTextContent(result));
}

export async function createMcpTestHarness(
  prefix: string = "modie-mcp-test-",
): Promise<McpTestHarness> {
  const workspace = await createFixtureWorkspace(prefix);
  await workspace.initGit({ defaultBranch: "dev", initialCommit: true });

  const ruleTag = formatArtifactTag("RULE", 101);
  const adrTag = formatArtifactTag("ADR", 101);
  const task101Id = "101";
  const task101Tag = formatArtifactTag("TASK", task101Id);

  await workspace.createRule({
    id: 101,
    slug: "sample-rule",
    title: "Sample Rule",
    body: "All code must be tested with isolated fixtures.",
  });

  await (workspace.createAdr as any)({
    id: 101,
    slug: "sample-decision",
    title: "Sample Decision",
    summary: "Decision to use singular MCP tools.",
    context: "Context for decision.",
    decision: "We adopt singular purpose tools.",
    consequences:
      "Greatly reduced preamble tokens and zero polymorphic confusion.",
    links: [ruleTag],
  });

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

  const server = createModieMcpServer({ cwd: workspace.cwd });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: "modie-test-client", version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(clientTransport);

  return {
    workspace,
    server,
    client,
    ruleTag,
    adrTag,
    task101Id,
    task101Tag,
    cleanup: async () => {
      await client.close();
      await server.close();
      await workspace.cleanup();
    },
  };
}

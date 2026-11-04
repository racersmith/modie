import { describe, expect, it } from "bun:test";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { jsonResource, registerJsonResource } from "./resources.ts";

describe("MCP Resource Envelope Boilerplate Helper (TASK-49, RULE-26)", () => {
  it("should standardize JSON resource envelopes without repetitive boilerplate", async () => {
    const server = new McpServer({ name: "test-helper-server", version: "1.0.0" });

    // Register a static resource using jsonResource helper
    jsonResource(
      server,
      "test-static",
      "modie://test/static",
      {
        title: "Test Static Resource",
        description: "Static resource test",
      },
      async (uri) => {
        return { status: "ok", uri: uri.href };
      },
    );

    // Register a template resource using registerJsonResource helper
    registerJsonResource(
      server,
      "test-template",
      new ResourceTemplate("modie://test/{slug}", { list: undefined }),
      {
        title: "Test Template Resource",
        description: "Template resource test",
      },
      async (uri, { slug }: { slug: string }) => {
        return { slug, timestamp: 123456 };
      },
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    // Read static resource
    const staticRes = await client.readResource({ uri: "modie://test/static" });
    expect(staticRes.contents).toBeDefined();
    expect(staticRes.contents.length).toBe(1);
    const staticContent = staticRes.contents[0] as any;
    expect(staticContent.mimeType).toBe("application/json");
    expect(staticContent.uri).toBe("modie://test/static");
    const parsedStatic = JSON.parse(staticContent.text);
    expect(parsedStatic).toEqual({ status: "ok", uri: "modie://test/static" });

    // Read template resource
    const templateRes = await client.readResource({ uri: "modie://test/my-sample-item" });
    expect(templateRes.contents).toBeDefined();
    expect(templateRes.contents.length).toBe(1);
    const templateContent = templateRes.contents[0] as any;
    expect(templateContent.mimeType).toBe("application/json");
    expect(templateContent.uri).toBe("modie://test/my-sample-item");
    const parsedTemplate = JSON.parse(templateContent.text);
    expect(parsedTemplate).toEqual({ slug: "my-sample-item", timestamp: 123456 });
  });
});

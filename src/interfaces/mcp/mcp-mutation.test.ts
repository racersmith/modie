/**
 * Integration tests for Cluster 4: Graph Mutation & Spark Incubation MCP Tools.
 * @verifies RULE-25, RULE-26, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createMcpTestHarness,
  getStructuredContent,
  getTextContent,
  type McpTestHarness,
} from "./test-utils.ts";

describe("Cluster 4: Graph Mutation & Spark Incubation Tools", () => {
  let harness: McpTestHarness;

  beforeEach(async () => {
    harness = await createMcpTestHarness("modie-mcp-mutation-");
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // @verifies RULE-26
  it("link_artifacts should mutate YAML frontmatter links byte-safely", async () => {
    const ruleRes = await harness.client.callTool({
      name: "create_rule",
      arguments: {
        title: "Isolated Execution Rule",
        invariant: "Execution environments must remain strictly isolated.",
      },
    });
    const newRuleTag = getStructuredContent(ruleRes).tag;

    const linkRes = await harness.client.callTool({
      name: "link_artifacts",
      arguments: {
        source: harness.task101Tag,
        targets: [newRuleTag],
      },
    });

    expect(linkRes.isError).toBeFalsy();
    const linkContent = getStructuredContent(linkRes);
    expect(linkContent.source).toBe(harness.task101Tag);
    expect(linkContent.added).toContain(newRuleTag);

    const verifyRes = await harness.client.callTool({
      name: "read_artifact",
      arguments: { tag: harness.task101Tag },
    });
    const markdown = getTextContent(verifyRes);
    expect(markdown).toContain(newRuleTag);
  });

  // @verifies RULE-26
  it("archive_artifact should archive obsolete artifact safely", async () => {
    const ruleRes = await harness.client.callTool({
      name: "create_rule",
      arguments: {
        title: "Temporary Rule",
        invariant: "Temporary rule to be archived.",
      },
    });
    const tempRuleTag = getStructuredContent(ruleRes).tag;

    const archiveRes = await harness.client.callTool({
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

  it("spark_add should record out-of-scope realization into .modie/ideas/SPARKS.md", async () => {
    const res = await harness.client.callTool({
      name: "spark_add",
      arguments: {
        title: "Agent Discovery",
        body: "Discovered an interface mismatch while implementing task.",
      },
    });

    expect(res.isError).toBeFalsy();
    const content = getStructuredContent(res);
    expect(content.handle).toMatch(/^[a-f0-9]{4}$/);
    expect(content.title).toBe("Agent Discovery");
    expect(content.relativePath).toBe(".modie/ideas/SPARKS.md");

    const fileContent = await harness.workspace.readFile(
      ".modie/ideas/SPARKS.md",
    );
    expect(fileContent).toContain(`# [${content.handle}] Agent Discovery`);
    expect(fileContent).toContain(
      "Discovered an interface mismatch while implementing task.",
    );
  });
});

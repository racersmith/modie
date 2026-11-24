/**
 * Integration tests for Cluster 1: Spatial & Artifact Exploration MCP Tools.
 * @verifies RULE-6, RULE-25, RULE-26, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createMcpTestHarness,
  getTextContent,
  type McpTestHarness,
} from "./test-utils.ts";

describe("Cluster 1: Spatial & Artifact Exploration Tools", () => {
  let harness: McpTestHarness;

  beforeEach(async () => {
    harness = await createMcpTestHarness("modie-mcp-explore-");
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // @verifies RULE-26
  it("directory_context should return token-conscious architectural context in summary and detailed modes", async () => {
    await harness.workspace.createMotive({
      content: "Root workspace intent and system purpose.",
    });
    await harness.workspace.createMotive({
      scopeDir: "src",
      content: "Source modules and services.",
    });

    const summaryRes = await harness.client.callTool({
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

    const detailedRes = await harness.client.callTool({
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

  // @verifies RULE-26
  it("read_artifact should return pure Markdown with tag, title, scope header and semantic Appendix", async () => {
    const res = await harness.client.callTool({
      name: "read_artifact",
      arguments: { tag: harness.task101Tag },
    });

    expect(res.isError).toBeFalsy();
    const text = getTextContent(res);
    expect(typeof text).toBe("string");

    expect(text).toContain(`# ${harness.task101Tag}: Sample Ready`);
    expect(text).toContain("**Scope**: `./`");
    expect(text).not.toContain("<!-- File:");
    expect(text).not.toContain("<!-- Scope:");

    expect(text).not.toContain("---\nlinks:\n");
    expect(text).toContain("# Context");
    expect(text).toContain("Ready task context.");

    expect(text).toContain("## Appendix: Relationships & Governance");
    expect(text).toContain("### Governing Rules & Constraints");
    expect(text).toContain(harness.ruleTag);
    expect(text).toContain("All code must be tested with isolated fixtures.");
    expect(text).toContain(harness.adrTag);
  });

  // @verifies RULE-6, RULE-26
  it("task_context should return actionable Markdown Mission Brief with elevated blast radius alert", async () => {
    const res = await harness.client.callTool({
      name: "task_context",
      arguments: { task_id: harness.task101Id },
    });

    expect(res.isError).toBeFalsy();
    const text = getTextContent(res);
    expect(typeof text).toBe("string");

    expect(text).toContain(`# Mission Brief: ${harness.task101Tag}`);
    expect(text).toContain("BLAST RADIUS CONSTRAINT");
    expect(text).toContain("## Acceptance Criteria");
    expect(text).toContain("- [ ] 1. First criterion");
    expect(text).toContain("- [ ] 2. Second criterion");
    expect(text).toContain("- [ ] 3. User Review");
    expect(text).toContain("## Governing Architectural Invariants");
    expect(text).toContain(harness.ruleTag);
    expect(text).toContain("All code must be tested with isolated fixtures.");
  });
});

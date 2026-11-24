/**
 * Integration tests for Cluster 3: Dedicated Artifact Authoring MCP Tools.
 * @verifies RULE-1, RULE-4, RULE-16, RULE-25, RULE-26, RULE-30, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../core/index.ts";
import {
  createMcpTestHarness,
  getStructuredContent,
  getTextContent,
  type McpTestHarness,
} from "./test-utils.ts";

describe("Cluster 3: Dedicated Artifact Authoring Tools", () => {
  let harness: McpTestHarness;

  beforeEach(async () => {
    harness = await createMcpTestHarness("modie-mcp-authoring-");
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  // @verifies RULE-1, RULE-16, RULE-26
  it("create_rule should author rule with typed invariant assertion and validating links", async () => {
    const res = await harness.client.callTool({
      name: "create_rule",
      arguments: {
        title: "New Governance Policy",
        invariant:
          "All interfaces must be decoupled from internal storage representations.",
        links: [harness.adrTag],
      },
    });

    expect(res.isError).toBeFalsy();
    const content = getStructuredContent(res);
    expect(content.kind).toBe("RULE");
    expect(content.tag).toMatch(/^RULE-\d+$/);
    expect(content.validatedLinks).toContain(harness.adrTag);
  });

  // @verifies RULE-4, RULE-26
  it("create_adr should author ADR with typed context, decision, consequences, and links", async () => {
    const res = await harness.client.callTool({
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

  // @verifies RULE-1, RULE-4
  it("create_adr should reject tombstone titles unless force is true", async () => {
    const rejectRes = await harness.client.callTool({
      name: "create_adr",
      arguments: {
        title: "Sunset Legacy Storage Pipeline",
        decision: "We sunset the legacy storage pipeline.",
      },
    });
    expect(rejectRes.isError).toBe(true);
    const errText = getTextContent(rejectRes);
    expect(errText).toContain("Tombstone ADR detected");

    const forceRes = await harness.client.callTool({
      name: "create_adr",
      arguments: {
        title: "Sunset Legacy Storage Pipeline",
        decision: "We sunset the legacy storage pipeline.",
        force: true,
      },
    });
    expect(forceRes.isError).toBeFalsy();
    const content = getStructuredContent(forceRes);
    expect(content.kind).toBe("ADR");
  });

  // @verifies RULE-30, RULE-26
  it("create_task should author task with acceptance criteria ending with User Review and persist summary", async () => {
    const summaryText = "Decompose legacy mega-tools into singular tools";
    const res = await harness.client.callTool({
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

    const fileContents = await harness.workspace.readFile(content.filepath);
    expect(fileContents).toContain(`summary: ${summaryText}`);

    const readRes = await harness.client.callTool({
      name: "read_artifact",
      arguments: { tag: content.tag },
    });
    const markdown = getTextContent(readRes);
    expect(markdown).toContain("User Review");

    const readyRes = await harness.client.readResource({
      uri: "modie://tasks/ready",
    });
    const readyMarkdown = (readyRes.contents[0] as any).text;
    expect(readyMarkdown).toContain(summaryText);
  });

  // @verifies RULE-25, RULE-26
  it("create_motive should author MOTIVE.md with explicit prose in target scope directory", async () => {
    const res = await harness.client.callTool({
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
    expect(content.content).toBeUndefined();

    const diskContent = await harness.workspace.readFile(
      "src/domain/.modie/MOTIVE.md",
    );
    expect(diskContent).toBe(
      "Domain layer providing architectural invariants and entities.\n",
    );
  });

  // @verifies RULE-25, RULE-26
  it("create_motive should scaffold default template when content is omitted", async () => {
    const res = await harness.client.callTool({
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

    const diskContent = await harness.workspace.readFile(
      "src/adapters/.modie/MOTIVE.md",
    );
    expect(diskContent).toContain(
      "core architectural purpose and domain responsibility",
    );
  });

  // @verifies RULE-25, RULE-26
  it("create_motive should reject overwriting existing file unless overwrite is true", async () => {
    await harness.client.callTool({
      name: "create_motive",
      arguments: {
        scope_dir: "src/collision",
        content: "Initial intent.",
      },
    });

    const failedRes = await harness.client.callTool({
      name: "create_motive",
      arguments: {
        scope_dir: "src/collision",
        content: "Updated intent.",
      },
    });
    expect(failedRes.isError).toBe(true);

    const successRes = await harness.client.callTool({
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

    const diskContent = await harness.workspace.readFile(
      "src/collision/.modie/MOTIVE.md",
    );
    expect(diskContent).toContain("Updated intent.");
  });

  // @verifies RULE-25, RULE-26
  it("create_motive should reject content containing cross-document artifact citations", async () => {
    const invalidTag = formatArtifactTag("RULE", 999);
    const res = await harness.client.callTool({
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
    await harness.workspace.createTask({
      id: scopedTaskId,
      slug: "subscope-task",
      title: "Subscope Task",
      context: "Subscope task context.",
      criteria: ["Work on subscope", "User Review"],
      scopeDir: "src/subscope",
    });

    await harness.client.callTool({
      name: "start_task",
      arguments: { task_id: scopedTaskId },
    });

    const res = await harness.client.callTool({
      name: "create_motive",
      arguments: {
        content: "Inferred subscope motive intent.",
      },
    });

    expect(res.isError).toBeFalsy();
    const content = getStructuredContent(res);
    expect(content.scope).toBe("src/subscope");
    expect(content.relativePath).toBe("src/subscope/.modie/MOTIVE.md");

    const diskContent = await harness.workspace.readFile(
      "src/subscope/.modie/MOTIVE.md",
    );
    expect(diskContent).toContain("Inferred subscope motive intent.");
  });
});

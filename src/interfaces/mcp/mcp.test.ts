/**
 * Integration and unit tests for Modie Model Context Protocol (MCP) server.
 * Verifies Consolidated 4-Tool Architecture,
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
import {
  DEFAULT_MCP_INSTRUCTIONS_PATH,
  loadMcpInstructions,
} from "./instructions.ts";

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

describe("Modie MCP Server - Consolidated Four-Tool Architecture", () => {
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
    await (workspace.createAdr as any)({
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

  it("should register exactly the 4 consolidated tools with outputSchema and behavioral annotations", async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    // Verify exactly the 4 consolidated tools are exposed
    expect(toolNames.sort()).toEqual([
      "modie_compile_context",
      "modie_create_artifact",
      "modie_mutate_governance",
      "modie_task_lifecycle",
    ]);

    // Ensure deprecated 1:1 CLI wrappers and dropped tools are not registered
    expect(toolNames).not.toContain("modie_query_catalog");
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
    // TASK-49: outputSchema bloat removed to protect model context window
    expect(compileTool.outputSchema).toBeUndefined();
    expect(Object.keys((compileTool.inputSchema as any)?.properties ?? {})).toEqual([
      "target",
    ]);

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

    it("should compile context for a specific artifact tag target", async () => {
      const res = await client.callTool({
        name: "modie_compile_context",
        arguments: { target: ruleTag },
      });

      expect(res.isError).toBeFalsy();
      const content = getStructuredContent(res);
      expect(content.mode).toBe("context");
      expect(content.scope).toBeDefined();
      expect(Array.isArray(content.governingRules)).toBe(true);
      expect(content.governingRules.some((r: any) => r.tag === ruleTag)).toBe(
        true,
      );
    });
  });

  describe("Tool 2: modie_task_lifecycle", () => {
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

  describe("Tool 3: modie_create_artifact", () => {
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

  describe("Tool 4: modie_mutate_governance", () => {
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

  describe("Self-Recovery Error Envelopes (RULE-6, RULE-16, RULE-25, RULE-26)", () => {
    it("should return CRITERIA_INCOMPLETE envelope directing model to modie_task_lifecycle check", async () => {
      const res = await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "complete",
          task_id: task101Id,
        },
      });

      expect(res.isError).toBe(true);
      const content = getStructuredContent(res);
      expect(content.isError).toBe(true);
      expect(content.code).toBe("CRITERIA_INCOMPLETE");
      expect(content.message).toContain("acceptance criteria remain unchecked");
      expect(content.diagnostic).toContain("RULE-21");
      expect(content.diagnostic).toContain("RULE-22");
      expect(content.recovery).toBeDefined();
      expect(content.recovery.tool).toBe("modie_task_lifecycle");
      expect(content.recovery.parameters?.action).toBe("check");
      expect(content.recovery.action).toContain("modie_task_lifecycle");
      expect(content.recovery.suggestion).toContain("force: true");
    });

    it("should return ANCESTRY_VIOLATION_RULE_16 envelope directing model to modie_compile_context scope", async () => {
      // 1. Create a rule in src/sub and an ADR in sibling src/other
      const ruleRes = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "RULE",
          title: "Scoped Sub Rule",
          scope_dir: "src/sub",
          sections: { Invariant: "Sub invariant." },
        },
      });
      const subRuleTag = getStructuredContent(ruleRes).tag;

      const adrRes = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "ADR",
          title: "Scoped Sibling Decision",
          scope_dir: "src/other",
          sections: {
            Context: "Sibling context.",
            Decision: "Sibling decision.",
          },
        },
      });
      const siblingAdrTag = getStructuredContent(adrRes).tag;

      // 2. Attempt illegal link from rule in src/sub to ADR in sibling src/other
      const linkRes = await client.callTool({
        name: "modie_mutate_governance",
        arguments: {
          action: "link",
          target: subRuleTag,
          targets: [siblingAdrTag],
        },
      });

      expect(linkRes.isError).toBe(true);
      const content = getStructuredContent(linkRes);
      expect(content.isError).toBe(true);
      expect(content.code).toBe("ANCESTRY_VIOLATION_RULE_16");
      expect(content.message).toContain("Rule justification ancestry violation");
      expect(content.diagnostic).toContain("RULE-16");
      expect(content.diagnostic).toContain("RULE-19");
      expect(content.recovery).toBeDefined();
      expect(content.recovery.tool).toBe("modie_compile_context");
      expect(content.recovery.parameters?.target).toBeDefined();
    });

    it("should return BLAST_RADIUS_BREACH_RULE_6 envelope when task target escapes scope", async () => {
      const res = await client.callTool({
        name: "modie_create_artifact",
        arguments: {
          kind: "TASK",
          title: "Escaping Task",
          scope_dir: "src/interfaces",
          target_paths: ["src/core/linking/validator.ts"],
        },
      });

      expect(res.isError).toBe(true);
      const content = getStructuredContent(res);
      expect(content.isError).toBe(true);
      expect(content.code).toBe("BLAST_RADIUS_BREACH_RULE_6");
      expect(content.message).toContain("Downward blast radius violation");
      expect(content.diagnostic).toContain("RULE-6");
      expect(content.recovery).toBeDefined();
      expect(content.recovery.tool).toBe("modie_compile_context");
      expect(content.recovery.parameters?.target).toBeDefined();
      expect(content.recovery.action).toContain("Confine mutations");
    });

    it("should return ARTIFACT_NOT_FOUND envelope directing model to discovery resources", async () => {
      const res = await client.callTool({
        name: "modie_compile_context",
        arguments: {
          mode: "inspect",
          target: "RULE-9999",
        },
      });

      expect(res.isError).toBe(true);
      const content = getStructuredContent(res);
      expect(content.isError).toBe(true);
      expect(content.code).toBe("ARTIFACT_NOT_FOUND");
      expect(content.message).toContain("not found");
      expect(content.diagnostic).toContain("RULE-29");
      expect(content.recovery).toBeDefined();
      expect(content.recovery.tool).toBe("modie_compile_context");
      expect(content.recovery.action).toContain("modie_compile_context");
    });

    it("should return INVALID_PARAMETER envelope when task_id is omitted outside task branch", async () => {
      const res = await client.callTool({
        name: "modie_task_lifecycle",
        arguments: {
          action: "status",
        },
      });

      expect(res.isError).toBe(true);
      const content = getStructuredContent(res);
      expect(content.isError).toBe(true);
      expect(content.code).toBe("INVALID_PARAMETER");
      expect(content.message).toContain("No task_id specified");
      expect(content.diagnostic).toBeDefined();
      expect(content.recovery).toBeDefined();
      expect(content.recovery.tool).toBe("modie_task_lifecycle");
      expect(content.recovery.parameters?.task_id).toBeDefined();
    });

    it("should return INVALID_PARAMETER envelope when linking without targets", async () => {
      const res = await client.callTool({
        name: "modie_mutate_governance",
        arguments: {
          action: "link",
          target: ruleTag,
          targets: [],
        },
      });

      expect(res.isError).toBe(true);
      const content = getStructuredContent(res);
      expect(content.isError).toBe(true);
      expect(content.code).toBe("INVALID_PARAMETER");
      expect(content.message).toContain("No target artifacts specified");
      expect(content.recovery).toBeDefined();
      expect(content.recovery.tool).toBe("modie_mutate_governance");
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

    // @verifies RULE-21, RULE-25, RULE-26
    it("[RULE-21][RULE-25][RULE-26] should load authoritative instructions from src/interfaces/mcp/instructions.md", () => {
      const instructions = loadMcpInstructions();
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions).toContain("Modie Agent Instructions");
      expect(instructions).toContain("Ephemeral Task Decoupling");
      expect(instructions).toContain("Strict Blast Radius Confinement");
      expect(instructions).toContain("Contract-Based Acceptance Criteria");

      expect(() =>
        loadMcpInstructions("/non/existent/path/instructions.md"),
      ).toThrow("Failed to load agent instructions");
    });

    // @verifies RULE-21, RULE-25, RULE-26
    it("[RULE-21][RULE-25][RULE-26] should provide native agent instructions in initialize handshake response without explicit resource reads", () => {
      const instructions = client.getInstructions();
      expect(instructions).toBeDefined();
      expect(typeof instructions).toBe("string");
      expect(instructions).toContain("Modie Agent Instructions");
      expect(instructions).toContain("Ephemeral Task Decoupling");
      expect(instructions).toContain("Strict Blast Radius Confinement");
      expect(instructions).toContain("Contract-Based Acceptance Criteria");
    });

    // @verifies RULE-25, RULE-26
    it("[RULE-25][RULE-26] should honor serverOptions.instructions override in initialize handshake and resource", async () => {
      const customInstructions = "# Custom Instructions for Testing";
      const customServer = createModieMcpServer({
        cwd: workspace.cwd,
        serverOptions: { instructions: customInstructions },
      });
      const [customClientTransport, customServerTransport] =
        InMemoryTransport.createLinkedPair();
      await customServer.connect(customServerTransport);

      const customClient = new Client(
        { name: "custom-test-client", version: "0.0.1" },
        { capabilities: {} },
      );
      await customClient.connect(customClientTransport);

      expect(customClient.getInstructions()).toBe(customInstructions);

      const readRes = await customClient.readResource({
        uri: "modie://instructions",
      });
      expect(getResourceText(readRes)).toBe(customInstructions);

      await customClient.close();
      await customServer.close();
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
      expect(response.result?.instructions).toBeDefined();
      expect(response.result?.instructions).toContain("Modie Agent Instructions");

      child.kill("SIGTERM");
    });
  });

  describe("Scoped Resource Templates & Helper (TASK-49, RULE-25, RULE-26)", () => {
    it("should list dynamic resource templates for artifact, context, and catalog", async () => {
      const result = await client.listResourceTemplates();
      const templates = result.resourceTemplates ?? [];
      const uriTemplates = templates.map((t) => t.uriTemplate);

      expect(uriTemplates).toContain("modie://artifact/{tag}");
      expect(uriTemplates).toContain("modie://context/{target}");
      expect(uriTemplates).toContain("modie://catalog/{kind}");
    });

    it("should read modie://artifact/{tag} and return composite artifact view", async () => {
      const res = await client.readResource({
        uri: `modie://artifact/${ruleTag}`,
      });

      expect(res.contents).toBeDefined();
      expect(res.contents.length).toBe(1);
      const text = (res.contents[0] as any).text as string;
      const parsed = JSON.parse(text);

      expect(parsed.tag).toBe(ruleTag);
      expect(parsed.subtype).toBe("RULE");
      expect(parsed.filepath).toContain(ruleTag);
      expect(parsed.relativePath).toBeDefined();
      expect(parsed.scope).toBeDefined();
      expect(parsed.title.toLowerCase()).toBe("sample rule");
      expect(parsed.invariant).toBeDefined();
      expect(Array.isArray(parsed.links)).toBe(true);
      expect(Array.isArray(parsed.referencedBy)).toBe(true);

      const referencingTags = parsed.referencedBy.map((r: any) => r.tag);
      expect(referencingTags).toContain(adrTag);
      expect(referencingTags).toContain(task101Tag);
    });

    it("should read modie://context and modie://context/{target} returning compiled cone", async () => {
      // 1. Root context resource
      const rootRes = await client.readResource({
        uri: "modie://context",
      });
      expect(rootRes.contents).toBeDefined();
      expect(rootRes.contents.length).toBe(1);
      const rootParsed = JSON.parse((rootRes.contents[0] as any).text as string);
      expect(rootParsed.scope).toBe(".");
      expect(Array.isArray(rootParsed.governingRules)).toBe(true);

      // 2. Scoped context template
      const res = await client.readResource({
        uri: "modie://context/root",
      });

      expect(res.contents).toBeDefined();
      expect(res.contents.length).toBe(1);
      const parsed = JSON.parse((res.contents[0] as any).text as string);

      expect(parsed.scope).toBe(".");
      expect(Array.isArray(parsed.ancestralScopes)).toBe(true);
      expect(Array.isArray(parsed.governingRules)).toBe(true);
      expect(parsed.governingRules.length).toBeGreaterThan(0);
      expect(parsed.governingRules.some((r: any) => r.tag === ruleTag)).toBe(true);
      expect(Array.isArray(parsed.linkedDecisions)).toBe(true);
    });

    it("should read modie://context/{target} for a task target and include compiled task", async () => {
      const res = await client.readResource({
        uri: `modie://context/${task101Tag}`,
      });

      expect(res.contents).toBeDefined();
      const parsed = JSON.parse((res.contents[0] as any).text as string);
      expect(parsed.task).toBeDefined();
      expect(parsed.task.tag).toBe(task101Tag);
      expect(parsed.task.criteriaProgress).toBeDefined();
    });

    it("should read modie://catalog/{kind} for tasks, rules, adrs, ready, and backlog", async () => {
      // 1. Catalog tasks
      const taskRes = await client.readResource({ uri: "modie://catalog/tasks" });
      const tasks = JSON.parse((taskRes.contents[0] as any).text as string);
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.some((t: any) => t.id === task101Id)).toBe(true);

      // 2. Catalog rules
      const ruleRes = await client.readResource({ uri: "modie://catalog/rules" });
      const rules = JSON.parse((ruleRes.contents[0] as any).text as string);
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.some((r: any) => r.tag === ruleTag)).toBe(true);

      // 3. Catalog adrs
      const adrRes = await client.readResource({ uri: "modie://catalog/adrs" });
      const adrs = JSON.parse((adrRes.contents[0] as any).text as string);
      expect(Array.isArray(adrs)).toBe(true);
      expect(adrs.some((a: any) => a.tag === adrTag)).toBe(true);

      // 4. Catalog ready
      const readyRes = await client.readResource({ uri: "modie://catalog/ready" });
      const ready = JSON.parse((readyRes.contents[0] as any).text as string);
      expect(Array.isArray(ready)).toBe(true);

      // 5. Catalog backlog
      const backlogRes = await client.readResource({
        uri: "modie://catalog/backlog",
      });
      const backlog = JSON.parse((backlogRes.contents[0] as any).text as string);
      expect(Array.isArray(backlog)).toBe(true);
    });
  });

  describe("Native MCP Workflow Prompts (TASK-49, RULE-26)", () => {
    it("should list the 3 standardized workflow prompts", async () => {
      const list = await client.listPrompts();
      const promptNames = list.prompts.map((p) => p.name);

      expect(promptNames).toContain("modie_task_execution");
      expect(promptNames).toContain("modie_rule_authoring");
      expect(promptNames).toContain("modie_adr_authoring");
    });

    it("should return modie_task_execution guidance for active task", async () => {
      const prompt = await client.getPrompt({
        name: "modie_task_execution",
        arguments: { task_id: task101Tag },
      });

      expect(prompt.messages).toBeDefined();
      expect(prompt.messages.length).toBe(1);
      const text = (prompt.messages[0]!.content as any).text as string;

      expect(text).toContain(task101Tag);
      expect(text).toContain("modie_task_lifecycle");
      expect(text).toContain("RULE-6");
      expect(text).toContain("complete_and_merge");
    });

    it("should return modie_rule_authoring guidance with atomicity and ancestry enforcement", async () => {
      const prompt = await client.getPrompt({
        name: "modie_rule_authoring",
        arguments: {
          name: "test-rule-invariant",
          justifying_adr: adrTag,
          scope: "src/interfaces",
        },
      });

      expect(prompt.messages).toBeDefined();
      const text = (prompt.messages[0]!.content as any).text as string;

      expect(text).toContain("test-rule-invariant");
      expect(text).toContain(adrTag);
      expect(text).toContain("src/interfaces");
      expect(text).toContain("RULE-11");
      expect(text).toContain("RULE-13");
      expect(text).toContain("RULE-16");
      expect(text).toContain("modie_create_artifact");
    });

    it("should support modie_rule_authoring when justifying_adr is omitted", async () => {
      const prompt = await client.getPrompt({
        name: "modie_rule_authoring",
        arguments: {
          name: "standalone-rule",
          scope: ".",
        },
      });

      expect(prompt.messages).toBeDefined();
      const text = (prompt.messages[0]!.content as any).text as string;

      expect(text).toContain("standalone-rule");
      expect(text).toContain("Optional Justification");
      expect(text).toContain("RULE-11");
      expect(text).toContain("initial_links: []");
    });

    it("should return modie_adr_authoring guidance with tradeoff and consequence structure", async () => {
      const prompt = await client.getPrompt({
        name: "modie_adr_authoring",
        arguments: {
          name: "test-decision-record",
          scope: ".",
          supersedes: adrTag,
        },
      });

      expect(prompt.messages).toBeDefined();
      const text = (prompt.messages[0]!.content as any).text as string;

      expect(text).toContain("test-decision-record");
      expect(text).toContain(adrTag);
      expect(text).toContain("RULE-4");
      expect(text).toContain("RULE-17");
      expect(text).toContain("modie_create_artifact");
    });
  });
});

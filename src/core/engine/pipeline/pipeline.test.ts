/**
 * Unit tests for the generic declarative artifact pipeline.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../../platform/testing/index.ts";
import {
  createArtifact,
  parseArtifact,
} from "./index.ts";
import type {
  ArtifactDefinition,
  BaseCreateArtifactOptions,
} from "../../domain/index.ts";
import {
  ARTIFACT_DEFINITIONS,
  adrDefinition,
  formatArtifactTag,
  getArtifactDefinition,
  ruleDefinition,
  taskDefinition,
} from "../../domain/index.ts";
import { createAdr, createRule, createTask } from "../../index.ts";
import { getArtifactDetails } from "../query/artifact-query.ts";

describe("Generic Declarative Artifact Pipeline (RULE-1, RULE-8, RULE-34, RULE-35, ADR-1, ADR-4)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-pipeline-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-1, RULE-8, RULE-34, RULE-35, ADR-1, ADR-4
  it("[RULE-1][RULE-8][RULE-34][RULE-35][ADR-1][ADR-4] should create an artifact through a custom declarative ArtifactDefinition", async () => {
    interface CustomSpecOptions extends BaseCreateArtifactOptions {
      overview: string;
      tags?: string[];
    }

    interface CustomSpecArtifact {
      id: string;
      slug: string;
      title: string;
      overview: string;
      tags: string[];
    }

    const specDefinition: ArtifactDefinition<
      CustomSpecOptions,
      CustomSpecArtifact
    > = {
      subtype: "SPEC",
      containerName: "specs",
      validate: ({ options }) => {
        if (options.overview.includes("FORBIDDEN")) {
          throw new Error("Invalid spec overview: contains forbidden content.");
        }
      },
      render: ({ id, slug, title, options }) => {
        const markdown = `# ${title}\n\n${options.overview}\n`;
        const artifact: CustomSpecArtifact = {
          id,
          slug,
          title,
          overview: options.overview,
          tags: options.tags ?? [],
        };
        return { markdown, artifact };
      },
    };

    const res = await createArtifact(specDefinition, {
      title: "Authentication Workflow",
      overview: "Details the OAuth2 token grant ceremony.",
      tags: ["auth", "security"],
      cwd: workspace.cwd,
    });

    const expectedSpec1Tag = formatArtifactTag("SPEC", 1);
    expect(res.id).toBe("1");
    expect(res.tag).toBe(expectedSpec1Tag);
    expect(res.filename).toBe(`authentication-workflow.${expectedSpec1Tag}.md`);
    expect(res.filepath).toBe(
      workspace.resolve(
        ".modie",
        "specs",
        `authentication-workflow.${expectedSpec1Tag}.md`,
      ),
    );
    expect(res.artifact.overview).toBe(
      "Details the OAuth2 token grant ceremony.",
    );

    const fileContent = await workspace.readFile(res.filepath);
    expect(fileContent).toContain("# Authentication Workflow");
    expect(fileContent).toContain("Details the OAuth2 token grant ceremony.");

    // Subsequent creation monotonically advances ID
    const res2 = await createArtifact(specDefinition, {
      title: "Authorization Grants",
      overview: "Details scope permissions.",
      cwd: workspace.cwd,
    });
    const expectedSpec2Tag = formatArtifactTag("SPEC", 2);
    expect(res2.id).toBe("2");
    expect(res2.tag).toBe(expectedSpec2Tag);
  });

  // @verifies RULE-8, RULE-34
  it("[RULE-8][RULE-34] should invoke custom validation hook and reject invalid options", async () => {
    const guardedDefinition: ArtifactDefinition = {
      subtype: "RULE",
      validate: () => {
        throw new Error(
          "Validation constraint failed: custom link rule violated.",
        );
      },
      render: ({ id, slug, title }) => ({
        markdown: `# ${title}`,
        artifact: { id, slug, title },
      }),
    };

    await expect(
      createArtifact(guardedDefinition, {
        title: "Test Guard",
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow(
      "Validation constraint failed: custom link rule violated.",
    );
  });

  // @verifies RULE-8, RULE-34
  it("[RULE-8][RULE-34] should reject creation with empty or whitespace title", async () => {
    const dummyDefinition: ArtifactDefinition = {
      subtype: "RULE",
      render: ({ id, slug, title }) => ({
        markdown: `# ${title}`,
        artifact: { id, slug, title },
      }),
    };

    await expect(
      createArtifact(dummyDefinition, {
        title: "   ",
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("Rule title must be a non-empty string.");
  });

  // @verifies RULE-1, RULE-8, RULE-34, RULE-35, ADR-1, ADR-4
  it("[RULE-1][RULE-8][RULE-34][RULE-35][ADR-1][ADR-4] should support creating standard artifacts directly via standard definitions", async () => {
    const expectedRuleTag = formatArtifactTag("RULE", 1);
    const expectedAdrTag = formatArtifactTag("ADR", 1);
    const expectedTaskTag = formatArtifactTag("TASK", 1);

    // 1. RULE via ruleDefinition
    const ruleRes = await createArtifact(ruleDefinition, {
      title: "Invariant Cache Validity",
      assertion: "Cached entries must invalidate on write.",
      cwd: workspace.cwd,
    });
    expect(ruleRes.tag).toBe(expectedRuleTag);
    expect(ruleRes.filename).toBe(
      `invariant-cache-validity.${expectedRuleTag}.md`,
    );

    // 2. ADR via adrDefinition
    const adrRes = await createArtifact(adrDefinition, {
      title: "Use Redis For Caching",
      context: "Need distributed key-value store.",
      decision: "Adopt Redis.",
      cwd: workspace.cwd,
    });
    expect(adrRes.tag).toBe(expectedAdrTag);
    expect(adrRes.filename).toBe(`use-redis-for-caching.${expectedAdrTag}.md`);

    // 3. TASK via taskDefinition
    const taskRes = await createArtifact(taskDefinition, {
      title: "Implement Cache Invalidation",
      acceptanceCriteria: ["Add TTL support", "Test eviction"],
      cwd: workspace.cwd,
    });
    expect(taskRes.tag).toBe(expectedTaskTag);
    expect(taskRes.filename).toBe(
      `implement-cache-invalidation.${expectedTaskTag}.md`,
    );
    expect(taskRes.watermark).toBeDefined();
  });

  // @verifies ADR-4, RULE-25, RULE-34, RULE-35
  it("[ADR-4][RULE-25][RULE-34][RULE-35] should roundtrip serialize and parse RULE, ADR, and TASK artifacts bidirectionally via ArtifactDefinition.parse", async () => {
    const adr1Tag = formatArtifactTag("ADR", 1);
    const rule1Tag = formatArtifactTag("RULE", 1);
    const task1Tag = formatArtifactTag("TASK", 1);

    // 1. Create ADR first so RULE and TASK can link to it
    const adrRes = await createArtifact(adrDefinition, {
      title: "Bidirectional Artifact Contract",
      summary: "Unify rendering and parsing in ArtifactDefinition.",
      contextSection: "Shotgun edits across read and write parsers.",
      alternatives: "- Keep separate parsers\n- Unify in definition",
      decision: "Each ArtifactDefinition owns both render and parse.",
      cwd: workspace.cwd,
    });

    const parsedAdr = parseArtifact(
      adrDefinition,
      adrRes.markdown,
      adrRes.filepath,
    );
    expect(parsedAdr.id).toBe("1");
    expect(parsedAdr.slug).toBe("bidirectional-artifact-contract");
    expect(parsedAdr.summary).toBe(
      "Unify rendering and parsing in ArtifactDefinition.",
    );
    expect(parsedAdr.contextSection).toBe(
      "Shotgun edits across read and write parsers.",
    );
    expect(parsedAdr.alternatives).toBe(
      "- Keep separate parsers\n- Unify in definition",
    );
    expect(parsedAdr.decision).toBe(
      "Each ArtifactDefinition owns both render and parse.",
    );

    // 2. Create RULE linking to ADR-1
    const ruleRes = await createArtifact(ruleDefinition, {
      title: "Single Parser Invariant",
      assertion:
        "All frontmatter and section parsing must use the core parser.",
      links: [adr1Tag],
      cwd: workspace.cwd,
    });

    const parsedRule = parseArtifact(
      "RULE",
      ruleRes.markdown,
      ruleRes.filepath,
    );
    expect(parsedRule).toEqual({
      id: "1",
      slug: "single-parser-invariant",
      title: "single parser invariant",
      links: [adr1Tag],
      assertion:
        "All frontmatter and section parsing must use the core parser.",
      filePath: ruleRes.filepath,
      rawContent: ruleRes.markdown,
    });

    // 3. Create TASK linking to ADR-1 and RULE-1
    const taskRes = await createArtifact(taskDefinition, {
      title: "Consolidate Artifact Pipeline",
      contextSection: "Unify definitions and CLI flags.",
      links: [adr1Tag, rule1Tag],
      acceptanceCriteria: ["Extend ArtifactDefinition", "Verify roundtrip"],
      review: false,
      cwd: workspace.cwd,
    });

    const parsedTask = parseArtifact(
      taskDefinition,
      taskRes.markdown,
      taskRes.filepath,
    );
    expect(parsedTask.id).toBe("1");
    expect(parsedTask.slug).toBe("consolidate-artifact-pipeline");
    expect(parsedTask.links).toEqual([adr1Tag, rule1Tag]);
    expect(parsedTask.contextSection).toBe("Unify definitions and CLI flags.");
    expect(parsedTask.acceptanceCriteria).toEqual([
      { text: "Extend ArtifactDefinition", completed: false },
      { text: "Verify roundtrip", completed: false },
    ]);

    // 4. Verify getArtifactDetails delegates to subtype definitions
    const taskDetails = await getArtifactDetails(task1Tag, {
      cwd: workspace.cwd,
    });
    expect(taskDetails.context).toBe("Unify definitions and CLI flags.");
    expect(taskDetails.acceptanceCriteria).toHaveLength(2);
    expect(getArtifactDefinition("RULE")).toBe(ruleDefinition);
    expect(getArtifactDefinition("ADR")).toBe(adrDefinition);
    expect(getArtifactDefinition("TASK")).toBe(taskDefinition);
    expect(ARTIFACT_DEFINITIONS["RULE"]).toBe(ruleDefinition);
    expect(ARTIFACT_DEFINITIONS["ADR"]).toBe(adrDefinition);
    expect(ARTIFACT_DEFINITIONS["TASK"]).toBe(taskDefinition);
  });

  // @verifies ADR-1, ADR-2, ADR-4, RULE-1, RULE-8, RULE-25, RULE-34, RULE-35
  it("[ADR-1][ADR-4][RULE-1][RULE-8][RULE-25][RULE-34] should return standardized CreateArtifactResult from createRule, createAdr, and createTask", async () => {
    // 1. Create predecessor ADR
    const adr1 = await createAdr({
      title: "Predecessor Architecture Decision",
      contextSection: "Initial decision.",
      cwd: workspace.cwd,
    });
    expect(adr1.id).toBe("1");
    expect(adr1.tag).toBe("ADR-1");
    expect(adr1.filename).toBe("predecessor-architecture-decision.ADR-1.md");
    expect(adr1.relativePath).toContain(
      ".modie/adrs/predecessor-architecture-decision.ADR-1.md",
    );
    expect(adr1.artifact.title).toBe("Predecessor Architecture Decision");

    // 2. Create superseding ADR
    const adr2 = await createAdr({
      title: "Successor Architecture Decision",
      contextSection: "Superseding decision.",
      supersedes: [adr1.tag],
      cwd: workspace.cwd,
    });
    expect(adr2.id).toBe("2");
    expect(adr2.tag).toBe("ADR-2");
    expect(adr2.supersedes).toEqual([adr1.tag]);
    expect(adr2.artifact.supersedes).toEqual([adr1.tag]);

    // 3. Create RULE
    const rule1 = await createRule({
      title: "Standardized Creation Rule",
      assertion:
        "All domain creation services return unified CreateArtifactResult payloads.",
      links: [adr1.tag],
      cwd: workspace.cwd,
    });
    expect(rule1.id).toBe("1");
    expect(rule1.tag).toBe("RULE-1");
    expect(rule1.filename).toBe("standardized-creation-rule.RULE-1.md");
    expect(rule1.artifact.assertion).toBe(
      "All domain creation services return unified CreateArtifactResult payloads.",
    );

    // 4. Create TASK
    const task1 = await createTask({
      title: "Verify Creation Payload Pipeline",
      contextSection:
        "Verifies domain creation results conforming to CreateArtifactResult.",
      links: [adr1.tag, rule1.tag],
      acceptanceCriteria: ["Ensure unified result structure"],
      branch: "dev",
      cwd: workspace.cwd,
    });
    expect(task1.id).toBe("1");
    expect(task1.tag).toBe("TASK-1");
    expect(task1.filename).toBe("verify-creation-payload-pipeline.TASK-1.md");
    expect(task1.watermark).toBeDefined();
    expect(task1.artifact.links).toEqual([adr1.tag, rule1.tag]);
  });

  // @verifies ADR-5, RULE-13, RULE-14, RULE-15, RULE-18, RULE-34
  it("[ADR-5][RULE-13][RULE-14][RULE-15][RULE-18][RULE-34] should validate links dynamically in createArtifact driven by definition.linkPolicy without definition.validate", async () => {
    const customDefinition: ArtifactDefinition = {
      subtype: "RULE",
      linkPolicy: {
        links: {
          ADR: "ancestor",
        },
      },
      render: ({ id, slug, title, options }) => ({
        markdown: `# ${title}`,
        artifact: { id, slug, title, links: (options as any).links },
      }),
    };

    // 1. Should reject invalid link target (RULE linking to RULE violates policy)
    await expect(
      createArtifact(customDefinition, {
        title: "Test Policy Enforcement",
        links: ["RULE-99"],
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("Invalid rule link target");

    // 2. Should reject invalid dependency for non-TASK
    await expect(
      createArtifact(customDefinition, {
        title: "Test Dependency Enforcement",
        depends_on: ["TASK-1"],
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("depends_on");

    // 3. Create real ADR so valid link can resolve
    const adr = await createAdr({
      title: "Real Ancestor ADR",
      contextSection: "Context for link validation",
      cwd: workspace.cwd,
    });

    // 4. Should succeed when link satisfies linkPolicy
    const result = await createArtifact(customDefinition, {
      title: "Valid Linked Artifact",
      links: [adr.tag],
      cwd: workspace.cwd,
    });
    expect(result.tag).toBe(formatArtifactTag("RULE", 1));
    expect(result.artifact.links).toEqual([adr.tag]);
  });
});

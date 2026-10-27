/**
 * Unit tests for the generic declarative artifact pipeline.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import {
  adrDefinition,
  createArtifact,
  ruleDefinition,
  taskDefinition,
  type ArtifactDefinition,
  type BaseCreateArtifactOptions,
} from "./index.ts";

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

    const specDefinition: ArtifactDefinition<CustomSpecOptions, CustomSpecArtifact> = {
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

    const expectedSpec1Tag = makeTestTag("SPEC", 1);
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
    const expectedSpec2Tag = makeTestTag("SPEC", 2);
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
    const expectedRuleTag = makeTestTag("RULE", 1);
    const expectedAdrTag = makeTestTag("ADR", 1);
    const expectedTaskTag = makeTestTag("TASK", 1);

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
});

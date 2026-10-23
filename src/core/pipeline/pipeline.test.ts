import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adrDefinition,
  createArtifact,
  ruleDefinition,
  taskDefinition,
  type ArtifactDefinition,
  type BaseCreateArtifactOptions,
} from "./index.ts";

describe("Generic Declarative Artifact Pipeline (TASK-18, ADR-1, ADR-4, RULE-1, RULE-8)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-pipeline-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should create an artifact through a custom declarative ArtifactDefinition", async () => {
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
      cwd: tempDir,
    });

    expect(res.id).toBe("1");
    expect(res.tag).toBe("SPEC-1");
    expect(res.filename).toBe("authentication-workflow.SPEC-1.md");
    expect(res.filepath).toBe(
      join(tempDir, ".modie", "specs", "authentication-workflow.SPEC-1.md"),
    );
    expect(res.artifact.overview).toBe("Details the OAuth2 token grant ceremony.");

    const fileContent = await readFile(res.filepath, "utf8");
    expect(fileContent).toContain("# Authentication Workflow");
    expect(fileContent).toContain("Details the OAuth2 token grant ceremony.");

    // Subsequent creation monotonically advances ID
    const res2 = await createArtifact(specDefinition, {
      title: "Authorization Grants",
      overview: "Details scope permissions.",
      cwd: tempDir,
    });
    expect(res2.id).toBe("2");
    expect(res2.tag).toBe("SPEC-2");
  });

  it("should invoke custom validation hook and reject invalid options", async () => {
    const guardedDefinition: ArtifactDefinition = {
      subtype: "RULE",
      validate: () => {
        throw new Error("Validation constraint failed: custom link rule violated.");
      },
      render: ({ id, slug, title }) => ({
        markdown: `# ${title}`,
        artifact: { id, slug, title },
      }),
    };

    await expect(
      createArtifact(guardedDefinition, {
        title: "Test Guard",
        cwd: tempDir,
      }),
    ).rejects.toThrow("Validation constraint failed: custom link rule violated.");
  });

  it("should reject creation with empty or whitespace title", async () => {
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
        cwd: tempDir,
      }),
    ).rejects.toThrow("Rule title must be a non-empty string.");
  });

  it("should support creating standard artifacts directly via standard definitions", async () => {
    // 1. RULE via ruleDefinition
    const ruleRes = await createArtifact(ruleDefinition, {
      title: "Invariant Cache Validity",
      assertion: "Cached entries must invalidate on write.",
      cwd: tempDir,
    });
    expect(ruleRes.tag).toBe("RULE-1");
    expect(ruleRes.filename).toBe("invariant-cache-validity.RULE-1.md");

    // 2. ADR via adrDefinition
    const adrRes = await createArtifact(adrDefinition, {
      title: "Use Redis For Caching",
      context: "Need distributed key-value store.",
      decision: "Adopt Redis.",
      cwd: tempDir,
    });
    expect(adrRes.tag).toBe("ADR-1");
    expect(adrRes.filename).toBe("use-redis-for-caching.ADR-1.md");

    // 3. TASK via taskDefinition
    const taskRes = await createArtifact(taskDefinition, {
      title: "Implement Cache Invalidation",
      acceptanceCriteria: ["Add TTL support", "Test eviction"],
      cwd: tempDir,
    });
    expect(taskRes.tag).toBe("TASK-1");
    expect(taskRes.filename).toBe("implement-cache-invalidation.TASK-1.md");
    expect(taskRes.watermark).toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkspaceContext,
  createWorkspaceContextSync,
  isWorkspaceContext,
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "./context.ts";
import type { ArtifactDefinition } from "./pipeline/types.ts";
import { MockVcsAdapter } from "./vcs/mock-adapter.ts";

describe("Workspace Context Container (RULE-25, RULE-34, ADR-1, ADR-2, ADR-9)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-context-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should construct WorkspaceContext asynchronously with loaded configuration", async () => {
    const modieDir = join(tempDir, ".modie");
    await mkdir(modieDir, { recursive: true });
    await writeFile(
      join(modieDir, "config.json"),
      JSON.stringify({ trunk: "main", prefix: "PROJ" }),
    );

    const mockVcs = new MockVcsAdapter();
    const ctx = await createWorkspaceContext({
      root: tempDir,
      vcs: mockVcs,
    });

    expect(ctx.root).toBe(tempDir);
    expect(ctx.cwd).toBe(tempDir);
    expect(ctx.vcs).toBe(mockVcs);
    expect(ctx.config.trunk).toBe("main");
    expect(ctx.config.prefix).toBe("PROJ");
    expect(ctx.registry).toBeDefined();
    expect(ctx.registry.isRegistered("RULE")).toBe(true);
    expect(ctx.registry.isRegistered("ADR")).toBe(true);
    expect(ctx.registry.isRegistered("TASK")).toBe(true);
  });

  it("should construct WorkspaceContext synchronously with default config", () => {
    const mockVcs = new MockVcsAdapter();
    const ctx = createWorkspaceContextSync({
      root: tempDir,
      vcs: mockVcs,
    });

    expect(ctx.root).toBe(tempDir);
    expect(ctx.cwd).toBe(tempDir);
    expect(ctx.vcs).toBe(mockVcs);
    expect(ctx.config).toEqual({});
    expect(ctx.registry).toBeDefined();
    expect(ctx.registry.isRegistered("RULE")).toBe(true);
  });

  it("should maintain isolated definition registries across distinct context instances", () => {
    const ctx1 = createWorkspaceContextSync({ root: tempDir });
    const ctx2 = createWorkspaceContextSync({ root: tempDir });

    const customDefinition: ArtifactDefinition = {
      subtype: "SPEC",
      render: ({ id, slug, title }) => ({
        markdown: `# ${title}`,
        artifact: { id, slug, title },
      }),
    };

    ctx1.registry.register(customDefinition);

    expect(ctx1.registry.isRegistered("SPEC")).toBe(true);
    expect(ctx2.registry.isRegistered("SPEC")).toBe(false);
  });

  it("should identify WorkspaceContext instances via isWorkspaceContext type guard", () => {
    const ctx = createWorkspaceContextSync({ root: tempDir });

    expect(isWorkspaceContext(ctx)).toBe(true);
    expect(isWorkspaceContext(null)).toBe(false);
    expect(isWorkspaceContext(undefined)).toBe(false);
    expect(isWorkspaceContext("some-string")).toBe(false);
    expect(isWorkspaceContext({})).toBe(false);
    expect(isWorkspaceContext({ root: tempDir })).toBe(false);
    expect(isWorkspaceContext({ root: tempDir, vcs: {}, registry: {} })).toBe(
      true,
    );
  });

  it("should resolve WorkspaceContext cleanly from existing context, container, or path", () => {
    const mockVcs = new MockVcsAdapter();
    const ctx = createWorkspaceContextSync({ root: tempDir, vcs: mockVcs });

    // 1. Existing WorkspaceContext passes through directly
    expect(resolveWorkspaceContext(ctx)).toBe(ctx);

    // 2. Options container with workspace property
    expect(resolveWorkspaceContext({ workspace: ctx })).toBe(ctx);

    // 3. String path resolves to fresh context rooted at that directory
    const pathCtx = resolveWorkspaceContext(tempDir, mockVcs);
    expect(pathCtx.root).toBe(tempDir);
    expect(pathCtx.vcs).toBe(mockVcs);

    // 4. Plain options with domain context / contextSection string should NOT collide or be sniffed
    const domainOptions = {
      cwd: tempDir,
      contextSection: "Architecture background description text",
      context: "Architecture background description text",
      vcs: mockVcs,
    };
    const resolvedDomainCtx = resolveWorkspaceContext(domainOptions);
    expect(resolvedDomainCtx.root).toBe(tempDir);
    expect(isWorkspaceContext(resolvedDomainCtx)).toBe(true);
    expect(resolvedDomainCtx.registry).toBeDefined();

    // 5. Options with explicit workspace and domain strings should return workspace directly without sniffing
    const mixedOptions = {
      workspace: ctx,
      contextSection: "Some domain markdown context",
      context: "Legacy domain context",
      cwd: tempDir,
    };
    expect(resolveWorkspaceContext(mixedOptions)).toBe(ctx);
  });
});

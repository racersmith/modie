/**
 * Unit and integration tests for Modie Core MOTIVE domain services.
 */

import { describe, expect, it } from "bun:test";
import {
  collectAncestralMotives,
  createMotive,
  readMotive,
  renderMotiveMarkdown,
  resolveMotivePath,
  resolveMotivePaths,
  validateMotiveContent,
} from "./index.ts";
import {
  createFixtureWorkspace,
  makeTestTag,
} from "../testing/fixture-workspace.ts";

describe("Core MOTIVE Pathing, Creation, Validation & Discovery (RULE-2, RULE-8, RULE-10, ADR-2, ADR-4, ADR-10)", () => {
  // @verifies RULE-8, ADR-2, ADR-10, RULE-34
  it("[RULE-8][ADR-2][ADR-10][RULE-34] should resolve canonical MOTIVE.md paths and normalize .modie container segments", async () => {
    await using workspace = await createFixtureWorkspace("modie-motive-paths-");

    const rootPaths = resolveMotivePaths(".", workspace.cwd);
    expect(rootPaths.scope).toBe(".");
    expect(rootPaths.filename).toBe("MOTIVE.md");
    expect(rootPaths.relativeModieDir).toBe(".modie");
    expect(rootPaths.relativePath).toBe(".modie/MOTIVE.md");
    expect(resolveMotivePath(".", workspace.cwd)).toBe(rootPaths.filepath);

    const nestedPaths = resolveMotivePaths("src/core", workspace.cwd);
    expect(nestedPaths.scope).toBe("src/core");
    expect(nestedPaths.relativeModieDir).toBe("src/core/.modie");
    expect(nestedPaths.relativePath).toBe("src/core/.modie/MOTIVE.md");

    // Normalizes `<dir>/.modie` and `<dir>/.modie/MOTIVE.md` back to `<dir>` per RULE-8
    const fromContainer = resolveMotivePaths("src/core/.modie", workspace.cwd);
    expect(fromContainer.scope).toBe("src/core");
    expect(fromContainer.relativePath).toBe("src/core/.modie/MOTIVE.md");

    const fromFile = resolveMotivePaths(
      "src/core/.modie/MOTIVE.md",
      workspace.cwd,
    );
    expect(fromFile.scope).toBe("src/core");
    expect(fromFile.relativePath).toBe("src/core/.modie/MOTIVE.md");

    // Rejects scope outside workspace root
    expect(() => resolveMotivePaths("../outside", workspace.cwd)).toThrow(
      /must reside within the workspace root/,
    );
  });

  // @verifies ADR-2, ADR-4, ADR-10, RULE-8, RULE-34
  it("[ADR-2][ADR-4][ADR-10][RULE-8][RULE-34] should create MOTIVE.md with explicit content and scaffold default template when content is omitted", async () => {
    await using workspace = await createFixtureWorkspace("modie-motive-create-");

    // 1. Explicit content at workspace root
    const rootRes = await createMotive({
      cwd: workspace.cwd,
      content:
        "Provide an automated architectural governance engine and context compiler.",
    });
    expect(rootRes.scope).toBe(".");
    expect(rootRes.relativePath).toBe(".modie/MOTIVE.md");
    expect(rootRes.overwritten).toBe(false);
    expect(rootRes.scaffolded).toBe(false);
    expect(rootRes.content).toBe(
      "Provide an automated architectural governance engine and context compiler.",
    );
    expect(await workspace.readFile(".modie/MOTIVE.md")).toBe(
      "Provide an automated architectural governance engine and context compiler.\n",
    );

    // 2. Template scaffolding in nested scope when content is omitted
    const scaffoldRes = await createMotive({
      cwd: workspace.cwd,
      scopeDir: "src/interfaces",
    });
    expect(scaffoldRes.scope).toBe("src/interfaces");
    expect(scaffoldRes.relativePath).toBe("src/interfaces/.modie/MOTIVE.md");
    expect(scaffoldRes.scaffolded).toBe(true);
    expect(scaffoldRes.overwritten).toBe(false);
    expect(scaffoldRes.content).toContain("`src/interfaces` directory scope");
  });

  // @verifies ADR-2, ADR-10, RULE-8, RULE-34
  it("[ADR-2][ADR-10][RULE-8][RULE-34] should enforce singleton collision guard unless overwrite is explicitly requested", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-motive-collision-",
    );

    await createMotive({
      cwd: workspace.cwd,
      scopeDir: "src/core",
      content: "Initial domain purpose.",
    });

    // Reject accidental overwrite when overwrite is omitted or false
    await expect(
      createMotive({
        cwd: workspace.cwd,
        scopeDir: "src/core",
        content: "Accidental replacement.",
      }),
    ).rejects.toThrow(/MOTIVE\.md already exists at "src\/core\/\.modie\/MOTIVE\.md"/);

    // Original content must remain intact
    expect(await workspace.readFile("src/core/.modie/MOTIVE.md")).toBe(
      "Initial domain purpose.\n",
    );

    // Succeed when overwrite: true is explicitly requested
    const updated = await createMotive({
      cwd: workspace.cwd,
      scopeDir: "src/core",
      content: " Deliberate updated domain purpose. ",
      overwrite: true,
    });
    expect(updated.overwritten).toBe(true);
    expect(updated.scaffolded).toBe(false);
    expect(updated.content).toBe("Deliberate updated domain purpose.");
    expect(await workspace.readFile("src/core/.modie/MOTIVE.md")).toBe(
      "Deliberate updated domain purpose.\n",
    );
  });

  // @verifies RULE-10, RULE-34, RULE-35
  it("[RULE-10][RULE-34][RULE-35] should reject motive content containing artifact tags or cross-document references", async () => {
    await using workspace = await createFixtureWorkspace("modie-motive-rule10-");

    const sampleRuleTag = makeTestTag("RULE", 10);
    const sampleAdrTag = makeTestTag("ADR", 4);
    const sampleTaskTag = makeTestTag("TASK", 99);

    // 1. Rejects canonical artifact tags (RULE, ADR, TASK)
    expect(() =>
      validateMotiveContent(`Enforce ${sampleRuleTag} across all modules.`),
    ).toThrow(/prohibited in MOTIVE\.md per RULE-10/);

    expect(() =>
      validateMotiveContent(`Follows decisions in ${sampleAdrTag}.`),
    ).toThrow(/prohibited in MOTIVE\.md per RULE-10/);

    expect(() =>
      validateMotiveContent(`Implemented during ${sampleTaskTag}.`),
    ).toThrow(/prohibited in MOTIVE\.md per RULE-10/);

    // 2. Rejects cross-document filenames and markdown links
    expect(() =>
      validateMotiveContent("See parent MOTIVE.md for high-level context."),
    ).toThrow(/prohibited in MOTIVE\.md per RULE-10/);

    expect(() =>
      validateMotiveContent("Refer to [Architecture](./design.md) for details."),
    ).toThrow(/prohibited in MOTIVE\.md per RULE-10/);

    expect(() =>
      validateMotiveContent(" Inspect .modie/rules/ for invariants."),
    ).toThrow(/prohibited in MOTIVE\.md per RULE-10/);

    // 3. Allows hyphenated English prose like "rule-based" and "task-oriented"
    expect(() =>
      renderMotiveMarkdown({
        content:
          "Provide a rule-based, task-oriented evaluation engine for local workflows.",
      }),
    ).not.toThrow();

    // 4. Rejects creation and preserves disk state when invalid content is passed
    await expect(
      createMotive({
        cwd: workspace.cwd,
        scopeDir: "src/core",
        content: `Coupled to ${sampleRuleTag}.`,
      }),
    ).rejects.toThrow(/prohibited in MOTIVE\.md per RULE-10/);

    expect(await workspace.fileExists("src/core/.modie/MOTIVE.md")).toBe(false);
  });

  // @verifies RULE-2, RULE-8, ADR-10, RULE-34
  it("[RULE-2][RULE-8][ADR-10][RULE-34] should read MOTIVE.md and collect upward ancestral motives without evaluating sibling subtrees", async () => {
    await using workspace = await createFixtureWorkspace(
      "modie-motive-ancestry-",
    );

    await workspace.createMotive({
      content: "Root workspace purpose.",
    });
    await workspace.createMotive({
      scopeDir: "src",
      content: "Source tree purpose.",
    });
    await workspace.createMotive({
      scopeDir: "src/core",
      content: "Core domain purpose.",
    });
    await workspace.createMotive({
      scopeDir: "src/interfaces",
      content: "Sibling interfaces purpose.",
    });

    const single = await readMotive("src/core", workspace.cwd);
    expect(single).not.toBeNull();
    expect(single?.scope).toBe("src/core");
    expect(single?.content).toBe("Core domain purpose.");

    const missing = await readMotive("src/core/gist", workspace.cwd);
    expect(missing).toBeNull();

    // Collect upward from deep leaf `src/core/gist` -> `src/core` -> `src` -> `.`
    const chain = await collectAncestralMotives("src/core/gist", workspace.cwd);
    expect(chain.map((m) => m.scope)).toEqual(["src/core", "src", "."]);
    expect(chain.map((m) => m.content)).toEqual([
      "Core domain purpose.",
      "Source tree purpose.",
      "Root workspace purpose.",
    ]);
  });
});


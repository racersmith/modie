/**
 * Isolated unit tests for CitationSource implementations (GitGrepSource and FsWalkSource).
 * Complies with ADR-4, ADR-5, RULE-25, RULE-31, RULE-34, and RULE-35.
 * @verifies RULE-25, RULE-31, RULE-34, RULE-35
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createFixtureWorkspace,
  makeTestTag,
  type FixtureWorkspace,
} from "../testing/index.ts";
import { MockVcsAdapter } from "../vcs/index.ts";
import {
  FsWalkSource,
  GitGrepSource,
  createTagRegex,
} from "./citation-source.ts";

describe("CitationSource Abstraction (RULE-25, RULE-34, RULE-35)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-cite-src-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("[RULE-25][RULE-35] should correctly generate tag regex with word boundary protections", () => {
    const targetTag = makeTestTag("RULE", 930);
    const regex = createTagRegex(targetTag);

    expect(regex.test(`// Cites ${targetTag} directly`)).toBe(true);
    expect(regex.test(`// Cites [${targetTag}] in brackets`)).toBe(true);
    expect(regex.test(`// Cites ${targetTag}_ext with underscore`)).toBe(false);
    expect(regex.test(`// Cites ${targetTag}-hyphen with hyphen`)).toBe(false);
    expect(regex.test(`// Cites ${targetTag}99 with number`)).toBe(false);
    expect(regex.test(`// Cites pre_${targetTag} with prefix`)).toBe(false);
  });

  it("[RULE-25][RULE-34][RULE-35] should extract citations with FsWalkSource", async () => {
    const targetTag = makeTestTag("RULE", 931);
    const targetFile = "target.md";

    await workspace.writeFile(targetFile, `# Target\nThis is ${targetTag}.\n`);
    await workspace.writeFile(
      "src/code.ts",
      `// Implements ${targetTag}\nconst x = 1;\n`,
    );
    await workspace.writeFile(
      "docs/readme.md",
      `# Guide\nRefer to ${targetTag} for guidelines.\n`,
    );
    await workspace.writeFile(
      "node_modules/dep.js",
      `// In ignored dir: ${targetTag}\n`,
    );

    const source = new FsWalkSource();
    const matches = await source.scan(targetTag, {
      cwd: workspace.cwd,
      targetFilepath: `${workspace.cwd}/${targetFile}`,
      ignoredDirectories: new Set(["node_modules", ".git"]),
    });

    expect(matches.length).toBe(2);
    expect(matches.some((m) => m.relPath === "src/code.ts")).toBe(true);
    expect(matches.some((m) => m.relPath === "docs/readme.md")).toBe(true);
    expect(matches.some((m) => m.relPath.includes("node_modules"))).toBe(false);
    expect(matches.some((m) => m.relPath === targetFile)).toBe(false);

    const codeMatch = matches.find((m) => m.relPath === "src/code.ts")!;
    expect(codeMatch.line).toBe(1);
    expect(codeMatch.snippet).toBe(`// Implements ${targetTag}`);
  });

  it("[RULE-25][RULE-34][RULE-35] should extract citations with GitGrepSource", async () => {
    await workspace.initGit();
    const targetTag = makeTestTag("RULE", 932);
    const targetFile = "target.md";

    await workspace.writeFile(targetFile, `# Target\nThis is ${targetTag}.\n`);
    await workspace.writeFile("committed.ts", `// Committed ${targetTag}\n`);
    await workspace.gitCommit("feat: commit file");

    await workspace.writeFile("untracked.ts", `// Untracked ${targetTag}\n`);

    const source = new GitGrepSource();
    const isAvail = await source.isAvailable(workspace.cwd);
    expect(isAvail).toBe(true);

    const matches = await source.scan(targetTag, {
      cwd: workspace.cwd,
      targetFilepath: `${workspace.cwd}/${targetFile}`,
      ignoredDirectories: new Set([".git"]),
    });

    expect(matches.length).toBe(2);
    expect(matches.some((m) => m.relPath === "committed.ts")).toBe(true);
    expect(matches.some((m) => m.relPath === "untracked.ts")).toBe(true);
    expect(matches.some((m) => m.relPath === targetFile)).toBe(false);
  });

  it("[RULE-25][RULE-35] should fail GitGrepSource scan when directory is not a git repository", async () => {
    const targetTag = makeTestTag("RULE", 933);
    const mockVcs = new MockVcsAdapter({ insideWorkTree: false });
    const source = new GitGrepSource(mockVcs);

    const isAvail = await source.isAvailable(workspace.cwd);
    expect(isAvail).toBe(false);

    expect(
      source.scan(targetTag, {
        cwd: workspace.cwd,
      }),
    ).rejects.toThrow("Directory is not a git repository");
  });
});

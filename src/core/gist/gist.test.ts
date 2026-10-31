/**
 * Unit tests for Core GIST path resolution, local reader, and shallow signpost discovery services.
 * @verifies ADR-2, ADR-4, ADR-8, ADR-10, ADR-11, RULE-8, RULE-9, RULE-12, RULE-20, RULE-34
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  discoverChildSignposts,
  discoverGistsForScope,
  formatFileGistFilename,
  isDirectoryGistFilename,
  isFileGistFilename,
  parseFileGistFilename,
  readDirectoryGist,
  readFileGist,
  readLocalGists,
  resolveDirectoryGistPath,
  resolveFileGistPath,
  resolveGistPaths,
} from "../index.ts";
import {
  createFixtureWorkspace,
  type FixtureWorkspace,
} from "../testing/index.ts";

describe("GIST Pathing & Filename Utilities (RULE-8, RULE-20, ADR-10)", () => {
  // @verifies RULE-20
  it("[RULE-20] should format and parse file-level GIST filenames and distinguish directory GIST.md", () => {
    expect(isDirectoryGistFilename("GIST.md")).toBe(true);
    expect(isDirectoryGistFilename("src/core/.modie/gists/GIST.md")).toBe(true);
    expect(isDirectoryGistFilename("index.ts.GIST.md")).toBe(false);

    expect(formatFileGistFilename("active-scanner.ts")).toBe(
      "active-scanner.ts.GIST.md",
    );
    expect(formatFileGistFilename("active-scanner.ts.GIST.md")).toBe(
      "active-scanner.ts.GIST.md",
    );

    expect(parseFileGistFilename("active-scanner.ts.GIST.md")).toBe(
      "active-scanner.ts",
    );
    expect(parseFileGistFilename("GIST.md")).toBeNull();
    expect(parseFileGistFilename(".gists")).toBeNull();
    expect(parseFileGistFilename("README.md")).toBeNull();

    expect(isFileGistFilename("active-scanner.ts.GIST.md")).toBe(true);
    expect(isFileGistFilename("GIST.md")).toBe(false);

    expect(() => formatFileGistFilename("GIST.md")).toThrow("RULE-20");
    expect(() => formatFileGistFilename("   ")).toThrow(
      "Source filename for file GIST must be non-empty",
    );
  });

  // @verifies RULE-8, RULE-20, ADR-10
  it("[RULE-8][RULE-20][ADR-10] should resolve directory GIST and ledger paths for root and nested scopes", () => {
    const rootPaths = resolveGistPaths(".", "/mock/root");
    expect(rootPaths.scope).toBe(".");
    expect(rootPaths.scopeDir).toBe("/mock/root");
    expect(rootPaths.gistsDir).toBe("/mock/root/.modie/gists");
    expect(rootPaths.directoryGistPath).toBe("/mock/root/.modie/gists/GIST.md");
    expect(rootPaths.relativeDirectoryGistPath).toBe(".modie/gists/GIST.md");
    expect(rootPaths.ledgerPath).toBe("/mock/root/.modie/gists/.gists");
    expect(rootPaths.relativeLedgerPath).toBe(".modie/gists/.gists");

    const nestedPaths = resolveGistPaths("src/core/resolver", "/mock/root");
    expect(nestedPaths.scope).toBe("src/core/resolver");
    expect(nestedPaths.scopeDir).toBe("/mock/root/src/core/resolver");
    expect(nestedPaths.relativeDirectoryGistPath).toBe(
      "src/core/resolver/.modie/gists/GIST.md",
    );
    expect(resolveDirectoryGistPath("src/core/resolver", "/mock/root")).toBe(
      "/mock/root/src/core/resolver/.modie/gists/GIST.md",
    );
  });

  // @verifies RULE-8, RULE-20, ADR-10
  it("[RULE-8][RULE-20][ADR-10] should strip .modie and .modie/gists container segments during path normalization", () => {
    const fromModie = resolveGistPaths("src/core/.modie", "/mock/root");
    expect(fromModie.scope).toBe("src/core");
    expect(fromModie.directoryGistPath).toBe(
      "/mock/root/src/core/.modie/gists/GIST.md",
    );

    const fromGistsDir = resolveGistPaths(
      "src/core/.modie/gists",
      "/mock/root",
    );
    expect(fromGistsDir.scope).toBe("src/core");
    expect(fromGistsDir.directoryGistPath).toBe(
      "/mock/root/src/core/.modie/gists/GIST.md",
    );

    const fromGistFile = resolveGistPaths(
      "src/core/.modie/gists/GIST.md",
      "/mock/root",
    );
    expect(fromGistFile.scope).toBe("src/core");
    expect(fromGistFile.directoryGistPath).toBe(
      "/mock/root/src/core/.modie/gists/GIST.md",
    );
  });

  // @verifies RULE-20, ADR-10
  it("[RULE-20][ADR-10] should resolve file-level GIST paths from combined source path or (dir, filename) arguments", () => {
    const fromCombined = resolveFileGistPath(
      "src/core/resolver/active-scanner.ts",
      "/mock/root",
    );
    expect(fromCombined.scope).toBe("src/core/resolver");
    expect(fromCombined.sourceFilename).toBe("active-scanner.ts");
    expect(fromCombined.sourceRelativePath).toBe(
      "src/core/resolver/active-scanner.ts",
    );
    expect(fromCombined.gistFilename).toBe("active-scanner.ts.GIST.md");
    expect(fromCombined.gistFilepath).toBe(
      "/mock/root/src/core/resolver/.modie/gists/active-scanner.ts.GIST.md",
    );
    expect(fromCombined.relativeGistFilepath).toBe(
      "src/core/resolver/.modie/gists/active-scanner.ts.GIST.md",
    );

    const fromTwoArgs = resolveFileGistPath(
      "src/core/resolver",
      "active-scanner.ts",
      "/mock/root",
    );
    expect(fromTwoArgs).toEqual(fromCombined);

    const fromExistingGistPath = resolveFileGistPath(
      "src/core/resolver/.modie/gists/active-scanner.ts.GIST.md",
      "/mock/root",
    );
    expect(fromExistingGistPath).toEqual(fromCombined);
  });

  it("should reject paths outside the workspace root", () => {
    expect(() => resolveGistPaths("../outside", "/mock/root")).toThrow(
      "path must reside within the workspace root",
    );
  });
});

describe("GIST Reader & Shallow Signpost Discovery Services (RULE-9, RULE-20, ADR-8, ADR-10, RULE-34)", () => {
  let workspace: FixtureWorkspace;

  beforeEach(async () => {
    workspace = await createFixtureWorkspace("modie-gist-test-");
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  // @verifies RULE-9, RULE-20, ADR-10, RULE-34
  it("[RULE-9][RULE-20][ADR-10][RULE-34] should resolve local directory GIST and sorted file GIST proxies while omitting ancestor GISTs", async () => {
    // Root ancestor GIST (should be omitted when reading src/core per RULE-9)
    await workspace.createGist({
      content: "Root workspace summary.",
    });
    await workspace.createGist({
      filename: "root-file.ts",
      content: "Root file proxy.",
    });

    // Target scope GISTs at src/core
    await workspace.createGist({
      scopeDir: "src/core",
      content: "Core governance engine and domain services.\n",
    });
    await workspace.createGist({
      scopeDir: "src/core",
      filename: "types.ts",
      content: "Core shared domain type definitions.",
    });
    await workspace.createGist({
      scopeDir: "src/core",
      filename: "index.ts",
      content: "Public barrel exports for Modie core.",
    });

    // Also write a .gists ledger and a misplaced GIST.md outside .modie/gists/ to verify RULE-20 filtering
    await workspace.writeFile(
      "src/core/.modie/gists/.gists",
      "# Modie GIST Ledger\nDIR_INPUT 123456\n",
    );
    await workspace.writeFile(
      "src/core/GIST.md",
      "Misplaced flat GIST that must be ignored per RULE-20.",
    );

    const dirGist = await readDirectoryGist("src/core", { cwd: workspace.cwd });
    expect(dirGist).not.toBeNull();
    expect(dirGist?.type).toBe("directory");
    expect(dirGist?.scope).toBe("src/core");
    expect(dirGist?.relativePath).toBe("src/core/.modie/gists/GIST.md");
    expect(dirGist?.content).toBe(
      "Core governance engine and domain services.",
    );

    const fileGist = await readFileGist("src/core/index.ts", {
      cwd: workspace.cwd,
    });
    expect(fileGist).not.toBeNull();
    expect(fileGist?.type).toBe("file");
    expect(fileGist?.sourceFilename).toBe("index.ts");
    expect(fileGist?.sourceRelativePath).toBe("src/core/index.ts");
    expect(fileGist?.relativePath).toBe(
      "src/core/.modie/gists/index.ts.GIST.md",
    );
    expect(fileGist?.content).toBe("Public barrel exports for Modie core.");

    const local = await readLocalGists("src/core", { cwd: workspace.cwd });
    expect(local.scope).toBe("src/core");
    expect(local.directoryGist?.content).toBe(
      "Core governance engine and domain services.",
    );
    // Sorted alphabetically by sourceFilename: index.ts, then types.ts
    expect(local.fileGists.map((f) => f.sourceFilename)).toEqual([
      "index.ts",
      "types.ts",
    ]);
    expect(local.fileGists[0]?.content).toBe(
      "Public barrel exports for Modie core.",
    );
    expect(local.fileGists[1]?.content).toBe(
      "Core shared domain type definitions.",
    );
  });

  // @verifies RULE-20, RULE-34
  it("[RULE-20][RULE-34] should normalize a target source file path to its enclosing directory when reading local GISTs", async () => {
    await workspace.writeFile("src/core/index.ts", "export {};\n");
    await workspace.createGist({
      scopeDir: "src/core",
      content: "Core summary.",
    });
    await workspace.createGist({
      scopeDir: "src/core",
      filename: "index.ts",
      content: "Index proxy.",
    });

    const localFromFile = await readLocalGists("src/core/index.ts", {
      cwd: workspace.cwd,
    });
    expect(localFromFile.scope).toBe("src/core");
    expect(localFromFile.directoryGist?.content).toBe("Core summary.");
    expect(localFromFile.fileGists).toHaveLength(1);
    expect(localFromFile.fileGists[0]?.sourceFilename).toBe("index.ts");
  });

  // @verifies ADR-8, RULE-20, RULE-34
  it("[ADR-8][RULE-20][RULE-34] should discover immediate child directory GIST signposts (depth=1) and ignore deeper descendants or dot/ignored folders", async () => {
    // Immediate children of src/core (depth=1)
    await workspace.createGist({
      scopeDir: "src/core/resolver",
      content: "Scans active workspace artifacts and Git history watermarks.",
    });
    await workspace.createGist({
      scopeDir: "src/core/adr",
      content: "Manages ADR creation, templates, and supersession links.",
    });

    // Child directory without GIST.md (should be skipped)
    await workspace.mkdir("src/core/empty-child");

    // Grandchild directory (depth=2, should NOT be included in depth=1 signposts for src/core)
    await workspace.createGist({
      scopeDir: "src/core/resolver/deep",
      content: "Deep grandchild summary.",
    });

    // Ignored / dot directories inside src/core (should be skipped)
    await workspace.createGist({
      scopeDir: "src/core/.hidden",
      content: "Hidden directory summary.",
    });
    await workspace.createGist({
      scopeDir: "src/core/node_modules",
      content: "Node modules summary.",
    });

    const signposts = await discoverChildSignposts("src/core", {
      cwd: workspace.cwd,
    });
    expect(signposts.map((s) => s.name)).toEqual(["adr", "resolver"]);
    expect(signposts[0]).toMatchObject({
      name: "adr",
      scope: "src/core/adr",
      relativePath: "src/core/adr/.modie/gists/GIST.md",
      content: "Manages ADR creation, templates, and supersession links.",
    });
    expect(signposts[1]).toMatchObject({
      name: "resolver",
      scope: "src/core/resolver",
      relativePath: "src/core/resolver/.modie/gists/GIST.md",
      content: "Scans active workspace artifacts and Git history watermarks.",
    });
  });

  // @verifies ADR-8, RULE-9, RULE-20, RULE-34
  it("[ADR-8][RULE-9][RULE-20][RULE-34] should combine local GISTs and shallow signposts via discoverGistsForScope and handle missing GISTs gracefully", async () => {
    const emptyResult = await discoverGistsForScope("src/nonexistent", {
      cwd: workspace.cwd,
    });
    expect(emptyResult.scope).toBe("src/nonexistent");
    expect(emptyResult.directoryGist).toBeNull();
    expect(emptyResult.fileGists).toEqual([]);
    expect(emptyResult.signposts).toEqual([]);
    expect(
      await readDirectoryGist("src/nonexistent", workspace.cwd),
    ).toBeNull();
    expect(
      await readFileGist("src/nonexistent/missing.ts", workspace.cwd),
    ).toBeNull();

    // Populate root GIST, root file proxy, and child signpost
    await workspace.createGist({
      content: "Root repository architecture summary.",
    });
    await workspace.createGist({
      filename: "index.ts",
      content: "Root entry point.",
    });
    await workspace.createGist({
      scopeDir: "src",
      content: "Source code packages for core and interfaces.",
    });

    const rootDiscovery = await discoverGistsForScope(".", {
      cwd: workspace.cwd,
    });
    expect(rootDiscovery.scope).toBe(".");
    expect(rootDiscovery.directoryGist?.content).toBe(
      "Root repository architecture summary.",
    );
    expect(rootDiscovery.fileGists).toHaveLength(1);
    expect(rootDiscovery.fileGists[0]?.sourceFilename).toBe("index.ts");
    expect(rootDiscovery.signposts).toHaveLength(1);
    expect(rootDiscovery.signposts[0]?.name).toBe("src");
    expect(rootDiscovery.signposts[0]?.content).toBe(
      "Source code packages for core and interfaces.",
    );
  });
});


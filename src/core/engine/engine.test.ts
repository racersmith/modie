import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import * as engine from "./index.ts";

const ENGINE_DIR = resolve(import.meta.dir);
const CORE_DIR = resolve(ENGINE_DIR, "..");

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?from\s+)?["']([^"']+)["']/g;
  for (const match of content.matchAll(importRegex)) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

// @verifies RULE-38
describe("Engine Architectural Layer Invariants (RULE-38)", () => {
  it("[RULE-38] engine services must only import from domain, platform, and engine namespaces", async () => {
    const engineFiles = await collectTsFiles(ENGINE_DIR);
    expect(engineFiles.length).toBeGreaterThan(15);

    const violations: { file: string; specifier: string; resolved: string }[] = [];

    for (const filePath of engineFiles) {
      const content = await readFile(filePath, "utf8");
      const specifiers = extractImportSpecifiers(content);

      for (const specifier of specifiers) {
        // Node built-ins or package.json or yaml are allowed external libraries
        if (
          specifier.startsWith("node:") ||
          specifier.endsWith("package.json") ||
          specifier === "yaml"
        ) {
          continue;
        }

        // Must be relative within core
        if (!specifier.startsWith(".")) {
          violations.push({
            file: relative(ENGINE_DIR, filePath),
            specifier,
            resolved: specifier,
          });
          continue;
        }

        const resolvedPath = normalize(resolve(join(filePath, ".."), specifier));

        // Must remain inside src/core/
        const relToCore = relative(CORE_DIR, resolvedPath);
        if (relToCore.startsWith("..") || isAbsolute(relToCore)) {
          violations.push({
            file: relative(ENGINE_DIR, filePath),
            specifier,
            resolved: relToCore,
          });
          continue;
        }

        // Within core, must be in domain/, platform/, or engine/
        const topSubdir = relToCore.split("/")[0];
        if (topSubdir !== "domain" && topSubdir !== "platform" && topSubdir !== "engine") {
          violations.push({
            file: relative(ENGINE_DIR, filePath),
            specifier,
            resolved: relToCore,
          });
        }
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file} -> "${v.specifier}" (resolved: ${v.resolved})`)
        .join("\n");
      throw new Error(
        `Architectural invariant violation (RULE-38): engine layer imports outside domain/platform/engine:\n${details}`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("[RULE-38] engine facade exports all primary services across traversal, context, query, linking, archival, lifecycle, and pipeline", () => {
    // Traversal
    expect(typeof engine.resolveWatermark).toBe("function");
    expect(typeof engine.scanActiveArtifacts).toBe("function");
    expect(typeof engine.detectGitBranch).toBe("function");

    // Context
    expect(typeof engine.createWorkspaceContext).toBe("function");
    expect(typeof engine.createWorkspaceContextSync).toBe("function");
    expect(typeof engine.resolveWorkspaceContext).toBe("function");

    // Query
    expect(typeof engine.compileContext).toBe("function");
    expect(typeof engine.formatCompiledContextMarkdown).toBe("function");
    expect(typeof engine.listRules).toBe("function");
    expect(typeof engine.listAdrs).toBe("function");
    expect(typeof engine.resolveArtifactByTag).toBe("function");
    expect(typeof engine.findArtifactReferences).toBe("function");

    // Linking
    expect(typeof engine.validateArtifactLink).toBe("function");
    expect(typeof engine.validateLinkTarget).toBe("function");
    expect(typeof engine.linkArtifact).toBe("function");
    expect(typeof engine.unlinkArtifact).toBe("function");

    // Archival
    expect(typeof engine.archiveArtifact).toBe("function");
    expect(typeof engine.archiveAdr).toBe("function");
    expect(typeof engine.archiveRule).toBe("function");

    // Task lifecycle
    expect(typeof engine.createTask).toBe("function");
    expect(typeof engine.queryTaskQueue).toBe("function");
    expect(typeof engine.startTaskBranch).toBe("function");
    expect(typeof engine.mergeTaskBranch).toBe("function");
    expect(typeof engine.completeTask).toBe("function");
    expect(typeof engine.checkTaskItem).toBe("function");

    // Pipelines & Artifact Creation
    expect(typeof engine.createArtifact).toBe("function");
    expect(typeof engine.createAdr).toBe("function");
    expect(typeof engine.createRule).toBe("function");
    expect(typeof engine.createMotive).toBe("function");
    expect(typeof engine.readMotive).toBe("function");
    expect(typeof engine.discoverChildMotives).toBe("function");
  });
});


import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import {
  ARTIFACT_DEFINITIONS,
  createDefaultDefinitionRegistry,
  defaultDefinitionRegistry,
  getArtifactDefinition,
  adrDefinition,
  ruleDefinition,
  taskDefinition,
} from "./registry.ts";

const DOMAIN_DIR = resolve(import.meta.dir);

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
  // Match standard static imports and re-exports
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?from\s+)?["']([^"']+)["']/g;
  for (const match of content.matchAll(importRegex)) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

// @verifies RULE-38
describe("Domain Architectural Layer Invariants (RULE-38)", () => {
  it("[RULE-38] domain models must contain zero imports to platform or engine services", async () => {
    const domainFiles = await collectTsFiles(DOMAIN_DIR);
    expect(domainFiles.length).toBeGreaterThan(10);

    const violations: { file: string; specifier: string; resolved: string }[] = [];

    const prohibitedSubstrings = [
      "/platform",
      "/engine",
      "/markdown",
      "/vcs",
      "/config",
      "/testing",
      "/query",
      "/resolver",
      "/pipeline",
      "/archival",
      "/context",
    ];

    for (const filePath of domainFiles) {
      const content = await readFile(filePath, "utf8");
      const specifiers = extractImportSpecifiers(content);

      for (const specifier of specifiers) {
        // Node built-ins or package.json are allowed
        if (specifier.startsWith("node:") || specifier.endsWith("package.json")) {
          continue;
        }

        // Must be relative
        if (!specifier.startsWith(".")) {
          violations.push({
            file: relative(DOMAIN_DIR, filePath),
            specifier,
            resolved: specifier,
          });
          continue;
        }

        const resolvedPath = normalize(resolve(join(filePath, ".."), specifier));

        // Must remain inside src/core/domain/
        const relToDomain = relative(DOMAIN_DIR, resolvedPath);
        if (relToDomain.startsWith("..") || isAbsolute(relToDomain)) {
          violations.push({
            file: relative(DOMAIN_DIR, filePath),
            specifier,
            resolved: relToDomain,
          });
          continue;
        }

        // Check prohibited module names
        for (const prohibited of prohibitedSubstrings) {
          if (specifier.includes(prohibited) || resolvedPath.includes(prohibited)) {
            violations.push({
              file: relative(DOMAIN_DIR, filePath),
              specifier,
              resolved: resolvedPath,
            });
            break;
          }
        }
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file} -> "${v.specifier}" (resolved: ${v.resolved})`)
        .join("\n");
      throw new Error(
        `Architectural invariant violation (RULE-38): domain layer contains outward imports to platform/engine:\n${details}`,
      );
    }

    expect(violations).toEqual([]);
  });

  // @verifies RULE-25
  it("[RULE-25] domain registry centralizes composition root across built-in subtypes", () => {
    const registry = createDefaultDefinitionRegistry();
    expect(registry.has("RULE")).toBe(true);
    expect(registry.has("ADR")).toBe(true);
    expect(registry.has("TASK")).toBe(true);

    expect(registry.get("RULE")).toBe(ruleDefinition);
    expect(registry.get("ADR")).toBe(adrDefinition);
    expect(registry.get("TASK")).toBe(taskDefinition);

    expect(defaultDefinitionRegistry.has("RULE")).toBe(true);
    expect(defaultDefinitionRegistry.has("ADR")).toBe(true);
    expect(defaultDefinitionRegistry.has("TASK")).toBe(true);

    expect(getArtifactDefinition("RULE")).toBe(ruleDefinition);
    expect(getArtifactDefinition("ADR")).toBe(adrDefinition);
    expect(getArtifactDefinition("TASK")).toBe(taskDefinition);

    expect(ARTIFACT_DEFINITIONS["RULE"]).toBe(ruleDefinition);
    expect(ARTIFACT_DEFINITIONS["ADR"]).toBe(adrDefinition);
    expect(ARTIFACT_DEFINITIONS["TASK"]).toBe(taskDefinition);
  });
});


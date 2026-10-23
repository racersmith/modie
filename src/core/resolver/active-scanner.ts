/**
 * Active artifact scanner.
 * Scans the workspace filesystem for indexable artifact files (*.RULE-*.md, *.ADR-*.md, *.TASK-*.md) and extracts IDs.
 * Complies with RULE-1, ADR-1, ADR-2, ADR-6, and ADR-9.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArtifactFilename, registerArtifactSubtype } from "../common/filename.ts";
import type { DiscoveredArtifact, DiscoveredTask, IndexableSubtype } from "./types.ts";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".cache",
  ".gemini",
  ".turbo",
  ".next",
  ".local",
  ".Trash",
  "Trash",
  ".cargo",
  ".rustup",
  ".npm",
  ".bun",
  ".yarn",
  ".venv",
  "venv",
  "target",
]);

/**
 * Recursively scans directory for active indexable artifact files.
 * Can be filtered to a specific subtype (RULE, ADR, or TASK).
 */
export async function scanActiveArtifacts(
  rootDir: string = process.cwd(),
  subtype?: IndexableSubtype,
): Promise<DiscoveredArtifact[]> {
  if (subtype) {
    registerArtifactSubtype(subtype);
  }
  const discovered: DiscoveredArtifact[] = [];
  const targetSubtype = subtype ? (subtype.toUpperCase() as IndexableSubtype) : undefined;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const parsed = parseArtifactFilename(entry.name);
        if (parsed) {
          if (!targetSubtype || parsed.subtype === targetSubtype) {
            discovered.push({
              id: parsed.id,
              subtype: parsed.subtype,
              tag: parsed.tag,
              slug: parsed.slug,
              filename: parsed.filename,
              filepath: join(dir, entry.name),
              isArchived: parsed.isArchived,
              status: "active",
            });
          }
        }
      }
    }
  }

  await walk(rootDir);
  return discovered;
}

/**
 * Returns a deduplicated list of active artifact IDs found on disk for a given subtype.
 */
export async function scanActiveArtifactIds(
  rootDir: string = process.cwd(),
  subtype?: IndexableSubtype,
): Promise<string[]> {
  const artifacts = await scanActiveArtifacts(rootDir, subtype);
  return Array.from(new Set(artifacts.map((a) => a.id)));
}

/**
 * Recursively scans directory for active task files (*.TASK-*.md).
 * Backward compatibility wrapper around scanActiveArtifacts.
 */
export async function scanActiveTasks(rootDir: string = process.cwd()): Promise<DiscoveredTask[]> {
  const artifacts = await scanActiveArtifacts(rootDir, "TASK");
  return artifacts
    .filter((a) => !a.isArchived)
    .map((a) => ({
      id: a.id,
      slug: a.slug,
      filename: a.filename,
      filepath: a.filepath,
      status: "active",
    }));
}

/**
 * Returns a deduplicated list of active task IDs found on disk.
 * Backward compatibility wrapper around scanActiveArtifactIds.
 */
export async function scanActiveTaskIds(rootDir: string = process.cwd()): Promise<string[]> {
  return scanActiveArtifactIds(rootDir, "TASK");
}

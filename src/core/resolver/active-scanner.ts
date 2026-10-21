/**
 * Active task scanner.
 * Scans the workspace filesystem for *.TASK-*.md files and extracts active task IDs.
 * Complies with RULE-1, ADR-6, and ADR-9.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseTaskFilename } from "../primitives/task/filename.ts";
import type { DiscoveredTask } from "./types.ts";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".cache",
  ".gemini",
  ".turbo",
  ".next",
]);

/**
 * Recursively scans directory for active task files (*.TASK-*.md).
 */
export async function scanActiveTasks(rootDir: string = process.cwd()): Promise<DiscoveredTask[]> {
  const discovered: DiscoveredTask[] = [];

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
        const parsed = parseTaskFilename(entry.name);
        if (parsed) {
          discovered.push({
            id: parsed.id,
            slug: parsed.slug,
            filename: parsed.filename,
            filepath: join(dir, entry.name),
            status: "active",
          });
        }
      }
    }
  }

  await walk(rootDir);
  return discovered;
}

/**
 * Returns a deduplicated list of active task IDs found on disk.
 */
export async function scanActiveTaskIds(rootDir: string = process.cwd()): Promise<string[]> {
  const tasks = await scanActiveTasks(rootDir);
  return Array.from(new Set(tasks.map((t) => t.id)));
}

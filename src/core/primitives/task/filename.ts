/**
 * Filename formatting and parsing for TASK primitive artifacts.
 * Backward compatibility wrapper around src/core/primitives/common/filename.ts.
 * Complies with RULE-1, ADR-1, ADR-6, and ADR-9.
 */

import {
  formatArtifactFilename,
  isArtifactFilename,
  isValidArtifactId,
  parseArtifactFilename,
  ARTIFACT_ID_REGEX,
} from "../common/filename.ts";

export const TASK_ID_REGEX = ARTIFACT_ID_REGEX;

export const TASK_FILENAME_REGEX =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.TASK-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)\.md$/;

export interface ParsedTaskFilename {
  slug: string;
  id: string;
  filename: string;
}

export function isValidTaskId(id: string | number): boolean {
  return isValidArtifactId(id);
}

export function formatTaskFilename(slug: string, id: string | number): string {
  return formatArtifactFilename({
    slug,
    subtype: "TASK",
    id,
  });
}

export function parseTaskFilename(
  pathOrFilename: string,
): ParsedTaskFilename | null {
  const parsed = parseArtifactFilename(pathOrFilename);
  if (!parsed || parsed.subtype !== "TASK" || parsed.isArchived) {
    return null;
  }
  return {
    slug: parsed.slug,
    id: parsed.id,
    filename: parsed.filename,
  };
}

export function isTaskFilename(pathOrFilename: string): boolean {
  return isArtifactFilename(pathOrFilename, "TASK");
}

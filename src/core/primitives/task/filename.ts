/**
 * Filename formatting and parsing for TASK primitive artifacts.
 * Complies with RULE-1, ADR-1, ADR-6, and ADR-9.
 */

import { isValidSlug } from "./slug.ts";

/**
 * Valid ID pattern: unpadded integer (1, 42) or branch/author-namespaced (2-1, J101, A102).
 */
export const TASK_ID_REGEX = /^[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/;

/**
 * Complete task filename regex matching: [slug].TASK-[ID].md
 */
export const TASK_FILENAME_REGEX =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)\.TASK-([A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*)\.md$/;

export interface ParsedTaskFilename {
  slug: string;
  id: string;
  filename: string;
}

/**
 * Validates whether an ID token conforms to Modie's unpadded / branch-namespaced grammar.
 */
export function isValidTaskId(id: string | number): boolean {
  const strId = String(id).trim();
  return TASK_ID_REGEX.test(strId);
}

/**
 * Formats a canonical task filename: [slug].TASK-[ID].md
 *
 * @throws Error if slug or id do not conform to RULE-1 grammar.
 */
export function formatTaskFilename(slug: string, id: string | number): string {
  const strId = String(id).trim();

  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid slug for task filename: "${slug}". Must be strict kebab-case (RULE-1).`,
    );
  }

  if (!isValidTaskId(strId)) {
    throw new Error(
      `Invalid task ID: "${id}". Must be unpadded integer or branch-namespaced token (RULE-1, ADR-9).`,
    );
  }

  return `${slug}.TASK-${strId}.md`;
}

/**
 * Parses a task filename (or full filepath) into its slug and ID.
 * Returns null if the filename does not match the TASK artifact grammar.
 */
export function parseTaskFilename(
  pathOrFilename: string,
): ParsedTaskFilename | null {
  const filename = pathOrFilename.split("/").pop() ?? pathOrFilename;
  const match = filename.match(TASK_FILENAME_REGEX);

  if (!match || !match[1] || !match[2]) {
    return null;
  }

  return {
    slug: match[1],
    id: match[2],
    filename,
  };
}

/**
 * Returns true if the path or filename corresponds to a valid TASK artifact filename.
 */
export function isTaskFilename(pathOrFilename: string): boolean {
  return parseTaskFilename(pathOrFilename) !== null;
}

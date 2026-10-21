/**
 * Kebab-case slug generator and validator for Canon artifacts (RULE-1).
 */

const KEBAB_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates whether a string is a strictly compliant kebab-case slug.
 */
export function isValidSlug(slug: string): boolean {
  return KEBAB_REGEX.test(slug);
}

/**
 * Generates a valid kebab-case slug from an arbitrary human-readable title or phrase.
 *
 * Examples:
 * - "Create Task CLI" -> "create-task-cli"
 * - "Task Primitive Model (Core)" -> "task-primitive-model-core"
 * - "---Hello__World---" -> "hello-world"
 */
export function generateSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    // Replace non-alphanumeric characters with hyphens
    .replace(/[^a-z0-9]+/g, "-")
    // Collapse multiple consecutive hyphens into one
    .replace(/-+/g, "-")
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error(`Cannot generate valid slug from empty or non-alphanumeric input: "${input}"`);
  }

  return normalized;
}

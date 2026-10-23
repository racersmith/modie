/**
 * VCS domain module index.
 * Complies with RULE-25, RULE-28, and ADR-6.
 */

export * from "./types.ts";
export { GitCliAdapter, defaultVcsAdapter } from "./git-cli-adapter.ts";
export { MockVcsAdapter } from "./mock-adapter.ts";
export type { MockVcsOptions } from "./mock-adapter.ts";

/**
 * VCS domain module index.
 * Complies with RULE-25 and RULE-28.
 */

export * from "./types.ts";
export { GitCliAdapter, defaultVcsAdapter } from "./git-cli-adapter.ts";
export { MockVcsAdapter } from "./mock-adapter.ts";
export type { MockVcsOptions } from "./mock-adapter.ts";

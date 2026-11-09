/**
 * Modie Core Platform: Host infrastructure layer (RULE-38, ADR-13).
 * Provides isolated I/O adapters for VCS, Markdown parsing, and configuration loading.
 * Does not export test fixtures to production bundles.
 */

export * from "./vcs/index.ts";
export * from "./markdown/index.ts";
export * from "./config/index.ts";


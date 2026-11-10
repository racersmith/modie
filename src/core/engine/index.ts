/**
 * Modie Core: Engine Layer.
 * Graph traversal, context compilation, query, linking, archival, task lifecycle management, and artifact pipelines (ADR-13, RULE-38).
 */

// Explicit re-exports to resolve ambiguity
export { validateTaskScope } from "./task/index.ts";
export type { WatermarkDetails } from "./traversal/index.ts";

// Engine services
export * from "./traversal/index.ts";
export * from "./context/index.ts";
export * from "./query/index.ts";
export * from "./linking/index.ts";
export * from "./archival/index.ts";
export * from "./task/index.ts";
export * from "./pipeline/index.ts";
export * from "./adr/index.ts";
export * from "./rule/index.ts";
export * from "./motive/index.ts";
export * from "./gist/index.ts";


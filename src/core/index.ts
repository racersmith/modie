/**
 * Modie Core: Governance engine and context compiler domain logic.
 * Public API exposed to interfaces (RULE-25).
 */

// Explicit re-exports to resolve ambiguity between domain and engine facades
export { validateTaskScope } from "./domain/index.ts";
export type { WatermarkDetails } from "./domain/index.ts";

// Domain layer (ADR-13, RULE-38)
export * from "./domain/index.ts";

// Composition root and registries
export * from "./registry.ts";
export * from "./context.ts";

// Platform layer (RULE-38, ADR-13)
export * from "./platform/index.ts";

// Engine modules
export * from "./pipeline/index.ts";
export * from "./task/index.ts";
export * from "./rule/index.ts";
export * from "./adr/index.ts";
export * from "./gist/index.ts";
export * from "./motive/index.ts";
export * from "./archival/index.ts";
export * from "./linking/index.ts";
export * from "./resolver/index.ts";
export * from "./query/index.ts";

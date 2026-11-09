/**
 * Modie Core: Governance engine and context compiler domain logic.
 * Public API exposed to interfaces (RULE-25).
 */

// Composition root and registries
export * from "./registry.ts";
export * from "./context.ts";

// Foundational primitives and platform layer (RULE-38, ADR-13)
export * from "./common/index.ts";
export * from "./platform/index.ts";

// Domain modules
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

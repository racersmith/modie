/**
 * Modie Core: Governance engine and context compiler domain logic.
 * Public API exposed to interfaces (RULE-25).
 */

// Domain layer (ADR-13, RULE-38)
export * from "./domain/index.ts";

// Composition root and registries
export * from "./registry.ts";
export * from "./context.ts";

// Platform layer (RULE-38, ADR-13)
export * from "./platform/index.ts";

// Engine layer (ADR-13, RULE-38)
export * from "./engine/index.ts";

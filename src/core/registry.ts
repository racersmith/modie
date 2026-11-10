/**
 * Modie Core: Composition Root for Artifact Definitions and Extensions.
 * Re-exports domain registry implementation and sets default registry factory (RULE-38, ADR-13).
 */

import { setDefaultRegistryFactory } from "./context/resolver.ts";
import { createDefaultDefinitionRegistry } from "./domain/registry.ts";

setDefaultRegistryFactory(createDefaultDefinitionRegistry);

export * from "./domain/registry.ts";

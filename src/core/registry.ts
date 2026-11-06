/**
 * Modie Core: Composition Root for Artifact Definitions and Extensions.
 * Registers concrete subtype definitions into the declarative pipeline DefinitionRegistry.
 * Complies with ADR-1, ADR-2, ADR-4, and RULE-25.
 */

import { adrDefinition } from "./adr/definition.ts";
import type { ArtifactSubtype } from "./common/types.ts";
import {
  DefaultDefinitionRegistry,
  defaultDefinitionRegistry,
  type DefinitionRegistry,
} from "./pipeline/registry.ts";
import type { ArtifactDefinition } from "./pipeline/types.ts";
import { setDefaultRegistryFactory } from "./context/resolver.ts";
import { ruleDefinition } from "./rule/definition.ts";
import { taskDefinition } from "./task/definition.ts";

/**
 * Creates a fresh, isolated DefinitionRegistry containing the default built-in subtypes (RULE, ADR, TASK).
 */
export function createDefaultDefinitionRegistry(): DefinitionRegistry {
  const registry = new DefaultDefinitionRegistry();
  registry.register(ruleDefinition);
  registry.register(adrDefinition);
  registry.register(taskDefinition);
  return registry;
}

setDefaultRegistryFactory(createDefaultDefinitionRegistry);

// Register default built-in subtypes on the legacy shared instance
defaultDefinitionRegistry.register(ruleDefinition);
defaultDefinitionRegistry.register(adrDefinition);
defaultDefinitionRegistry.register(taskDefinition);

export {
  defaultDefinitionRegistry,
  ruleDefinition,
  adrDefinition,
  taskDefinition,
};

/**
 * Resolves the canonical ArtifactDefinition for an indexable subtype.
 */
export function getArtifactDefinition<TOptions = any, TArtifact = any>(
  subtype: ArtifactSubtype | string,
): ArtifactDefinition<TOptions, TArtifact> | undefined {
  return defaultDefinitionRegistry.get<TOptions, TArtifact>(subtype);
}

/**
 * Central declarative registry proxy across all registered subtypes.
 */
export const ARTIFACT_DEFINITIONS: Record<
  string,
  ArtifactDefinition<any, any>
> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      return defaultDefinitionRegistry.get(prop);
    },
    has(_target, prop: string) {
      return defaultDefinitionRegistry.has(prop);
    },
    ownKeys() {
      return defaultDefinitionRegistry
        .getAll()
        .map((d) => d.subtype.toString().toUpperCase());
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      const def = defaultDefinitionRegistry.get(prop);
      if (def) {
        return { configurable: true, enumerable: true, value: def };
      }
      return undefined;
    },
  },
);


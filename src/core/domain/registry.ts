/**
 * Modie Core Domain Layer: Composition Root for Artifact Definitions and Extensions.
 * Registers concrete subtype definitions into the declarative pipeline DefinitionRegistry.
 * Complies with RULE-38.
 */

import { adrDefinition, type AdrDefinition } from "./adr/definition.ts";
import type { ArtifactSubtype } from "./common/types.ts";
import { ruleDefinition, type RuleDefinition } from "./rule/definition.ts";
import { taskDefinition, type TaskDefinition } from "./task/definition.ts";
import type { ArtifactDefinition } from "./types.ts";

export interface DefinitionRegistry {
  register(definition: ArtifactDefinition<any, any>): void;
  registerSubtype(subtype: string): void;
  get<TOptions = any, TArtifact = any>(
    subtype: ArtifactSubtype | string,
  ): ArtifactDefinition<TOptions, TArtifact> | undefined;
  has(subtype: ArtifactSubtype | string): boolean;
  isRegistered(subtype: ArtifactSubtype | string): boolean;
  getAll(): ArtifactDefinition<any, any>[];
  clear(): void;
}

export class DefaultDefinitionRegistry implements DefinitionRegistry {
  private readonly definitions = new Map<
    string,
    ArtifactDefinition<any, any>
  >();
  private readonly registeredSubtypes = new Set<string>([
    "RULE",
    "ADR",
    "TASK",
  ]);

  register(definition: ArtifactDefinition<any, any>): void {
    const key = definition.subtype.toString().trim().toUpperCase();
    this.definitions.set(key, definition);
    this.registeredSubtypes.add(key);
  }

  registerSubtype(subtype: string): void {
    const upper = subtype.trim().toUpperCase();
    if (/^[A-Z0-9]+$/.test(upper)) {
      this.registeredSubtypes.add(upper);
    }
  }

  get<TOptions = any, TArtifact = any>(
    subtype: ArtifactSubtype | string,
  ): ArtifactDefinition<TOptions, TArtifact> | undefined {
    const key = subtype.toString().trim().toUpperCase();
    return this.definitions.get(key) as
      ArtifactDefinition<TOptions, TArtifact> | undefined;
  }

  has(subtype: ArtifactSubtype | string): boolean {
    const key = subtype.toString().trim().toUpperCase();
    return this.definitions.has(key) || this.registeredSubtypes.has(key);
  }

  isRegistered(subtype: ArtifactSubtype | string): boolean {
    return this.has(subtype);
  }

  getAll(): ArtifactDefinition<any, any>[] {
    return Array.from(this.definitions.values());
  }

  clear(): void {
    this.definitions.clear();
    this.registeredSubtypes.clear();
  }
}

export function createDefinitionRegistry(): DefinitionRegistry {
  return new DefaultDefinitionRegistry();
}

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

export const defaultDefinitionRegistry: DefinitionRegistry =
  createDefaultDefinitionRegistry();

export {
  ruleDefinition,
  adrDefinition,
  taskDefinition,
};

export type {
  RuleDefinition,
  AdrDefinition,
  TaskDefinition,
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


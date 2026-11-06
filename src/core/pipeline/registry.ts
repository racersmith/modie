/**
 * Declarative Artifact Definition Registry.
 * Provides inversion of control so concrete subtype definitions register with the generic pipeline.
 * Complies with ADR-1, ADR-2, ADR-4, and RULE-25.
 */

import type { ArtifactSubtype } from "../common/types.ts";
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
  private readonly definitions = new Map<string, ArtifactDefinition<any, any>>();
  private readonly registeredSubtypes = new Set<string>(["RULE", "ADR", "TASK"]);

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
      | ArtifactDefinition<TOptions, TArtifact>
      | undefined;
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

export const defaultDefinitionRegistry: DefinitionRegistry =
  new DefaultDefinitionRegistry();


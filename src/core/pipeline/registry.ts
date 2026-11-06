/**
 * Declarative Artifact Definition Registry.
 * Provides inversion of control so concrete subtype definitions register with the generic pipeline.
 * Complies with ADR-1, ADR-2, ADR-4, and RULE-25.
 */

import type { ArtifactSubtype } from "../common/types.ts";
import type { ArtifactDefinition } from "./types.ts";

export interface DefinitionRegistry {
  register(definition: ArtifactDefinition<any, any>): void;
  get<TOptions = any, TArtifact = any>(
    subtype: ArtifactSubtype | string,
  ): ArtifactDefinition<TOptions, TArtifact> | undefined;
  has(subtype: ArtifactSubtype | string): boolean;
  getAll(): ArtifactDefinition<any, any>[];
  clear(): void;
}

export class DefaultDefinitionRegistry implements DefinitionRegistry {
  private readonly definitions = new Map<string, ArtifactDefinition<any, any>>();

  register(definition: ArtifactDefinition<any, any>): void {
    const key = definition.subtype.toString().trim().toUpperCase();
    this.definitions.set(key, definition);
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
    return this.definitions.has(key);
  }

  getAll(): ArtifactDefinition<any, any>[] {
    return Array.from(this.definitions.values());
  }

  clear(): void {
    this.definitions.clear();
  }
}

export const defaultDefinitionRegistry: DefinitionRegistry =
  new DefaultDefinitionRegistry();


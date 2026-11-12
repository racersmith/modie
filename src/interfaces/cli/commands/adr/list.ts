/**
 * Declarative CLI command definition for `modie adr list [options]`.
 * Consumes public core API per RULE-25, honors ancestral scope traversal per 
 * and enforces stdout/stderr separation per RULE-27.
 */

import { adrDefinition, type ListedArtifact } from "../../../../core/index.ts";
import {
  createArtifactListCommand,
  createArtifactListSchema,
  renderArtifactListTable,
  type CliCommandDefinition,
} from "../../framework/index.ts";

export const adrListSchema = createArtifactListSchema("ADRs");
export type AdrListInput = typeof adrListSchema;

/**
 * Formats listed ADR artifacts into a human-readable aligned table.
 */
export const renderAdrListTable: (adrs: ListedArtifact[]) => string =
  renderArtifactListTable;

/**
 * Declarative definition for the `modie adr list` command.
 */
export const adrListCommand: CliCommandDefinition<
  Record<string, any>,
  ListedArtifact[],
  typeof adrListSchema
> = createArtifactListCommand(adrDefinition, {
  schema: adrListSchema,
});

/**
 * Declarative CLI command definition for `modie rule list [options]`.
 * Consumes public core API per RULE-25, honors ancestral scope traversal per RULE-9,
 * and enforces stdout/stderr separation per RULE-27.
 */

import { ruleDefinition, type ListedArtifact } from "../../../../core/index.ts";
import {
  createArtifactListCommand,
  createArtifactListSchema,
  renderArtifactListTable,
  type CliCommandDefinition,
} from "../../framework/index.ts";

export const ruleListSchema = createArtifactListSchema("rules");
export type RuleListInput = typeof ruleListSchema;

/**
 * Formats listed RULE artifacts into a human-readable aligned table.
 */
export const renderRuleListTable: (rules: ListedArtifact[]) => string =
  renderArtifactListTable;

/**
 * Declarative definition for the `modie rule list` command.
 */
export const ruleListCommand: CliCommandDefinition<
  Record<string, any>,
  ListedArtifact[],
  typeof ruleListSchema
> = createArtifactListCommand(ruleDefinition, {
  schema: ruleListSchema,
});

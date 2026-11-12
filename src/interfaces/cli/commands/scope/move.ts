/**
 * Declarative CLI command definition for `modie scope move <tag> [targetScope] [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  relocateArtifact,
  type RelocateArtifactResult,
} from "../../../../core/index.ts";
import {
  defineCommand,
  type CliCommandDefinition,
  type CliExecutionContext,
} from "../../framework/index.ts";

export const scopeMoveSchema = z.object({
  tag: z
    .string()
    .min(1, "Artifact tag or identifier is required")
    .describe("Artifact tag (e.g. RULE-1, ADR-1) or file path"),
  targetScope: z
    .string()
    .optional()
    .describe(
      "Target scope directory (defaults to auto-calculated optimal DCA based on citations)",
    ),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Validate and compute destination paths without moving files"),
  noMotive: z
    .boolean()
    .default(false)
    .describe("Do not scaffold MOTIVE.md in target directory"),
});

export type ScopeMoveInput = z.infer<typeof scopeMoveSchema>;

export function renderScopeMoveResult(
  result: RelocateArtifactResult,
  context: CliExecutionContext,
  input?: ScopeMoveInput,
): void {
  if (input?.dryRun) {
    context.stderr("[Dry Run] Would relocate artifact:");
  } else {
    context.stderr("Artifact Relocation Successful:");
  }

  context.stderr(`  Tag:             ${result.tag} (${result.subtype})`);
  context.stderr(
    `  Previous Scope:  ${result.previousScope} (${result.previousRelativePath})`,
  );
  context.stderr(
    `  New Scope:       ${result.newScope} (${result.newRelativePath})`,
  );

  if (result.scaffoldedMotive) {
    context.stderr("  Scaffolded:      MOTIVE.md in target scope");
  }
}

export const scopeMoveCommand: CliCommandDefinition<
  Record<string, any>,
  RelocateArtifactResult,
  typeof scopeMoveSchema
> = defineCommand({
  id: "scope_move",
  namespace: "scope",
  name: "move",
  summaryUsage: "<tag> [targetScope] [options]",
  usage: "modie scope move <tag-or-identifier> [targetScope] [options]",
  description: "Relocate an artifact to an explicit or auto-calculated target scope",
  agentGuidance:
    "Call this tool to relocate a RULE or ADR artifact to an explicit target directory scope, or omit the target to automatically compute and move it to its optimal mathematical scope based on citations.",
  helpUsage: "modie scope move --help",
  schema: scopeMoveSchema,
  positionals: [
    {
      name: "tag",
      required: true,
    },
    {
      name: "targetScope",
      required: false,
    },
  ],
  execute: async (input, context) => {
    return relocateArtifact(input.tag, input.targetScope, {
      cwd: context.cwd,
      dryRun: input.dryRun,
      scaffoldMotive: !input.noMotive,
    });
  },
  render: renderScopeMoveResult,
});


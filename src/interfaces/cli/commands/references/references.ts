/**
 * Declarative CLI command definition for `modie references <tag> [options]` (alias: refs).
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Evaluates subtype-agnostic archival safety.
 */

import { z } from "zod";
import {
  findArtifactReferences,
  type ArtifactReferencesResult,
} from "../../../../core/index.ts";
import {
  defineCommand,
  type CliCommandDefinition,
  type CliExecutionContext,
} from "../../framework/index.ts";

export const referencesSchema = z.object({
  tag: z
    .string()
    .min(1, "Artifact tag or identifier is required")
    .describe("Artifact tag (e.g. RULE-25, ADR-4, TASK-20), slug, or filepath"),
  by: z.boolean().default(false).describe("Display only 'Found In' citations"),
  to: z
    .boolean()
    .default(false)
    .describe("Display only 'Links To' declared outbound links"),
  codeOnly: z
    .boolean()
    .default(false)
    .describe("Filter citations to source code and tests only"),
  governanceOnly: z
    .boolean()
    .default(false)
    .describe("Filter citations to governance artifacts only"),
});

export type ReferencesInput = z.infer<typeof referencesSchema>;

function renderFoundInGovernance(
  context: CliExecutionContext,
  foundIn: ArtifactReferencesResult["foundIn"],
): void {
  if (foundIn.governanceLinks.length > 0) {
    context.stderr(
      `  Governance Links (${foundIn.governanceLinks.length}):`,
    );
    for (const item of foundIn.governanceLinks) {
      const tagDisplay = item.sourceTag ?? "Artifact";
      const status = item.isArchived ? " [archived]" : "";
      const rel = item.relationship ? ` (${item.relationship})` : "";
      context.stderr(
        `    ${tagDisplay.padEnd(10)} ${item.relativePath}:${item.line}${rel}${status}`,
      );
    }
  }

  if (foundIn.governanceProse.length > 0) {
    context.stderr(
      `  Governance Prose (${foundIn.governanceProse.length}):`,
    );
    for (const item of foundIn.governanceProse) {
      const tagDisplay = item.sourceTag ?? "Artifact";
      context.stderr(
        `    ${tagDisplay.padEnd(10)} ${item.relativePath}:${item.line}`,
      );
    }
  }
}

function renderFoundInCode(
  context: CliExecutionContext,
  foundIn: ArtifactReferencesResult["foundIn"],
): void {
  if (foundIn.code.length > 0) {
    context.stderr(`  Source Code (${foundIn.code.length}):`);
    for (const item of foundIn.code) {
      context.stderr(
        `    ${item.relativePath}:${item.line}  ${item.snippet}`,
      );
    }
  }

  if (foundIn.tests.length > 0) {
    context.stderr(`  Test Suites (${foundIn.tests.length}):`);
    for (const item of foundIn.tests) {
      context.stderr(
        `    ${item.relativePath}:${item.line}  ${item.snippet}`,
      );
    }
  }
}

function renderFoundInSection(
  context: CliExecutionContext,
  foundIn: ArtifactReferencesResult["foundIn"],
  codeOnly: boolean,
  govOnly: boolean,
): void {
  context.stderr(
    `\n[Found In] (${foundIn.total} citations across repository)`,
  );

  if (!codeOnly) {
    renderFoundInGovernance(context, foundIn);
  }
  if (!govOnly) {
    renderFoundInCode(context, foundIn);
  }

  if (foundIn.documentation.length > 0 && !codeOnly && !govOnly) {
    context.stderr(
      `  Documentation (${foundIn.documentation.length}):`,
    );
    for (const item of foundIn.documentation) {
      context.stderr(
        `    ${item.relativePath}:${item.line}  ${item.snippet}`,
      );
    }
  }

  if (foundIn.total === 0) {
    context.stderr(`  (no citations found in repository)`);
  }
}

function renderLinksToSection(
  context: CliExecutionContext,
  linksTo: ArtifactReferencesResult["linksTo"],
): void {
  context.stderr(
    `\n[Links To] (${linksTo.total} declared outbound targets)`,
  );
  context.stderr(
    `  ADRs:   ${linksTo.adrs.length > 0 ? linksTo.adrs.join(", ") : "(none)"}`,
  );
  context.stderr(
    `  Rules:  ${linksTo.rules.length > 0 ? linksTo.rules.join(", ") : "(none)"}`,
  );
  context.stderr(
    `  Tasks:  ${linksTo.tasks.length > 0 ? linksTo.tasks.join(", ") : "(none)"}`,
  );
  if (linksTo.supersedes.length > 0) {
    context.stderr(`  Supersedes: ${linksTo.supersedes.join(", ")}`);
  }
  if (linksTo.superseded_by) {
    context.stderr(`  Superseded By: ${linksTo.superseded_by}`);
  }
}

function renderArchivalGuardSection(
  context: CliExecutionContext,
  guard: ArtifactReferencesResult["archivalGuard"],
): void {
  context.stderr(`\n[Archival Safety Check]`);
  if (guard.canArchive) {
    context.stderr(
      `  Can Archive: YES (0 active blocking governance links)`,
    );
    return;
  }
  context.stderr(
    `  Can Archive: NO (${guard.blockingCount} active blocking governance link(s))`,
  );
  context.stderr(`  Blocking Dependencies:`);
  for (const reason of guard.blockingReasons) {
    context.stderr(`    - ${reason}`);
  }
}

function renderReferences(
  result: ArtifactReferencesResult,
  context: CliExecutionContext,
  input?: ReferencesInput,
): void {
  const byVal = input?.by ?? context.flags.by;
  const toVal = input?.to ?? context.flags.to;
  const showOnlyBy = Boolean(byVal && !toVal);
  const showOnlyTo = Boolean(toVal && !byVal);
  const codeOnly = Boolean(input?.codeOnly ?? context.flags["code-only"]);
  const govOnly = Boolean(
    input?.governanceOnly ?? context.flags["governance-only"],
  );

  const target = result.target;
  const archivedNotice = target.isArchived ? " [ARCHIVED]" : " [Active]";

  context.stderr(`Target: ${target.tag} (${target.slug})${archivedNotice}`);
  context.stderr(`Path:   ${target.relativePath}`);

  if (!showOnlyTo) {
    renderFoundInSection(context, result.foundIn, codeOnly, govOnly);
  }
  if (!showOnlyBy) {
    renderLinksToSection(context, result.linksTo);
  }
  if (!showOnlyTo) {
    renderArchivalGuardSection(context, result.archivalGuard);
  }
}

/**
 * Declarative definition for the `modie references` command.
 */
export const referencesCommandDefinition: CliCommandDefinition<
  Record<string, any>,
  ArtifactReferencesResult,
  typeof referencesSchema
> = defineCommand({
  id: "references",
  name: "references",
  aliases: ["refs"],
  summaryUsage: "<tag> [options]",
  usage: "modie references <tag> [options] (alias: refs)",
  description: "Display citations and declared outbound links",
  helpUsage: "modie references --help",
  schema: referencesSchema,
  positionals: [
    {
      name: "tag",
      required: true,
      missingError:
        "Missing required artifact identifier. Usage: modie references <tag> [options]",
    },
  ],
  flags: {
    by: {
      aliases: ["found-in"],
    },
    to: {
      aliases: ["links-to"],
    },
  },
  execute: async (input, context) => {
    return findArtifactReferences(input.tag, { cwd: context.cwd });
  },
  render: renderReferences,
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
  },
});

/**
 * Declarative CLI command definition for `modie references <tag> [options]` (alias: refs).
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 * Evaluates subtype-agnostic archival safety per RULE-31.
 */

import {
  findArtifactReferences,
  type ArtifactReferencesResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  generateCommandHelp,
  type CliCommandDefinition,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export interface ReferencesFlags {
  by?: boolean;
  "found-in"?: boolean;
  to?: boolean;
  "links-to"?: boolean;
  "code-only"?: boolean;
  "governance-only"?: boolean;
  json?: boolean;
}

/**
 * Declarative definition for the `modie references` command.
 */
export const referencesCommandDefinition: CliCommandDefinition<
  ReferencesFlags,
  ArtifactReferencesResult
> = {
  name: "references",
  usage: "modie references <tag> [options] (alias: refs)",
  description:
    "Discover all citations found across governance, code, and tests ('Found In') and declared outbound links ('Links To').",
  helpUsage: "modie references --help",
  positionals: [
    {
      name: "tag",
      description: "Artifact tag (e.g. RULE-25, ADR-4, TASK-20), slug, or filepath",
      required: true,
      missingError:
        "Missing required artifact identifier. Usage: modie references <tag> [options]",
    },
  ],
  flags: {
    by: {
      type: "boolean",
      description: "Display only 'Found In' citations",
      aliases: ["found-in"],
    },
    to: {
      type: "boolean",
      description: "Display only 'Links To' declared outbound links",
      aliases: ["links-to"],
    },
    "code-only": {
      type: "boolean",
      description: "Filter citations to source code and tests only",
    },
    "governance-only": {
      type: "boolean",
      description: "Filter citations to governance artifacts only",
    },
  },
  run: async (context) => {
    const targetTag = context.positionals[0]!;
    return findArtifactReferences(targetTag, { cwd: context.cwd });
  },
  render: (result, context) => {
    const showOnlyBy = Boolean(context.flags.by && !context.flags.to);
    const showOnlyTo = Boolean(context.flags.to && !context.flags.by);
    const codeOnly = Boolean(context.flags["code-only"]);
    const govOnly = Boolean(context.flags["governance-only"]);

    const target = result.target;
    const archivedNotice = target.isArchived ? " [ARCHIVED]" : " [Active]";

    context.stderr(`Target: ${target.tag} (${target.slug})${archivedNotice}`);
    context.stderr(`Path:   ${target.relativePath}`);

    // Section 1: Found In
    if (!showOnlyTo) {
      context.stderr(`\n[Found In] (${result.foundIn.total} citations across repository)`);

      const showGov = !codeOnly;
      const showCode = !govOnly;

      if (showGov && result.foundIn.governanceLinks.length > 0) {
        context.stderr(`  Governance Links (${result.foundIn.governanceLinks.length}):`);
        for (const item of result.foundIn.governanceLinks) {
          const tagDisplay = item.sourceTag ?? "Artifact";
          const status = item.isArchived ? " [archived]" : "";
          const rel = item.relationship ? ` (${item.relationship})` : "";
          context.stderr(`    ${tagDisplay.padEnd(10)} ${item.relativePath}:${item.line}${rel}${status}`);
        }
      }

      if (showGov && result.foundIn.governanceProse.length > 0) {
        context.stderr(`  Governance Prose (${result.foundIn.governanceProse.length}):`);
        for (const item of result.foundIn.governanceProse) {
          const tagDisplay = item.sourceTag ?? "Artifact";
          context.stderr(`    ${tagDisplay.padEnd(10)} ${item.relativePath}:${item.line}`);
        }
      }

      if (showCode && result.foundIn.code.length > 0) {
        context.stderr(`  Source Code (${result.foundIn.code.length}):`);
        for (const item of result.foundIn.code) {
          context.stderr(`    ${item.relativePath}:${item.line}  ${item.snippet}`);
        }
      }

      if (showCode && result.foundIn.tests.length > 0) {
        context.stderr(`  Test Suites (${result.foundIn.tests.length}):`);
        for (const item of result.foundIn.tests) {
          context.stderr(`    ${item.relativePath}:${item.line}  ${item.snippet}`);
        }
      }

      if (result.foundIn.documentation.length > 0 && !codeOnly && !govOnly) {
        context.stderr(`  Documentation (${result.foundIn.documentation.length}):`);
        for (const item of result.foundIn.documentation) {
          context.stderr(`    ${item.relativePath}:${item.line}  ${item.snippet}`);
        }
      }

      if (result.foundIn.total === 0) {
        context.stderr(`  (no citations found in repository)`);
      }
    }

    // Section 2: Links To
    if (!showOnlyBy) {
      const linksTo = result.linksTo;
      context.stderr(`\n[Links To] (${linksTo.total} declared outbound targets)`);
      context.stderr(`  ADRs:   ${linksTo.adrs.length > 0 ? linksTo.adrs.join(", ") : "(none)"}`);
      context.stderr(`  Rules:  ${linksTo.rules.length > 0 ? linksTo.rules.join(", ") : "(none)"}`);
      context.stderr(`  Tasks:  ${linksTo.tasks.length > 0 ? linksTo.tasks.join(", ") : "(none)"}`);
      if (linksTo.supersedes.length > 0) {
        context.stderr(`  Supersedes: ${linksTo.supersedes.join(", ")}`);
      }
      if (linksTo.superseded_by) {
        context.stderr(`  Superseded By: ${linksTo.superseded_by}`);
      }
    }

    // Section 3: Archival Guard
    if (!showOnlyTo) {
      const guard = result.archivalGuard;
      context.stderr(`\n[Archival Safety Check] (RULE-31)`);
      if (guard.canArchive) {
        context.stderr(`  Can Archive: YES (0 active blocking governance links)`);
      } else {
        context.stderr(`  Can Archive: NO (${guard.blockingCount} active blocking governance link(s))`);
        context.stderr(`  Blocking Dependencies:`);
        for (const reason of guard.blockingReasons) {
          context.stderr(`    - ${reason}`);
        }
      }
    }
  },
  renderJson: (result, context) => {
    context.stdout(JSON.stringify(result, null, 2));
  },
};

/**
 * CLI command handler for `modie references`.
 */
export const handleReferences: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(referencesCommandDefinition);

/**
 * Prints usage instructions for `modie references`.
 */
export function printReferencesHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(referencesCommandDefinition));
}

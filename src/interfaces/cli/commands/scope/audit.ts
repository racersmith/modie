/**
 * Declarative CLI command definition for `modie scope audit [target] [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  auditArtifactPlacement,
  relocateArtifact,
  type ArtifactPlacementAuditReport,
  type RelocateArtifactResult,
} from "../../../../core/index.ts";
import {
  defineCommand,
  formatAlignedTable,
  type CliCommandDefinition,
  type CliExecutionContext,
} from "../../framework/index.ts";

export const scopeAuditSchema = z.object({
  target: z
    .string()
    .optional()
    .describe(
      "Artifact tag or directory scope to audit (defaults to workspace root '.')",
    ),
  apply: z
    .boolean()
    .default(false)
    .describe(
      "Automatically execute recommended relocations for over-scoped and under-scoped artifacts",
    ),
  all: z
    .boolean()
    .default(false)
    .describe(
      "Include optimal and inchoate artifacts in report (defaults to issues only)",
    ),
  threshold: z
    .number()
    .int()
    .positive()
    .default(3)
    .describe("Minimum citation threshold to justify least-scope demotion"),
});

export type ScopeAuditInput = z.infer<typeof scopeAuditSchema>;

export interface ScopeAuditResult extends ArtifactPlacementAuditReport {
  applied: boolean;
  relocations: RelocateArtifactResult[];
}

export function renderScopeAuditReport(
  result: ScopeAuditResult,
  context: CliExecutionContext,
  input?: ScopeAuditInput,
): void {
  context.stderr("Artifact Scope Audit (Least Scope Placement - RULE-12):\n");

  if (result.suggestions.length === 0) {
    context.stderr("  No active governance artifacts found to audit.");
    return;
  }

  const showAll = input?.all ?? false;
  const displayItems = showAll
    ? result.suggestions
    : result.suggestions.filter(
        (s) => s.status === "OVER_SCOPED" || s.status === "UNDER_SCOPED",
      );

  if (displayItems.length === 0) {
    context.stderr(
      `✓ All ${result.totalAudited} governance artifacts are optimally scoped.`,
    );
    return;
  }

  const table = formatAlignedTable(displayItems, [
    { header: "TAG", value: (s) => s.tag },
    { header: "SUBTYPE", value: (s) => s.subtype },
    { header: "CURRENT SCOPE", value: (s) => s.currentScope },
    { header: "RECOMMENDED", value: (s) => s.recommendedScope },
    { header: "CITATIONS", value: (s) => String(s.citationsCount) },
    { header: "STATUS", value: (s) => s.status },
    {
      header: "ACTION",
      value: (s) => {
        if (s.status === "OVER_SCOPED") {
          return `Demote to ${s.recommendedScope}`;
        }
        if (s.status === "UNDER_SCOPED") {
          const extCount = s.outOfScopeCitationsCount ?? s.violations.length;
          return `Elevate to ${s.recommendedScope} or prune (${extCount} ext)`;
        }
        if (s.status === "INCHOATE") {
          return "< 3 citations";
        }
        return "-";
      },
    },
  ]);

  context.stderr(table);

  context.stderr(
    `\nSummary: ${result.totalAudited} audited (${result.optimalCount} optimal, ${result.overScopedCount} over-scoped, ${result.underScopedCount} under-scoped, ${result.inchoateCount} inchoate).`,
  );

  const underScoped = result.suggestions.filter(
    (s) => s.status === "UNDER_SCOPED",
  );
  if (underScoped.length > 0) {
    context.stderr("\nUnder-Scoped Artifacts & External Citations:");
    for (const item of underScoped) {
      const extFiles = item.outOfScopePaths ?? item.violations;
      context.stderr(
        `  ${item.tag} (${item.subtype}) [Current: ${item.currentScope} -> DCA: ${item.recommendedScope}]:`,
      );
      context.stderr(
        `    Out-of-scope citations (${extFiles.length} file(s)):`,
      );
      for (const f of extFiles) {
        context.stderr(`      - ${f}`);
      }
      context.stderr("    Resolution Options:");
      context.stderr(
        `      1. Elevate artifact: modie scope move ${item.tag} ${item.recommendedScope}`,
      );
      context.stderr(
        `      2. Prune foreign tags: remove or reword out-of-scope citations`,
      );
    }
  }

  if (!result.applied) {
    const hintParts: string[] = [];
    if (result.overScopedCount > 0 || result.underScopedCount > 0) {
      hintParts.push(
        "Run with --apply to automatically execute recommended relocations.",
      );
    }
    if (!showAll && result.optimalCount > 0) {
      hintParts.push("Pass --all to include optimal artifacts.");
    }
    if (hintParts.length > 0) {
      context.stderr(hintParts.join(" "));
    }
  } else {
    context.stderr(
      `\nApplied relocations (${result.relocations.length} artifact(s) moved):`,
    );
    for (const rel of result.relocations) {
      context.stderr(
        `  - ${rel.tag}: ${rel.previousScope} -> ${rel.newScope} (${rel.newRelativePath})`,
      );
    }
  }
}

export const scopeAuditCommand: CliCommandDefinition<
  Record<string, any>,
  ScopeAuditResult,
  typeof scopeAuditSchema
> = defineCommand({
  id: "scope_audit",
  namespace: "scope",
  name: "audit",
  rootAliases: ["audit"],
  summaryUsage: "[target] [options]",
  usage: "modie scope audit [target-or-scope] [options]",
  description: "Audit artifact placement and detect over-scoped/under-scoped governance",
  agentGuidance:
    "Call this tool to audit least-scope placement (RULE-12) across the workspace or for a specific artifact tag. Identifies over-scoped rules causing task context bloat and under-scoped rules causing duplicate governance. Pass --apply to execute relocations automatically.",
  helpUsage: "modie scope audit --help",
  schema: scopeAuditSchema,
  positionals: [
    {
      name: "target",
      required: false,
    },
  ],
  execute: async (input, context) => {
    const auditReport = await auditArtifactPlacement(input.target, {
      cwd: context.cwd,
      minCitationsThreshold: input.threshold,
    });

    const relocations: RelocateArtifactResult[] = [];

    if (input.apply) {
      const actionable = auditReport.suggestions.filter(
        (s) => s.status === "OVER_SCOPED" || s.status === "UNDER_SCOPED",
      );
      for (const item of actionable) {
        const res = await relocateArtifact(item.tag, item.recommendedScope, {
          cwd: context.cwd,
          scaffoldMotive: true,
        });
        relocations.push(res);
      }
    }

    return {
      ...auditReport,
      applied: input.apply,
      relocations,
    };
  },
  render: renderScopeAuditReport,
});

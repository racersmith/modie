/**
 * Declarative CLI command definition for `modie scope <target> [options]`.
 * Consumes public core API per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  resolveScope,
  type ScopeResolutionResult,
} from "../../../../core/index.ts";
import {
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
  type CliExecutionContext,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const scopeSchema = z.object({
  target: z
    .string()
    .default(".")
    .describe(
      "Artifact tag (e.g. RULE-6, TASK-51), slug, or file/directory path (default: '.')",
    ),
});

export type ScopeInput = z.infer<typeof scopeSchema>;

export interface ScopeFlags {
  json?: boolean;
}

/**
 * Standard human-readable renderer for scope details to stderr per RULE-27.
 */
export function renderScopeDetails(
  result: ScopeResolutionResult,
  context: CliExecutionContext<ScopeFlags>,
): void {
  context.stderr(`Scope Resolution: ${result.target}`);
  context.stderr(`Type:             ${result.type}`);
  if (result.type === "artifact" && result.artifact) {
    context.stderr(
      `Artifact:         ${result.artifact.tag} (${result.artifact.subtype})`,
    );
    context.stderr(`Artifact Path:    ${result.artifact.relativePath}`);
  } else {
    context.stderr(`Target Path:      ${result.targetPath}`);
  }
  context.stderr(`Governing Scope:  ${result.scope}`);
  context.stderr(`Scope Directory:  ${result.scopeDir}`);
  context.stderr(`Enclosing .modie: ${result.enclosingModieDir}`);

  if (result.ancestralScopes.length > 0) {
    context.stderr(`Ancestral Scopes: ${result.ancestralScopes.join(" -> ")}`);
  }

  if (result.ancestralRuleChains.length > 0) {
    context.stderr(`\nAncestral Rule Chains:`);
    for (const chain of result.ancestralRuleChains) {
      if (chain.rules.length === 0) continue;
      context.stderr(`  Scope [${chain.scope}]:`);
      for (const rule of chain.rules) {
        context.stderr(
          `    - ${rule.tag}: ${rule.title} (${rule.relativePath})`,
        );
      }
    }
  }

  if (result.tasks.length > 0) {
    context.stderr(`\nActive Tasks in Scope [${result.scope}]:`);
    for (const task of result.tasks) {
      context.stderr(
        `  - ${task.tag}: ${task.title} [${task.readiness}] (${task.criteriaProgress})`,
      );
    }
  }
}

/**
 * Machine-parsable JSON renderer for scope details to stdout.
 */
export function renderScopeDetailsJson(
  result: ScopeResolutionResult,
  context: CliExecutionContext<ScopeFlags>,
): void {
  context.stdout(JSON.stringify(result, null, 2));
}

/**
 * Declarative definition for the `modie scope` command.
 */
export const scopeCommand: CliCommandDefinition<
  ScopeFlags,
  ScopeResolutionResult,
  typeof scopeSchema
> = defineCommand({
  id: "scope",
  name: "scope",
  usage: "modie scope [target-or-identifier] [options]",
  description:
    "Resolve architectural scope boundaries, enclosing .modie root, and ancestral rule chains.",
  agentGuidance:
    "Call this tool to bidirectionally resolve architectural scope boundaries, enclosing .modie root, ancestral governance rules, and active tasks for an artifact tag or codebase path.",
  helpUsage: "modie scope --help",
  schema: scopeSchema,
  positionals: [
    {
      name: "target-or-identifier",
      property: "target",
      description:
        "Artifact tag (e.g. RULE-6, TASK-51), slug, or file/directory path (default: '.')",
      required: false,
    },
  ],
  flags: {},
  execute: async (input, context) => {
    return resolveScope(input.target, { cwd: context.cwd });
  },
  render: renderScopeDetails,
  renderJson: renderScopeDetailsJson,
});

/**
 * CLI command handler for `modie scope`.
 */
export const handleScope: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(scopeCommand);

/**
 * Prints usage instructions for `modie scope`.
 */
export function printScopeHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(scopeCommand));
}

/**
 * Declarative CLI command definition for `modie context [target] [options]`.
 * Consumes public core API per RULE-25, enforces token economy per RULE-26,
 * and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  compileContext,
  formatCompiledContextMarkdown,
  type CompiledContextResult,
} from "../../../../core/index.ts";
import {
  defineCommand,
  type CliCommandDefinition,
  type CliExecutionContext,
} from "../../framework/index.ts";

export const contextSchema = z.object({
  target: z
    .string()
    .optional()
    .describe(
      "Target directory/file path, task tag, or artifact identifier (default: '.')",
    ),
  scope: z.string().optional().describe("Alias for target scope directory"),
  task: z.string().optional().describe("Alias for target task identifier"),
  raw: z
    .boolean()
    .optional()
    .default(false)
    .describe("Emit synthesized raw Markdown context document to stdout"),
});

export type ContextInput = z.infer<typeof contextSchema>;

function renderTaskSpecStderr(
  context: CliExecutionContext,
  t: NonNullable<CompiledContextResult["task"]>,
): void {
  context.stderr(`\nTask Specification:`);
  context.stderr(`  Task:         ${t.tag} (${t.title})`);
  context.stderr(`  Readiness:    ${t.readiness} (${t.criteriaProgress})`);
  context.stderr(
    `  Blast Radius: ${t.blastRadius.scope} (${t.blastRadius.constraint})`,
  );
  if (t.depends_on.length > 0) {
    context.stderr(`  Depends On:   ${t.depends_on.join(", ")}`);
  }
  if (t.blockedBy.length > 0) {
    context.stderr(`  Blocked By:   ${t.blockedBy.join(", ")}`);
  }
  if (t.links.length > 0) {
    context.stderr(`  Links:        ${t.links.join(", ")}`);
  }
  if (t.context) {
    context.stderr(`  Context:      ${t.context}`);
  }
  if (t.acceptanceCriteria.length > 0) {
    context.stderr(`  Acceptance Criteria:`);
    t.acceptanceCriteria.forEach((c, idx) => {
      const box = c.completed ? "[x]" : "[ ]";
      context.stderr(`    ${idx + 1}. ${box} ${c.text}`);
    });
  }
}

function renderMotivesStderr(
  context: CliExecutionContext,
  motives: CompiledContextResult["motives"],
): void {
  context.stderr(`\nUpward Motives (${motives.length}):`);
  if (motives.length === 0) {
    context.stderr(`  (none)`);
    return;
  }
  for (const m of motives) {
    context.stderr(`  [${m.scope}] (${m.relativePath}):`);
    for (const line of m.content.split("\n")) {
      context.stderr(`    ${line}`);
    }
  }
}

function renderRulesStderr(
  context: CliExecutionContext,
  rules: CompiledContextResult["rules"],
): void {
  context.stderr(`\nGoverning Rules (${rules.length}):`);
  if (rules.length === 0) {
    context.stderr(`  (none)`);
    return;
  }
  for (const r of rules) {
    context.stderr(`  - ${r.tag} [${r.scope}] (${r.title}): ${r.body}`);
  }
}

function renderAdrsStderr(
  context: CliExecutionContext,
  adrs: CompiledContextResult["adrs"],
): void {
  context.stderr(`\nArchitectural Decisions (${adrs.length}):`);
  if (adrs.length === 0) {
    context.stderr(`  (none)`);
    return;
  }
  for (const a of adrs) {
    context.stderr(`  - ${a.tag} [${a.scope}] (${a.title}): ${a.summary}`);
  }
}

function renderChildMotivesStderr(
  context: CliExecutionContext,
  childMotives: CompiledContextResult["childMotives"],
): void {
  context.stderr(`\nChild Directory Motives (${childMotives.length}):`);
  if (childMotives.length === 0) {
    context.stderr(`  (none)`);
    return;
  }
  for (const cm of childMotives) {
    context.stderr(`  - [${cm.scope}] (${cm.relativePath}): ${cm.content}`);
  }
}

/**
 * Human-readable context overview renderer to stderr (or raw markdown to stdout when `--raw` is passed) per RULE-27.
 */
export function renderCompiledContext(
  result: CompiledContextResult,
  context: CliExecutionContext,
  input?: ContextInput,
): void {
  if (input?.raw || context.flags.raw) {
    context.stdout(formatCompiledContextMarkdown(result).trimEnd());
    return;
  }

  context.stderr(`Context Compilation: ${result.target}`);
  context.stderr(`Type:                ${result.type}`);
  context.stderr(`Target Path:         ${result.targetPath}`);
  context.stderr(`Governing Scope:     ${result.scope}`);
  context.stderr(`Ancestral Scopes:    ${result.ancestralScopes.join(" -> ")}`);

  if (result.task) {
    renderTaskSpecStderr(context, result.task);
  }
  renderMotivesStderr(context, result.motives);
  renderRulesStderr(context, result.rules);
  renderAdrsStderr(context, result.adrs);
  renderChildMotivesStderr(context, result.childMotives);
}

/**
 * Declarative definition for the `modie context` command and `context` MCP tool.
 */
export const contextCommand: CliCommandDefinition<
  Record<string, any>,
  CompiledContextResult,
  typeof contextSchema
> = defineCommand({
  id: "context",
  name: "context",
  summaryUsage: "[target] [options]",
  usage: "modie context [target-or-identifier] [options]",
  description:
    "Compile unified architectural context (ancestral motives, governing rules, ADR summaries, task spec, and child directory motives)",
  agentGuidance:
    "PRIMARY ENTRY POINT: Call this tool first when starting a task or exploring a directory scope. Synthesizes the complete Cone of Governance & Orientation in a single token-efficient call: upward ancestral MOTIVEs, active governing RULE invariants, concise ADR summaries, task acceptance criteria and blast radius boundaries when given a TASK tag, and immediate child directory motives.",
  helpUsage: "modie context --help",
  schema: contextSchema,
  positionals: [
    {
      name: "target-or-identifier",
      required: false,
    },
  ],
  flags: {
    scope: {
      property: "target",
      short: "s",
      placeholder: "<dir>",
      description: "Target directory scope (alias for positional target)",
    },
    task: {
      property: "target",
      short: "t",
      placeholder: "<id>",
      description: "Target task identifier (alias for positional target)",
    },
    raw: {
      short: "r",
      aliases: ["markdown"],
    },
  },
  execute: async (input, context) => {
    const resolvedTarget = input.target ?? input.task ?? input.scope ?? ".";
    return compileContext(resolvedTarget, { cwd: context.cwd });
  },
  render: renderCompiledContext,
});

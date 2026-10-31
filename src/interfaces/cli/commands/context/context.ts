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
  createCommandHandler,
  defineCommand,
  generateCommandHelp,
  type CliCommandDefinition,
  type CliExecutionContext,
} from "../../framework/index.ts";
import type { CliIoOptions } from "../../types.ts";

export const contextSchema = z.object({
  target: z
    .string()
    .optional()
    .describe(
      "Target directory/file path, task tag, or artifact identifier (default: '.')",
    ),
  scope: z
    .string()
    .optional()
    .describe("Alias for target scope directory"),
  task: z
    .string()
    .optional()
    .describe("Alias for target task identifier"),
  raw: z
    .boolean()
    .optional()
    .default(false)
    .describe("Emit synthesized raw Markdown context document to stdout"),
});

export type ContextInput = z.infer<typeof contextSchema>;

export interface ContextFlags {
  scope?: string;
  task?: string;
  raw?: boolean;
  markdown?: boolean;
  json?: boolean;
}

/**
 * Human-readable context overview renderer to stderr (or raw markdown to stdout when `--raw` is passed) per RULE-27.
 */
export function renderCompiledContext(
  result: CompiledContextResult,
  context: CliExecutionContext<ContextFlags>,
): void {
  if (context.flags.raw) {
    context.stdout(formatCompiledContextMarkdown(result).trimEnd());
    return;
  }

  context.stderr(`Context Compilation: ${result.target}`);
  context.stderr(`Type:                ${result.type}`);
  context.stderr(`Target Path:         ${result.targetPath}`);
  context.stderr(`Governing Scope:     ${result.scope}`);
  context.stderr(
    `Ancestral Scopes:    ${result.ancestralScopes.join(" -> ")}`,
  );

  if (result.task) {
    const t = result.task;
    context.stderr(`\nTask Specification:`);
    context.stderr(`  Task:         ${t.tag} (${t.title})`);
    context.stderr(`  Readiness:    ${t.readiness} (${t.criteriaProgress})`);
    context.stderr(`  Blast Radius: ${t.blastRadius.scope} (${t.blastRadius.constraint})`);
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

  context.stderr(`\nUpward Motives (${result.motives.length}):`);
  if (result.motives.length === 0) {
    context.stderr(`  (none)`);
  } else {
    for (const m of result.motives) {
      context.stderr(`  [${m.scope}] (${m.relativePath}):`);
      for (const line of m.content.split("\n")) {
        context.stderr(`    ${line}`);
      }
    }
  }

  context.stderr(`\nGoverning Rules (${result.rules.length}):`);
  if (result.rules.length === 0) {
    context.stderr(`  (none)`);
  } else {
    for (const r of result.rules) {
      context.stderr(`  - ${r.tag} [${r.scope}] (${r.title}): ${r.body}`);
    }
  }

  context.stderr(`\nArchitectural Decisions (${result.adrs.length}):`);
  if (result.adrs.length === 0) {
    context.stderr(`  (none)`);
  } else {
    for (const a of result.adrs) {
      context.stderr(`  - ${a.tag} [${a.scope}] (${a.title}): ${a.summary}`);
    }
  }

  const hasLocalGists =
    Boolean(result.gists.directoryGist) || result.gists.fileGists.length > 0;
  context.stderr(`\nLocal GISTs [${result.scope}]:`);
  if (!hasLocalGists) {
    context.stderr(`  (none)`);
  } else {
    if (result.gists.directoryGist) {
      context.stderr(
        `  Directory (${result.gists.directoryGist.relativePath}): ${result.gists.directoryGist.content}`,
      );
    }
    for (const fg of result.gists.fileGists) {
      context.stderr(`  File ${fg.sourceFilename}: ${fg.content}`);
    }
  }

  context.stderr(`\nChild Signposts (${result.signposts.length}):`);
  if (result.signposts.length === 0) {
    context.stderr(`  (none)`);
  } else {
    for (const sp of result.signposts) {
      context.stderr(`  - [${sp.scope}] (${sp.relativePath}): ${sp.content}`);
    }
  }
}

/**
 * Structured JSON renderer for compiled context to stdout per RULE-26 and RULE-27.
 */
export function renderCompiledContextJson(
  result: CompiledContextResult,
  context: CliExecutionContext<ContextFlags>,
): void {
  context.stdout(JSON.stringify(result, null, 2));
}

/**
 * Declarative definition for the `modie context` command and `context` MCP tool.
 */
export const contextCommand: CliCommandDefinition<
  ContextFlags,
  CompiledContextResult,
  typeof contextSchema
> = defineCommand({
  id: "context",
  name: "context",
  summaryUsage: "[target] [options]",
  usage: "modie context [target-or-identifier] [options]",
  description:
    "Compile unified architectural context (motives, rules, ADR summaries, task spec, GISTs, and signposts)",
  agentGuidance:
    "PRIMARY ENTRY POINT: Call this tool first when starting a task or exploring a directory scope. Synthesizes the complete Cone of Governance & Orientation in a single token-efficient call: upward ancestral MOTIVEs (RULE-2), active governing RULE invariants (RULE-9), concise ADR summaries (ADR-8), task acceptance criteria and blast radius boundaries when given a TASK tag (RULE-6), local directory/file GISTs (RULE-20), and immediate child directory signposts (ADR-8).",
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
      short: "s",
      placeholder: "<dir>",
      description: "Target directory scope (alias for positional target)",
    },
    task: {
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
  renderJson: renderCompiledContextJson,
});

/**
 * CLI command handler for `modie context`.
 */
export const handleContext: (
  args: string[],
  options?: CliIoOptions,
) => Promise<number> = createCommandHandler(contextCommand);

/**
 * Prints usage instructions for `modie context`.
 */
export function printContextHelp(stderr: (msg: string) => void): void {
  stderr(generateCommandHelp(contextCommand));
}

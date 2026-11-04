/**
 * Native MCP Workflow Prompts for Modie.
 * Standardizes multi-step agent behaviors with zero static preamble token overhead (RULE-26).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Registers all standardized workflow prompts on the MCP server.
 */
export function registerAllPrompts(server: McpServer) {
  // 1. modie_task_execution
  server.registerPrompt(
    "modie_task_execution",
    {
      title: "Task Execution Workflow",
      description:
        "Structured lifecycle progression for active tasks: start branch, observe blast radius, batch check criteria, and complete/merge.",
      argsSchema: {
        task_id: z
          .string()
          .optional()
          .describe("Task tag or ID (e.g. 'TASK-49'). Defaults to active task branch"),
      },
    },
    async ({ task_id }) => {
      const targetTask = task_id ? ` for task ${task_id}` : "";
      return {
        description: `Guided execution workflow${targetTask}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `You are executing a task using Modie's lifecycle engine${targetTask}. Follow this disciplined workflow:`,
                "",
                "1. **Start Task & Initialize Context**:",
                `   - Call \`modie_task_lifecycle\` with \`action: "start"\`${task_id ? `, \`task_id: "${task_id}"\`` : ""}.`,
                "   - Review the returned Mission Brief, Acceptance Criteria, blast radius constraint, and ambient rules.",
                "",
                "2. **Observe Blast Radius Confinement (RULE-6)**:",
                "   - Confine all file creations and code edits strictly within or below the task's scope directory.",
                "   - Do not modify ancestor or sibling directories without an explicit parent task.",
                "",
                "3. **Progressive Criteria Verification (RULE-21, RULE-22)**:",
                "   - As requirements are implemented and verified via unit tests, check criteria in batch:",
                "     `modie_task_lifecycle(action: \"check\", check_items: [1, 2, ...])`.",
                "",
                "4. **Planned Governance Artifacts**:",
                "   - If the task spec includes planned rules or ADRs, author them using `modie_create_artifact` before completing the task.",
                "",
                "5. **Complete and Merge Ceremony (RULE-32)**:",
                "   - Once all criteria are checked and test suite passes, finalize the task:",
                "     `modie_task_lifecycle(action: \"complete_and_merge\")`.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  // 2. modie_rule_authoring
  server.registerPrompt(
    "modie_rule_authoring",
    {
      title: "Rule Authoring Workflow",
      description:
        "Guided authoring of atomic, implementation-agnostic architectural invariants with least-scope placement and optional justifying ADR validation.",
      argsSchema: {
        name: z
          .string()
          .describe("Short kebab-case rule name (e.g. 'mcp-payload-token-economy')"),
        justifying_adr: z
          .string()
          .optional()
          .describe(
            "Optional tag of the ancestor or local ADR that justifies this rule (e.g. 'ADR-5')",
          ),
        scope: z
          .string()
          .optional()
          .describe("Directory scope where this rule applies (defaults to '.')"),
      },
    },
    async ({ name, justifying_adr, scope }) => {
      const targetScope = scope || ".";
      const justificationText = justifying_adr
        ? ` justified by "${justifying_adr}"`
        : "";
      const initialLinksText = justifying_adr
        ? `\`initial_links: ["${justifying_adr}"]\``
        : "`initial_links: []` (or omit)";
      const ancestryStep = justifying_adr
        ? [
            "3. **Justification Ancestry & Link Targets (RULE-13, RULE-16, RULE-19)**:",
            `   - Verify that \`${justifying_adr}\` resides in scope \`"${targetScope}"\` or an ancestor scope.`,
            "   - A RULE must link strictly to an ADR. Never link a rule to another rule, a task, or a motive.",
          ]
        : [
            "3. **Link Targets & Optional Justification (RULE-13, RULE-16, RULE-19)**:",
            "   - A justifying ADR is optional. If links are provided, a RULE must link strictly to an ancestor or local ADR.",
            "   - Never link a rule to another rule, a task, or a motive.",
          ];

      return {
        description: `Guided authoring workflow for rule "${name}"`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `You are authoring architectural rule "${name}" at scope "${targetScope}"${justificationText}. Follow Modie governance invariants:`,
                "",
                "1. **Atomicity (RULE-11)**:",
                "   - State exactly ONE architectural invariant. Avoid compound rules joining unrelated policies with 'and'.",
                "",
                "2. **Implementation-Agnostic Phrasing (RULE-3)**:",
                "   - Express the constraint as an invariant boundary using normative language (`MUST`, `MUST NOT`).",
                "   - Do not prescribe transient file paths, mechanical function names, or implementation details unless the rule directly governs naming.",
                "",
                ...ancestryStep,
                "",
                "4. **Least-Scope Placement (RULE-12)**:",
                `   - Confirm that \`"${targetScope}"\` is the lowest common ancestor scope where the invariant holds true.`,
                "",
                "5. **Scaffold & Create**:",
                "   - Call `modie_create_artifact` with:",
                `     \`kind: "RULE"\`, \`name: "${name}"\`, \`scope: "${targetScope}"\`, ${initialLinksText}, and formulated invariant content.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  // 3. modie_adr_authoring
  server.registerPrompt(
    "modie_adr_authoring",
    {
      title: "ADR Authoring Workflow",
      description:
        "Guided deliberation of architectural decisions, context, tradeoffs, consequences, and rule derivation.",
      argsSchema: {
        name: z
          .string()
          .describe("Short kebab-case decision name (e.g. 'consolidated-mcp-interface')"),
        scope: z
          .string()
          .optional()
          .describe("Directory scope governed by this decision (defaults to '.')"),
        supersedes: z
          .string()
          .optional()
          .describe("Tag of the previous ADR being superseded if applicable (e.g. 'ADR-2')"),
      },
    },
    async ({ name, scope, supersedes }) => {
      const targetScope = scope || ".";
      const supersedesNote = supersedes
        ? `\n   - This decision supersedes \`${supersedes}\`. Include \`${supersedes}\` in initial links so frontmatter records the relationship.`
        : "";
      return {
        description: `Guided authoring workflow for architectural decision "${name}"`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `You are recording architectural decision record (ADR) "${name}" at scope "${targetScope}". Follow Modie decision record standards:`,
                "",
                "1. **Context & Problem Space**:",
                "   - Frame the architectural forces, technical context, and problem statement requiring a deliberate decision.",
                "",
                "2. **Considered Options & Trade-offs**:",
                "   - Document alternative designs considered and evaluate trade-offs objectively.",
                "",
                "3. **Adopted Decision & Summary**:",
                "   - Clearly define the adopted architecture and provide a 1-sentence executive summary.",
                "",
                "4. **Consequences & Immutability (RULE-4)**:",
                "   - Document both positive consequences and accepted risks/negative trade-offs.",
                "   - Note that once committed, ADRs are immutable historical records; future modifications supersede rather than rewrite.",
                supersedesNote,
                "",
                "5. **Derived Rule Invariants (RULE-17)**:",
                "   - Identify if new invariant constraints must be derived into dedicated RULE artifacts to enforce this decision.",
                "",
                "6. **Scaffold & Create**:",
                "   - Call `modie_create_artifact` with:",
                `     \`kind: "ADR"\`, \`name: "${name}"\`, \`scope: "${targetScope}"\`, \`summary: "..."\`, ${supersedes ? `\`initial_links: ["${supersedes}"]\`, ` : ""}and decision markdown content.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}


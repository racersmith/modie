/**
 * Self-Recovery Error Envelopes for Model Context Protocol (MCP) Tools.
 * Standardizes machine-readable error codes, actionable diagnostics,
 * and concrete recovery objects guiding model self-correction (RULE-25, RULE-26).
 */

export const McpErrorCode = {
  CRITERIA_INCOMPLETE: "CRITERIA_INCOMPLETE",
  ANCESTRY_VIOLATION: "ANCESTRY_VIOLATION",
  BLAST_RADIUS_BREACH: "BLAST_RADIUS_BREACH",
  ARTIFACT_NOT_FOUND: "ARTIFACT_NOT_FOUND",
  INVALID_PARAMETER: "INVALID_PARAMETER",
  EXECUTION_FAILED: "EXECUTION_FAILED",
} as const;

export type McpErrorCodeType = (typeof McpErrorCode)[keyof typeof McpErrorCode];

export interface McpRecoverySuggestion {
  /**
   * Actionable remediation direction for the agent.
   */
  action: string;

  /**
   * Recommended tool to call for remediation.
   */
  tool: string;

  /**
   * Suggested parameters for the recommended tool call.
   */
  parameters?: Record<string, unknown>;

  /**
   * Human-readable guidance suggestion.
   */
  suggestion?: string;

  /**
   * Unchecked checklist item indices when criteria are incomplete.
   */
  uncheckedItems?: Array<{ item: number; text?: string }>;

  /**
   * Allowed scopes when a boundary breach occurs.
   */
  allowedScopes?: string[];

  /**
   * Valid parameter alternatives when validation fails.
   */
  validAlternatives?: string[];

  [key: string]: unknown;
}

export interface McpErrorPayload {
  isError: true;
  code: McpErrorCodeType | string;
  message: string;
  diagnostic: string;
  recovery: McpRecoverySuggestion;
}

/**
 * Custom error class for MCP tool execution failures with structured self-recovery guidance.
 */
export class McpToolError extends Error {
  readonly isError = true as const;
  readonly code: McpErrorCodeType | string;
  readonly diagnostic: string;
  readonly recovery: McpRecoverySuggestion;

  constructor(options: {
    code: McpErrorCodeType | string;
    message: string;
    diagnostic: string;
    recovery: McpRecoverySuggestion;
  }) {
    super(options.message);
    this.name = "McpToolError";
    this.code = options.code;
    this.diagnostic = options.diagnostic;
    this.recovery = options.recovery;
  }

  toPayload(): McpErrorPayload {
    return {
      isError: true,
      code: this.code,
      message: this.message,
      diagnostic: this.diagnostic,
      recovery: this.recovery,
    };
  }

  static criteriaIncomplete(options: {
    taskId?: string;
    message: string;
    uncheckedItems?: Array<{ item: number; text?: string }>;
  }): McpToolError {
    const taskId = options.taskId ?? "current";
    const uncheckedIndices = options.uncheckedItems?.map((u) => u.item) ?? [];
    return new McpToolError({
      code: McpErrorCode.CRITERIA_INCOMPLETE,
      message: options.message,
      diagnostic:
        "Task acceptance criteria checklist items remain incomplete. All acceptance criteria must be satisfied before task completion or branch merging.",
      recovery: {
        action:
          "Call check_criteria with items to verify remaining acceptance criteria before completing the task.",
        tool: "check_criteria",
        parameters: {
          task_id: taskId !== "current" ? taskId : undefined,
          items: uncheckedIndices.length > 0 ? uncheckedIndices : [1],
        },
        suggestion:
          "Verify remaining acceptance criteria using check_criteria(items=[...]).",
        uncheckedItems: options.uncheckedItems,
      },
    });
  }

  static ancestryViolation(options: {
    message: string;
    ruleId?: string;
    sourceTag?: string;
    targetTag?: string;
    sourceScope?: string;
    targetScope?: string;
  }): McpToolError {
    const isAdrRule = /adr rule scope violation/i.test(options.message);
    const isTaskGovernance = /task governance scope violation/i.test(
      options.message,
    );
    let diagnostic =
      "Rule justification ancestry violation: rules may only be justified by ADRs residing in the rule's directory or an ancestor directory up to the workspace root. Sideways and descendant links are prohibited.";

    if (isAdrRule) {
      diagnostic =
        "ADR rule scope violation: target rules must reside in the ADR's directory or a descendant subtree.";
    } else if (isTaskGovernance) {
      diagnostic =
        "Task governance scope violation: tasks may only cite rules and ADRs residing in the task's directory or an ancestor directory.";
    }

    return new McpToolError({
      code: McpErrorCode.ANCESTRY_VIOLATION,
      message: options.message,
      diagnostic,
      recovery: {
        action:
          "Inspect container hierarchy and governing scopes via task_context before establishing links.",
        tool: "task_context",
        parameters: {},
        suggestion:
          "Ensure source and target artifacts follow spatial hierarchy rules. Inspect enclosing scopes using task_context or ls_better.",
      },
    });
  }

  static blastRadiusBreach(options: {
    message: string;
    targetPath?: string;
    scopeDir?: string;
  }): McpToolError {
    return new McpToolError({
      code: McpErrorCode.BLAST_RADIUS_BREACH,
      message: options.message,
      diagnostic:
        "All task implementation mutations and declared targets must reside strictly at or below the governing task's scope directory. Modifying ancestral or sibling directories violates the task blast radius.",
      recovery: {
        action:
          "Confine mutations strictly within or below the active task's declared scope directory, or author a dedicated task at an ancestor scope.",
        tool: "task_context",
        parameters: {},
        suggestion:
          "Check the active task's declared scope with task_context and confine modifications to that directory.",
      },
    });
  }

  static artifactNotFound(options: {
    message: string;
    identifier?: string;
  }): McpToolError {
    return new McpToolError({
      code: McpErrorCode.ARTIFACT_NOT_FOUND,
      message: options.message,
      diagnostic:
        "The requested artifact tag or identifier could not be resolved in the workspace filesystem or active artifact registry.",
      recovery: {
        action:
          "Verify valid artifact tags using read_artifact, or inspect active tasks via modie://tasks/ready.",
        tool: "read_artifact",
        parameters: options.identifier ? { tag: options.identifier } : {},
        suggestion:
          "Verify the artifact identifier (e.g. 'RULE-<id>', 'TASK-<id>'). Use modie://tasks/ready to discover ready tasks.",
      },
    });
  }

  static invalidParameter(options: {
    message: string;
    parameter?: string;
    validAlternatives?: string[];
    tool?: string;
    suggestedParameters?: Record<string, unknown>;
  }): McpToolError {
    return new McpToolError({
      code: McpErrorCode.INVALID_PARAMETER,
      message: options.message,
      diagnostic:
        "One or more arguments provided to the tool failed schema validation or logical consistency checks.",
      recovery: {
        action:
          "Correct the tool arguments according to the tool input schema.",
        tool: options.tool ?? "task_context",
        parameters: options.suggestedParameters,
        validAlternatives: options.validAlternatives,
        suggestion: "Inspect the tool's inputSchema and pass valid parameters.",
      },
    });
  }
}

/**
 * Converts any caught error into a standardized model-recoverable McpErrorPayload.
 */
export function toMcpErrorPayload(
  error: unknown,
  context: { toolName?: string; args?: Record<string, unknown> } = {},
): McpErrorPayload {
  if (error instanceof McpToolError) {
    return error.toPayload();
  }

  const rawMessage =
    error && typeof error === "object" && "message" in error
      ? String((error as any).message)
      : String(error ?? "Unknown execution error");

  const toolName = context.toolName ?? "task_context";
  const args = context.args ?? {};

  // 1. Check for acceptance criteria incomplete (RULE-21, RULE-22)
  if (
    /incomplete acceptance criteria|acceptance criteria remain unchecked|no acceptance criteria checklist items/i.test(
      rawMessage,
    )
  ) {
    const taskIdMatch = rawMessage.match(
      /(?:task\s+["']?(?:TASK-)?([a-zA-Z0-9_-]+)|TASK-([a-zA-Z0-9_-]+))/i,
    );
    const taskId =
      taskIdMatch?.[1] ??
      taskIdMatch?.[2] ??
      (args.task_id as string | undefined);

    // Extract unchecked indices if formatted as list (e.g. "- [ ] [1] Item" or "- [ ] Item")
    const uncheckedItems: Array<{ item: number; text?: string }> = [];
    const itemMatches = rawMessage.matchAll(/\[(?:item\s+)?(\d+)\]/gi);
    for (const m of itemMatches) {
      const idx = Number.parseInt(m[1]!, 10);
      if (!Number.isNaN(idx) && !uncheckedItems.some((u) => u.item === idx)) {
        uncheckedItems.push({ item: idx });
      }
    }

    return McpToolError.criteriaIncomplete({
      taskId,
      message: rawMessage,
      uncheckedItems: uncheckedItems.length > 0 ? uncheckedItems : undefined,
    }).toPayload();
  }

  // 2. Check for ancestry violations
  if (
    /ancestry violation|rule scope violation|adr scope violation|task governance scope violation|sideways link/i.test(
      rawMessage,
    )
  ) {
    const sourceScopeMatch = rawMessage.match(/scope\s+["']([^"']+)["']/i);
    const sourceScope = sourceScopeMatch?.[1];

    return McpToolError.ancestryViolation({
      message: rawMessage,
      sourceScope,
    }).toPayload();
  }

  // 3. Check for blast radius breach (RULE-6)
  if (
    /downward blast radius|escapes task scope directory|blast radius/i.test(
      rawMessage,
    )
  ) {
    const pathMatch = rawMessage.match(/target path\s+["']([^"']+)["']/i);
    const targetPath = pathMatch?.[1];

    return McpToolError.blastRadiusBreach({
      message: rawMessage,
      targetPath,
    }).toPayload();
  }

  // 4. Check for missing artifact / task not found (RULE-29, RULE-34)
  if (
    /was not found across active or archived|was not found among active tasks|was not found on disk|artifact .* was not found|task .* was not found/i.test(
      rawMessage,
    )
  ) {
    const idMatch = rawMessage.match(
      /(?:Artifact|Task|rule|adr)\s+["']([^"']+)["']/i,
    );
    const identifier = idMatch?.[1];

    return McpToolError.artifactNotFound({
      message: rawMessage,
      identifier,
    }).toPayload();
  }

  // 5. Check for invalid parameter or missing context
  if (
    /no task_id specified|subject artifact target must be specified|no target artifacts specified|invalid item index|unsupported (?:task lifecycle )?action|invalid scope|invalid parameter|validation failed/i.test(
      rawMessage,
    )
  ) {
    return McpToolError.invalidParameter({
      message: rawMessage,
      tool: toolName,
      suggestedParameters: args,
    }).toPayload();
  }

  // 6. Generic execution error
  return {
    isError: true,
    code: McpErrorCode.EXECUTION_FAILED,
    message: rawMessage,
    diagnostic: `Execution failure encountered while executing MCP tool "${toolName}".`,
    recovery: {
      action: "Inspect current task context and parameters using task_context.",
      tool: "task_context",
      parameters: {},
      suggestion: "Verify arguments and repository context before retrying.",
    },
  };
}

/**
 * Standardizes MCP tool execution error responses for the Model Context Protocol.
 * Emits diagnostics to stderr (RULE-27) and returns structured JSON envelope
 * in both `content[0].text` and `structuredContent`.
 */
export function formatMcpToolError(
  error: unknown,
  toolName: string,
  args: Record<string, unknown> = {},
  stderr?: (msg: string) => void,
) {
  const payload = toMcpErrorPayload(error, { toolName, args });
  stderr?.(`[${toolName}] ${payload.code}: ${payload.message}`);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

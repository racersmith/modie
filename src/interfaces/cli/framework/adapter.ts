/**
 * Adapter bridging CLI command arguments to declarative Zod action schemas.
 * Enforces RULE-25 (interface-core decoupling), RULE-26 (token economy), and RULE-27 (stream separation).
 */

import { z } from "zod";
import type {
  CliCommandDefinition,
  CliExecutionContext,
  CliFlagDefinition,
  CliPositionalDefinition,
  DefineCommandOptions,
} from "./types.ts";

/**
 * Converts a string to camelCase (e.g. "force-trunk" -> "forceTrunk").
 */
export function toCamelCase(str: string): string {
  return str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
}

/**
 * Converts a string to kebab-case (e.g. "forceTrunk" -> "force-trunk").
 */
export function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Converts a string to snake_case (e.g. "depends-on" -> "depends_on").
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[- ]([a-z0-9])/gi, "_$1").toLowerCase();
}

/**
 * Inspects a Zod schema to determine its core unwrapped type kind (e.g. "string", "number", "boolean", "array").
 */
export function getZodKind(schema: any): string {
  let curr = schema;
  while (curr) {
    const type = curr._def?.type || curr._def?.typeName || "";
    if (
      type === "default" ||
      type === "optional" ||
      type === "nullable" ||
      type === "ZodDefault" ||
      type === "ZodOptional" ||
      type === "ZodNullable"
    ) {
      curr = curr._def?.innerType ?? (typeof curr.unwrap === "function" ? curr.unwrap() : null);
    } else {
      return type.toLowerCase().replace(/^zod/, "");
    }
  }
  return "";
}

/**
 * Formats a Zod issue into a user-friendly CLI error message.
 */
export function formatZodIssue(
  issue: z.ZodIssue,
  definition: CliCommandDefinition<any, any, any>,
): string {
  const path = issue.path[0];
  const pathStr = typeof path === "string" ? path : "";

  // Check if issue is a missing required field
  const isMissing =
    (issue.code === "invalid_type" &&
      ((issue as any).received === "undefined" ||
        issue.message.includes("received undefined"))) ||
    issue.message === "Required";

  if (isMissing) {
    // If it's a positional argument
    const pos = definition.positionals?.find(
      (p) => (p.property ?? p.name) === pathStr || toCamelCase(p.name) === pathStr,
    );
    if (pos) {
      if (pos.missingError) return pos.missingError;
      const usageHint = definition.usage ? ` Usage: ${definition.usage}` : "";
      return `Missing required ${pos.name}.${usageHint}`;
    }

    // If it's a flag
    const flagName = toKebabCase(pathStr);
    if (flagName === "item") {
      return "Missing required --item flag. Usage: modie task check <id-or-path> --item <index>";
    }
    const usageHint = definition.usage ? ` Usage: ${definition.usage}` : "";
    return `Missing required --${flagName} flag.${usageHint}`;
  }

  if (pathStr === "item") {
    const rawVal = (issue as any).input ?? "";
    return `Invalid item index "${rawVal}". Must be a positive integer (1-based index).`;
  }

  // Custom issue message or default
  return issue.message;
}

/**
 * Maps raw CLI execution context (positionals and flags) into a typed object conforming to a Zod schema.
 */
export function mapContextToSchemaInput(
  definition: CliCommandDefinition<any, any, any>,
  context: CliExecutionContext<any>,
): Record<string, any> {
  const schema = definition.schema;
  if (!schema || !schema.shape) {
    return { ...context.flags };
  }

  const rawInput: Record<string, any> = {};
  const shape = schema.shape;
  const declaredPositionals = definition.positionals ?? [];

  // 1. Map positional arguments
  for (let i = 0; i < declaredPositionals.length; i++) {
    const posDef = declaredPositionals[i]!;
    let targetProp = posDef.property;

    if (!targetProp) {
      // Find matching schema property
      if (shape[posDef.name]) {
        targetProp = posDef.name;
      } else {
        const camel = toCamelCase(posDef.name);
        const snake = toSnakeCase(posDef.name);
        if (shape[camel]) {
          targetProp = camel;
        } else if (shape[snake]) {
          targetProp = snake;
        } else if (posDef.name === "id-or-path" && shape.id) {
          targetProp = "id";
        } else if (posDef.name === "tag-or-identifier" && shape.tag) {
          targetProp = "tag";
        }
      }
    }

    if (targetProp && shape[targetProp]) {
      const val = posDef.variadic
        ? context.positionals.slice(i).join(" ").trim()
        : context.positionals[i]?.trim();

      if (val !== undefined && val !== "") {
        rawInput[targetProp] = val;
      }
    }
  }

  // 2. Map flags into schema properties
  for (const [propName, propSchema] of Object.entries(shape)) {
    // If positional already supplied a value, skip flag mapping unless omitted
    if (rawInput[propName] !== undefined) {
      continue;
    }

    const kind = getZodKind(propSchema);
    const candidates = [
      propName,
      toKebabCase(propName),
      toSnakeCase(propName),
      toCamelCase(propName),
    ];

    // Find any explicit flag definition targeting this property
    let explicitFlagDef: CliFlagDefinition | undefined;
    let explicitFlagName: string | undefined;

    if (definition.flags) {
      for (const [fname, fdef] of Object.entries(definition.flags)) {
        if (fdef.property === propName || candidates.includes(fname)) {
          explicitFlagDef = fdef;
          explicitFlagName = fname;
          if (fdef.aliases) {
            candidates.push(...fdef.aliases);
          }
          break;
        }
      }
    }

    // Special flag naming conventions
    if (propName === "depends_on") {
      candidates.push("depends-on", "depend-on");
    } else if (propName === "links") {
      candidates.push("link", "links");
    } else if (propName === "criteria") {
      candidates.push("criterion", "criteria", "acceptance-criteria");
    } else if (propName === "context") {
      candidates.push("assertion");
    } else if (propName === "keepFile") {
      candidates.push("keep-file", "no-delete");
    } else if (propName === "keepBranch") {
      candidates.push("keep-branch");
    } else if (propName === "noCommit") {
      candidates.push("no-commit");
    }

    const uniqueCandidates = Array.from(new Set(candidates));

    if (kind === "array") {
      // Aggregate values across all matching candidates
      const aggregated: string[] = [];

      for (const cand of uniqueCandidates) {
        const val = context.flags[cand];
        if (val === undefined || val === null) continue;

        const candFlagDef = definition.flags?.[cand];
        const isVerbatim =
          candFlagDef?.splitCommas !== undefined
            ? candFlagDef.splitCommas === false
            : cand === "criterion" || cand === "link" || cand === "depend-on";

        if (Array.isArray(val)) {
          for (const item of val) {
            if (typeof item === "string") {
              if (isVerbatim) {
                aggregated.push(item.trim());
              } else {
                aggregated.push(...item.split(",").map((s) => s.trim()).filter(Boolean));
              }
            }
          }
        } else if (typeof val === "string") {
          if (isVerbatim) {
            aggregated.push(val.trim());
          } else {
            aggregated.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
          }
        }
      }

      if (aggregated.length > 0) {
        rawInput[propName] = aggregated;
      }
    } else if (kind === "boolean") {
      // Find first boolean candidate present
      let boolVal: boolean | undefined;
      for (const cand of candidates) {
        if (context.flags[cand] !== undefined) {
          boolVal = Boolean(context.flags[cand]);
          break;
        }
      }

      if (boolVal !== undefined) {
        rawInput[propName] = boolVal;
      }
    } else {
      // Strings, numbers, and other primitives
      let matchedVal: any = undefined;
      for (const cand of candidates) {
        if (context.flags[cand] !== undefined) {
          matchedVal = context.flags[cand];
          break;
        }
      }

      if (matchedVal !== undefined && matchedVal !== "") {
        rawInput[propName] = matchedVal;
      }
    }
  }

  return rawInput;
}

/**
 * Creates a standard CliCommandDefinition wrapping a Zod action schema and execution handler.
 */
export function defineCommand<
  TSchema extends z.ZodObject<any>,
  TResult = any,
  TFlags = Record<string, any>,
>(
  definition: DefineCommandOptions<TSchema, TResult, TFlags>,
): CliCommandDefinition<TFlags, TResult, TSchema> {
  const fullDefinition: CliCommandDefinition<TFlags, TResult, TSchema> = {
    ...definition,
    run:
      definition.run ??
      (async (context: CliExecutionContext<TFlags>) => {
        const rawInput = mapContextToSchemaInput(fullDefinition, context);
        const parsed = definition.schema.safeParse(rawInput);

        if (!parsed.success) {
          const firstIssue = parsed.error.issues[0];
          const errorMsg = firstIssue
            ? formatZodIssue(firstIssue, fullDefinition)
            : "Invalid command arguments";
          throw new Error(errorMsg);
        }

        return definition.execute(parsed.data, context);
      }),
  };

  return fullDefinition;
}

/**
 * Adapter bridging CLI command arguments to declarative Zod action schemas.
 * Enforces RULE-25 (interface-core decoupling) and RULE-27 (stream separation).
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
 * Converts a string to PascalCase (e.g. "force-trunk" -> "ForceTrunk").
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
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
      curr =
        curr._def?.innerType ??
        (typeof curr.unwrap === "function" ? curr.unwrap() : null);
    } else {
      return type.toLowerCase().replace(/^zod/, "");
    }
  }
  return "";
}

const ZOD_WRAPPER_TYPES = new Set([
  "default",
  "optional",
  "nullable",
  "ZodDefault",
  "ZodOptional",
  "ZodNullable",
]);

const ZOD_PIPE_TYPES = new Set([
  "pipe",
  "ZodPipeline",
  "effects",
  "ZodEffects",
]);

function unwrapZodNext(curr: any, type: string): any {
  if (ZOD_WRAPPER_TYPES.has(type)) {
    return (
      curr._def?.innerType ??
      (typeof curr.unwrap === "function" ? curr.unwrap() : null)
    );
  }
  if (ZOD_PIPE_TYPES.has(type)) {
    return curr._def?.out ?? curr._def?.schema ?? curr._def?.in ?? null;
  }
  return null;
}

/**
 * Extracts the `.describe(...)` string from a Zod schema, unwrapping outer modifiers
 * (`optional`, `default`, `nullable`, `preprocess`/`pipe`) if needed.
 */
export function getZodDescription(schema: any): string | undefined {
  let curr = schema;
  while (curr) {
    const desc = curr.description ?? curr._def?.description;
    if (typeof desc === "string" && desc.length > 0) {
      return desc;
    }
    const type = curr._def?.type || curr._def?.typeName || "";
    curr = unwrapZodNext(curr, type);
  }
  return undefined;
}

function resolvePositionalSchemaProperty(
  posDef: CliPositionalDefinition,
  shape: Record<string, any>,
): string | undefined {
  if (posDef.property && shape[posDef.property]) {
    return posDef.property;
  }
  if (shape[posDef.name]) {
    return posDef.name;
  }
  const camel = toCamelCase(posDef.name);
  const snake = toSnakeCase(posDef.name);
  if (shape[camel]) return camel;
  if (shape[snake]) return snake;
  if (posDef.name === "id-or-path" && shape.id) return "id";
  if (posDef.name === "tag-or-identifier" && shape.tag) return "tag";
  if (posDef.name === "tag-or-path" && shape.tag) return "tag";
  if (posDef.name === "target-or-identifier" && shape.target) return "target";
  return posDef.property;
}

function resolveFlagSchemaProperty(
  flagName: string,
  flagDef: CliFlagDefinition,
  shape: Record<string, any>,
): string | undefined {
  if (flagDef.property && shape[flagDef.property]) {
    return flagDef.property;
  }
  const rawNames = [flagName, ...(flagDef.aliases ?? [])];
  for (const name of rawNames) {
    const candidates = [
      name,
      toCamelCase(name),
      toSnakeCase(name),
      `${name}s`,
      `${toCamelCase(name)}s`,
      `${toSnakeCase(name)}s`,
    ];
    for (const cand of candidates) {
      if (shape[cand]) {
        return cand;
      }
    }
  }
  return flagDef.property;
}

/**
 * Infers missing positional property bindings and descriptions from the command's Zod schema.
 */
export function resolveCommandPositionals(
  positionals: CliPositionalDefinition[] | undefined,
  schema: any,
): CliPositionalDefinition[] | undefined {
  if (!positionals) return undefined;
  const shape: Record<string, any> = schema?.shape ?? {};

  return positionals.map((posDef) => {
    const propName = resolvePositionalSchemaProperty(posDef, shape);
    const propSchema = propName ? shape[propName] : undefined;
    return {
      ...posDef,
      ...(propName && !posDef.property ? { property: propName } : {}),
      description:
        posDef.description ??
        (propSchema ? getZodDescription(propSchema) : undefined) ??
        "",
    };
  });
}

/**
 * Infers missing flag `type`, `multiple`, `property`, and `description` metadata from the
 * command's Zod schema, and automatically synthesizes CLI flags for any schema properties
 * not already covered by declared positionals or flags.
 */
function trackPositionalCoveredProperties(
  positionals?: CliPositionalDefinition[],
  shape?: Record<string, any>,
): Set<string> {
  const covered = new Set<string>();
  if (positionals && shape) {
    for (const posDef of positionals) {
      const propName = resolvePositionalSchemaProperty(posDef, shape);
      if (propName) {
        covered.add(propName);
      }
    }
  }
  return covered;
}

function trackFlagCoveredProperties(
  flagName: string,
  flagDef: CliFlagDefinition,
  propName: string | undefined,
  shape: Record<string, any> | undefined,
  covered: Set<string>,
): void {
  if (propName) covered.add(propName);
  if (!shape) return;
  if (shape[flagName]) covered.add(flagName);
  for (const alias of flagDef.aliases ?? []) {
    if (shape[alias]) covered.add(alias);
    const camelAlias = toCamelCase(alias);
    if (shape[camelAlias]) covered.add(camelAlias);
  }
}

function resolveSingleFlag(
  flagName: string,
  flagDef: CliFlagDefinition,
  propName: string | undefined,
  propSchema: any,
): CliFlagDefinition {
  const kind = propSchema ? getZodKind(propSchema) : undefined;
  const inferredType: "string" | "boolean" =
    kind === "boolean" ? "boolean" : "string";
  const inferredMultiple = kind === "array" ? true : undefined;
  const inferredDescription =
    flagDef.description ??
    (propSchema ? getZodDescription(propSchema) : undefined) ??
    "";

  return {
    ...flagDef,
    type: flagDef.type ?? inferredType,
    ...(flagDef.multiple !== undefined
      ? { multiple: flagDef.multiple }
      : inferredMultiple !== undefined
        ? { multiple: inferredMultiple }
        : {}),
    ...(propName && !flagDef.property ? { property: propName } : {}),
    description: inferredDescription,
  };
}

function synthesizeSchemaFlags(
  shape: Record<string, any>,
  coveredProperties: Set<string>,
  resolvedFlags: Record<string, CliFlagDefinition>,
): void {
  for (const [propName, propSchema] of Object.entries(shape)) {
    if (coveredProperties.has(propName)) {
      continue;
    }
    const flagName = toKebabCase(propName);
    if (resolvedFlags[flagName]) {
      continue;
    }
    const kind = getZodKind(propSchema);
    resolvedFlags[flagName] = {
      type: kind === "boolean" ? "boolean" : "string",
      ...(kind === "array" ? { multiple: true } : {}),
      property: propName,
      description: getZodDescription(propSchema) ?? "",
    };
  }
}

export function resolveCommandFlags(
  declaredFlags: Record<string, CliFlagDefinition> | undefined,
  positionals: CliPositionalDefinition[] | undefined,
  schema: any,
): Record<string, CliFlagDefinition> | undefined {
  const shape: Record<string, any> | undefined = schema?.shape;
  if (!shape && !declaredFlags) {
    return undefined;
  }

  const resolvedFlags: Record<string, CliFlagDefinition> = {};
  const coveredProperties = trackPositionalCoveredProperties(positionals, shape);

  for (const [flagName, flagDef] of Object.entries(declaredFlags ?? {})) {
    const propName = shape
      ? resolveFlagSchemaProperty(flagName, flagDef, shape)
      : flagDef.property;
    const propSchema = propName && shape ? shape[propName] : undefined;

    trackFlagCoveredProperties(flagName, flagDef, propName, shape, coveredProperties);
    resolvedFlags[flagName] = resolveSingleFlag(flagName, flagDef, propName, propSchema);
  }

  if (shape) {
    synthesizeSchemaFlags(shape, coveredProperties, resolvedFlags);
  }

  return resolvedFlags;
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
      (p) =>
        (p.property ?? p.name) === pathStr || toCamelCase(p.name) === pathStr,
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

function mapPositionals(
  positionals: CliPositionalDefinition[],
  positionalArgs: string[],
  shape: Record<string, any>,
  rawInput: Record<string, any>,
): void {
  for (let i = 0; i < positionals.length; i++) {
    const posDef = positionals[i]!;
    const targetProp =
      posDef.property ?? resolvePositionalSchemaProperty(posDef, shape);
    if (!targetProp || !shape[targetProp]) continue;

    const val = posDef.variadic
      ? positionalArgs.slice(i).join(" ").trim()
      : positionalArgs[i]?.trim();

    if (val !== undefined && val !== "") {
      rawInput[targetProp] = val;
    }
  }
}

function getPropertyFlagCandidates(
  propName: string,
  flags: Record<string, CliFlagDefinition> | undefined,
): string[] {
  const candidates = new Set<string>([
    propName,
    toKebabCase(propName),
    toSnakeCase(propName),
    toCamelCase(propName),
  ]);

  if (flags) {
    for (const [fname, fdef] of Object.entries(flags)) {
      if (fdef.property === propName || candidates.has(fname)) {
        candidates.add(fname);
        for (const alias of fdef.aliases ?? []) {
          candidates.add(alias);
        }
      }
    }
  }

  return Array.from(candidates);
}

function extractArrayValue(
  flags: Record<string, any>,
  flagNames: string[],
  allFlags: Record<string, CliFlagDefinition> | undefined,
): string[] | undefined {
  const aggregated: string[] = [];

  for (const name of flagNames) {
    const rawVal = flags[name];
    if (rawVal === undefined || rawVal === null) continue;

    const flagDef = allFlags?.[name];
    const splitCommas = flagDef?.splitCommas ?? true;
    const values = Array.isArray(rawVal) ? rawVal : [rawVal];

    for (const item of values) {
      if (typeof item !== "string") continue;
      if (!splitCommas) {
        aggregated.push(item.trim());
      } else {
        const parts = item
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        aggregated.push(...parts);
      }
    }
  }

  return aggregated.length > 0 ? aggregated : undefined;
}

function extractBooleanValue(
  flags: Record<string, any>,
  flagNames: string[],
): boolean | undefined {
  // Check boolean negation flags (--no-*)
  for (const name of flagNames) {
    const kebab = toKebabCase(name);
    const negationKeys = [
      `no-${kebab}`,
      `no${toPascalCase(name)}`,
      `no_${toSnakeCase(name)}`,
      ...(kebab.startsWith("no-") ? [name, kebab] : []),
    ];
    for (const negKey of negationKeys) {
      if (flags[negKey] === true) {
        return false;
      }
    }
  }

  // Check positive flag presence
  for (const name of flagNames) {
    if (flags[name] !== undefined) {
      return Boolean(flags[name]);
    }
  }

  return undefined;
}

function extractScalarValue(
  flags: Record<string, any>,
  flagNames: string[],
): any {
  for (const name of flagNames) {
    const val = flags[name];
    if (val !== undefined && val !== "") {
      return val;
    }
  }
  return undefined;
}

function mapFlagsToInput(
  definition: CliCommandDefinition<any, any, any>,
  flags: Record<string, any>,
  shape: Record<string, any>,
  rawInput: Record<string, any>,
): void {
  for (const [propName, propSchema] of Object.entries(shape)) {
    if (rawInput[propName] !== undefined) continue;

    const flagNames = getPropertyFlagCandidates(propName, definition.flags);
    const kind = getZodKind(propSchema);

    let val: any;
    if (kind === "array") {
      val = extractArrayValue(flags, flagNames, definition.flags);
    } else if (kind === "boolean") {
      val = extractBooleanValue(flags, flagNames);
    } else {
      val = extractScalarValue(flags, flagNames);
    }

    if (val !== undefined) {
      rawInput[propName] = val;
    }
  }
}

/**
 * Maps raw CLI execution context (positionals and flags) into a typed object conforming to a Zod schema.
 */
export function mapContextToSchemaInput(
  definition: CliCommandDefinition<any, any, any>,
  context: CliExecutionContext<any>,
): Record<string, any> {
  const schema = definition.schema;
  if (!schema?.shape) {
    return { ...context.flags };
  }

  const rawInput: Record<string, any> = {};
  mapPositionals(
    definition.positionals ?? [],
    context.positionals,
    schema.shape,
    rawInput,
  );
  mapFlagsToInput(definition, context.flags, schema.shape, rawInput);
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
  const resolvedPositionals = resolveCommandPositionals(
    definition.positionals,
    definition.schema,
  );
  const resolvedFlags = resolveCommandFlags(
    definition.flags,
    resolvedPositionals,
    definition.schema,
  );

  const fullDefinition: CliCommandDefinition<TFlags, TResult, TSchema> = {
    ...definition,
    positionals: resolvedPositionals,
    flags: resolvedFlags,
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

        (context as any).input = parsed.data;
        return definition.execute(parsed.data, context);
      }),
  };

  return fullDefinition;
}

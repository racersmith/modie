/**
 * Standardized CLI command factory for indexable artifact subtypes.
 * Consumes core domain definitions per RULE-25 and enforces stdout/stderr separation per RULE-27.
 */

import { z } from "zod";
import {
  getArtifactDefinition,
  listActiveArtifacts,
  type ArtifactDefinition,
  type IndexableSubtype,
  type ListedArtifact,
} from "../../../core/index.ts";
import { defineCommand } from "./adapter.ts";
import { renderArtifactListTable } from "./table.ts";
import type {
  CliCommandDefinition,
  CliExecutionContext,
  CliFlagDefinition,
} from "./types.ts";

/**
 * Creates a declarative Zod schema for artifact listing commands.
 */
export function createArtifactListSchema(pluralLabel = "artifacts") {
  return z.object({
    scope: z
      .string()
      .optional()
      .describe(
        `Filter ${pluralLabel} by ancestral scope traversal from target path up to workspace root`,
      ),
  });
}

export const artifactListSchema = createArtifactListSchema();
export type ArtifactListInput = z.infer<typeof artifactListSchema>;

interface SubtypeMetadata {
  singularLabel: string;
  pluralLabel: string;
  headerLabel: string;
  agentGuidance: string;
}

const STANDARD_METADATA: Record<string, SubtypeMetadata> = {
  RULE: {
    singularLabel: "rule",
    pluralLabel: "rules",
    headerLabel: "Active Rules",
    agentGuidance:
      "Call this tool to discover active governance rules across the repository or governing a specific directory scope (honoring ancestral scope traversal per RULE-9).",
  },
  ADR: {
    singularLabel: "ADR",
    pluralLabel: "ADRs",
    headerLabel: "Active ADRs",
    agentGuidance:
      "Call this tool to discover active architectural decision records (ADRs) across the repository or governing a specific directory scope (honoring ancestral scope traversal per RULE-9).",
  },
};

export interface ArtifactListCommandFactoryOptions<
  TSchema extends z.ZodObject<any> = typeof artifactListSchema,
> {
  /** Canonical domain definition for the artifact subtype. */
  definition?: ArtifactDefinition<any, any>;
  /** Subtype tag identifier (e.g. "RULE", "ADR"). */
  subtype?: IndexableSubtype | string;
  /** CLI namespace for command grouping (defaults to subtype.toLowerCase()). */
  namespace?: string;
  /** Unique command identifier (defaults to `${namespace}_list`). */
  id?: string;
  /** Canonical command name (defaults to "list"). */
  name?: string;
  /** Subcommand aliases (defaults to ["ls"]). */
  aliases?: string[];
  /** Short command description. */
  description?: string;
  /** Agent guidance text for tool projection. */
  agentGuidance?: string;
  /** Singular label used in count summaries (e.g. "rule", "ADR"). */
  singularLabel?: string;
  /** Plural label used in summaries and help descriptions (e.g. "rules", "ADRs"). */
  pluralLabel?: string;
  /** Header title for active artifact listings (e.g. "Active Rules", "Active ADRs"). */
  headerLabel?: string;
  /** Table renderer callback for non-JSON output mode. */
  renderTable?: (artifacts: ListedArtifact[]) => string;
  /** Declarative input schema. */
  schema?: TSchema;
  /** Additional or overridden flag definitions. */
  flags?: Record<string, CliFlagDefinition>;
  /** Custom domain execution handler. */
  execute?: (
    input: z.infer<TSchema>,
    context: CliExecutionContext<any>,
  ) => Promise<ListedArtifact[]> | ListedArtifact[];
}

function resolveLabels(
  upperSubtype: string,
  lowerSubtype: string,
  definition?: ArtifactDefinition<any, any>,
  options: Partial<ArtifactListCommandFactoryOptions<any>> = {},
): SubtypeMetadata {
  const standard = STANDARD_METADATA[upperSubtype];

  const singularLabel =
    options.singularLabel ?? standard?.singularLabel ?? lowerSubtype;

  const pluralLabel =
    options.pluralLabel ??
    standard?.pluralLabel ??
    definition?.containerName ??
    `${lowerSubtype}s`;

  const headerLabel =
    options.headerLabel ??
    standard?.headerLabel ??
    `Active ${pluralLabel.charAt(0).toUpperCase() + pluralLabel.slice(1)}`;

  const agentGuidance =
    options.agentGuidance ??
    standard?.agentGuidance ??
    `Call this tool to discover active ${pluralLabel} across the repository or governing a specific directory scope (honoring ancestral scope traversal per RULE-9).`;

  return { singularLabel, pluralLabel, headerLabel, agentGuidance };
}

function extractSubtypeAndDefinition(
  definitionOrSubtypeOrOptions:
    | ArtifactDefinition<any, any>
    | IndexableSubtype
    | string
    | ArtifactListCommandFactoryOptions<any>,
  maybeOptions?: ArtifactListCommandFactoryOptions<any>,
): {
  subtype: string;
  definition?: ArtifactDefinition<any, any>;
  options: ArtifactListCommandFactoryOptions<any>;
} {
  if (typeof definitionOrSubtypeOrOptions === "string") {
    const subtype = definitionOrSubtypeOrOptions;
    const definition = getArtifactDefinition(subtype);
    return { subtype, definition, options: maybeOptions ?? {} };
  }

  if (
    typeof definitionOrSubtypeOrOptions === "object" &&
    "render" in definitionOrSubtypeOrOptions &&
    typeof (definitionOrSubtypeOrOptions as any).render === "function"
  ) {
    const definition =
      definitionOrSubtypeOrOptions as ArtifactDefinition<any, any>;
    return {
      subtype: String(definition.subtype),
      definition,
      options: maybeOptions ?? {},
    };
  }

  const options = definitionOrSubtypeOrOptions as ArtifactListCommandFactoryOptions<any>;
  const definition =
    options.definition ??
    (options.subtype ? getArtifactDefinition(options.subtype) : undefined);
  const subtype = options.subtype ?? (definition ? String(definition.subtype) : "");

  if (!subtype) {
    throw new Error(
      "createArtifactListCommand requires an artifact subtype or ArtifactDefinition",
    );
  }

  return { subtype, definition, options };
}

/**
 * Creates a standardized CliCommandDefinition for listing artifacts of an indexable subtype.
 * Parameterized by artifact subtype or ArtifactDefinition per RULE-25 and RULE-27.
 */
export function createArtifactListCommand<
  TSchema extends z.ZodObject<any> = typeof artifactListSchema,
>(
  definitionOrSubtypeOrOptions:
    | ArtifactDefinition<any, any>
    | IndexableSubtype
    | string
    | ArtifactListCommandFactoryOptions<TSchema>,
  maybeOptions?: ArtifactListCommandFactoryOptions<TSchema>,
): CliCommandDefinition<Record<string, any>, ListedArtifact[], TSchema> {
  const { subtype, definition, options } = extractSubtypeAndDefinition(
    definitionOrSubtypeOrOptions,
    maybeOptions,
  );

  const upperSubtype = subtype.toUpperCase();
  const lowerSubtype = subtype.toLowerCase();

  const { singularLabel, pluralLabel, headerLabel, agentGuidance } =
    resolveLabels(upperSubtype, lowerSubtype, definition, options);

  const namespace = options.namespace ?? lowerSubtype;
  const name = options.name ?? "list";
  const schema = (options.schema ??
    createArtifactListSchema(pluralLabel)) as TSchema;
  const tableRenderer = options.renderTable ?? renderArtifactListTable;

  const flags: Record<string, CliFlagDefinition> = {
    scope: {
      short: "s",
      placeholder: "<path>",
      description: `Filter ${pluralLabel} governing target directory scope via ancestral traversal`,
    },
    ...(options.flags ?? {}),
  };

  return defineCommand({
    id: options.id ?? `${namespace}_${name}`,
    namespace,
    name,
    aliases: options.aliases ?? ["ls"],
    summaryUsage: "[options]",
    usage: `modie ${namespace} ${name} [options]`,
    description: options.description ?? `List active ${upperSubtype} artifacts`,
    agentGuidance,
    helpUsage: `modie ${namespace} ${name} --help`,
    schema,
    positionals: [],
    flags,
    execute:
      options.execute ??
      (async (input: any, context: CliExecutionContext<any>) => {
        return listActiveArtifacts(upperSubtype as IndexableSubtype, {
          cwd: context.cwd,
          scope: input?.scope,
        });
      }),
    render: (artifacts, context, input) => {
      const scope = input?.scope ?? context.flags.scope;
      if (artifacts.length === 0) {
        if (scope) {
          context.stderr(
            `No active ${pluralLabel} found governing scope "${scope}".`,
          );
        } else {
          context.stderr(`No active ${pluralLabel} found in workspace.`);
        }
        return;
      }

      const scopeSummary = scope ? ` governing scope "${scope}"` : "";
      const countLabel = artifacts.length === 1 ? singularLabel : pluralLabel;
      context.stderr(
        `${headerLabel} (${artifacts.length} ${countLabel}${scopeSummary}):\n`,
      );
      context.stderr(tableRenderer(artifacts));
    },
  });
}

export const defineArtifactListCommand = createArtifactListCommand;


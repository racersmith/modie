/**
 * Generic artifact creation pipeline.
 * Coordinates slugging, directory resolution, lifecycle validation,
 * monotonic ID allocation, template rendering, and atomic file writing.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-8, and RULE-25.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  defaultDefinitionRegistry,
  formatArtifactFilename,
  generateSlug,
  parseArtifactFilename,
  parseCanonicalTag,
  resolveArtifactDirectories,
  resolveSubtypeLinkPolicy,
  slugToTitle,
  type ArtifactDefinition,
  type ArtifactLinkRelationship,
  type ArtifactParseContext,
  type BaseCreateArtifactOptions,
  type CreateArtifactResult,
  type IndexableSubtype,
} from "../../domain/index.ts";
import { resolveWorkspaceContext, type WorkspaceContext } from "../context/index.ts";
import { buildArtifactParseContext } from "../../platform/markdown/index.ts";
import { resolveArtifactByTag } from "../query/artifact-query.ts";
import {
  resolveNextArtifactId,
  resolveWatermark,
} from "../traversal/watermark.ts";
import { assertNotZombieTask } from "../task/completion.ts";
import { validateLinkTarget } from "../linking/validator.ts";
import { updateSupersededArtifactFrontmatter } from "./supersession.ts";

/**
 * Validates frontmatter links and task dependencies dynamically driven by declarative
 * definition.linkPolicy (ADR-5, RULE-7, RULE-13, RULE-14, RULE-15, RULE-16, RULE-17, RULE-18, RULE-19).
 */
async function validateArtifactLinks<
  TOptions extends BaseCreateArtifactOptions,
  TArtifact,
>(
  definition: ArtifactDefinition<TOptions, TArtifact>,
  options: TOptions,
  normalizedScopeDir: string,
  ctx: WorkspaceContext,
  cwd: string,
): Promise<void> {
  const policy = resolveSubtypeLinkPolicy(
    definition.subtype as string,
    definition.linkPolicy,
  );
  if (!policy) {
    return;
  }

  const relationships: ArtifactLinkRelationship[] = ["links", "depends_on"];
  for (const rel of relationships) {
    const targets = options[rel];
    if (targets && targets.length > 0) {
      for (const target of targets) {
        await validateLinkTarget(
          definition.subtype,
          normalizedScopeDir,
          rel,
          target,
          {
            cwd,
            workspace: ctx,
            sourceTag: (definition.subtype as string).toUpperCase(),
            policy,
          },
        );
      }
    }
  }
}

/**
 * Creates an artifact of any declared subtype through the standardized pipeline.
 */
export async function createArtifact<
  TOptions extends BaseCreateArtifactOptions,
  TArtifact,
>(
  definition: ArtifactDefinition<TOptions, TArtifact>,
  options: TOptions,
): Promise<CreateArtifactResult<TArtifact>> {
  const ctx = resolveWorkspaceContext(options);
  const cwd = ctx.root;

  // Register subtype on instance registry
  ctx.registry.register(definition);

  if (!options.title || options.title.trim().length === 0) {
    const subtypeDisplay =
      definition.subtype === "ADR"
        ? "ADR"
        : definition.subtype.charAt(0).toUpperCase() +
          definition.subtype.slice(1).toLowerCase();
    throw new Error(`${subtypeDisplay} title must be a non-empty string.`);
  }

  // 1. Generate canonical slug per RULE-1
  const slug = generateSlug(options.title);

  // 2. Resolve directory scope & target placement per RULE-8
  const { normalizedScopeDir, targetDir } = resolveArtifactDirectories(
    definition.subtype as IndexableSubtype,
    options.scopeDir,
    cwd,
  );

  // 3. Declarative link and dependency validation per definition.linkPolicy (ADR-5)
  await validateArtifactLinks(
    definition,
    options,
    normalizedScopeDir,
    ctx,
    cwd,
  );

  // 4. Subtype-specific validation hook (e.g. blast radius)
  if (definition.validate) {
    await definition.validate({
      title: options.title.trim(),
      slug,
      normalizedScopeDir,
      targetDir,
      options,
      cwd,
    });
  }

  // 3.5 Validate supersedes targets and ensure same-subtype constraint
  let normalizedSupersedes: string[] | undefined;
  if (options.supersedes) {
    const supersedesRaw = Array.isArray(options.supersedes)
      ? options.supersedes
      : [options.supersedes];
    const supersedesList = supersedesRaw
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (supersedesList.length > 0) {
      normalizedSupersedes = supersedesList;
    }

    const subtypeDisplay = (definition.subtype as string).toUpperCase();
    const article = subtypeDisplay === "ADR" ? "An" : "A";

    for (const sup of supersedesList) {
      const tagInfo = parseCanonicalTag(sup);
      if (!tagInfo || tagInfo.subtype.toUpperCase() !== subtypeDisplay) {
        throw new Error(
          `Invalid supersedes target: "${sup}". ${article} ${subtypeDisplay} can only supersede other ${subtypeDisplay} artifacts.`,
        );
      }
      await resolveArtifactByTag(sup, {
        cwd,
        subtype: definition.subtype as IndexableSubtype,
        includeArchived: true,
      });
    }
  }

  // 4. Allocate monotonic artifact ID
  let id: string;
  let watermark = undefined;

  if (definition.allocateId) {
    const alloc = await definition.allocateId({
      title: options.title.trim(),
      slug,
      normalizedScopeDir,
      targetDir,
      options,
      cwd,
    });
    if (typeof alloc === "string") {
      id = alloc;
    } else {
      id = alloc.id;
      watermark = alloc.watermark;
    }
  } else if (definition.subtype.toString().toUpperCase() === "TASK") {
    const taskOptions = options as any;
    const wm = await resolveWatermark({
      cwd,
      branch: taskOptions.branch,
      prefix: taskOptions.prefix,
      forceTrunk: taskOptions.forceTrunk,
    });
    id = wm.nextId;
    watermark = wm;
    await assertNotZombieTask(id, cwd);
  } else {
    id = await resolveNextArtifactId(definition.subtype as IndexableSubtype, {
      cwd,
      workspace: ctx,
    });
  }

  // 5. Format canonical filename per RULE-1
  const filename = formatArtifactFilename({
    slug,
    subtype: definition.subtype as IndexableSubtype,
    id,
  });
  const filepath = join(targetDir, filename);

  // 6. Render template into markdown string and structured artifact
  const { markdown, artifact } = definition.render({
    id,
    slug,
    title: options.title.trim(),
    normalizedScopeDir,
    targetDir,
    filepath,
    options,
    cwd,
  });

  // 7. Write artifact file to disk
  await mkdir(targetDir, { recursive: true });
  await writeFile(filepath, markdown, "utf8");

  const tag = `${definition.subtype.toUpperCase()}-${id}`;

  // 8. Update frontmatter of superseded artifacts
  if (options.supersedes) {
    const supersedesRaw = Array.isArray(options.supersedes)
      ? options.supersedes
      : [options.supersedes];
    const supersedesList = supersedesRaw
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    for (const sup of supersedesList) {
      await updateSupersededArtifactFrontmatter(sup, tag, {
        cwd,
        expectedSubtype: definition.subtype,
      });
    }
  }

  return {
    artifact,
    filename,
    filepath,
    relativePath: relative(cwd, filepath),
    markdown,
    id,
    tag,
    watermark,
    supersedes: normalizedSupersedes,
  };
}

export { buildArtifactParseContext } from "../../platform/markdown/index.ts";

/**
 * Parses raw markdown content into a strongly-typed artifact object using the
 * subtype's bidirectional ArtifactDefinition.parse contract.
 */
export function parseArtifact<TArtifact = unknown>(
  definitionOrSubtype:
    ArtifactDefinition<any, TArtifact> | IndexableSubtype | string,
  rawContent: string,
  filePathOrMetadata?:
    | string
    | {
        id?: string;
        slug?: string;
        title?: string;
        filepath?: string;
        filename?: string;
      },
): TArtifact {
  const definition =
    typeof definitionOrSubtype === "string"
      ? (defaultDefinitionRegistry.get(definitionOrSubtype) as
          ArtifactDefinition<any, TArtifact> | undefined)
      : definitionOrSubtype;

  if (!definition || !definition.parse) {
    const subtypeName =
      typeof definitionOrSubtype === "string"
        ? definitionOrSubtype
        : definitionOrSubtype.subtype;
    throw new Error(
      `Artifact subtype "${subtypeName}" does not define a bidirectional parse handler.`,
    );
  }

  const context = buildArtifactParseContext(rawContent, filePathOrMetadata);
  return definition.parse(context);
}

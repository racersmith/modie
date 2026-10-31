/**
 * Generic artifact creation pipeline.
 * Coordinates slugging, directory resolution, lifecycle validation,
 * monotonic ID allocation, template rendering, and atomic file writing.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-8, and RULE-25.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { adrDefinition } from "../adr/definition.ts";
import {
  formatArtifactFilename,
  generateSlug,
  parseArtifactFilename,
  registerArtifactSubtype,
  resolveArtifactDirectories,
} from "../common/index.ts";
import type { IndexableSubtype } from "../common/types.ts";
import {
  parseCanonicalTag,
  resolveArtifactByTag,
} from "../query/artifact-query.ts";
import { parseMarkdownDocument } from "../query/markdown-parser.ts";
import { resolveNextArtifactId } from "../resolver/watermark.ts";
import { ruleDefinition } from "../rule/definition.ts";
import { taskDefinition } from "../task/definition.ts";
import { updateSupersededArtifactFrontmatter } from "./supersession.ts";
import type {
  ArtifactDefinition,
  ArtifactParseContext,
  BaseCreateArtifactOptions,
  CreateArtifactResult,
} from "./types.ts";

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
  const cwd = options.cwd ?? process.cwd();

  // Register subtype with filename grammar and active scanner
  registerArtifactSubtype(definition.subtype);

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

  // 3. Subtype-specific validation hook (e.g. link targets, ancestry, blast radius)
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
  if (options.supersedes) {
    const supersedesRaw = Array.isArray(options.supersedes)
      ? options.supersedes
      : [options.supersedes];
    const supersedesList = supersedesRaw
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

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
    id = alloc.id;
    watermark = alloc.watermark;
  } else {
    id = await resolveNextArtifactId(definition.subtype as IndexableSubtype, {
      cwd,
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
  };
}

/**
 * Resolves the canonical ArtifactDefinition for an indexable subtype ("RULE", "ADR", "TASK").
 */
export function getArtifactDefinition(
  subtype: IndexableSubtype | string,
): ArtifactDefinition<any, any> | undefined {
  const upper = subtype.toUpperCase();
  if (upper === "RULE") return ruleDefinition;
  if (upper === "ADR") return adrDefinition;
  if (upper === "TASK") return taskDefinition;
  return undefined;
}

/**
 * Builds a standardized ArtifactParseContext from raw markdown content and optional path/metadata.
 */
export function buildArtifactParseContext(
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
): ArtifactParseContext {
  const doc = parseMarkdownDocument(rawContent);
  let id = "";
  let slug = "";
  let title = "";
  let filepath: string | undefined;
  let filename: string | undefined;

  if (typeof filePathOrMetadata === "string") {
    filepath = filePathOrMetadata;
    filename = filePathOrMetadata;
    const parsed = parseArtifactFilename(filePathOrMetadata);
    if (parsed) {
      id = parsed.id;
      slug = parsed.slug;
    }
  } else if (filePathOrMetadata) {
    filepath = filePathOrMetadata.filepath;
    filename = filePathOrMetadata.filename ?? filePathOrMetadata.filepath;
    if (filePathOrMetadata.id !== undefined) id = filePathOrMetadata.id;
    if (filePathOrMetadata.slug !== undefined) slug = filePathOrMetadata.slug;
    if (filePathOrMetadata.title !== undefined) title = filePathOrMetadata.title;
    if ((!id || !slug) && filename) {
      const parsed = parseArtifactFilename(filename);
      if (parsed) {
        if (!id) id = parsed.id;
        if (!slug) slug = parsed.slug;
      }
    }
  }

  if (!title && slug) {
    title = slug.replace(/-/g, " ");
  }

  return {
    id,
    slug,
    title,
    filepath,
    filename,
    rawContent,
    frontmatter: doc.frontmatter,
    body: doc.body,
    frontmatterFields: doc.frontmatterFields,
    sections: doc.sections,
  };
}

/**
 * Parses raw markdown content into a strongly-typed artifact object using the
 * subtype's bidirectional ArtifactDefinition.parse contract.
 */
export function parseArtifact<TArtifact = unknown>(
  definitionOrSubtype:
    | ArtifactDefinition<any, TArtifact>
    | IndexableSubtype
    | string,
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
      ? (getArtifactDefinition(definitionOrSubtype) as
          | ArtifactDefinition<any, TArtifact>
          | undefined)
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

/**
 * Generic artifact creation pipeline.
 * Coordinates slugging, directory resolution, lifecycle validation,
 * monotonic ID allocation, template rendering, and atomic file writing.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-8, and RULE-25.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  formatArtifactFilename,
  generateSlug,
  registerArtifactSubtype,
  resolveArtifactDirectories,
} from "../common/index.ts";
import type { IndexableSubtype } from "../common/types.ts";
import { resolveNextArtifactId } from "../resolver/watermark.ts";
import type {
  ArtifactDefinition,
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
    options.useSubtypeContainer ?? true,
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
    id = await resolveNextArtifactId(definition.subtype as IndexableSubtype, { cwd });
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

import {
  parseArtifactFilename,
  slugToTitle,
} from "../common/index.ts";
import {
  parseMarkdownDocument,
  type ArtifactParseContext,
} from "../markdown/index.ts";
import { parseAcceptanceCriteria } from "./checklist.ts";
import { extractTaskSummary } from "./template.ts";
import type { TaskArtifact } from "./types.ts";

/**
 * Reconstructs a strongly-typed TaskArtifact from a standardized ArtifactParseContext.
 */
export function parseTaskFromContext(
  context: ArtifactParseContext,
): TaskArtifact {
  const contextSection =
    context.sections["Context"] ??
    Object.entries(context.sections).find(
      ([k]) => k.toLowerCase() === "context",
    )?.[1];
  const acceptanceCriteria = parseAcceptanceCriteria(context.body);
  const summary =
    context.frontmatterFields.summary ??
    extractTaskSummary(context.rawContent, context.slug);

  return {
    id: context.id,
    slug: context.slug,
    ...(context.title ? { title: context.title } : {}),
    ...(summary ? { summary } : {}),
    depends_on: context.frontmatterFields.depends_on ?? [],
    links: context.frontmatterFields.links,
    contextSection,
    context: contextSection,
    acceptanceCriteria,
    rawContent: context.rawContent,
    filePath: context.filepath,
  };
}

/**
 * Parses task markdown text into a strongly-typed TaskArtifact object.
 */
export function parseTaskMarkdown(
  content: string,
  filePathOrFilename?: string,
): TaskArtifact {
  const doc = parseMarkdownDocument(content);
  let id = "";
  let slug = "";

  if (filePathOrFilename) {
    const parsedFilename = parseArtifactFilename(filePathOrFilename);
    if (parsedFilename && parsedFilename.subtype === "TASK") {
      id = parsedFilename.id;
      slug = parsedFilename.slug;
    }
  }

  return parseTaskFromContext({
    id,
    slug,
    title: slugToTitle(slug),
    filepath: filePathOrFilename,
    filename: filePathOrFilename,
    rawContent: content,
    frontmatter: doc.frontmatter,
    body: doc.body,
    frontmatterFields: doc.frontmatterFields,
    sections: doc.sections,
  });
}

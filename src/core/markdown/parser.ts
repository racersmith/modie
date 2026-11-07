/**
 * Unified Markdown document and ArtifactParseContext compiler.
 * Complies with ADR-1, ADR-2, ADR-4, RULE-1, RULE-25, and RULE-26.
 */

import { parseArtifactFilename, slugToTitle } from "../common/index.ts";
import {
  parseFrontmatterFields,
  splitMarkdownFrontmatter,
  type ParsedFrontmatterFields,
} from "./frontmatter.ts";
import { parseMarkdownSections } from "./sections.ts";

export interface ParsedMarkdownDocument {
  frontmatter: string;
  body: string;
  frontmatterFields: ParsedFrontmatterFields;
  sections: Record<string, string>;
}

export interface ArtifactParseContext {
  id: string;
  slug: string;
  title: string;
  filepath?: string;
  filename?: string;
  rawContent: string;
  frontmatter: string;
  body: string;
  frontmatterFields: ParsedFrontmatterFields;
  sections: Record<string, string>;
}

/**
 * Parses a markdown document into its frontmatter string, body string,
 * parsed frontmatter fields, and level-1 sections map in a single unified pass.
 */
export function parseMarkdownDocument(content: string): ParsedMarkdownDocument {
  const { frontmatter, body } = splitMarkdownFrontmatter(content);
  const frontmatterFields = parseFrontmatterFields(frontmatter);
  const sections = parseMarkdownSections(body);
  return {
    frontmatter,
    body,
    frontmatterFields,
    sections,
  };
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
    if (filePathOrMetadata.title !== undefined)
      title = filePathOrMetadata.title;
    if ((!id || !slug) && filename) {
      const parsed = parseArtifactFilename(filename);
      if (parsed) {
        if (!id) id = parsed.id;
        if (!slug) slug = parsed.slug;
      }
    }
  }

  if (!title) {
    if (doc.sections["Title"]) {
      title = doc.sections["Title"].trim();
    } else if (slug) {
      title = slugToTitle(slug);
    }
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

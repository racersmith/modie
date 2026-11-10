/**
 * Aligned tabular output formatting for CLI presentations.
 * Enforces RULE-25 (interface-core decoupling) and RULE-27 (stdout/stderr stream separation).
 */

import type { ListedArtifact } from "../../../core/index.ts";

export interface TableColumnSpec<T> {
  /** Column header title (e.g. "TAG", "TITLE", "STATUS"). */
  header: string;
  /** Minimum width for the column (defaults to header length). */
  minWidth?: number;
  /** Specific separator dash width for the column (defaults to calculated column width). */
  separatorWidth?: number;
  /** Alignment for column values (defaults to "left"). */
  align?: "left" | "right";
  /** Value extractor returning formatted string for the row item. */
  value: (item: T) => string;
}

/**
 * Formats a list of items into an aligned plaintext table with header, separator, and data rows.
 * Automatically computes column widths to align contents across rows.
 */
export function formatAlignedTable<T>(
  items: T[],
  columns: TableColumnSpec<T>[],
): string {
  if (items.length === 0) {
    return "";
  }

  const widths = columns.map((col) => {
    const min = col.minWidth ?? col.header.length;
    const maxVal = Math.max(0, ...items.map((item) => col.value(item).length));
    return Math.max(min, col.header.length, maxVal);
  });

  const header = columns
    .map((col, i) => {
      const width = widths[i] ?? 0;
      return i === columns.length - 1 ? col.header : col.header.padEnd(width);
    })
    .join("  ");

  const separator = columns
    .map((col, i) => {
      const width = widths[i] ?? 0;
      const sepWidth = col.separatorWidth ?? width;
      return "-".repeat(sepWidth);
    })
    .join("  ");

  const rows = items.map((item) =>
    columns
      .map((col, i) => {
        const val = col.value(item);
        if (i === columns.length - 1) {
          return val;
        }
        const width = widths[i] ?? 0;
        return col.align === "right"
          ? val.padStart(width)
          : val.padEnd(width);
      })
      .join("  "),
  );

  return [header, separator, ...rows].join("\n");
}

/**
 * Standard presentation formatter for listed active artifacts across indexable subtypes.
 * Renders an aligned table with TAG, TITLE, LINKS, and PATH columns.
 */
export function renderArtifactListTable(artifacts: ListedArtifact[]): string {
  return formatAlignedTable(artifacts, [
    { header: "TAG", minWidth: 8, value: (a) => a.tag },
    { header: "TITLE", minWidth: 12, value: (a) => a.title },
    {
      header: "LINKS",
      minWidth: 10,
      value: (a) => (a.links.length > 0 ? a.links.join(", ") : "-"),
    },
    { header: "PATH", separatorWidth: 24, value: (a) => a.relativePath },
  ]);
}

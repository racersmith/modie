/**
 * Shared types for Modie sparks and idea artifacts.
 */

export interface SparkEntry {
  /**
   * Unique handle or short hex token (e.g. "7a1f", "ide").
   * Undefined if not yet minted or assigned.
   */
  handle?: string;

  /**
   * Clean title of the spark (without # or handle).
   */
  title: string;

  /**
   * Multiline body text below the heading (paragraphs, code snippets, lists).
   * Empty string if single-line spark without body.
   */
  body: string;

  /**
   * Exact raw markdown section representation for serialization.
   */
  raw: string;
}

export interface ParsedSparkLedger {
  /**
   * All parsed spark entries in order.
   */
  sparks: SparkEntry[];

  /**
   * Number of sparks lacking a handle requiring lazy minting.
   */
  unmintedCount: number;
}

export interface SparkAddOptions {
  /**
   * Concise title or realization summary.
   */
  title: string;

  /**
   * Optional body paragraphs, code snippets, or sub-bullets.
   */
  body?: string;

  /**
   * Optional custom handle (e.g. "ide", "cli"). If omitted, a random 4-char hex is minted.
   */
  handle?: string;

  /**
   * Target workspace directory (defaults to process.cwd()).
   */
  cwd?: string;
}


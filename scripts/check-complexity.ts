#!/usr/bin/env bun
/**
 * Cyclomatic Complexity & Module Architecture Analyzer for Modie.
 *
 * Scans `src/` (excluding tests) to measure:
 * 1. Function-level Cyclomatic Complexity (McCabe CC) using TypeScript AST.
 * 2. Secondary maintainability smells: line length and parameter count.
 * 3. Cross-module import coupling and mutual circular dependencies (2-cycles).
 *
 * ## Cyclomatic Complexity (CC) Categories
 * Based on McCabe / NIST maintainability thresholds:
 * - 1–10  (Simple / Low Risk): Simply written and easy to maintain; ideal range.
 * - 11–20 (Moderate Risk): Moderately complex; consider refactoring for readability.
 * - 21–49 (High Risk): Difficult to maintain, unnecessarily complicated, error-prone.
 * - 50+   (Extreme Risk): Considered untestable due to extreme complexity.
 *
 * ## CLI Usage
 * ```bash
 * # Run default complexity report (summary table + actionable breakdowns)
 * bun scripts/check-complexity.ts
 *
 * # Specific analysis modes
 * bun scripts/check-complexity.ts cc       # Cyclomatic complexity report (default)
 * bun scripts/check-complexity.ts deps     # Module coupling graph
 * bun scripts/check-complexity.ts cycles   # Mutual module dependency cycles
 * bun scripts/check-complexity.ts all      # Run all checks
 *
 * # Filter by category
 * bun scripts/check-complexity.ts --category=extreme
 * bun scripts/check-complexity.ts --category=high
 * bun scripts/check-complexity.ts --category=moderate
 * bun scripts/check-complexity.ts --category=actionable
 *
 * # CI Gates & Thresholds
 * bun scripts/check-complexity.ts --ci         # Exit code 1 if any function has CC >= 50
 * bun scripts/check-complexity.ts --max-cc=35  # Exit code 1 if any function exceeds CC 35
 * bun scripts/check-complexity.ts --fail-on=high # Exit code 1 on high or extreme
 *
 * # Machine-readable output
 * bun scripts/check-complexity.ts --json
 * ```
 */

import { parseSync } from "oxc-parser";
import { readFileSync } from "node:fs";
import { resolve, relative, join, dirname } from "node:path";
import { Glob } from "bun";

// =============================================================================
// 1. Types & Categorization Constants
// =============================================================================

/**
 * Cyclomatic complexity risk tier.
 */
export type ComplexityTier = "simple" | "moderate" | "high" | "extreme";

/**
 * Metadata and guidance for a cyclomatic complexity category.
 */
export interface ComplexityCategory {
  tier: ComplexityTier;
  label: string;
  min: number;
  max: number;
  rating: string;
  description: string;
  action: string;
  badge: string;
}

/**
 * Standard CC thresholds and descriptions based on McCabe / NIST maintainability guidelines:
 * - 1–10: Simple / low risk, easy to maintain (ideal range).
 * - 11–20: Moderate complexity, refactor for readability when modifying.
 * - 21–49: High risk, difficult to maintain, susceptible to errors.
 * - 50+: Extreme risk, considered untestable due to extreme complexity.
 */
export const COMPLEXITY_CATEGORIES: readonly ComplexityCategory[] = [
  {
    tier: "simple",
    label: "1–10",
    min: 1,
    max: 10,
    rating: "Simple (Low Risk)",
    description:
      "Code is simply written and easy to maintain; ideal range for most functions.",
    action: "Healthy — maintain current structure.",
    badge: "LOW",
  },
  {
    tier: "moderate",
    label: "11–20",
    min: 11,
    max: 20,
    rating: "Moderate Risk",
    description:
      "Code may need refactoring for better readability; moderately complex.",
    action: "Monitor — refactor for readability during feature changes.",
    badge: "MODERATE",
  },
  {
    tier: "high",
    label: "21–49",
    min: 21,
    max: 49,
    rating: "High Risk",
    description:
      "Difficult to maintain, unnecessarily complicated, and susceptible to errors.",
    action:
      "Action Required — decompose into smaller, focused helper functions.",
    badge: "HIGH",
  },
  {
    tier: "extreme",
    label: "50+",
    min: 50,
    max: Infinity,
    rating: "Extreme Risk (Untestable)",
    description:
      "Considered untestable due to extreme complexity; modifications are hazardous.",
    action:
      "Critical Refactor — untestable; decouple control flow immediately.",
    badge: "CRITICAL",
  },
] as const;

/**
 * Metrics recorded for an individual function AST node.
 */
export interface FunctionMetric {
  /** Relative path from `src/`, e.g. `core/task/query.ts` */
  file: string;
  /** Relative path from current working directory for clickable terminal links */
  displayPath: string;
  /** Function or method identifier */
  name: string;
  /** 1-based start line */
  line: number;
  /** 1-based end line */
  endLine: number;
  /** Cyclomatic complexity (McCabe CC) */
  cc: number;
  /** Total lines of code */
  len: number;
  /** Parameter count */
  params: number;
  /** Assigned complexity tier */
  tier: ComplexityTier;
}

/**
 * Parsed CLI execution options.
 */
interface CliOptions {
  mode: "cc" | "deps" | "cycles" | "all";
  category?: ComplexityTier | "actionable";
  allModerate: boolean;
  maxCc?: number;
  failOn?: ComplexityTier;
  ci: boolean;
  json: boolean;
  help: boolean;
}

// =============================================================================
// 2. Terminal Styling & Color Support
// =============================================================================

const useColor =
  !process.env.NO_COLOR &&
  !process.argv.includes("--no-color") &&
  (Boolean(process.stdout.isTTY) || process.argv.includes("--color"));

const c = {
  reset: (s: string | number) => (useColor ? `\x1b[0m${s}\x1b[0m` : String(s)),
  bold: (s: string | number) => (useColor ? `\x1b[1m${s}\x1b[0m` : String(s)),
  dim: (s: string | number) => (useColor ? `\x1b[2m${s}\x1b[0m` : String(s)),
  red: (s: string | number) => (useColor ? `\x1b[31m${s}\x1b[0m` : String(s)),
  green: (s: string | number) => (useColor ? `\x1b[32m${s}\x1b[0m` : String(s)),
  yellow: (s: string | number) =>
    useColor ? `\x1b[33m${s}\x1b[0m` : String(s),
  blue: (s: string | number) => (useColor ? `\x1b[34m${s}\x1b[0m` : String(s)),
  magenta: (s: string | number) =>
    useColor ? `\x1b[35m${s}\x1b[0m` : String(s),
  cyan: (s: string | number) => (useColor ? `\x1b[36m${s}\x1b[0m` : String(s)),
};

// =============================================================================
// 3. CLI Argument Parser
// =============================================================================

function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: "cc",
    allModerate: false,
    ci: false,
    json: false,
    help: false,
  };

  const validTiers: ComplexityTier[] = [
    "simple",
    "moderate",
    "high",
    "extreme",
  ];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (
      arg === "cc" ||
      arg === "deps" ||
      arg === "cycles" ||
      arg === "all"
    ) {
      options.mode = arg;
    } else if (arg === "--ci") {
      options.ci = true;
      options.failOn = "extreme";
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--all-moderate") {
      options.allModerate = true;
    } else if (arg.startsWith("--max-cc=")) {
      const val = parseInt(arg.slice(9), 10);
      if (!Number.isNaN(val)) options.maxCc = val;
    } else if (arg === "--max-cc" && i + 1 < args.length) {
      const val = parseInt(args[++i], 10);
      if (!Number.isNaN(val)) options.maxCc = val;
    } else if (arg.startsWith("--category=")) {
      const cat = arg.slice(11).toLowerCase();
      if (cat === "actionable" || validTiers.includes(cat as ComplexityTier)) {
        options.category = cat as ComplexityTier | "actionable";
      }
    } else if ((arg === "-c" || arg === "--category") && i + 1 < args.length) {
      const cat = args[++i].toLowerCase();
      if (cat === "actionable" || validTiers.includes(cat as ComplexityTier)) {
        options.category = cat as ComplexityTier | "actionable";
      }
    } else if (arg.startsWith("--fail-on=")) {
      const tier = arg.slice(10).toLowerCase();
      if (validTiers.includes(tier as ComplexityTier)) {
        options.failOn = tier as ComplexityTier;
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
${c.bold("Modie Cyclomatic Complexity & Module Coupling Analyzer")}

Scans \`src/\` (excluding tests) to measure function-level cyclomatic complexity,
secondary maintainability smells (length, parameter count), and module cycles.

${c.bold("USAGE:")}
  bun scripts/check-complexity.ts [mode] [flags]

${c.bold("MODES:")}
  ${c.cyan("cc")}        Cyclomatic complexity report (default)
  ${c.cyan("deps")}      Module dependency coupling graph
  ${c.cyan("cycles")}    Mutual module cycle (2-cycle) detector
  ${c.cyan("all")}       Run all complexity and module coupling checks

${c.bold("CC CATEGORIES (McCabe / NIST Thresholds):")}
  ${c.green("1–10")}   Simple / Low Risk     Healthy; ideal range for most functions.
  ${c.yellow("11–20")}  Moderate Risk         Code may need refactoring for readability.
  ${c.red("21–49")}  High Risk             Difficult to maintain, unnecessarily complex.
  ${c.bold(c.red("50+"))}    Extreme (Untestable)  Untestable complexity; urgent refactor target.

${c.bold("FLAGS:")}
  ${c.cyan("-c, --category=<tier>")}  Filter function listing by category:
                         ${c.bold("extreme")} | ${c.bold("high")} | ${c.bold("moderate")} | ${c.bold("simple")} | ${c.bold("actionable")}
  ${c.cyan("--all-moderate")}         Display all moderate risk functions (default shows top 5)
  ${c.cyan("--max-cc=<n>")}           Fail (exit 1) if any function CC exceeds <n>
  ${c.cyan("--fail-on=<tier>")}       Fail (exit 1) if any function is in <tier> or above
  ${c.cyan("--ci")}                   CI guard: fails (exit 1) if any function has CC >= 50
  ${c.cyan("--json")}                 Output machine-readable JSON payload
  ${c.cyan("--no-color")}             Disable ANSI color output
  ${c.cyan("-h, --help")}             Show this help message

${c.bold("EXAMPLES:")}
  bun scripts/check-complexity.ts
  bun scripts/check-complexity.ts --category=high
  bun scripts/check-complexity.ts --ci
  bun scripts/check-complexity.ts --max-cc=35
  bun scripts/check-complexity.ts all
`);
}

// =============================================================================
// 4. AST Analysis & Metric Extraction
// =============================================================================

/**
 * Classifies a cyclomatic complexity score into its corresponding risk tier.
 *
 * Thresholds:
 * - 1–10: Simple
 * - 11–20: Moderate
 * - 21–49: High
 * - 50+: Extreme
 */
export function classifyTier(cc: number): ComplexityTier {
  if (cc <= 10) return "simple";
  if (cc <= 20) return "moderate";
  if (cc < 50) return "high";
  return "extreme";
}

/**
 * Pre-computes 0-based character offsets for the start of every line in the source text.
 */
function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Resolves a 1-based line number for a character offset using binary search.
 */
function getLine(offset: number, lineStarts: number[]): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

/**
 * Resolves a human-readable identifier for a function AST node.
 *
 * Traversal heuristics:
 * 1. Named function declaration/expression (`n.id.name`).
 * 2. Class/object method or property definition (`parent.key.name || parent.key.value`).
 * 3. Assigned variable declaration (`parent.id.name`).
 * 4. Assignment expression target (e.g. `obj.prop = ...`).
 * 5. Call expression context for inline callbacks (e.g. `<cb:array.map>`).
 * 6. Anonymous fallback (`<anon>`).
 */
function fnName(n: any, parent: any, text: string): string {
  if (n.id?.name) return n.id.name;

  if (parent) {
    if (parent.type === "VariableDeclarator" && parent.id?.name) {
      return parent.id.name;
    }
    if (parent.type === "MethodDefinition" && parent.key) {
      return parent.key.name ?? parent.key.value ?? "<method>";
    }
    if (parent.type === "PropertyDefinition" && parent.key) {
      return parent.key.name ?? parent.key.value ?? "<prop>";
    }
    if (parent.type === "Property" && parent.key) {
      return parent.key.name ?? parent.key.value ?? "<prop>";
    }
    if (parent.type === "AssignmentExpression" && parent.left) {
      if (parent.left.start !== undefined && parent.left.end !== undefined) {
        return text.slice(parent.left.start, parent.left.end);
      }
      return "<assign>";
    }
    if (parent.type === "CallExpression") {
      const callee = parent.callee;
      if (callee?.start !== undefined && callee?.end !== undefined) {
        const expr = text
          .slice(callee.start, callee.end)
          .replace(/\s+/g, " ")
          .trim();
        return `<cb:${expr.length > 30 ? expr.slice(0, 27) + "..." : expr}>`;
      }
      return "<cb>";
    }
  }

  return "<anon>";
}

/**
 * Determines whether an ESTree AST node marks a callable function boundary.
 */
function isFn(n: any): boolean {
  if (!n || typeof n !== "object") return false;
  return (
    (n.type === "FunctionDeclaration" ||
      n.type === "FunctionExpression" ||
      n.type === "ArrowFunctionExpression") &&
    Boolean(n.body)
  );
}

/**
 * Computes McCabe Cyclomatic Complexity of a function AST node.
 *
 * Formula:
 *   CC = 1 + (decision points)
 *
 * Decision points counted:
 * - Conditionals & switches: `if`, `?:` (ternary), `case` (excluding `default`)
 * - Loops: `for`, `for..in`, `for..of`, `while`, `do..while`
 * - Error handling: `catch`
 * - Short-circuit boolean operators: `&&`, `||`, `??`
 *
 * Nested function boundaries:
 * Traversal does NOT recurse into nested functions because nested functions
 * represent independent callable units and are counted as separate `FunctionMetric` records.
 */
function complexity(fn: any): number {
  let cc = 1;

  function visit(n: any): void {
    if (!n || typeof n !== "object") return;
    // Nested functions are analyzed independently; skip descending into them.
    if (n !== fn && isFn(n)) return;

    switch (n.type) {
      case "IfStatement":
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
      case "CatchClause":
      case "ConditionalExpression":
        cc++;
        break;
      case "SwitchCase":
        // In ESTree, only non-null test indicates a 'case' clause (null indicates 'default').
        if (n.test !== null && n.test !== undefined) {
          cc++;
        }
        break;
      case "LogicalExpression":
        if (n.operator === "&&" || n.operator === "||" || n.operator === "??") {
          cc++;
        }
        break;
    }

    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const val = n[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && item.type) {
            visit(item);
          }
        }
      } else if (val && typeof val === "object" && val.type) {
        visit(val);
      }
    }
  }

  if (fn.body) {
    visit(fn.body);
  }

  return cc;
}

/**
 * Formats secondary maintainability smell tags (compound complexity).
 */
function formatSmellTags(f: FunctionMetric): string {
  const smells: string[] = [];
  if (f.len >= 200) smells.push(`critical length: ${f.len}L`);
  else if (f.len >= 100) smells.push(`long: ${f.len}L`);

  if (f.params >= 5) smells.push(`high params: ${f.params}`);
  else if (f.params >= 4) smells.push(`params: ${f.params}`);

  return smells.length > 0 ? ` ${c.dim(`[${smells.join(", ")}]`)}` : "";
}

// =============================================================================
// 5. Codebase Scan Execution
// =============================================================================

const root = resolve(import.meta.dir, "../src");
const files = [...new Glob("**/*.ts").scanSync(root)].filter(
  (f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts"),
);

const fns: FunctionMetric[] = [];
const imports: Record<string, Set<string>> = {};

for (const rel of files) {
  const full = join(root, rel);
  const text = readFileSync(full, "utf8");
  const lineStarts = computeLineStarts(text);
  const parsed = parseSync(rel, text);
  imports[rel] = new Set();

  const walk = (n: any, parent: any) => {
    if (!n || typeof n !== "object") return;

    // Collect module imports and exports for coupling & cycle analysis
    if (
      (n.type === "ImportDeclaration" ||
        n.type === "ExportNamedDeclaration" ||
        n.type === "ExportAllDeclaration") &&
      n.source &&
      typeof n.source.value === "string"
    ) {
      imports[rel].add(n.source.value);
    }

    // Collect function metrics
    if (isFn(n)) {
      // For method/property definitions, use the outer definition span for accurate start line
      const spanNode =
        parent?.type === "MethodDefinition" ||
        parent?.type === "PropertyDefinition"
          ? parent
          : n;
      const start = getLine(spanNode.start, lineStarts);
      const end = getLine(spanNode.end, lineStarts);
      const cc = complexity(n);
      const displayPath = relative(process.cwd(), full);

      fns.push({
        file: rel,
        displayPath,
        name: fnName(n, parent, text),
        line: start,
        endLine: end,
        cc,
        len: end - start + 1,
        params: n.params?.length ?? 0,
        tier: classifyTier(cc),
      });
    }

    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const val = n[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && item.type) {
            walk(item, n);
          }
        }
      } else if (val && typeof val === "object" && val.type) {
        walk(val, n);
      }
    }
  };

  walk(parsed.program, null);
}

// =============================================================================
// 6. Actionable Reporting
// =============================================================================

const options = parseCliArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

// Sort all functions by cyclomatic complexity descending
fns.sort((a, b) => b.cc - a.cc);

const extremeFns = fns.filter((f) => f.tier === "extreme");
const highFns = fns.filter((f) => f.tier === "high");
const moderateFns = fns.filter((f) => f.tier === "moderate");
const simpleFns = fns.filter((f) => f.tier === "simple");

const actionableCount = extremeFns.length + highFns.length;
const actionablePercent = ((actionableCount / fns.length) * 100).toFixed(1);
const healthyPercent = (
  ((simpleFns.length + moderateFns.length) / fns.length) *
  100
).toFixed(1);

// JSON Machine-Readable Mode
if (options.json) {
  const jsonReport = {
    summary: {
      totalFunctions: fns.length,
      analyzedFiles: files.length,
      actionableCount,
      actionablePercent: Number(actionablePercent),
      healthyPercent: Number(healthyPercent),
    },
    distribution: {
      simple: {
        range: "1–10",
        count: simpleFns.length,
        percent: Number(((simpleFns.length / fns.length) * 100).toFixed(1)),
      },
      moderate: {
        range: "11–20",
        count: moderateFns.length,
        percent: Number(((moderateFns.length / fns.length) * 100).toFixed(1)),
      },
      high: {
        range: "21–49",
        count: highFns.length,
        percent: Number(((highFns.length / fns.length) * 100).toFixed(1)),
      },
      extreme: {
        range: "50+",
        count: extremeFns.length,
        percent: Number(((extremeFns.length / fns.length) * 100).toFixed(1)),
      },
    },
    functions: {
      extreme: extremeFns,
      high: highFns,
      moderate: options.allModerate ? moderateFns : moderateFns.slice(0, 10),
      simpleCount: simpleFns.length,
    },
    longest: fns
      .slice()
      .sort((a, b) => b.len - a.len)
      .slice(0, 10),
  };

  console.log(JSON.stringify(jsonReport, null, 2));
  evaluateExitGates(options, fns, extremeFns, highFns);
  process.exit(0);
}

// Human-Readable Complexity Report
if (options.mode === "cc" || options.mode === "all") {
  printComplexityDistribution();

  const filter = options.category;

  if (!filter || filter === "actionable" || filter === "extreme") {
    printTierSection(
      "Extreme Risk (CC 50+)",
      "🔴",
      c.bold(
        c.red(
          "Critical Priority — Considered untestable; decouple control flow immediately",
        ),
      ),
      extremeFns,
    );
  }

  if (!filter || filter === "actionable" || filter === "high") {
    printTierSection(
      "High Risk (CC 21–49)",
      "🟠",
      c.yellow(
        "High Priority — Difficult to maintain; prioritize decomposing into helper functions",
      ),
      highFns,
    );
  }

  if (filter === "moderate" || options.allModerate) {
    printTierSection(
      "Moderate Risk (CC 11–20)",
      "🟡",
      c.cyan(
        "Moderate Priority — Review for readability when modifying these files",
      ),
      moderateFns,
    );
  } else if (!filter || filter === "actionable") {
    // Show concise preview of moderate functions
    const previewCount = Math.min(5, moderateFns.length);
    printTierSection(
      `Moderate Risk (CC 11–20) — Preview (Top ${previewCount} of ${moderateFns.length})`,
      "🟡",
      c.dim(
        `Run with --category=moderate or --all-moderate to see all ${moderateFns.length} functions`,
      ),
      moderateFns.slice(0, previewCount),
    );
  }

  if (filter === "simple") {
    printTierSection(
      "Simple (CC 1–10)",
      "🟢",
      c.green("Low Risk — Simply written and easy to maintain; ideal range"),
      simpleFns.slice(0, 20),
    );
    if (simpleFns.length > 20) {
      console.log(
        c.dim(
          `  ... and ${simpleFns.length - 20} more functions within ideal range.`,
        ),
      );
    }
  }

  printLongestFunctions();
  printActionableGuidance();
}

// Module Coupling & Dependency Cycles
if (
  options.mode === "deps" ||
  options.mode === "cycles" ||
  options.mode === "all"
) {
  analyzeCouplingAndCycles(options.mode);
}

// Check CI Thresholds and Exit Codes
evaluateExitGates(options, fns, extremeFns, highFns);

// =============================================================================
// 7. Output Helper Functions
// =============================================================================

/**
 * Prints the executive complexity distribution table.
 */
function printComplexityDistribution(): void {
  console.log(`\n${c.bold("=== Cyclomatic Complexity Distribution ===")}`);
  console.log(
    c.dim(
      `Analyzed ${fns.length} functions across ${files.length} non-test files in \`src/\`.\n`,
    ),
  );

  console.log(
    c.bold("Tier            CC Range    Count     Share   Status & Guidance"),
  );
  console.log(c.dim("─".repeat(82)));

  const rows = [
    {
      name: "Simple",
      range: "1–10",
      count: simpleFns.length,
      pct: ((simpleFns.length / fns.length) * 100).toFixed(1),
      status: c.green("🟢 Healthy (ideal range for most functions)"),
    },
    {
      name: "Moderate",
      range: "11–20",
      count: moderateFns.length,
      pct: ((moderateFns.length / fns.length) * 100).toFixed(1),
      status: c.cyan("🟡 Monitor (refactor for readability when touched)"),
    },
    {
      name: "High Risk",
      range: "21–49",
      count: highFns.length,
      pct: ((highFns.length / fns.length) * 100).toFixed(1),
      status: c.yellow("🟠 Action Required (decompose complex branching)"),
    },
    {
      name: "Extreme Risk",
      range: "50+",
      count: extremeFns.length,
      pct: ((extremeFns.length / fns.length) * 100).toFixed(1),
      status: c.bold(
        c.red("🔴 Critical (untestable; urgent refactoring needed)"),
      ),
    },
  ];

  for (const r of rows) {
    const nameCol = r.name.padEnd(14);
    const rangeCol = r.range.padStart(6);
    const countCol = String(r.count).padStart(8);
    const pctCol = `${r.pct}%`.padStart(9);
    console.log(
      `${nameCol}  ${rangeCol}  ${countCol}  ${pctCol}   ${r.status}`,
    );
  }

  console.log(c.dim("─".repeat(82)));
  console.log(
    `Summary: ${c.bold(`${healthyPercent}%`)} of functions are healthy/moderate (CC ≤ 20). ` +
      `${c.bold(c.yellow(`${actionableCount} functions (${actionablePercent}%)`))} require attention.\n`,
  );
}

/**
 * Prints a categorized list of functions belonging to a specific tier.
 */
function printTierSection(
  title: string,
  icon: string,
  guidance: string,
  list: FunctionMetric[],
): void {
  console.log(`\n${c.bold(`=== ${icon} ${title} (${list.length}) ===`)}`);
  console.log(guidance);

  if (list.length === 0) {
    console.log(c.dim("  None found — excellent!"));
    return;
  }

  console.log(c.dim("\n  CC   Lines  Params  Location & Symbol"));
  console.log(c.dim("  " + "─".repeat(78)));

  for (const f of list) {
    const ccStr = String(f.cc).padStart(4);
    const lenStr = `${f.len}L`.padStart(6);
    const paramsStr = String(f.params).padStart(7);
    const loc = `${f.displayPath}:${f.line}`;
    const smells = formatSmellTags(f);

    console.log(
      `  ${c.bold(ccStr)}  ${lenStr}  ${paramsStr}  ${loc} ${c.bold(f.name)}${smells}`,
    );
  }
}

/**
 * Prints the longest functions across the codebase.
 */
function printLongestFunctions(): void {
  const longest = fns
    .slice()
    .sort((a, b) => b.len - a.len)
    .slice(0, 10);

  console.log(`\n${c.bold("=== 📏 Longest Functions (Top 10) ===")}`);
  console.log(c.dim("  Lines    CC  Params  Location & Symbol"));
  console.log(c.dim("  " + "─".repeat(78)));

  for (const f of longest) {
    const lenStr = `${f.len}L`.padStart(7);
    const ccStr = String(f.cc).padStart(5);
    const paramsStr = String(f.params).padStart(7);
    const loc = `${f.displayPath}:${f.line}`;
    console.log(
      `  ${c.bold(lenStr)}  ${ccStr}  ${paramsStr}  ${loc} ${f.name}`,
    );
  }
}

/**
 * Prints actionable next steps and refactoring guidance based on the findings.
 */
function printActionableGuidance(): void {
  console.log(`\n${c.bold("=== 💡 Actionable Next Steps ===")}`);

  if (extremeFns.length > 0) {
    console.log(
      `1. ${c.bold(c.red("Urgent Refactor Target (CC >= 50):"))}\n` +
        `   • ${extremeFns[0].name} (CC ${extremeFns[0].cc}, ${extremeFns[0].len}L) in ${c.cyan(extremeFns[0].displayPath)}:${extremeFns[0].line}\n` +
        `     Current complexity exceeds untestable threshold. Decompose into dedicated sub-handlers.`,
    );
  }

  if (highFns.length > 0) {
    const compoundSmells = highFns.filter((f) => f.len >= 150 || f.params >= 4);
    console.log(
      `\n2. ${c.bold(c.yellow("High-Priority Compound Smells (High CC + Large Scope):"))}`,
    );
    for (const f of compoundSmells.slice(0, 3)) {
      console.log(
        `   • ${c.bold(f.name)} (CC ${f.cc}, ${f.len}L, ${f.params} params) at ${c.cyan(f.displayPath)}:${f.line}`,
      );
    }
    console.log(
      c.dim(
        "     Decompose high-branching functions before adding new features or governance rules.",
      ),
    );
  }

  console.log(
    `\n3. ${c.bold("CI & Automated Governance:")}\n` +
      `   • Use ${c.cyan("bun scripts/check-complexity.ts --ci")} to fail builds on untestable functions (CC >= 50).\n` +
      `   • Use ${c.cyan("bun scripts/check-complexity.ts --max-cc=35")} to enforce a strict CC ceiling.\n` +
      `   • Use ${c.cyan("bun scripts/check-complexity.ts --category=high")} to isolate high-risk functions.`,
  );
}

/**
 * Evaluates configured CI gates and thresholds, exiting with code 1 if violated.
 */
function evaluateExitGates(
  opts: CliOptions,
  allFns: FunctionMetric[],
  extremeList: FunctionMetric[],
  highList: FunctionMetric[],
): void {
  if (opts.maxCc !== undefined) {
    const violations = allFns.filter((f) => f.cc > opts.maxCc!);
    if (violations.length > 0) {
      console.error(
        `\n${c.bold(c.red("✖ CI FAILURE:"))} ${violations.length} function(s) exceeded max CC threshold of ${opts.maxCc}:`,
      );
      for (const v of violations.slice(0, 5)) {
        console.error(`  - CC ${v.cc}: ${v.displayPath}:${v.line} ${v.name}`);
      }
      process.exit(1);
    }
  }

  if (opts.failOn === "extreme" && extremeList.length > 0) {
    console.error(
      `\n${c.bold(c.red("✖ CI FAILURE:"))} ${extremeList.length} function(s) in Extreme Risk tier (CC >= 50):`,
    );
    for (const v of extremeList) {
      console.error(`  - CC ${v.cc}: ${v.displayPath}:${v.line} ${v.name}`);
    }
    process.exit(1);
  }

  if (
    opts.failOn === "high" &&
    (extremeList.length > 0 || highList.length > 0)
  ) {
    const total = extremeList.length + highList.length;
    console.error(
      `\n${c.bold(c.red("✖ CI FAILURE:"))} ${total} function(s) in High or Extreme Risk tier (CC >= 21):`,
    );
    for (const v of [...extremeList, ...highList].slice(0, 10)) {
      console.error(`  - CC ${v.cc}: ${v.displayPath}:${v.line} ${v.name}`);
    }
    process.exit(1);
  }
}

/**
 * Analyzes module coupling and detects mutual 2-cycles between architectural modules.
 */
function analyzeCouplingAndCycles(mode: "deps" | "cycles" | "all"): void {
  const modOf = (rel: string): string => {
    const parts = rel.split("/");
    if (parts.length <= 1) {
      return parts[0]; // e.g. "index.ts"
    }
    if (parts[0] === "core") {
      return `core/${parts[1]}`;
    }
    return parts.slice(0, Math.min(3, parts.length - 1)).join("/");
  };

  const edges: Record<string, Record<string, number>> = {};
  for (const [rel, specs] of Object.entries(imports)) {
    const from = modOf(rel);
    for (const s of specs) {
      let target: string | null = null;
      if (s.startsWith(".")) {
        target = relative(root, resolve(join(root, dirname(rel)), s));
      } else if (s.startsWith("@core/")) {
        target = "core/" + s.slice(6);
      } else if (s.startsWith("@interfaces/")) {
        target = "interfaces/" + s.slice(12);
      } else {
        (edges[from] ??= {})["ext:" + s] =
          ((edges[from] ??= {})["ext:" + s] ?? 0) + 1;
        continue;
      }
      const to = modOf(target.endsWith(".ts") ? target : target + "/x.ts");
      if (to === from) continue;
      (edges[from] ??= {})[to] = (edges[from][to] ?? 0) + 1;
    }
  }

  if (mode === "deps" || mode === "all") {
    console.log(`\n${c.bold("=== Module Coupling Graph ===")}`);
    for (const [from, tos] of Object.entries(edges).sort()) {
      console.log(
        c.bold(from),
        c.dim("->"),
        Object.entries(tos)
          .map(([t, cnt]) => `${t}${c.dim(`(${cnt})`)}`)
          .join(", "),
      );
    }
  }

  // Detect mutual 2-cycles (A imports B and B imports A)
  const mutualPairs = new Set<string>();
  for (const [from, tos] of Object.entries(edges)) {
    if (from.startsWith("ext:")) continue;
    for (const to of Object.keys(tos)) {
      if (to.startsWith("ext:")) continue;
      if (edges[to]?.[from]) {
        const pairKey = [from, to].sort().join(" <-> ");
        mutualPairs.add(pairKey);
      }
    }
  }

  if (mode === "cycles" || mode === "all") {
    if (mutualPairs.size > 0) {
      console.log(`\n${c.bold("=== ⚠ Mutual Module Cycles (2-Cycles) ===")}`);
      for (const pair of sorted(mutualPairs)) {
        console.log(`  ${c.yellow("⚠")} ${pair}`);
      }
    } else {
      console.log(`\n${c.green("✓ No mutual module cycles detected.")}`);
    }
  }
}

function sorted(set: Set<string>): string[] {
  return Array.from(set).sort();
}

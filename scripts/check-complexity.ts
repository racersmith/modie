#!/usr/bin/env bun
/**
 * Cyclomatic complexity and module dependency analyzer for Modie.
 * Scans `src/` (excluding tests) to measure function-level cyclomatic complexity,
 * parameter counts, line lengths, and cross-module import coupling.
 */

import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve, relative, join, dirname } from "node:path";
import { Glob } from "bun";

const root = resolve(import.meta.dir, "../src");
const files = [...new Glob("**/*.ts").scanSync(root)].filter(
  (f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts"),
);

interface FunctionMetric {
  file: string;
  name: string;
  line: number;
  cc: number;
  len: number;
  params: number;
}

const fns: FunctionMetric[] = [];
const imports: Record<string, Set<string>> = {};

function fnName(n: ts.Node): string {
  const anyN = n as any;
  if (anyN.name && ts.isIdentifier(anyN.name)) return anyN.name.text;
  if (anyN.name) return anyN.name.getText();
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p)) return p.name.getText();
  if (p && ts.isPropertyAssignment(p)) return p.name.getText();
  if (p && ts.isCallExpression(p))
    return `<cb:${p.expression.getText().slice(0, 30)}>`;
  return "<anon>";
}

const isFn = (n: ts.Node) =>
  ts.isFunctionDeclaration(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isArrowFunction(n) ||
  ts.isFunctionExpression(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessor(n);

function complexity(fn: ts.Node): number {
  let cc = 1;
  const visit = (n: ts.Node) => {
    if (n !== fn && isFn(n)) return; // nested functions are counted separately
    switch (n.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.CaseClause:
        cc++;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = (n as ts.BinaryExpression).operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          cc++;
        }
        break;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return cc;
}

for (const rel of files) {
  const full = join(root, rel);
  const sf = ts.createSourceFile(
    full,
    readFileSync(full, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  imports[rel] = new Set();

  const walk = (n: ts.Node) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier
    ) {
      imports[rel].add((n.moduleSpecifier as ts.StringLiteral).text);
    }
    if (isFn(n)) {
      const start = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      const end = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
      fns.push({
        file: rel,
        name: fnName(n),
        line: start,
        cc: complexity(n),
        len: end - start + 1,
        params: (n as any).parameters?.length ?? 0,
      });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

const mode = process.argv[2] ?? "cc";

if (mode === "cc" || mode === "all") {
  fns.sort((a, b) => b.cc - a.cc);
  console.log("=== Cyclomatic Complexity (Top 35) ===");
  for (const f of fns.slice(0, 35)) {
    console.log(
      `${String(f.cc).padStart(3)} (len: ${String(f.len).padStart(3)}L, params: ${f.params})  ${f.file}:${f.line} ${f.name}`,
    );
  }
  /*
    1–10: This code is simply written and is easy to maintain. This is the ideal range for most functions.
    11–20: Code may need refactoring for better readability; this score is considered moderately complex.
    21+: Possibly difficult to maintain, unnecessarily complicated, and more susceptible to errors.
    50+: Considered untestable due to extreme complexity, making modifications or debugging complicated.
  */

  const dist = { "1-5": 0, "6-10": 0, "11-20": 0, ">20": 0 };
  for (const f of fns) {
    if (f.cc <= 5) dist["1-5"]++;
    else if (f.cc <= 10) dist["6-10"]++;
    else if (f.cc <= 20) dist["11-20"]++;
    else dist[">20"]++;
  }
  console.log(`\nDistribution across ${fns.length} functions:`, dist);

  fns.sort((a, b) => b.len - a.len);
  console.log("\n=== Longest Functions (Top 10) ===");
  for (const f of fns.slice(0, 10)) {
    console.log(
      `${String(f.len).padStart(4)}L  cc=${String(f.cc).padStart(2)}  ${f.file}:${f.line} ${f.name}`,
    );
  }
}

if (mode === "deps" || mode === "cycles" || mode === "all") {
  const modOf = (rel: string) => {
    const parts = rel.split("/");
    return parts[0] === "core"
      ? `core/${parts[1]}`
      : parts.slice(0, Math.min(3, parts.length - 1)).join("/");
  };

  const edges: Record<string, Record<string, number>> = {};
  for (const [rel, specs] of Object.entries(imports)) {
    const from = modOf(rel);
    for (const s of specs) {
      let target: string | null = null;
      if (s.startsWith("."))
        target = relative(root, resolve(join(root, dirname(rel)), s));
      else if (s.startsWith("@core/")) target = "core/" + s.slice(6);
      else if (s.startsWith("@interfaces/"))
        target = "interfaces/" + s.slice(12);
      else {
        (edges[from] ??= {})["ext:" + s] =
          ((edges[from] ??= {})["ext:" + s] ?? 0) + 1;
        continue;
      }
      const to = modOf(target.endsWith(".ts") ? target : target + "/x.ts");
      if (to === from) continue;
      (edges[from] ??= {})[to] = (edges[from][to] ?? 0) + 1;
    }
  }

  console.log("\n=== Module Coupling Graph ===");
  for (const [from, tos] of Object.entries(edges).sort()) {
    console.log(
      from,
      "->",
      Object.entries(tos)
        .map(([t, c]) => `${t}(${c})`)
        .join(", "),
    );
  }

  // Detect mutual 2-cycles
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

  if (mutualPairs.size > 0) {
    console.log("\n=== Mutual Module Cycles (2-Cycles) ===");
    for (const pair of sorted(mutualPairs)) {
      console.log(`  ⚠ ${pair}`);
    }
  } else {
    console.log("\nNo mutual module cycles detected.");
  }
}

function sorted(set: Set<string>): string[] {
  return Array.from(set).sort();
}

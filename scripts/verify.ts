#!/usr/bin/env bun
import { $ } from "bun";

const CHECKS = {
  types: { name: "Typecheck", cmd: "bun check" },
  test: { name: "Tests", cmd: "bun test --parallel --dots" },
  complexity: {
    name: "Complexity",
    cmd: "bun ./scripts/check-complexity.ts --ci",
  },
  circular: {
    name: "Circular",
    cmd: "bunx dpdm --no-warning --no-tree --exit-code circular:1 ./src/",
  },
  knip: {
    name: "Knip",
    cmd: "bun knip",
  },
  plugin: {
    name: "Plugin",
    cmd: "bun ./scripts/validate-plugin.ts",
  },
  duplication: {
    name: "Duplication",
    cmd: "bun run check:duplication",
    optional: true,
  },
} as const;

type CheckId = keyof typeof CHECKS;

const ALIASES: Record<string, CheckId> = {
  exports: "knip",
};

const args = process.argv.slice(2);
const failFast = args.includes("--fail-fast") || args.includes("-f");
const verbose = args.includes("--verbose") || args.includes("-v");
const rawTargets = args.filter((a) => !a.startsWith("-"));
const targets = rawTargets.map((t) => (t in ALIASES ? ALIASES[t] : t)) as (
  | CheckId
  | "all"
)[];

const keys: CheckId[] =
  targets.length > 0 && !targets.includes("all")
    ? (targets.filter((k) => k in CHECKS) as CheckId[])
    : (Object.keys(CHECKS) as CheckId[]).filter(
        (k) => targets.includes("all") || !CHECKS[k].optional,
      );

if (keys.length === 0) {
  console.error(
    `Unknown target. Available: ${Object.keys(CHECKS).join(", ")}, all`,
  );
  process.exit(1);
}

console.log(`\n🔍 Verifying: ${keys.join(", ")}\n`);
const startTime = performance.now();
const failures: { name: string; output: string }[] = [];

for (const key of keys) {
  const { name, cmd } = CHECKS[key];
  const t0 = performance.now();
  const res = await $`${{ raw: cmd }}`.quiet().nothrow();
  const ms = Math.round(performance.now() - t0);

  if (res.exitCode === 0) {
    console.log(`  ✓ ${name.padEnd(14)} passed (${ms}ms)`);
    if (verbose) console.log(res.text() || res.stderr.toString());
  } else {
    console.log(`  ✗ ${name.padEnd(14)} FAILED (${ms}ms)`);
    const output = [res.stderr.toString(), res.stdout.toString()]
      .filter(Boolean)
      .join("\n")
      .trim();
    failures.push({ name, output });
    if (failFast) break;
  }
}

if (failures.length > 0) {
  console.log("\n" + "=".repeat(60) + "\n❌ FAILURES\n" + "=".repeat(60));
  for (const { name, output } of failures) {
    console.log(`\n--- ${name} ---\n${output}\n`);
  }
}

const totalSec = ((performance.now() - startTime) / 1000).toFixed(2);
console.log("-".repeat(40));
if (failures.length === 0) {
  console.log(`✨ All ${keys.length} checks passed! (${totalSec}s)\n`);
} else {
  console.log(
    `❌ ${failures.length} of ${keys.length} checks failed. (${totalSec}s)\n`,
  );
}

process.exit(failures.length === 0 ? 0 : 1);

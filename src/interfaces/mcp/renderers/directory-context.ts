/**
 * Architectural Directory Context Markdown Renderer.
 * Implements RULE-25 and RULE-26.
 */

import type { CompiledContextResult } from "../../../core/index.ts";

/**
 * Renders on-demand architectural directory context in either 'summary' or 'detailed' mode.
 * Enforces token economy per RULE-26.
 */
export function renderDirectoryContext(
  result: CompiledContextResult,
  mode: "summary" | "detailed" = "summary",
): string {
  const lines: string[] = [
    `# Directory Context: ${result.scope}`,
    "",
    `- **Scope**: \`${result.scope}\``,
    `- **Ancestral Chain**: ${result.ancestralScopes.map((s) => `\`${s}\``).join(" -> ")}`,
  ];

  if (mode === "summary") {
    if (result.motives.length > 0 && result.motives[0]) {
      const nearest = result.motives[0];
      lines.push(
        "",
        `## Motive (\`${nearest.scope}\`)`,
        "",
        nearest.content,
      );
    }

    lines.push("", `## Governing Rules (${result.rules.length})`);
    if (result.rules.length === 0) {
      lines.push("", "_No governing rules in scope._");
    } else {
      lines.push("");
      for (const r of result.rules) {
        lines.push(`- **${r.tag}** (\`${r.scope}\`): ${r.title}`);
      }
    }

    lines.push("", `## Child Directory Motives (${result.childMotives.length})`);
    if (result.childMotives.length === 0) {
      lines.push("", "_No child directory motives._");
    } else {
      lines.push("");
      for (const cm of result.childMotives) {
        lines.push(`- **\`${cm.name}/\`** (\`${cm.scope}\`): ${cm.content}`);
      }
    }
  } else {
    lines.push("", `## Upward Motives (${result.motives.length})`);
    if (result.motives.length === 0) {
      lines.push("", "_No motives defined in ancestral chain._");
    } else {
      for (const m of result.motives) {
        lines.push(
          "",
          `### Scope \`${m.scope}\` (\`${m.relativePath}\`)`,
          "",
          m.content,
        );
      }
    }

    lines.push("", `## Governing Rules (${result.rules.length})`);
    if (result.rules.length === 0) {
      lines.push("", "_No governing rules in scope._");
    } else {
      lines.push("");
      for (const r of result.rules) {
        lines.push(`- **${r.tag}** (\`${r.scope}\` — ${r.title}): ${r.body}`);
      }
    }

    lines.push("", `## Architectural Decisions (${result.adrs.length})`);
    if (result.adrs.length === 0) {
      lines.push("", "_No active ADRs in ancestral chain._");
    } else {
      lines.push("");
      for (const a of result.adrs) {
        lines.push(`- **${a.tag}** (\`${a.scope}\` — ${a.title}): ${a.summary}`);
      }
    }

    lines.push("", `## Child Directory Motives (${result.childMotives.length})`);
    if (result.childMotives.length === 0) {
      lines.push("", "_No child directory motives._");
    } else {
      lines.push("");
      for (const cm of result.childMotives) {
        lines.push(`- **\`${cm.name}/\`** (\`${cm.scope}\`): ${cm.content}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

---
summary: Enforce rule verification across polyglot codebases using a language-agnostic regex scanner matching rule tags in test headers and code annotations.
links:
  - ADR-4
  - RULE-3
  - RULE-11
  - RULE-23
---

# Context

`RULE` artifacts define falsifiable system laws that the codebase must adhere to (RULE-3). However, without an automated, language-agnostic mechanism connecting English rule documents to concrete source code and test suites, rules risk becoming "honor-system" documentation that decays silently during refactors.

Polyglot codebases use dozens of programming languages and test frameworks (Jest, Vitest, PyTest, Cargo test, Go test, JUnit). Building language-specific AST plugins for every compiler is brittle and unsustainable.

# Alternatives Considered

- **Language-Specific AST Plugins:** Writing dedicated compiler plugins or linters for TypeScript, Rust, Python, etc. Unmaintainable across polyglot systems.
- **External Test Mapping Manifests (JSON/YAML):** Maintaining a separate file mapping test names to rule IDs. Prone to synchronization rot whenever tests are renamed or relocated.
- **Strict Docstring Annotations Only (`@verifies` in comments):** Clean, but fails to capture idiomatic test naming conventions in BDD/TDD frameworks where developers naturally describe behaviors in test title strings (`it('[RULE-XX] should...')`).

# Decision

We adopt a **Universal Regex-Based Verification Scanner** supporting both comment annotations and test description headers:

1. **Tagging Formats:**
   - **Test Description Headers:** `it('[RULE-XX] description', ...)` or `test("[RULE-XX] description", ...)`
   - **Comment Annotations:** `// @verifies RULE-XX`, `# @verifies RULE-XX`, `/* @satisfies RULE-XX */`
   - **Idiomatic Test Function Names:** `fn test_rule_xx_behavior()` or `def test_rule_xx():`

2. **Universal Multi-Language Scanner:**
   - The Modie linter uses a fast pattern matcher scanning for `\bRULE-\d+\b` within test directories and implementation files.
   - Requires zero language-specific plugins or runtime AST integration.

3. **Verification Gap Reporting:**
   - `modie lint --rules` matches all active `RULE` documents against code and test occurrences.
   - Any rule lacking at least one matching `@verifies` tag or `[RULE-XX]` test header is reported as an actionable **Rule Verification Gap**.

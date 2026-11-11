import { describe, expect, it } from "bun:test";
import {
  formatRejectedSpark,
  generateRandomHexHandle,
  lazyMintSparks,
  parseSparkLedger,
  resolveIdeaPath,
  resolveIdeasDir,
  resolveRejectedIdeaPath,
  resolveRejectedSparksPath,
  resolveSparksPath,
  serializeSpark,
  serializeSparkLedger,
} from "./index.ts";

describe("Spark Domain Primitives (RULE-38)", () => {
  describe("Path Resolution", () => {
    it("should resolve paths relative to root workspace", () => {
      const cwd = "/workspace/project";
      expect(resolveIdeasDir(cwd)).toBe("/workspace/project/.modie/ideas");
      expect(resolveSparksPath(cwd)).toBe(
        "/workspace/project/.modie/ideas/SPARKS.md",
      );
      expect(resolveRejectedSparksPath(cwd)).toBe(
        "/workspace/project/.modie/ideas/.rejected/SPARKS.md",
      );
      expect(resolveIdeaPath("my-concept", cwd)).toBe(
        "/workspace/project/.modie/ideas/my-concept.IDEA.md",
      );
      expect(resolveRejectedIdeaPath("my-concept", cwd)).toBe(
        "/workspace/project/.modie/ideas/.rejected/my-concept.IDEA.md",
      );
    });
  });

  describe("Parser: parseSparkLedger", () => {
    it("should return empty list when given empty content", () => {
      const result = parseSparkLedger("");
      expect(result.sparks).toEqual([]);
      expect(result.unmintedCount).toBe(0);
    });

    it("should parse heading without handle as unminted", () => {
      const content = "# Clickable links in editor\nWhat if we added links?";
      const result = parseSparkLedger(content);

      expect(result.sparks.length).toBe(1);
      expect(result.unmintedCount).toBe(1);
      expect(result.sparks[0]?.handle).toBeUndefined();
      expect(result.sparks[0]?.title).toBe("Clickable links in editor");
      expect(result.sparks[0]?.body).toBe("What if we added links?");
    });

    it("should parse custom handle e.g. [ide] or [NEXT]", () => {
      const content =
        "# [ide] Clickable links in editor\nWhat if we added links?";
      const result = parseSparkLedger(content);

      expect(result.sparks.length).toBe(1);
      expect(result.unmintedCount).toBe(0);
      expect(result.sparks[0]?.handle).toBe("ide");
      expect(result.sparks[0]?.title).toBe("Clickable links in editor");
      expect(result.sparks[0]?.body).toBe("What if we added links?");
    });

    it("should parse 4-character hex handle [7a1f]", () => {
      const content = "# [7a1f] Clickable links\nDescription here.";
      const result = parseSparkLedger(content);

      expect(result.sparks.length).toBe(1);
      expect(result.unmintedCount).toBe(0);
      expect(result.sparks[0]?.handle).toBe("7a1f");
      expect(result.sparks[0]?.title).toBe("Clickable links");
      expect(result.sparks[0]?.body).toBe("Description here.");
    });

    it("should handle multiple sparks in single document", () => {
      const content = [
        "# First Spark",
        "Body of first spark.",
        "",
        "# [2b4c] Second Spark",
        "Body of second spark.",
        "",
        "# Third Spark",
      ].join("\n");

      const result = parseSparkLedger(content);
      expect(result.sparks.length).toBe(3);
      expect(result.unmintedCount).toBe(2);

      expect(result.sparks[0]?.handle).toBeUndefined();
      expect(result.sparks[0]?.title).toBe("First Spark");
      expect(result.sparks[0]?.body).toBe("Body of first spark.");

      expect(result.sparks[1]?.handle).toBe("2b4c");
      expect(result.sparks[1]?.title).toBe("Second Spark");
      expect(result.sparks[1]?.body).toBe("Body of second spark.");

      expect(result.sparks[2]?.handle).toBeUndefined();
      expect(result.sparks[2]?.title).toBe("Third Spark");
      expect(result.sparks[2]?.body).toBe("");
    });

    it("should be code-fence aware and not split on comments inside ``` code blocks", () => {
      const content = [
        "# Python Tooling Idea",
        "Here is a snippet:",
        "```python",
        "# This is a python comment",
        "def main():",
        "    pass",
        "```",
        "End of explanation.",
        "",
        "# Next Spark",
        "Another spark here.",
      ].join("\n");

      const result = parseSparkLedger(content);
      expect(result.sparks.length).toBe(2);

      const first = result.sparks[0];
      expect(first?.title).toBe("Python Tooling Idea");
      expect(first?.body).toContain("# This is a python comment");
      expect(first?.body).toContain("def main():");
      expect(first?.body).toContain("End of explanation.");

      const second = result.sparks[1];
      expect(second?.title).toBe("Next Spark");
      expect(second?.body).toBe("Another spark here.");
    });
  });

  describe("Handle Generation & Lazy Minting", () => {
    it("should generate a 4-character hex handle that avoids collisions", () => {
      const existing = new Set(["0001", "0002", "abcd"]);
      const handle = generateRandomHexHandle(existing);

      expect(handle).toMatch(/^[a-f0-9]{4}$/);
      expect(existing.has(handle)).toBe(false);
    });

    it("should lazily mint handles for untagged sparks and preserve tagged ones", () => {
      const content = [
        "# [custom] Existing Spark",
        "Body 1",
        "",
        "# Unminted Spark One",
        "Body 2",
        "",
        "# Unminted Spark Two",
        "Body 3",
      ].join("\n");

      const parsed = parseSparkLedger(content);
      expect(parsed.unmintedCount).toBe(2);

      const { ledger, mintedCount } = lazyMintSparks(parsed);
      expect(mintedCount).toBe(2);
      expect(ledger.unmintedCount).toBe(0);

      // Custom handle preserved
      expect(ledger.sparks[0]?.handle).toBe("custom");
      expect(ledger.sparks[0]?.title).toBe("Existing Spark");

      // Newly minted handles
      const handle1 = ledger.sparks[1]?.handle;
      const handle2 = ledger.sparks[2]?.handle;

      expect(handle1).toMatch(/^[a-f0-9]{4}$/);
      expect(handle2).toMatch(/^[a-f0-9]{4}$/);
      expect(handle1).not.toBe(handle2);
      expect(handle1).not.toBe("custom");
    });

    it("should do nothing when all sparks already have handles", () => {
      const content = "# [a1b2] Done\nBody";
      const parsed = parseSparkLedger(content);
      const { ledger, mintedCount } = lazyMintSparks(parsed);

      expect(mintedCount).toBe(0);
      expect(ledger.unmintedCount).toBe(0);
      expect(ledger.sparks[0]?.handle).toBe("a1b2");
    });
  });

  describe("Serialization & Rejection Formatting", () => {
    it("should serialize a single spark with or without body", () => {
      const withBody = serializeSpark({
        handle: "7a1f",
        title: "My Idea",
        body: "First line.\nSecond line.",
        raw: "",
      });
      expect(withBody).toBe("# [7a1f] My Idea\nFirst line.\nSecond line.");

      const withoutBody = serializeSpark({
        handle: "7a1f",
        title: "My Idea",
        body: "",
        raw: "",
      });
      expect(withoutBody).toBe("# [7a1f] My Idea");
    });

    it("should serialize an entire ledger separated by double newlines", () => {
      const sparks = [
        { handle: "1111", title: "One", body: "Body 1", raw: "" },
        { handle: "2222", title: "Two", body: "Body 2", raw: "" },
      ];
      const serialized = serializeSparkLedger(sparks);
      expect(serialized).toBe(
        "# [1111] One\nBody 1\n\n# [2222] Two\nBody 2\n",
      );
    });

    it("should format rejected spark with immediate blockquote callout", () => {
      const spark = {
        handle: "7a1f",
        title: "Old Feature Idea",
        body: "Detailed description here.",
        raw: "",
      };

      const rejected = formatRejectedSpark(
        spark,
        "Conflicts with plain-text DAG",
        "2026-11-11",
      );

      expect(rejected).toBe(
        [
          "# [7a1f] Old Feature Idea",
          "> **Rejected (2026-11-11):** Conflicts with plain-text DAG",
          "",
          "Detailed description here.",
          "",
        ].join("\n"),
      );
    });
  });
});


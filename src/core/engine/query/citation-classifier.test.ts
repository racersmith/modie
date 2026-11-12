/**
 * Isolated unit tests for pure citation classifier and rule verification disambiguation.
 * Implements RULE-23, RULE-31 and RULE-35.
 * @verifies RULE-23, RULE-31, RULE-35
 */

import { describe, expect, it } from "bun:test";
import { formatArtifactTag } from "../../domain/index.ts";
import {
  classifyCitation,
  isTestVerificationCitation,
  type GovernanceArtifactCache,
  type GovernanceArtifactData,
} from "./citation-classifier.ts";
import { buildLinksTo } from "./references.ts";

describe("Citation Classifier & Invariant Verification (RULE-23, RULE-31, RULE-35)", () => {
  it("[RULE-35] should return null when target tag is not present or boundary check fails", () => {
    const targetTag = formatArtifactTag("RULE", 901);
    const longerTag = `${targetTag}9`;

    // No tag match
    expect(
      classifyCitation(
        { relPath: "src/file.ts", line: 10, snippet: "const foo = 123;" },
        targetTag,
      ),
    ).toBeNull();

    // Boundary check: tag is part of a longer identifier
    expect(
      classifyCitation(
        {
          relPath: "src/file.ts",
          line: 10,
          snippet: `const identifier = "${longerTag}";`,
        },
        targetTag,
      ),
    ).toBeNull();
  });

  it("[RULE-35] should classify code citations in standard source files", () => {
    const targetTag = formatArtifactTag("RULE", 902);
    const match = {
      relPath: "src/domain/service.ts",
      line: 42,
      snippet: `// Implements ${targetTag} governance`,
    };

    const item = classifyCitation(match, targetTag);
    expect(item).not.toBeNull();
    expect(item?.type).toBe("code");
    expect(item?.relativePath).toBe("src/domain/service.ts");
    expect(item?.line).toBe(42);
    expect(item?.snippet).toBe(`// Implements ${targetTag} governance`);
  });

  it("[RULE-35] should classify documentation citations in general markdown and text documents", () => {
    const targetTag = formatArtifactTag("ADR", 903);
    const match = {
      relPath: "docs/architecture.md",
      line: 12,
      snippet: `Consult ${targetTag} for decisions.`,
    };

    const item = classifyCitation(match, targetTag);
    expect(item).not.toBeNull();
    expect(item?.type).toBe("documentation");
    expect(item?.relativePath).toBe("docs/architecture.md");
    expect(item?.line).toBe(12);
  });

  it("[RULE-23][RULE-35] should classify formal test verification citations in test files", () => {
    const targetTag = formatArtifactTag("RULE", 904);

    // Comment annotation format: @verifies TAG
    const commentMatch = {
      relPath: "src/test/suite.test.ts",
      line: 5,
      snippet: `// @verifies ${targetTag}`,
    };
    const commentItem = classifyCitation(commentMatch, targetTag);
    expect(commentItem?.type).toBe("test");

    // Standardized bracketed header format: "[TAG] should ..."
    const bracketMatch = {
      relPath: "src/test/suite.test.ts",
      line: 10,
      snippet: `it("[${targetTag}] should pass", () => {});`,
    };
    const bracketItem = classifyCitation(bracketMatch, targetTag);
    expect(bracketItem?.type).toBe("test");

    // Suite declaration format: describe("...(TAG)...")
    const suiteMatch = {
      relPath: "src/test/suite.spec.ts",
      line: 15,
      snippet: `describe("Suite (${targetTag})", () => {});`,
    };
    const suiteItem = classifyCitation(suiteMatch, targetTag);
    expect(suiteItem?.type).toBe("test");
  });

  it("[RULE-23][RULE-35] should reject incidental test body data citations as unverified occurrences", () => {
    const targetTag = formatArtifactTag("RULE", 905);
    const incidentalMatch = {
      relPath: "src/test/suite.test.ts",
      line: 25,
      snippet: `expect(tag).toBe("${targetTag}");`,
    };

    expect(classifyCitation(incidentalMatch, targetTag)).toBeNull();
  });

  it("[RULE-31][RULE-35] should classify active governance links as blocking archival", () => {
    const targetTag = formatArtifactTag("ADR", 906);
    const citingTag = formatArtifactTag("RULE", 907);

    const cache: GovernanceArtifactCache = new Map();
    const govData: GovernanceArtifactData = {
      parsedArtifact: {
        tag: citingTag,
        subtype: "RULE",
        id: "907",
        slug: "citing-rule",
        filename: `citing-rule.${citingTag}.md`,
        isArchived: false,
      },
      linkLines: new Map([[3, "links"]]),
      frontmatterEndLine: 5,
      isSupersedingSuccessor: false,
    };
    cache.set("rules/citing-rule.md", govData);

    const match = {
      relPath: "rules/citing-rule.md",
      line: 3,
      snippet: `  - ${targetTag}`,
    };

    const item = classifyCitation(match, targetTag, cache);
    expect(item).not.toBeNull();
    expect(item?.type).toBe("governance-link");
    expect(item?.sourceTag).toBe(citingTag);
    expect(item?.relationship).toBe("links");
    expect(item?.isArchived).toBe(false);
    expect(item?.isBlocking).toBe(true);
  });

  it("[RULE-31][RULE-35] should classify archived governance links as non-blocking archival", () => {
    const targetTag = formatArtifactTag("ADR", 908);
    const citingTag = formatArtifactTag("RULE", 909);

    const cache: GovernanceArtifactCache = new Map();
    const govData: GovernanceArtifactData = {
      parsedArtifact: {
        tag: citingTag,
        subtype: "RULE",
        id: "909",
        slug: "archived-rule",
        filename: `archived-rule.${citingTag}.ARCHIVED.md`,
        isArchived: true,
      },
      linkLines: new Map([[3, "links"]]),
      frontmatterEndLine: 5,
      isSupersedingSuccessor: false,
    };
    cache.set("rules/archived-rule.md", govData);

    const match = {
      relPath: "rules/archived-rule.md",
      line: 3,
      snippet: `  - ${targetTag}`,
    };

    const item = classifyCitation(match, targetTag, cache);
    expect(item?.type).toBe("governance-link");
    expect(item?.isArchived).toBe(true);
    expect(item?.isBlocking).toBe(false);
  });

  it("[RULE-31][RULE-35] should classify superseding successor relationships as non-blocking", () => {
    const targetTag = formatArtifactTag("ADR", 910);
    const successorTag = formatArtifactTag("ADR", 911);

    const cache: GovernanceArtifactCache = new Map();
    const govData: GovernanceArtifactData = {
      parsedArtifact: {
        tag: successorTag,
        subtype: "ADR",
        id: "911",
        slug: "successor-adr",
        filename: `successor-adr.${successorTag}.md`,
        isArchived: false,
      },
      linkLines: new Map([[3, "supersedes"]]),
      frontmatterEndLine: 5,
      isSupersedingSuccessor: true,
    };
    cache.set("adrs/successor.md", govData);

    const match = {
      relPath: "adrs/successor.md",
      line: 3,
      snippet: `  - ${targetTag}`,
    };

    const item = classifyCitation(match, targetTag, cache);
    expect(item?.type).toBe("governance-link");
    expect(item?.isBlocking).toBe(false);
  });

  it("[RULE-35] should classify governance document body citations as governance-prose", () => {
    const targetTag = formatArtifactTag("ADR", 912);
    const citingTag = formatArtifactTag("RULE", 913);

    const cache: GovernanceArtifactCache = new Map();
    const govData: GovernanceArtifactData = {
      parsedArtifact: {
        tag: citingTag,
        subtype: "RULE",
        id: "913",
        slug: "citing-rule",
        filename: `citing-rule.${citingTag}.md`,
        isArchived: false,
      },
      linkLines: new Map([[3, "links"]]),
      frontmatterEndLine: 5,
      isSupersedingSuccessor: false,
    };
    cache.set("rules/citing-rule.md", govData);

    const match = {
      relPath: "rules/citing-rule.md",
      line: 12,
      snippet: `As decided in ${targetTag}, we decouple interfaces.`,
    };

    const item = classifyCitation(match, targetTag, cache);
    expect(item).not.toBeNull();
    expect(item?.type).toBe("governance-prose");
    expect(item?.sourceTag).toBe(citingTag);
    expect(item?.isBlocking).toBe(false);
  });
});

describe("buildLinksTo Pure Extraction (RULE-35)", () => {
  it("[RULE-35] should extract and deduplicate all outbound links, dependencies, and supersessions", () => {
    const adrTag = formatArtifactTag("ADR", 920);
    const ruleTag = formatArtifactTag("RULE", 921);
    const taskTag1 = formatArtifactTag("TASK", 922);
    const taskTag2 = formatArtifactTag("TASK", 923);
    const successorTag = formatArtifactTag("ADR", 924);

    const rawContent = `---
links:
  - ${adrTag}
  - ${ruleTag}
superseded_by:
  - ${successorTag}
---
# Document
`;

    const linksTo = buildLinksTo({
      links: [adrTag, ruleTag, adrTag],
      depends_on: [taskTag1, taskTag2.replace("TASK-", "")],
      supersedes: [adrTag],
      rawContent,
    });

    expect(linksTo.adrs).toEqual([adrTag]);
    expect(linksTo.rules).toEqual([ruleTag]);
    expect(linksTo.tasks).toContain(taskTag1);
    expect(linksTo.tasks).toContain(taskTag2);
    expect(linksTo.supersedes).toEqual([adrTag]);
    expect(linksTo.superseded_by).toBe(successorTag);
    expect(linksTo.total).toBe(6);
  });
});

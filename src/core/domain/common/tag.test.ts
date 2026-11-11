/**
 * Unit tests for canonical tag grammar and subtype normalization helpers.
 * @verifies RULE-1, RULE-25, RULE-35, ADR-1, ADR-2
 */

import { describe, expect, it } from "bun:test";
import { makeTestTag } from "../../platform/testing/index.ts";
import {
  asArtifactSubtype,
  asArtifactTag,
  formatArtifactTag,
  isValidArtifactTag,
  parseCanonicalTag,
} from "./tag.ts";

describe("Tag Grammar & Normalization (RULE-1, RULE-25, RULE-35)", () => {
  it("[RULE-1] should normalize strings to uppercase branded subtype", () => {
    expect(asArtifactSubtype("rule")).toBe("RULE" as any);
    expect(asArtifactSubtype(" ADR ")).toBe("ADR" as any);
    expect(asArtifactSubtype("task")).toBe("TASK" as any);
  });

  it("[RULE-1][RULE-35] should normalize strings to uppercase branded artifact tag", () => {
    const rule1Tag = makeTestTag("RULE", 1);
    const adr42Tag = makeTestTag("ADR", 42);
    const taskSubTag = makeTestTag("TASK", "2-1");

    expect(asArtifactTag(rule1Tag.toLowerCase())).toBe(rule1Tag as any);
    expect(asArtifactTag(` ${adr42Tag.toLowerCase()} `)).toBe(adr42Tag as any);
    expect(asArtifactTag(taskSubTag.toLowerCase())).toBe(taskSubTag as any);
  });

  it("[RULE-1][RULE-35] should format canonical artifact tag from components", () => {
    const rule1Tag = makeTestTag("RULE", 1);
    const adr6Tag = makeTestTag("ADR", 6);
    const taskSubTag = makeTestTag("TASK", "250-1");

    expect(formatArtifactTag("rule", 1)).toBe(rule1Tag as any);
    expect(formatArtifactTag("ADR", "6")).toBe(adr6Tag as any);
    expect(formatArtifactTag("task", "250-1")).toBe(taskSubTag as any);
  });

  it("[RULE-1][RULE-35] should parse valid canonical tags", () => {
    const rule1Tag = makeTestTag("RULE", 1);
    const adr42Tag = makeTestTag("ADR", 42);
    const taskSubTag = makeTestTag("TASK", "250-1");

    expect(parseCanonicalTag(rule1Tag)).toEqual({
      subtype: "RULE" as any,
      id: "1",
      tag: rule1Tag as any,
    });
    expect(parseCanonicalTag(adr42Tag.toLowerCase())).toEqual({
      subtype: "ADR" as any,
      id: "42",
      tag: adr42Tag as any,
    });
    expect(parseCanonicalTag(taskSubTag.toLowerCase())).toEqual({
      subtype: "TASK" as any,
      id: "250-1",
      tag: taskSubTag as any,
    });
  });

  it("[RULE-1] should reject invalid tags and return null", () => {
    expect(parseCanonicalTag("INVALID")).toBeNull();
    expect(parseCanonicalTag("RULE-")).toBeNull();
    expect(parseCanonicalTag("-42")).toBeNull();
    expect(parseCanonicalTag("MOTIVE")).toBeNull();
    expect(parseCanonicalTag("")).toBeNull();
  });

  it("[RULE-1][RULE-35] should check tag validity with isValidArtifactTag", () => {
    const rule1Tag = makeTestTag("RULE", 1);
    const taskSubTag = makeTestTag("TASK", "7-1");
    const adr10Tag = makeTestTag("ADR", 10);

    expect(isValidArtifactTag(rule1Tag)).toBe(true);
    expect(isValidArtifactTag(taskSubTag.toLowerCase())).toBe(true);
    expect(isValidArtifactTag(adr10Tag.toLowerCase())).toBe(true);
    expect(isValidArtifactTag("invalid")).toBe(false);
    expect(isValidArtifactTag("")).toBe(false);
  });
});

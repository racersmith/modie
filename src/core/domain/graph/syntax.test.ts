/**
 * Unit tests for pure tag and link syntax predicates.
 * Verifies RULE-13, RULE-14, RULE-15, RULE-18, and RULE-34.
 * @verifies RULE-13, RULE-14, RULE-15, RULE-18, RULE-34
 */

import { describe, expect, it } from "bun:test";
import {
  ADR_LINK_TAG_REGEX,
  GOVERNANCE_LINK_TAG_REGEX,
  TASK_DEPENDENCY_TAG_REGEX,
  isValidAdrLinkTag,
  isValidGovernanceLinkTag,
  isValidTaskDependencyTag,
} from "./syntax.ts";

describe("Link & Dependency Syntax Predicates (RULE-13, RULE-14, RULE-15, RULE-18)", () => {
  // @verifies RULE-13
  it("[RULE-13] should validate ADR link tags with isValidAdrLinkTag", () => {
    expect(isValidAdrLinkTag("ADR-1")).toBe(true);
    expect(isValidAdrLinkTag("adr-10")).toBe(true);
    expect(isValidAdrLinkTag("ADR-42-1")).toBe(true);
    expect(isValidAdrLinkTag("ADR-J101")).toBe(true);

    expect(isValidAdrLinkTag("RULE-1")).toBe(false);
    expect(isValidAdrLinkTag("TASK-1")).toBe(false);
    expect(isValidAdrLinkTag("MOTIVE")).toBe(false);
    expect(isValidAdrLinkTag("")).toBe(false);
    expect(isValidAdrLinkTag("invalid-tag")).toBe(false);
  });

  // @verifies RULE-14, RULE-15
  it("[RULE-14][RULE-15] should validate governance link tags with isValidGovernanceLinkTag", () => {
    expect(isValidGovernanceLinkTag("ADR-1")).toBe(true);
    expect(isValidGovernanceLinkTag("adr-10")).toBe(true);
    expect(isValidGovernanceLinkTag("RULE-1")).toBe(true);
    expect(isValidGovernanceLinkTag("rule-25")).toBe(true);

    expect(isValidGovernanceLinkTag("TASK-1")).toBe(false);
    expect(isValidGovernanceLinkTag("task-5")).toBe(false);
    expect(isValidGovernanceLinkTag("MOTIVE")).toBe(false);
    expect(isValidGovernanceLinkTag("")).toBe(false);
    expect(isValidGovernanceLinkTag("random-string")).toBe(false);
  });

  // @verifies RULE-18
  it("[RULE-18] should validate task dependency tags with isValidTaskDependencyTag", () => {
    expect(isValidTaskDependencyTag("TASK-1")).toBe(true);
    expect(isValidTaskDependencyTag("task-10")).toBe(true);
    expect(isValidTaskDependencyTag("TASK-10-1")).toBe(true);
    expect(isValidTaskDependencyTag("TASK-A101")).toBe(true);

    expect(isValidTaskDependencyTag("ADR-1")).toBe(false);
    expect(isValidTaskDependencyTag("RULE-1")).toBe(false);
    expect(isValidTaskDependencyTag("MOTIVE")).toBe(false);
    expect(isValidTaskDependencyTag("")).toBe(false);
    expect(isValidTaskDependencyTag("TASK")).toBe(false);
  });

  // @verifies RULE-13, RULE-14, RULE-15, RULE-18
  it("[RULE-13][RULE-14][RULE-15][RULE-18] should match tag patterns using regex constants", () => {
    expect(ADR_LINK_TAG_REGEX.test("ADR-1")).toBe(true);
    expect(ADR_LINK_TAG_REGEX.test("adr-99")).toBe(true);
    expect(ADR_LINK_TAG_REGEX.test("RULE-1")).toBe(false);

    expect(GOVERNANCE_LINK_TAG_REGEX.test("ADR-1")).toBe(true);
    expect(GOVERNANCE_LINK_TAG_REGEX.test("RULE-1")).toBe(true);
    expect(GOVERNANCE_LINK_TAG_REGEX.test("TASK-1")).toBe(false);

    expect(TASK_DEPENDENCY_TAG_REGEX.test("TASK-1")).toBe(true);
    expect(TASK_DEPENDENCY_TAG_REGEX.test("task-1")).toBe(true);
    expect(TASK_DEPENDENCY_TAG_REGEX.test("ADR-1")).toBe(false);
  });
});


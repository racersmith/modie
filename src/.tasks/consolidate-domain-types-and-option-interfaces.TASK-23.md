---
depends_on: []

links:
  - ADR-10
  - RULE-25
---

# Context

CreateRuleOptions, CreateAdrOptions, and CreateTaskOptions (along with their result interfaces) are defined in creation.ts across src/core/{rule,adr,task}/. This creates circular import dependencies when definition.ts imports options from creation.ts while creation.ts delegates to generic pipelines. Consolidate all creation options and result interfaces into canonical types.ts files across all domain modules.

# Acceptance Criteria

- [ ] Move CreateRuleOptions and CreateRuleResult to src/core/rule/types.ts and update all imports
- [ ] Move CreateAdrOptions and CreateAdrResult to src/core/adr/types.ts and update all imports
- [ ] Move CreateTaskOptions and CreateTaskResult to src/core/task/types.ts and update all imports
- [ ] Ensure src/core/index.ts re-exports all types cleanly and verify 0 cyclic dependencies with bun test and bun check

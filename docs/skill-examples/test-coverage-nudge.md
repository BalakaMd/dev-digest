---
name: test-coverage-nudge
description: When the diff changes conditional logic, check that every branch of it is exercised by a test.
type: custom
---

## Branch coverage of changed logic

For every conditional the diff adds or changes — `if`/`else`, ternary, `switch`
case, early return, `catch`, optional chaining that can short-circuit, default
parameter — locate the test that exercises EACH side of it.

Report a finding when a side has no test. Name the branch by file and line, and
state the input that would reach it.

Do not report:
- branches in code the diff did not touch;
- a branch covered indirectly by a test that would fail if the branch broke.

A test that exercises a branch without asserting anything about its effect does
not count as coverage — say so explicitly when you see it.

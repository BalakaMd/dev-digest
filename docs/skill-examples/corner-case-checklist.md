---
name: corner-case-checklist
description: When reviewing tests, walk this checklist of boundary conditions and report the ones nothing covers.
type: rubric
---

## Corner cases to check for

Walk this list against the changed behaviour. Report only the entries that are
BOTH plausible for this code and untested.

- **Emptiness** — empty string, empty array/object, empty result set, no rows.
- **Cardinality** — zero, exactly one, many; the difference between them often
  hides a `[0]` or a missing loop.
- **Boundaries** — first/last element, off-by-one on ranges and slices, min/max
  numeric values, exactly-at-the-limit inputs.
- **Absence** — null, undefined, a missing optional field, a field present but
  empty.
- **Text** — unicode, emoji, very long strings, whitespace-only, embedded quotes
  or delimiters that could break parsing.
- **Ordering** — unordered inputs asserted in a fixed order, duplicate entries,
  stability of a sort.
- **Repetition** — calling twice (idempotence), concurrent invocation, retry
  after failure.
- **Time** — timezone, DST boundary, clock-dependent assertions.

For each gap: name the case, the file:line of the code that would mishandle it,
and the assertion you would add.

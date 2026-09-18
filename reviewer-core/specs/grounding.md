# Spec — grounding and scoring

The engine's hardest guarantee: **a finding cites a real location, or it does not
ship.** Everything here is load-bearing. A change that makes one of these
statements false is a regression, not a refactor.

## The gate

`groundFindings(findings, diff)` runs over every finding before a review is
returned. A finding is **kept** only if:

1. its `file` is present in the diff, **and**
2. its `[start_line, end_line]` range intersects a real hunk for that file,
   measured against new-side line numbers.

Anything else is **dropped**, with a reason recorded for the trace. The reasons
are specific on purpose — `file 'x' not present in diff` versus `lines 10-12 do
not intersect any diff hunk in 'x'` — because the two failures mean different
things when you are debugging a model.

The line index is built from each hunk's `newLineNumbers`, falling back to the
hunk's declared `newStart`/`newLines` range when that array is absent.

Range comparison is order-insensitive: a finding that reports `end_line` before
`start_line` is normalised rather than rejected. Models get this backwards often
enough that failing on it would throw away correct findings.

## Why it is mechanical

The gate is arithmetic over the diff, not a judgement call and not a prompt
instruction. A model asked nicely to cite real lines will still, sometimes,
invent one. Asking again does not fix it; checking does.

This is also why there is **no bypass flag**. A caller that could opt out would
eventually opt out, and the guarantee would quietly become a suggestion.

## Full-file findings

Some producers are not tied to a hunk — secret scanners, phantom-code checks,
hook output. Findings whose `kind` is one of `secret_leak`, `lethal_trifecta`,
`phantom`, `hook` are treated as **full-file**: they must still name a file that
appears in the diff, but they are exempt from the line-intersection test.

Adding a producer that reports at file granularity means adding its `kind` to
that set. Loosening the line rule for everything is not the alternative.

## Scoring

The score is **recomputed from the findings that survived**. The model's
self-reported score is read and discarded.

This follows directly from the gate: if a model reported five findings and two
were hallucinated, a score it derived from five is wrong by construction. The
same holds for the verdict on the map-reduce path, where the worst chunk verdict
wins and the score is averaged **before** grounding, then recomputed after.

`groundingSummary` renders the outcome as `kept/total passed` (for example
`3/4 passed`) for run traces and CI output.

## Observability

Dropped findings are never silently discarded — they are returned alongside the
kept ones with their reasons, and the caller surfaces them. A run where the model
produced four findings and all four were dropped must look different from a run
where the model produced none.

## Test coverage

There is no dedicated grounding test file. The gate is exercised end to end from
`test/run.test.ts` with a stubbed provider, by two cases:

- *single-pass: assembles, grounds, drops the hallucinated finding*
- *score is deterministic from findings: a clean approve scores 100*

Those two pin the headline behaviour — drop what is not cited, recompute the
score — but the gate's own edges are currently unpinned: a file absent from the
diff, a full-file `kind`, a reversed range, and the `newLineNumbers` fallback all
work in code and are asserted nowhere. A unit test over `groundFindings` covering
those is the obvious next addition, and the right place for it is a new
`test/grounding.test.ts`.

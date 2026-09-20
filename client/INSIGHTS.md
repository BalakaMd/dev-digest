# Insights — `@devdigest/web`

Append-only log of traps, surprises and decisions discovered while working on
`@devdigest/web`. This is the pressure valve for `AGENTS.md`: anything worth
remembering but not worth its tokens in every session belongs here.

Read this before a non-trivial change. Add an entry whenever something cost you
time that it should not have.

## Format

Newest first. One entry per finding:

```
## YYYY-MM-DD — [category] Short, specific title
**Symptom** — what was observed.
**Cause** — what was actually going on.
**Takeaway** — what to do differently, concretely.
```

Categories: `gotcha` · `root-cause` · `convention` · `dead-end` · `perf-cost` ·
`env-quirk`. The `engineering-insights` skill holds the full rubric, the quality
bar, and the deduplication procedure — consult it before reading or writing.

Promote an entry into `AGENTS.md` only if it passes the line test there: "if I
remove this line, will Claude start making mistakes?"

---

## 2026-09-19 — [gotcha] `borderColor` is itself a shorthand, so `FindingCard` still warns

**Symptom** — anything that re-renders a `FindingCard` with a different `focused`
value (j/k navigation, and now the severity filter in `FindingsPanel`) prints
"Updating a style property during rerender (borderColor) when a conflicting
property is set (borderLeftColor)" to the console and to the vitest output.
**Cause** — `FindingCard/styles.ts` carries a comment stating it is "all-longhand
(never mix `border` shorthand with `borderLeft`)", and it does avoid the `border`
shorthand. But `borderColor` is *also* a shorthand — for the four per-side colour
properties — so pairing it with `borderLeftColor` reproduces exactly the case the
comment set out to avoid. The comment reads as a solved problem, which is why the
warning survived.
**Takeaway** — when a React inline style needs one side to differ, set all four
sides explicitly (`borderTopColor` / `borderRightColor` / `borderBottomColor` /
`borderLeftColor`); never reach for `borderColor` as the "longhand". The same
applies to `borderWidth`, `borderStyle`, `margin`, `padding` and `background`,
all of which React treats as shorthands. Do not trust the comment in
`FindingCard/styles.ts` — it describes the intent, not the current behaviour.

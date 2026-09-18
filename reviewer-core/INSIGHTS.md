# Insights — `@devdigest/reviewer-core`

Append-only log of traps, surprises and decisions discovered while working on
`@devdigest/reviewer-core`. This is the pressure valve for `CLAUDE.md`: anything
worth remembering but not worth its tokens in every session belongs here.

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

Promote an entry into `CLAUDE.md` only if it passes the line test there: "if I
remove this line, will Claude start making mistakes?"

---

_No entries yet._

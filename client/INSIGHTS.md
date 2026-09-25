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

## 2026-09-25 — [gotcha] `format.relativeTime(date)` without a `now` logs ENVIRONMENT_FALLBACK errors
**Symptom** — Tests for a page showing "last scan 2 minutes ago" passed, but every render printed an
`IntlError: ENVIRONMENT_FALLBACK` stack trace. The dev console did the same.
**Cause** — next-intl wants a reference time for relative formatting; the app configures no global
`now`, so every call without one falls back and complains.
**Takeaway** — Pass one explicitly from `useNow({ updateInterval: 60_000 })`. That silences the error
and keeps the label current (see `ConventionsView`).

## 2026-09-24 — [dead-end] HTML5 drag-and-drop for reordering did not work in real Chrome
**Symptom** — the agent Skills tab reordered rows with `draggable` +
`dragstart`/`dragover`/`drop`. Unit tests passed, but a real mouse drag did
nothing, in the built-in browser pane and in the user's own Chrome alike: no
reorder, no request, no console error.
**Cause** — not pinned down. Native DnD only starts from real OS input (so
synthesised input can never drive it) and is sensitive to re-renders of the
dragged element; `fireEvent.drag*` in jsdom exercises none of that, which is
why the tests stayed green.
**Takeaway** — build reordering on pointer events instead: `pointerdown` on a
handle with `setPointerCapture`, `pointermove` hit-testing row tops, `pointerup`
committing (see `SkillsTab`). It works with mouse, touch and synthesised input,
so a `left_click_drag` in the pane is a real check. jsdom has no `PointerEvent`;
`src/test/setup.ts` polyfills it, otherwise `fireEvent.pointer*` drops
`button`/`clientY`.

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

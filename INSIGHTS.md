# Insights — the DevDigest repository as a whole

Append-only log of traps, surprises and decisions discovered while working on
this repository. This is the pressure valve for `AGENTS.md`: anything worth
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

## 2026-09-24 — [env-quirk] The browser pane's drag never fires HTML5 drag-and-drop
**Symptom** — verifying the agent Skills tab in the built-in browser, a
`left_click_drag` from one row to another did nothing: no reorder, no request,
no error — although the rows are `draggable` and the unit tests pass.
**Cause** — the pane synthesises mouse down/move/up; Chromium starts a native
HTML5 drag (`dragstart`/`dragover`/`drop`) only from real OS input, so
`draggable` elements never see a drag.
**Takeaway** — to exercise native DnD in the pane, dispatch the events yourself:
`new DragEvent('dragstart' | 'dragover' | 'drop', { bubbles: true, cancelable:
true, dataTransfer: new DataTransfer() })` on the source and target elements via
the JavaScript tool, then check the result. Do not conclude DnD is broken from a
dead mouse drag.

## 2026-09-24 — [gotcha] A PreToolUse(Bash) matcher sees the whole command, heredocs included
**Symptom** — the new PR gate denied a `cat > file <<EOF` call that was merely
writing documentation, because the document mentioned the gated command.
**Cause** — a `PreToolUse` hook receives the entire command string. A substring
test (`*"gh pr create"*`) therefore matches the words wherever they appear: in a
heredoc body, a `grep` pattern, a commit message, a comment.
**Takeaway** — match at command position, not by substring: anchor to start of
line or to a shell separator (`(^|[;&|(])[[:space:]]*cmd`). Over-matching is
worse than it looks — the first thing a gate that blocks unrelated work gets is
switched off, and then it protects nothing.

## 2026-09-24 — [convention] `vendor/shared` is already out of sync on `main`
**Symptom** — a "the two vendored copies must be identical" check reported five
critical findings on a diff that touched neither copy.
**Cause** — `server/src/vendor/shared` and `client/src/vendor/shared` differ on
`main` in `adapters.ts` and several `contracts/*.ts` files. Mostly comment text,
so nothing fails and nobody has fixed it — but not only: the client
`knowledge.ts` was also missing `AgentVersionConfig` / `AgentVersion`. It and
`trace.ts` were re-synced by the skills work (copy the canonical file whole);
the remaining drift is still comment-only.
**Takeaway** — compare only the shared files a diff actually touches. A standing
false positive is worse than no check: it trains everyone to skim past the
category, and the one real divergence goes past with it.

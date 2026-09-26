# Insights — `@devdigest/api`

Append-only log of traps, surprises and decisions discovered while working on
`@devdigest/api`. This is the pressure valve for `AGENTS.md`: anything worth
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

## 2026-09-25 — [gotcha] A system LLM prompt that does not pin the output language gets answers in a random one
**Symptom** — A real conventions re-scan through `openrouter / deepseek/deepseek-v4-flash` returned
most rules in Chinese, although the prompt and the sampled code were English. The previous scan
on the same repo had answered in English.
**Cause** — Nothing in the system prompt fixed the output language, and cheap models drift. The
drift also broke de-duplication: a Chinese restatement of an already-accepted English rule shares
no tokens with it, so it came back as a "new" candidate.
**Takeaway** — Any system-feature prompt whose output is shown or compared as text should state the
language explicitly ("Write every `rule` in English, whatever language the code comments use" in
`prompts/conventions-extraction.system.md`). Mock-LLM tests never catch this; run one real call.

## 2026-09-25 — [env-quirk] `drizzle-kit generate` hangs on an interactive rename prompt when stdin is not a TTY
**Symptom** — `pnpm db:generate` after dropping one column and adding others to the same table
printed "Is scan_id column … created or renamed from another column?" and then waited forever;
in an agent shell there is no way to answer it.
**Cause** — drizzle-kit asks, for each added column, whether it renames a dropped one. The prompt
needs a TTY and ignores piped stdin.
**Takeaway** — Give it a pseudo-terminal and accept the default ("create column") for every prompt:
`(for i in $(seq 1 20); do sleep 2; printf '\r'; done) | script -q /dev/null pnpm db:generate`.
Then read the generated SQL before trusting it: a wrong answer turns a drop+add into a RENAME.

## 2026-09-24 — [root-cause] A list query without ORDER BY reshuffles after every UPDATE
**Symptom** — toggling an agent, or changing its skills, made it jump to the
bottom of the agents list in the UI.
**Cause** — `AgentsRepository.list` had no `ORDER BY`, so Postgres returned heap
order. An `UPDATE` writes a new row version at the end of the heap, so the row
just edited came back last.
**Takeaway** — any query whose result is shown as a list needs an explicit,
total `ORDER BY` (add an id tie-break for rows created together, e.g. by the
seed). `test/skills.it.test.ts` asserts the agents list order survives updates.

## 2026-09-24 — [gotcha] A run reaches `done` before its trace exists
**Symptom** — an integration test that waited for `waitForPrRuns` and then read
`GET /runs/:id/trace` failed intermittently with the trace body undefined, while
the same test passed on the next run.
**Cause** — `ReviewRunExecutor.runOneAgent` calls `completeAgentRun` (status
`done`) first and `saveRunTrace` afterwards. `waitForPrRuns` polls `agent_runs`
status only, so it can return in the gap between the two writes.
**Takeaway** — a test that asserts on the trace must poll the trace endpoint
until it returns a document (see `traceFor` in `test/skills-prompt.it.test.ts`),
not just wait for a terminal run status. The same gap exists for any UI that
opens the trace the instant a run turns `done`.

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

## 2026-09-26 — [env-quirk] A dev machine with a real `OPENROUTER_API_KEY` turns an unmocked provider path into a real network call in it-tests
**Symptom** — after wiring the intent classifier's best-effort derivation into
`ReviewRunExecutor.executeRuns` (it resolves `openrouter` by default whenever no
`llm.openrouter` override is injected), `reviews.it.test.ts` and
`skills-prompt.it.test.ts` — which only inject `llm.openai` — went from
sub-second to 6–13s per test, and one assertion failed outright because
`waitForPrRuns`'s default 10s timeout elapsed before the run even started (the
executor awaits the shared intent derivation before the per-agent loop).
**Cause** — this sandbox has a real `OPENROUTER_API_KEY` resolvable through
`LocalSecretsProvider` (env or `~/.devdigest/secrets.json`), so
`container.llm('openrouter')` built a REAL `OpenRouterProvider` instead of
throwing `ConfigError`, and the classifier call went out over the network before
timing out. The same risk exists for `GITHUB_TOKEN`: an unmocked
`container.github()` will construct a real Octokit client whenever a PR body
happens to reference an issue or a doc link.
**Takeaway** — never assume "no override supplied" means "no real key configured
on this machine". Any it-test whose code path can reach an unmocked provider or
`GitHubClient` — directly or through a feature that resolves one by default,
like the intent classifier — must inject `secrets: new MockSecretsProvider({})`
(or explicit `llm`/`github` overrides for every id the path can reach), not rely
on the ambient environment being key-less. `git diff`-ing test timings after a
new best-effort background call is a fast way to notice this class of bug: a
mocked call is single-digit-ms, a live one is seconds.

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

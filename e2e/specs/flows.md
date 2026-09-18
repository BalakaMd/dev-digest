# Spec — what the browser flows guarantee

> This file documents the flows. The **executable** specs in this folder are the
> `*.flow.json` files; `run.ts` loads those and ignores everything else, so this
> `.md` sits here as their contract without affecting the run.

Seven flows, run in filename order against a seeded stack. Together they assert
that every screen in the starter renders with real data and that navigation
between them works.

## The flows

| File | Guarantees | Steps |
|------|------------|-------|
| `01-app-boot.flow.json` | the app boots and the root redirects to a repo's PR list | 4 |
| `02-repo-pulls-detail.flow.json` | a PR opens from the list and its review detail loads | 7 |
| `03-agents.flow.json` | the agents list renders the seeded reviewer agents | 4 |
| `04-pr-findings.flow.json` | PR detail shows the seeded run, verdict, and findings | 10 |
| `05-pr-diff.flow.json` | the Files-changed tab renders the seeded diff | 8 |
| `06-onboarding.flow.json` | the add-repository screen renders | 4 |
| `07-settings.flow.json` | Settings renders API Keys and Feature Models | 7 |

## Standing rules

**Determinism above all.** No LLM, no API key, no network beyond the local stack.
agent-browser's AI `chat` command is never used — a flow that asks a model what
it sees is not a test, it is a coin flip.

**Locators are deterministic only**: `--url`, `--text`, and
`find role|text|label`. No CSS selectors tied to markup structure, no XPath, no
nth-child.

**Read-only against seeded data.** Flows read the demo repo `acme/payments-api`
and PR #482. Nothing creates, edits, or deletes.

**No cross-flow state.** Each flow must pass when run alone. They share a browser
session for speed, not for setup — a flow that depends on where a previous one
left the page is broken even if it currently passes.

**`{BASE}` never hardcoded.** Always `{BASE}/…`, substituted at run time, so the
same flow works on `:3000` and on the hermetic runner's alternate port.

**The waits are the assertions.** `wait --text` / `wait --url` fail on timeout;
`assert.stdoutIncludes` is the only extra check. There is no assertion library.

## Adding a flow

Number it after the last one — execution order is lexical. Give it a `name` that
reads as a sentence about behaviour, because that name is what the runner prints
and what a reader sees in CI output. Label each step: the label replaces the raw
command in the log and is the difference between a readable failure and a wall of
CLI arguments.

Keep flows short. A ten-step flow that fails at step nine tells you far less than
two five-step flows, because a failure aborts the rest of its flow.

## Coverage boundary

These cover **rendering and navigation**, not review quality. Running an actual
review needs an LLM key and produces non-deterministic output, so it is out of
scope here by design — the engine's behaviour is pinned by
[`../../reviewer-core/specs/grounding.md`](../../reviewer-core/specs/grounding.md)
and the server's integration tests instead.

The `COST` column added with the run-cost feature is not yet asserted by any
flow; a seeded completed run would be needed first.

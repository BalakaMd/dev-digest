# Spec — the review cycle

The contract for running a review, from the HTTP call to persisted findings.
These statements should stay true; if a change makes one false, the change is
either wrong or this file needs updating in the same commit.

## Trigger

`POST /pulls/:id/review`, body `{ agentId }` **or** `{ all: true }`. Both fields
are optional in the schema but one is required in practice — neither given is a
`400 invalid_run_request`. An empty body is accepted and then rejected by that
same rule, so the failure is a clear message rather than a parse error.

Reviews are **never** triggered automatically. Polling syncs the PR list and
explicitly does not start a run.

## Run rows exist before the work does

For each target agent, an `agent_runs` row is created **up front** and its id
returned immediately. Only then does execution start, in the background, not
awaited by the route.

This ordering is the contract the UI depends on: the client stores the returned
run ids and subscribes to `GET /runs/:id/events` while the run is still starting.
Creating the row after the work began would leave a window where the stream
cannot be subscribed and early events are lost.

The response is `{ pr_id, runs: [{ run_id, agent_id, agent_name }], reviews }`.

## Isolation between agents

`all: true` fans out to every enabled agent. **A failure in one agent must not
abort the others** — each run is caught and persisted as `failed` with its error
text, and the remaining runs continue.

Shared pre-work (loading the diff) is the exception: it happens once for all
queued runs, so its failure fails every one of them. The error is fanned out to
each run's log and each row is marked `failed`.

## The diff

`loadDiff` prefers a real `git diff base...head` through the `GitClient`. When
that yields nothing or throws — no clone yet, a test, a repo that was never
cloned — it falls back to reconstructing a synthetic unified diff from the
persisted `pr_files` patches.

The contract: **a review can run before a clone completes.** Reviews must not
require a working checkout.

## The engine boundary

The server owns I/O; `@devdigest/reviewer-core` owns the review. The server
resolves context and passes it in:

- `systemPrompt`, `model`, `diff`, `llm` — always
- `callers`, `repoMap`, `rankNote` — only when repo-intel is on for that agent
- `prDescription` — only when the PR has a body; untrusted, wrapped downstream

Repo-intel has **two independent gates**: the global `REPO_INTEL_ENABLED` and the
per-agent `repo_intel` toggle. When an agent opts out, enrichment is skipped
entirely so its prompt is byte-identical to the repo-intel-off baseline. When the
repo is simply not indexed, the facade returns empty and the sections are
omitted — the run degrades silently to diff-only rather than failing.

Optional sections follow an **omit-when-empty** contract: `assemblePrompt` leaves
the section out entirely rather than emitting an empty heading.

## Grounding and scoring

Every finding must cite a line that exists in the diff or it is dropped. The
score is recomputed from the findings that survived. **The model's self-reported
score is ignored.** This is mechanical, not advisory — see
[`../../reviewer-core/specs/grounding.md`](../../reviewer-core/specs/grounding.md).

## Observability

Events stream over the `runBus` to `GET /runs/:id/events` (SSE). The stream
replays a buffer first, then goes live, and ends when the run ends — a client
that subscribes late still sees the whole run.

Event kinds are exactly `info | tool | result | error`. The same lines are
buffered into `run_traces` so the log survives a page reload, readable at
`GET /runs/:id/trace`.

Cancellation is cooperative: `checkCancelled` is polled between units of work and
throws `RunCancelledError`, so a cancel lands between chunks rather than tearing
down mid-call.

## Persistence

On completion the run row gets `status`, `duration_ms`, `tokens_in`,
`tokens_out`, `cost_usd`, and the grounding summary; the review and its surviving
findings are written alongside.

`cost_usd` is **null, never 0**, when the model is unpriced or the run failed
before reaching the model — `0` would claim the review was free. The UI renders
null as `—`.

## What this spec does not cover

Multi-agent composition, memory retrieval, and the eval pipeline are later
lessons. The tables exist in the schema and sit empty until then.

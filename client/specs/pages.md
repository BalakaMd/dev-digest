# Spec — routes and the data behind them

What each screen is, what it reads, and the behaviour that should stay true.
If a change makes a statement here false, fix the change or update this file in
the same commit.

## Route table

| Route | Purpose | Hooks → endpoints |
|-------|---------|-------------------|
| `/` | entry; redirects to the active repo's PR list | `useRepos` → `GET /repos` |
| `/onboarding` | add a repository by URL | `useAddRepo` → `POST /repos` |
| `/repos/[repoId]/pulls` | PR list | `usePulls` → `GET /repos/:id/pulls`; `useRefreshRepo` → `POST /repos/:id/refresh` |
| `/repos/[repoId]/pulls/[number]` | PR detail — overview, diff, findings, run trace | `usePullDetail`, `usePrRuns`, `usePrReviews`, `usePrComments`, `useRunReview`, `useFindingAction`, `useRunEvents`, `useRunTrace` |
| `/agents` | agent list | `useAgents` → `GET /agents` |
| `/agents/[id]` | agent editor (model, system prompt, toggles) | `useAgent`, `useUpdateAgent`, `useProviderModels` |
| `/settings/[section]` | API keys, models | `useSettings`, `useUpdateSettings`, `useSecretsStatus`, `useTestConnection` |

## PR list

Default filter is **`needs_review`**, not "all" — it is the most actionable view
on open. The filter lives in the query string (`?status=`), and switching writes
it explicitly so that choosing "all" survives a reload instead of falling back to
the default.

Filtering, sorting and search are **client-side** over the already-fetched list.
The endpoint returns the PRs; the screen does not re-query on every keystroke.

Columns are `PULL REQUEST · AUTHOR · SIZE · SCORE · STATUS · COST · UPDATED`, and
their widths are declared in **three** places that must agree: `GRID` and
`COLUMN_KEYS` in `constants.ts`, and the cells rendered by `PRRow`. A mismatch
breaks the table layout silently.

`COST` shows the **latest completed run's** cost, not a sum across runs — a re-run
replaces the figure. A newer *failed* run must not blank out the last successful
cost. A PR that never completed a run shows `—`, never `$0.00`.

An unknown or stale `:repoId` renders a friendly `RepoNotFound` empty state, not
an error screen.

## PR detail

Runs are started manually. `useRunReview` posts to `POST /pulls/:id/review`; the
returned run ids are kept in global state so an in-flight run survives a reload
and a device switch, and `usePrActiveRuns` re-reads the server's view as the
source of truth.

`useRunEvents` subscribes to `GET /runs/:id/events` (SSE) for the live log. The
stream replays its buffer before going live, so subscribing late still shows the
whole run. After the run ends, the same lines are readable from the persisted
trace via `useRunTrace`.

Findings can be accepted or dismissed (`useFindingAction`). A finding always
cites a file and line range that exist in the diff — the server drops the rest
before they ever reach the client.

## Agents

Two agents ship seeded (General and Security; this tree also carries a
Performance one). The editor owns `model`, `system_prompt`, and the per-agent
`repo_intel` toggle. `useProviderModels` lists models for the selected provider,
so the model field is a choice, not free text.

## Settings

Keys entered here are sent to the API and stored server-side in
`~/.devdigest/secrets.json`; they are never written into the database and never
kept in browser storage. `useSecretsStatus` reports only **whether** a key is
configured — the client never receives key values back.

## Cross-cutting

Every screen renders inside `AppShell` with breadcrumbs and `g`-then-key
shortcuts. Loading states are skeletons, not spinners; empty and error states are
`EmptyState` / `ErrorState` with a retry that re-runs the query.

All visible text resolves through `next-intl` — no literal strings in components.

## Not here yet

Skills, memory, eval, blast/brief, multi-agent and the dashboards are later
lessons. Their message namespaces already exist in `messages/en/`, which is why
you will see `eval.json` or `memory.json` with no screen behind them.

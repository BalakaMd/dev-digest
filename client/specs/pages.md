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
| `/skills` | skill grid + preview drawer, create / import, delete | `useSkills` → `GET /skills`; `useSkillAgents`, `useCreateSkill`, `useImportSkillPreview` → `POST /skills/import`, `useUpdateSkill`, `useDeleteSkill` |
| `/skills/[id]` | skill editor — Config, Preview, Versioning | `useSkill`, `useUpdateSkill`, `useSkillVersions`, `useRestoreSkillVersion` |
| `/agents` | agent grid | `useAgents` → `GET /agents` |
| `/agents/[id]` | agent editor — Config, Skills | `useAgent`, `useUpdateAgent`, `useProviderModels`, `useSkills`, `useAgentSkills`, `useSetAgentSkills` |
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

## Skills

A skill is text and configuration only (name, directive description, type,
markdown body) and is shared across agents. Clicking a card opens a read-only
preview in a **side drawer**; its Open button leads to `/skills/[id]`. Create
happens in a modal. Import takes a `.md` or `.zip`, shows the server's preview
(the extracted markdown core plus the archive members that were *not* imported)
and persists nothing until the user confirms — the skill is then saved with
source `imported`. Delete always goes through a confirmation dialog.

The card toggle is the skill's **global** switch: a disabled skill reaches no
agent's prompt. Any content edit bumps the version and snapshots the body;
toggling does not. Restore writes an old body forward as a new version — history
is append-only. The version diff is computed client-side against the current
body.

## Agents

Five agents ship seeded: General, Security, Performance, and the two
skills-experiment agents (Test Quality, API Contract — disabled, no skills). The
editor has exactly two tabs. **Config** owns `model`, `system_prompt`, strategy
and the per-agent `repo_intel` toggle; `useProviderModels` lists models for the
selected provider, so the model field is a choice, not free text.

**Skills** lists every skill in the workspace. A skill is enabled for the agent
when it is linked; enabled skills come first, in link order, and that order is
the order of their blocks in the prompt. Only enabled skills can be dragged (or
moved with ↑/↓); reordering is off while the name filter is active. Every change
posts the full ordered id list (`POST /agents/:id/skills`), which also bumps the
agent's version. Agent delete goes through a confirmation dialog.

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

Memory, eval, blast/brief, multi-agent and the dashboards are later lessons. Their message namespaces already exist in `messages/en/`, which is why
you will see `eval.json` or `memory.json` with no screen behind them.

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
| `/repos/[repoId]/pulls/[number]` | PR detail — overview, diff, findings, run trace | `usePullDetail`, `usePrRuns`, `usePrReviews`, `usePrComments`, `useRunReview`, `useFindingAction`, `useRunEvents`, `useRunTrace`, `usePrIntent` → `GET /pulls/:id/intent`, `useDeriveIntent` → `POST /pulls/:id/intent` |
| `/repos/[repoId]/conventions` | Skills Lab → Conventions: Run Scan / ReScan, candidate cards (accept, reject, inline edit), Create skill modal | `useConventions` → `GET /repos/:id/conventions`; `useExtractConventions` → `POST /repos/:id/conventions/extract`; `useUpdateConvention` → `PATCH /conventions/:id`; `useConventionSkillDrafts` → `GET /repos/:id/conventions/skill-drafts`; `useCreateConventionSkills` → `POST /repos/:id/conventions/skills` |
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
before they ever reach the client. A finding with `scope: "out"` (kept as the
one out-of-scope signal the server allows through) carries an "Outside PR
scope" tag next to its accept/dismiss state.

`IntentCard` (`usePrIntent` → `GET /pulls/:id/intent`, `useDeriveIntent` →
`POST /pulls/:id/intent`) renders above the tab body on both **Overview** and
**Findings** — it precedes the review results wherever they appear, and
starting a run switches the tab to Findings so it still sits above them. States:
`none` (a **Derive intent** button) · `derived` (quoted summary, IN SCOPE / OUT
OF SCOPE columns, a confidence badge, and a Sources row — unreachable/
unsupported sources are shown visibly as unavailable) · `stale` (the PR head
moved since this intent was derived — a warning line plus an emphasised
**Re-derive**; the card still shows the stale intent, it is never hidden) ·
`error` (inline message with a retry). Intent is never re-derived
automatically; after a review run finishes, `page.tsx` invalidates
`["pr-intent", prId]` so an intent the run auto-derived (see
`server/specs/review-flow.md`) appears without a manual refresh.

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

## Conventions

Per repo, under **SKILLS LAB** in the sidebar (`g c`). Before the first scan the
page shows only **Run Scan**; once a scan exists the header shows **ReScan** and
the line "Detected from N sample files · last scan X ago". A scan is one
synchronous request — the button spins until the server answers with the new
state.

Each card shows the category, the rule, the verified evidence (`file:line` plus
the file's own code, extra files behind "+N more"), and the post-verification
confidence. **Accept** toggles (Accepted → back to pending), **Reject** removes
the card at once (optimistic) and the server never returns it again, and
**Edit** turns the card into an inline form for rule and category. ReScan
replaces only pending cards nobody touched; accepted and edited ones stay,
rejected ones stay gone.

Rejected cards are not deleted. Once anything is rejected, a **Rejected (N)**
chip appears after the category filters; it lists the rejected cards dimmed,
with a single **Restore** button that puts the card back to pending. A restored
card counts as touched, so the next ReScan keeps it.

**Create skill** appears once at least one card is accepted. The modal loads
server-built drafts (one skill, or one per category) and every field is editable,
including the markdown body in a line-numbered editor. Edits survive switching
between the two modes. Every Create makes **new** skills (type `convention`,
source `extracted`) and then navigates to `/skills`.

## Agents

Five agents ship seeded: General, Security, Performance, and the two
skills-experiment agents (Test Quality, API Contract — disabled, no skills). The
editor has exactly two tabs. **Config** owns `model`, `system_prompt`, strategy
and the per-agent `repo_intel` toggle; `useProviderModels` lists models for the
selected provider, so the model field is a choice, not free text.

**Skills** lists every skill in the workspace. A skill is enabled for the agent
when it is linked. The list opens with enabled skills first, in link order, then
the rest alphabetically; after that rows never move on their own. Toggling a
skill flips it in place, and the enabled rows top to bottom (numbered #1, #2, …)
are the order of their blocks in the prompt. Only enabled skills can be dragged
by their handle (pointer events, not HTML5 DnD) or moved with ↑/↓, which step
over disabled rows; reordering is off while the name filter is active. Every change
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

# Development Plan: Agent Performance Dashboard

Created: 2026-10-14 · Branch: lab-08 · HEAD: 8435f73 · Status: ready
Spec: specs/agent-performance-dashboard/spec.md · SPEC-10 · approved
Recommended mode: multi-agent — ten steps / ~60 files span 4 packages; no step group may exceed ~12 files, so work runs as 6 sequential implementer waves with independent test-writers; the only true overlap is client implementer ∥ server+reviewer-core test-writer (W3).

Command aliases used below (all from project guidance, never run by the planner):
`RC` = `cd reviewer-core && npm test` (+ `npm run typecheck`) · `SU` = `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `SI` = `cd server && pnpm exec vitest run .it.test` (Docker) · `ST` = `cd server && pnpm typecheck` · `CT` = `cd client && pnpm test` · `CTC` = `cd client && pnpm typecheck` · `AR` = `cd agent-runner && npm run typecheck` (script at agent-runner/package.json:11; its package manager is not stated in guidance, use the lockfile found there).

## Requirements
Copied verbatim from the spec (ids unchanged); `→` lists the steps.
- AC-1: "The sidebar SHALL show an "Agent Performance" item in the GLOBAL group, placed directly above "CI Runs", that opens the Agent Performance page for the active repository. The "Multi-Agent Review" item SHALL stay where it is. (Q-14) [covers US-1]" → S6
- AC-2: "The Agent Performance page SHALL show the title "Agent Performance" and the subtitle "Which agents earn their keep — accept rate is the quality signal"." → S10
- AC-61: "The page SHALL show every number for one repository — the repository its address names, else the active repository — and SHALL state that repository's full name (`owner/name`) under the subtitle as "Repository: <owner/name>". (Q-18)" → S10 · assumes Q-4
- AC-62: "WHEN the user selects another repository in the repository selector, the page SHALL read and show that repository's numbers for the same range and sort, and SHALL collapse any expanded row. (Q-18)" → S6, S10 · assumes Q-4
- AC-63: "WHILE the workspace has no repository, the page SHALL show "No repository yet" with a link to import one in place of the cards, the table and the cost breakdown, and SHALL send no read. (Q-18)" → S10
- AC-47: "The page SHALL keep the repository, the selected range (preset, or custom start and end dates), the sort column and direction, and the expanded row in its address. Opening that address, reloading it or following a shared link SHALL show the same repository, range, sort and expanded row. (accepted P-1, Q-18)" → S7, S10
- AC-64: "IF a part of the address is invalid — a repository that is not in the workspace, a range that AC-6 rejects, an unknown sort column or direction, or an expanded row that names no listed agent — THEN the page SHALL replace only that part with its default (the active repository; "30 days"; Accept descending; no expanded row), SHALL show a short notice naming what was reset, and SHALL keep the valid parts. (Q-22)" → S7, S10
- AC-50: "The page SHALL show "Data as of <time>", the time of the last successful read, and a "Refresh" control that reads the same repository and range again. (accepted P-4)" → S10
- AC-3: "The page SHALL offer a range control with the choices "1 day", "30 days" and "Custom range". "30 days" SHALL be selected when the page opens with no range in its address." → S10
- AC-4: "WHEN the user selects another range, the page SHALL read the all-agents aggregation (AC-19) for that range and show it in the cards, the table and the cost breakdown. Card labels SHALL name the range: "(1D)", "(30D)", or "(<start date> – <end date>)" for a custom range." → S6, S8, S10
- AC-5: "The page SHALL send every range to the API as two instants, `from` (inclusive) and `to` (exclusive): "1 day": `from` = now − 24 hours, `to` = now; "30 days": `from` = now − 30 × 24 hours, `to` = now; custom: `from` = 00:00 of the start date and `to` = 00:00 of the day after the end date, both in the browser's time zone, so both dates are included in full. "now" is the moment the page sends the read. A run SHALL belong to a range when `from ≤ ran_at < to`, by its start time `ran_at`. (Q-6)" → S6, S7
- AC-6: "IF a custom range has its end date before its start date, an end date after today, or covers more than 366 calendar days, THEN the range control SHALL show an inline error naming the problem and the page SHALL send no read. (Q-6)" → S7, S10
- AC-65: "A run SHALL **belong to a repository** when either: it is a local run whose pull request belongs to that repository; or it is a CI run whose recorded repository (`owner/name`) equals that repository's full name, compared without regard to letter case [default of non-blocking Q-27]. A local run whose pull request no longer exists, and a CI run whose repository is not imported into the workspace, SHALL belong to no repository and SHALL not be shown on this page. (Q-18)" → S4
- AC-7: "A **counted run** SHALL be an agent run of the caller's workspace that belongs to the selected repository (AC-65), whose start time is inside the range, whose status is `done`, `failed` or `cancelled`, and whose source is `local` or `ci`. A run with status `running` SHALL never be counted. (Q-1, Q-2, Q-18)" → S4
- AC-8: "Each agent run that belongs to a multi-agent run SHALL be counted as one run of its own agent, like a single-agent run (consistent with SPEC-08 AC-25)." → S4
- AC-9: "**Runs** of an agent SHALL be the number of its counted runs, and **Failed** SHALL be the number of its counted runs with status `failed`." → S4
- AC-10: "**Total cost** SHALL be the sum of the recorded costs of the counted runs that have a cost. A run with no recorded cost (null) SHALL add nothing and SHALL never be treated as 0. The reads SHALL also return the number of counted runs without a cost ("not priced"). (Q-7)" → S4
- AC-11: "**Avg cost** of an agent SHALL be the mean recorded cost over the agent's counted runs with status `done` that have a cost, and SHALL be null when there is none. (Q-1, Q-7)" → S4
- AC-12: "**Avg duration** of an agent SHALL be the mean recorded duration over the agent's counted runs with status `done` that have a duration, and SHALL be null when there is none. (Q-1)" → S4
- AC-13: "**Accept rate** of an agent SHALL be `accepted / (accepted + dismissed)` over the findings of the reviews produced by the agent's counted runs with source `local`, using each finding's decision as stored at the time of the read. A finding counts as accepted when it has an accept decision and as dismissed when it has a dismiss decision; findings with no decision SHALL be excluded. CI runs SHALL contribute no findings. The reads SHALL return `accepted`, `dismissed` and the denominator `accepted + dismissed` with the rate, and SHALL return the rate as null when the denominator is 0. (Q-2, Q-3) [covers US-2]" → S4
- AC-14: "An accept rate SHALL be marked **low sample** when its denominator is between 1 and 9. The reads SHALL return this mark for every agent row and for Avg accept rate. (Q-4)" → S4
- AC-15: "**Avg accept rate** SHALL be the pooled rate `Σ accepted / Σ (accepted + dismissed)` over the findings selected by AC-13 for all listed agents and for counted runs of deleted agents, and the all-agents read SHALL return `accepted`, `dismissed` and that denominator, and a null rate when it is 0. (Q-8, Q-23)" → S4
- AC-16: "**Last run** of an agent SHALL be the latest start time among all of the agent's runs that belong to the selected repository and have status `done`, `failed` or `cancelled`, of any source and at any time, whether or not that run is inside the range; it SHALL be null when there is no such run. (Q-16, Q-18)" → S4
- AC-17: "**Most-active agent** SHALL be the listed agent with the most counted runs in the range. On a tie, the agent with the latest Last run (AC-16) SHALL win, and on a further tie the agent whose name comes first alphabetically. WHILE no listed agent has a counted run, there SHALL be no most-active agent. (Q-9)" → S4
- AC-18: "The **cost breakdown by agent** SHALL sum each agent's counted-run costs, and the **cost breakdown by model** SHALL sum counted-run costs per stored model name. The sum of the by-agent amounts and the sum of the by-model amounts SHALL each equal Total cost, computed on unrounded values. [covers US-3]" → S4
- AC-53: "Counted runs whose agent was deleted SHALL count in the totals (Runs, Failed, Total cost, cost by source, not-priced count, Avg accept rate) and SHALL form one "Deleted agent" slice in the by-agent breakdown. They SHALL have no table row and SHALL never be the most-active agent. (Q-10, Q-23)" → S4
- AC-54: "Counted runs with a cost and no stored model name SHALL form one "Unknown model" slice in the by-model breakdown. (Q-10)" → S4
- AC-55: "The **listed agents** SHALL be every enabled agent of the workspace, plus every disabled agent with at least one counted run in the selected repository and range. (Q-11)" → S4
- AC-58: "**Cost per accepted finding** of an agent SHALL be the sum of recorded costs of its counted runs with source `local` that have a cost, divided by its `accepted` count (AC-13). It SHALL be null when `accepted` is 0 or none of those runs has a cost. (accepted P-7, Q-25)" → S4
- AC-45: "WHEN a local agent run ends with a recorded cost, the API SHALL store with the run its **cost source**: `provider` when every model call of the run returned a provider-reported cost, `estimate` when none did, and `mixed` otherwise. Runs that ended before this feature, and every CI run, SHALL have the cost source `unknown`. A run with no recorded cost SHALL have no cost source. (Q-5, Q-21)" → S1, S2
- AC-56: "The all-agents read SHALL split the range into consecutive buckets that start at `from`: 24 one-hour buckets for a range of 24 hours or less, and 24-hour buckets otherwise, the last bucket ending at `to`. It SHALL return the number of counted runs starting in each bucket; the bucket counts SHALL add up to Runs. (Q-13, Q-24)" → S4 · assumes Q-2
- AC-57: "The **previous period** SHALL be `[from − (to − from), from)` for the same repository, and its total cost SHALL be computed by AC-7 and AC-10. (Q-13)" → S4
- AC-19: "The API SHALL expose an all-agents read `GET /agent-performance?repoId=&from=&to=` that returns, for the repository and range: the repository id and full name, and the range actually applied (`from`, `to` as ISO-8601 instants); totals: runs, failed, total cost, the number of counted runs not priced, the cost split by cost source (`provider`, `estimate`, `mixed`, `unknown`), avg accept rate with `accepted`, `dismissed`, denominator and low-sample mark, and the most-active agent (id, name, runs, accept rate with denominator) or null; the previous-period total cost and whether the previous period has any counted run (AC-57), and the runs per bucket (AC-56); one row per listed agent (AC-55): agent id, name, enabled flag, runs, failed, avg cost, avg duration in milliseconds, accept rate, `accepted`, `dismissed`, denominator, low-sample mark, last run time, cost per accepted finding; the by-agent and by-model cost breakdowns." → S3, S5
- AC-20: "The API SHALL expose a per-agent read `GET /agents/:id/performance?repoId=&from=&to=` for any agent of the workspace, enabled or disabled. It SHALL return the same row fields as one AC-19 row, plus, for that agent in that repository: the by-model cost breakdown, the number of counted runs not priced, the cost split by cost source, the number of undecided findings selected by AC-13, and the number of counted runs per source (`local`, `ci`). (Q-12)" → S3, S5
- AC-21: "For every listed agent, repository and range, the per-agent read and that agent's row in the all-agents read SHALL return equal runs, failed, avg cost, avg duration, accept rate, `accepted`, `dismissed`, denominator, low-sample mark, last run and cost per accepted finding, because both apply AC-7 to AC-18, AC-55, AC-58 and AC-65." → S4, S5
- AC-22: "WHILE an agent of the workspace has no counted run in the repository and range, the per-agent read SHALL return runs 0, failed 0, a null avg cost, avg duration, accept rate and cost per accepted finding, a denominator of 0, and an empty by-model breakdown, with status 200." → S4, S5
- AC-23: "IF a read names an agent or a repository that does not exist in the caller's workspace, THEN the API SHALL answer 404." → S5
- AC-24: "IF `repoId`, `from` or `to` is missing, `repoId` is not an id, `from` or `to` is not an ISO-8601 instant, `from` is not before `to`, or `to − from` exceeds 366 × 24 hours plus 1 hour (one daylight-saving shift), THEN both reads SHALL reject the request with a validation error and read nothing. (Q-6)" → S3, S5
- AC-25: "Both reads SHALL only read stored repositories, pull requests, agents, runs, reviews and findings. They SHALL write nothing, start no review run, and make no model call, embedding call or other outbound network request (including price look-ups and GitHub calls); costs are taken as stored. [covers US-4]" → S4, S5
- AC-26: "The "Total runs" card SHALL show the number of counted runs in the range and a sparkline of counted runs per bucket (AC-56). (Q-13)" → S8
- AC-27: "The "Total cost" card SHALL show Total cost and, below it, one text line per cost source with a non-zero amount, each with its share of Total cost as a whole percentage: "Provider-reported $X (P%)", "DevDigest estimate $Y (P%)", "Mixed $Z (P%)", "Source unknown $W (P%)". WHILE at least one counted run has no cost, the card SHALL show "K runs not priced". (Q-5, Q-7, accepted P-8) [covers US-3]" → S8
- AC-66: "The "Total cost" card SHALL show the difference "Total cost − previous-period total cost" (AC-57) with its sign and the text "vs previous period". IF the previous period has no counted run, THEN the card SHALL show "No previous data" in place of the difference. (Q-13)" → S8
- AC-59: "The page SHALL state "Agent review runs only — eval runs and other model calls are not included" next to the Total cost card. (Q-15)" → S8
- AC-28: "The "Avg accept rate" card SHALL show the rate as a whole percentage, a ring of the same value, its denominator as "of N decisions", and the note "local runs only". WHILE the rate is low sample (AC-14), the card SHALL show the label "Low sample". WHILE the denominator is 0, the card SHALL show "—" and "No decisions yet" in place of the rate and the ring." → S8
- AC-29: "The "Most-active agent" card SHALL show the agent's name, its runs and its accept rate with denominator. WHILE there is no most-active agent (AC-17), the card SHALL show "—"." → S8
- AC-67: "WHEN the user activates the "Most-active agent" card, the page SHALL scroll to that agent's table row and expand it (AC-35). (accepted P-9)" → S8, S10
- AC-68: "Every accept rate the page shows (table cell, Avg accept rate card and ring, Most-active agent card) SHALL be coloured green at 70 % or more, amber from 50 % to 69 %, and red below 50 %, by its unrounded value. A low-sample rate SHALL use a neutral colour. Each coloured rate SHALL carry the text description "High (≥70%)", "Medium (50–69%)" or "Low (<50%)", available on hover, on focus and to assistive technology. (Q-19)" → S7, S8
- AC-30: "The agents table SHALL have the columns Agent, Runs, Failed, Avg cost, Avg dur., Accept, Cost / accepted, Last run, and a "View" action, with one row per listed agent (AC-55). A disabled agent's row SHALL show the text label "Disabled" next to its name. (Q-11, accepted P-3, accepted P-7)" → S9
- AC-31: "A null avg cost, avg duration, accept rate, cost per accepted finding or last run SHALL be shown as "—", never as 0." → S8, S9
- AC-32: "The Accept cell SHALL show the rate as a whole percentage together with its decisions as "accepted/denominator" (for example "78% · 45/58"). WHILE the rate is low sample (AC-14), the cell SHALL also show the text label "Low sample". The Accept column header SHALL carry the description "Accepted / (accepted + dismissed), local runs only". [covers US-2]" → S8, S9
- AC-33: "The table SHALL be sorted by Accept, descending, when the page opens with no sort in its address." → S7, S9
- AC-34: "WHEN the user activates the Accept column header, the table SHALL toggle the Accept sort between descending and ascending. In both directions, rows SHALL be ordered as: rates with 10 or more decisions, then low-sample rates, then rows with no rate; each group is sorted by rate in the chosen direction, and equal values are ordered by agent name. (Q-4)" → S7, S9
- AC-52: "WHEN the user activates the Runs, Avg cost, Avg dur. or Last run column header, the table SHALL sort by that column, toggling between descending and ascending on each activation. Rows with no value SHALL come last in both directions, equal values SHALL be ordered by agent name, and only one column SHALL drive the sort at a time. (accepted P-6)" → S7, S9
- AC-35: "WHEN the user expands a table row, the page SHALL read that agent through the per-agent read (AC-20) for the same repository and range and show, in the expanded row: the agent's cost by model, with amounts; its findings decided as accepted, dismissed, and the undecided count; its counted runs from local and from CI; its cost split by cost source. (Q-12)" → S6, S9
- AC-60: "WHILE the per-agent read of an expanded row is in flight, the expanded row SHALL show loading placeholders and no number; IF it fails, THEN the expanded row SHALL show an error message and a "Retry" control, and the rest of the page SHALL stay as it is." → S9
- AC-36: "WHEN the user activates "View" on a row, the page SHALL open that agent's editor page (`/agents/:id`). (Q-17)" → S9
- AC-37: "Opening the page, reloading it, changing the repository or the range, sorting, expanding a row, activating the Most-active card, Refresh, Retry or "View" SHALL NOT start a review run or any model call; they only read stored data through AC-19 or AC-20. [covers US-4]" → S6, S10
- AC-38: "The "Cost breakdown" section SHALL show two donut charts, "By agent" and "By model". Each has a legend that lists every slice's name, amount and share of Total cost as a whole percentage, in text; the amounts of each legend add up to Total cost (AC-18). (accepted P-2)" → S7, S9
- AC-51: "WHILE a breakdown has more than 6 slices, its donut SHALL show the 6 largest slices on their own and one "Other" segment with the sum of the rest, and its legend SHALL still list every slice. Slices are ordered by amount, descending, then by name. (accepted P-5)" → S7, S9
- AC-39: "WHILE Total cost is 0 because no counted run has a cost, the "Cost breakdown" section SHALL show the message "No priced runs in this period" in place of the charts." → S9 · assumes Q-3
- AC-40: "WHILE a read is in flight, the page SHALL show loading placeholders in the cards, the table and the cost breakdown, and SHALL show no number, no zero and no "—" in them." → S10
- AC-41: "IF the read fails, THEN the page SHALL show an error message and a "Retry" control in place of the cards, the table and the cost breakdown, SHALL show no number or zero, and SHALL keep the range control and the repository selector usable." → S10
- AC-42: "WHILE the workspace has agents but the selected repository has no counted run in the range, the page SHALL show "No agent runs on <owner/name> in this period" with a hint to choose a longer range in place of the table and the cost breakdown; the Total runs card SHALL show 0 and the Avg accept rate and Most-active agent cards SHALL show "—"." → S8, S10
- AC-43: "WHILE the workspace has a repository but no agent, the page SHALL show "No agents yet" with a link to the Agents page in place of the cards, the table and the cost breakdown." → S10 · assumes Q-1
- AC-44: "WHILE the range has counted runs and a listed agent has none, that agent's row SHALL show Runs 0, Failed 0 and "—" for Avg cost, Avg dur., Accept and Cost / accepted, distinct from the page-level empty state of AC-42." → S9
- NFR-1: "(performance): WHEN the range holds up to 10 000 counted runs, each read SHALL answer within 2 seconds on a developer machine. [default of non-blocking Q-20]" → S2, S4, S5
- NFR-2: "(security): Both reads SHALL scope every row to the caller's workspace and the requested repository, and SHALL validate `repoId`, `from`, `to` and `:id` against their schema before any query (AC-24)." → S3, S4, S5
- NFR-3: "(accessibility): The range control, every sortable column header (with its current sort state exposed to assistive technology), row expansion, the Most-active card, "View", "Refresh" and "Retry" SHALL be operable by keyboard and have accessible names. Each chart, the ring and the sparkline SHALL have a text equivalent with the same values. "Low sample", accept-rate quality (AC-68) and cost source SHALL be conveyed by text, not by colour alone. Truncated text SHALL be available in full on focus." → S8, S9, S10
- NFR-4: "(reliability): The reads SHALL be deterministic: the same stored data, repository and range give the same values and the same row, slice and bucket order. Rounding SHALL happen only for display." → S4
- NFR-5: "(security): Both reads SHALL be covered by the API's existing rate limit." → S5

## Traceability
Verify column: the command alias that proves it; hands-on checks need `./scripts/dev.sh` (stack up) with seeded runs. "Hint" is the hands-on path.

| Requirement | Steps | Tests | Verify | Verification hint | State |
|---|---|---|---|---|---|
| AC-1 | S6 | T-21 | CT | Sidebar GLOBAL: "Agent Performance" above "CI Runs", click opens `/agent-performance?repo=<active>`; "Multi-Agent Review" still in WORKSPACE | planned |
| AC-2 | S10 | T-20 | CT | Open page; title and subtitle text exact | planned |
| AC-61 | S10 | T-20 | CT | Under subtitle: "Repository: acme/web" matching the address repo | assumes Q-4 |
| AC-62 | S6, S10 | T-20, T-21 | CT | Pick another repo in the sidebar selector: stays on page, range/sort kept, row collapsed | assumes Q-4 |
| AC-63 | S10 | T-20 | CT | Workspace with no repo: "No repository yet" + import link; network tab shows no `/agent-performance` call | planned |
| AC-47 | S7, S10 | T-10, T-20 | CT | Change range/sort/expand, reload and open link in a new tab: same view | planned |
| AC-64 | S7, S10 | T-10, T-20 | CT | Open `?repo=bogus&sort=zzz&dir=up&range=custom`: parts reset, notice names each, valid parts kept | planned |
| AC-50 | S10 | T-20 | CT | "Data as of" time changes after Refresh; Refresh re-sends the same repo and range | planned |
| AC-3 | S10 | T-19, T-20 | CT | Range control offers 3 choices; default "30 days" | planned |
| AC-4 | S6, S8, S10 | T-16, T-20 | CT | Switch 1 day: card labels "(1D)", one read sent | planned |
| AC-5 | S6, S7 | T-11, T-22 | CT | Network tab: `from`/`to` instants; custom range = local midnights, `to` = day after end | planned |
| AC-6 | S7, S10 | T-11, T-19 | CT | Custom end before start / future / >366 days: inline error, no request | planned |
| AC-65 | S4 | T-6 | SI | API: seeded CI run `ACME/Web` counted for repo `acme/web`; run with deleted PR absent | planned |
| AC-7 | S4 | T-5, T-6 | SU, SI | Seeded `running` run absent from totals; from inclusive, to exclusive | planned |
| AC-8 | S4 | T-6 | SI | Runs with `multi_agent_run_id` counted once each | planned |
| AC-9 | S4 | T-5 | SU | Runs/Failed per agent match seed | planned |
| AC-10 | S4 | T-5, T-6 | SU, SI | Null cost adds nothing; `not_priced_runs` matches | planned |
| AC-11 | S4 | T-5 | SU | Avg cost uses only `done` priced runs | planned |
| AC-12 | S4 | T-5 | SU | Avg duration uses only `done` runs with duration | planned |
| AC-13 | S4 | T-5, T-6 | SU, SI | Toggle a finding accept→undecided, re-read: counts change; CI contributes none | planned |
| AC-14 | S4 | T-5 | SU | 9 decisions → `low_sample` true; 10 → false; 0 → false | planned |
| AC-15 | S4 | T-5, T-6 | SU, SI | Pooled, not mean of rates; includes deleted-agent runs | planned |
| AC-16 | S4 | T-6 | SI | Agent with run outside range: `last_run_at` still set | planned |
| AC-17 | S4 | T-5 | SU | Tie → latest last run → name | planned |
| AC-18 | S4 | T-5, T-6 | SU, SI | Sum of both breakdowns equals `total_cost_usd` (tolerance 1e-9) | planned |
| AC-53 | S4 | T-5, T-6 | SU, SI | Delete an agent: no row, `agent_id:null` slice, totals unchanged | planned |
| AC-54 | S4 | T-5, T-6 | SU, SI | Priced run with null model → `model:null` slice | planned |
| AC-55 | S4 | T-6 | SI | Disabled agent with zero runs not in rows; with a run it is | planned |
| AC-58 | S4 | T-5 | SU | cost / accepted; null when accepted 0 | planned |
| AC-45 | S1, S2 | T-1, T-2, T-3, T-6 | RC, SI | Run a mocked local review; `agent_runs.cost_source` = provider/estimate/mixed; failed run null; old and CI rows read as `unknown` | planned |
| AC-56 | S4 | T-5 | SU | Buckets: 24×1 h for 24 h; 30 daily for 30 d; sum = runs | assumes Q-2 |
| AC-57 | S4 | T-5, T-6 | SU, SI | Previous period total and `has_runs` | planned |
| AC-19 | S3, S5 | T-4, T-6 | SU, SI | `GET /agent-performance?repoId&from&to` returns every listed field | planned |
| AC-20 | S3, S5 | T-4, T-6 | SU, SI | `GET /agents/:id/performance?...` for enabled and disabled agent | planned |
| AC-21 | S4, S5 | T-6 | SI | Every overview row deep-equals the per-agent read's row fields | planned |
| AC-22 | S4, S5 | T-5, T-6 | SU, SI | Agent without runs: 200 with zeros/nulls and empty `cost_by_model` | planned |
| AC-23 | S5 | T-6 | SI | Unknown or other-workspace agent/repo → 404 | planned |
| AC-24 | S3, S5 | T-4, T-9 | SU | Missing/invalid/reversed/over-long → 422 `validation_error` | planned |
| AC-25 | S4, S5 | T-7 | SI | Row counts unchanged; fetch trap and Mock LLM/GitHub/PriceBook never called | planned |
| AC-26 | S8 | T-16 | CT | Total runs card number and sparkline text equivalent equal bucket sums | planned |
| AC-27 | S8 | T-16 | CT | Source lines with %; "K runs not priced" | planned |
| AC-66 | S8 | T-16 | CT | Signed delta + "vs previous period"; "No previous data" | planned |
| AC-59 | S8 | T-16 | CT | Note text beside Total cost card | planned |
| AC-28 | S8 | T-16 | CT | % + ring + "of N decisions" + "local runs only"; Low sample; "—"/"No decisions yet" | planned |
| AC-29 | S8 | T-16 | CT | Name, runs, accept with denominator; "—" | planned |
| AC-67 | S8, S10 | T-16, T-20 | CT | Click/Enter on card: scrolls to and expands the row | planned |
| AC-68 | S7, S8 | T-12, T-15 | CT | 69.9 % amber, 70 % green, 49.9 % red; low sample neutral; hover/focus shows description | planned |
| AC-30 | S9 | T-17 | CT | Nine columns; "Disabled" label | planned |
| AC-31 | S8, S9 | T-15, T-17 | CT | Null values render "—" | planned |
| AC-32 | S8, S9 | T-15, T-17 | CT | "78% · 45/58"; "Low sample"; header description | planned |
| AC-33 | S7, S9 | T-13, T-17 | CT | Fresh page: Accept descending | planned |
| AC-34 | S7, S9 | T-13, T-17 | CT | Toggle both directions: qualified, low sample, no rate | planned |
| AC-52 | S7, S9 | T-13, T-17 | CT | Other columns toggle; nulls last | planned |
| AC-35 | S6, S9 | T-17 | CT | Expand: one per-agent read with the overview's applied range | planned |
| AC-60 | S9 | T-17 | CT | Placeholders while loading; error + Retry inside the row only | planned |
| AC-36 | S9 | T-17 | CT | View link href `/agents/<id>` | planned |
| AC-37 | S6, S10 | T-20, T-22 | CT | Network tab during all actions: GET reads only | planned |
| AC-38 | S7, S9 | T-14, T-18 | CT | Two donuts; legends with name, amount, % | planned |
| AC-51 | S7, S9 | T-14, T-18 | CT | 8 agents: 6 slices + "Other" in donut, 8 legend rows | planned |
| AC-39 | S9 | T-18 | CT | All runs unpriced: message replaces charts | assumes Q-3 |
| AC-40 | S10 | T-20 | CT | Throttle network: skeletons only, no number/zero/"—" | planned |
| AC-41 | S10 | T-20 | CT | Stop API: error + Retry; range control still usable | planned |
| AC-42 | S8, S10 | T-16, T-20 | CT | Range with no runs: message + hint; cards 0 / "—" | planned |
| AC-43 | S10 | T-20 | CT | No agents: "No agents yet" + Agents link | assumes Q-1 |
| AC-44 | S9 | T-17 | CT | Zero-run agent row among active ones | planned |
| NFR-1 | S2, S4, S5 | T-8 | SI | Seed 10 000 counted runs (+10 000 previous): each read < 2000 ms | planned |
| NFR-2 | S3, S4, S5 | T-4, T-6, T-9 | SU, SI | Other-workspace data never in output; invalid ids 422 before any query | planned |
| NFR-3 | S8, S9, S10 | T-15..T-20 | CT | Tab through the page, Enter/Space on headers, rows, card; screen-reader names; sort state `aria-sort` | planned |
| NFR-4 | S4 | T-5, T-8 | SU, SI | Two identical calls return deep-equal bodies; fixed ORDER BY | planned |
| NFR-5 | S5 | not tested — rate limit is off under `NODE_ENV=test` (server/AGENTS.md) | `rg -n "rateLimit" server/src/modules/agent-performance` must return nothing | Production-mode app: >120 calls/min → 429 | planned |

## Non-functional requirements
| NFR | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 perf | SPEC-10 | Index `agent_runs(workspace_id, ran_at)` in the S2 migration; repository fetches slim run facts + one grouped decision query + one grouped last-run query; aggregation in memory (S4) | T-8: 10 000 + 10 000 runs, `< 2000 ms` per read |
| NFR-2 security | SPEC-10 + server/AGENTS.md (schema-first, workspace-scoped) | Zod query/params schema (S3) rejects before handler; every repository method takes `workspaceId` and filters runs, PRs, agents, reviews (S4) | T-4, T-6 (other workspace), T-9 |
| NFR-3 a11y | SPEC-10 | Text equivalents for donut/ring/sparkline, `aria-sort`, buttons for headers/rows/card, `title` + focus-visible description for truncation and accept-rate quality (S8, S9, S10) | T-15..T-20 + manual keyboard/screen-reader pass |
| NFR-4 reliability | SPEC-10 + server INSIGHTS 2026-09-24 | Total ORDER BY in every query (`ran_at, id`; agents `name, id`); name ties compared by code point, not locale; rounding only in client | T-5, T-8 |
| NFR-5 rate limit | SPEC-10 | Routes registered inside the module plugin after the global `@fastify/rate-limit` (server/src/app.ts:112); no `config.rateLimit` override | grep command in traceability |
| Untrusted input | guidance (CLAUDE.md, spec "Untrusted inputs") | Names rendered as text only; address params validated in `_model/address.ts` | T-10, T-15..T-20 |

## Requirements review
- Q-1 [non-blocking] AC-43 — "no agent" is not defined for a workspace whose agents are all disabled with no runs (they are not listed, AC-55) — planned with: treat "no listed agent" (`rows` empty) as AC-43; no extra response field.
- Q-2 [non-blocking] AC-56 — "24 one-hour buckets for a range of 24 hours or less" and "last bucket ending at `to`" contradict for spans under 24 h (a 23-hour DST day, or any short API range) — planned with: `ceil(span / 1 h)` one-hour buckets when span ≤ 24 h, last one cut at `to`; 24-hour buckets otherwise; counts always add up to Runs.
- Q-3 [non-blocking] AC-39/AC-38 — Total cost can be 0 while runs are priced (free models are stored as 0, client/src/lib/format.ts:17-19); shares would divide by zero — planned with: show AC-39's message only when no counted run has a cost; when every priced run is free, show legends with "$0.00 · 0%" and one neutral ring.
- Q-4 [non-blocking] AC-61/AC-62 — the sidebar selector shows the active repository, the page may show the address repository — planned with: the view syncs the active repository to a valid address repository (`setRepoId`), so selector and page agree.
- Decision D-1 (not a spec change) AC-45 — migration adds nullable `cost_source` with no data backfill; reads treat `cost_source IS NULL AND cost_usd IS NOT NULL` as `unknown` (covers old local rows and all CI rows, NG-11) and `cost_usd IS NULL` as "no source". A provider result without `costSource` (OpenAI/Anthropic adapters, mocks) counts as `estimate`.
- Decision D-2 AC-13 — findings are attributed only through `reviews.run_id` (reviews.ts:19); a review with null/unknown run id contributes to no agent (design-review note); `findings.kind` `finding` and `lethal_trifecta` both count.
- Decision D-3 — `onSelectRepo` in the shell always pushes `/repos/:id/pulls` (client/src/components/app-shell/hooks/useShellContext.ts:33-39), which would break AC-62; S6 changes it (non-vendor file) to stay on `/agent-performance` keeping range and sort.
- Requirements suggestions for the spec author: (a) fix AC-56 wording for spans under 24 h (Q-2); (b) state the zero-cost-priced case in AC-39 (Q-3); (c) define "no agent" for AC-43 (Q-1); (d) AC-18 equality on floats holds only within floating-point tolerance, say so; (e) the default chosen for AC-62 re the shell selector (Q-4).

## Scope
In: cost-source capture (reviewer-core → `agent_runs.cost_source`); shared contract; read-only module `agent-performance` with two routes; client page `/agent-performance` (cards, table, donuts, range, address state), nav entry, shell repo-switch tweak, i18n namespace.
Out: Stats tab (NG-1); any change to how runs/costs/decisions are produced besides AC-45 (NG-2); live updates (NG-3); editing/running/deleting (NG-4); Memory page and moving Multi-Agent Review (NG-5); invoice reconciliation (NG-6); cost source on other screens (NG-7); per-agent trend arrows (NG-8); eval/non-agent model calls (NG-9); workspace-wide view / repo filter (NG-10); CI runner/artifact change and the committed bundle `.devdigest/runner/**` (NG-11). Documentation (doc-writer), commits and pushes.

## Context used
- Guidance read: CLAUDE.md, server/AGENTS.md (= CLAUDE.md), client/CLAUDE.md, reviewer-core/CLAUDE.md, TESTING.md, onion-architecture SKILL + rules (drizzle, fastify, zod-contracts, testing), frontend-ui-architecture SKILL + constants reference.
- Lessons applied: server INSIGHTS 2026-09-24 (list ORDER BY) → total ORDER BY everywhere (S4); 2026-09-25 (drizzle-kit rename prompt) → S2 generates with a pseudo-terminal and reads the SQL; 2026-10-12 (cancel can still end `done`) → counting uses the final stored status only, no step relies on cancel (EC-9); 2026-09-26 (hermetic suite) → T-7 injects mocks, never a real key. client INSIGHTS 2026-10-04 (value imports from shared blank the page) → `import type` only, all rules re-implemented in `_model/` (S6–S10); 2026-09-25 (`relativeTime` needs `now`) → "Last run" uses `useNow` (S9); 2026-09-26 (no `user-event`) → tests use `fireEvent` (T-15..T-20); 2026-09-30 (`getByTitle` and SVG) → chart tooltips asserted with `getByText`; 2026-10-12 (mutate in StrictMode) → Refresh is a `refetch()` from a click handler, no mount-time mutation. reviewer-core INSIGHTS: no entries.
- Designs: `specs/agent-performance-dashboard/designs/1-agent-performance-dashboard.webp` — populated page: header + "30 days" button, four stat cards (runs + sparkline, cost + delta, accept ring, most-active), agents table with sort arrow on Accept, two donuts with legend, sidebar entry → steps S8, S9, S10 (design-review.md read; its module table and notes are input only).
- Skills: onion-architecture — S4, S5 (rings, repository/service/route split, no SQL policy); drizzle-orm-patterns — S2, S4 (column, index, grouped aggregates); zod — S3; fastify-best-practices — S5; frontend-ui-architecture — S6–S10 (feature folder, `_model`, i18n, data layer); next-best-practices — S10 (`useSearchParams` inside Suspense, as client/src/app/multi-agent-review/page.tsx); react-best-practices — S8–S10; react-testing-library — T-15..T-22.

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| reviewer-core does no I/O, imports only zod/own modules | reviewer-core/CLAUDE.md | S1 only aggregates a per-call tag already returned by the injected provider |
| Contract change = edit server canonical + client copy | CLAUDE.md "Conventions", onion zod-contracts | S1 (adapters.ts) and S3 (new contract file + barrel) edit both copies, byte-identical |
| Only repositories import drizzle/db schema | onion SKILL checklist 2 | S4 `repository.ts` is the only Drizzle file; aggregate/service/routes pure |
| No business rules in SQL; fetch then decide | onion rules/drizzle.md | Status list, low-sample threshold, listed-agents rule live in `constants.ts`/`aggregate.ts`; SQL only scopes (workspace, repository, range) and takes the status list as a parameter |
| Route = tenancy + schema + one service call | onion rules/fastify.md | S5 routes call `container.agentPerformanceService.*` once; 404 via `NotFoundError` |
| Static module registration, DI container, services take explicit deps | server/AGENTS.md | S5 adds one import + one entry in `modules/index.ts`; service built by a lazy `Container` getter with its repository injected |
| Schema-first validation, 422 before handler | server/AGENTS.md | S3 `AgentPerformanceQuery` + `IdParams` |
| Migration generated by drizzle-kit, never hand-named/edited | CLAUDE.md | S2 runs `pnpm db:generate`; no SQL edits |
| `*.it.test.ts` for DB tests | CLAUDE.md "Naming" | T-3, T-6, T-7, T-8 |
| Client: data only through `lib/hooks` → `lib/api.ts`; strings via next-intl; thin pages; feature folders with sibling tests | client/CLAUDE.md | S6 hooks, S6 messages, S10 thin `page.tsx`, `_components/<Pascal>/` with tests |
| Client imports only types from `@devdigest/shared` | client INSIGHTS 2026-10-04 | `import type` everywhere |
| `*/vendor/**` off-limits except the listed paths | CLAUDE.md "Do not touch" | Edited: `server/src/vendor/shared/**` (canonical) + `client/src/vendor/shared/**` (copy) and `client/src/vendor/ui/nav.ts` (owner exception, one entry). Not edited: `client/src/vendor/ui/charts/Donut.tsx` (its legend has no shares → own donut in the feature) |
| Features do not import each other; shared → features → app | frontend-ui-architecture | New avatar and AcceptRate live in the feature (not imported from multi-agent-review); `lib/hooks` receives the range resolver as a callback instead of importing from `app/` |
| No lockfile edits, no new dependency | CLAUDE.md | recharts is already a client dependency (used at client/src/vendor/ui/charts/Donut.tsx:3 and client/src/app/eval/_components/AgentEvalView/_components/TrendChart/TrendChart.tsx:9) |
| Page and reads never call a model/network | AC-25 | Service has only the repository as dependency; `PriceBook` is never injected |

## Steps
### S1 reviewer-core reports the cost source per call and per run
- Module / layer: reviewer-core (ring 1) + shared ports (ring 2)
- Files:
  - modify `server/src/vendor/shared/adapters.ts` — add `export type RunCostSource = 'provider' | 'estimate' | 'mixed'` and optional `costSource?: RunCostSource` on `StructuredResult` (adapters.ts:83-91), documented "absent = not provider-reported (estimate)".
  - modify `client/src/vendor/shared/adapters.ts` — identical copy.
  - modify `reviewer-core/src/llm/openrouter.ts` — track per attempt whether `usage.cost` was a number (lines 104-108); on return set `costSource`: `provider` if every attempt reported, `mixed` if some, `estimate` if none (cost then from `estimateCost`, line 117).
  - modify `reviewer-core/src/review/run.ts` — `ReviewOutcome.costSource: RunCostSource | null` (run.ts:104-126): count calls with non-null `costUsd`; `null` when run `costUsd` is null; `provider` when all calls are `provider`; `estimate` when none is `provider`/`mixed` (absent counts as estimate); else `mixed`. Aggregation next to the cost sum at run.ts:198.
- Designs: —
- Skills to apply: onion-architecture § rings/reviewer-core, typescript-expert
- Depends on: —
- Tests (single-agent mode): T-1, T-2
- Done when: an OpenRouter call whose responses carry `usage.cost` yields `costSource:'provider'`; `reviewPullRequest` over mixed chunks yields `mixed`; no new import or I/O in reviewer-core; other providers/mocks untouched and still compile.
- Verify: `RC` and `ST` and `AR`

### S2 Persist the cost source (schema, migration, run completion)
- Module / layer: server persistence + reviews application
- Files:
  - modify `server/src/db/schema/runs.ts` — add `costSource: text('cost_source', { enum: ['provider','estimate','mixed'] })` (nullable) after `costUsd` (runs.ts:42); fix the "USD billed" comment (runs.ts:37-42) to say provider-reported or estimated, source in `cost_source`; add `index('agent_runs_ws_ran_idx').on(t.workspaceId, t.ranAt)` to the table callback (runs.ts:74-84) for NFR-1.
  - create (generated) `server/src/db/migrations/0018_<generated>.sql` plus its `meta/` snapshot and journal entry — produced by `cd server && pnpm db:generate`; per server INSIGHTS 2026-09-25 run it under a pseudo-terminal (`(for i in $(seq 1 20); do sleep 2; printf '\r'; done) | script -q /dev/null pnpm db:generate`), accept "create column", then read the SQL: only `ADD COLUMN cost_source` and `CREATE INDEX`. Never hand-name or edit; no backfill (D-1).
  - modify `server/src/modules/reviews/repository/run.repo.ts` — `completeAgentRun` accepts `costSource?: RunCostSource | null` and stores `values.costUsd == null ? null : values.costSource ?? null` (run.repo.ts:142-181; update the "billed" comment at :150-153).
  - modify `server/src/modules/reviews/repository.ts` — same optional field in the facade type (repository.ts:148-171; comment :155-158).
  - modify `server/src/modules/reviews/run-executor.ts` — pass `costSource: outcome.costSource` in the success-path `completeAgentRun` (run-executor.ts:258, 296-307). The failure/cancel calls at :88 and :357 stay without a cost source.
- Designs: —
- Skills to apply: drizzle-orm-patterns § schema/migrations, onion-architecture § persistence ring
- Depends on: S1
- Tests (single-agent mode): T-3
- Done when: a successful local run stores `cost_source` (`provider`/`estimate`/`mixed`); a failed or unpriced run stores null; `pnpm db:migrate` applies 0018 on a fresh DB; existing tests still pass.
- Verify: `ST` and `SU` and `SI` (the reviews integration suites); `cd server && pnpm db:migrate`

### S3 Shared contract of the two reads
- Module / layer: contracts (ring 2), both copies
- Files:
  - create `server/src/vendor/shared/contracts/agent-performance.ts` (snake_case like eval-ci.ts), Zod:
    - `PerfInstant = z.string().datetime({ offset: true })`.
    - `AgentPerformanceQuery = z.object({ repoId: z.string().uuid(), from: PerfInstant, to: PerfInstant }).superRefine` — `from < to` and `to − from ≤ 366·86 400 000 + 3 600 000` ms (AC-24).
    - `AcceptStats {rate:number|null, accepted:int, dismissed:int, decisions:int, low_sample:boolean}`; `CostBySource {provider,estimate,mixed,unknown:number}`.
    - `AgentPerformanceRow {agent_id, name, enabled, runs, failed, avg_cost_usd|null, avg_duration_ms|null, accept:AcceptStats, last_run_at:string|null, cost_per_accepted_usd|null}`.
    - `AgentCostSlice {agent_id:string|null, name:string|null, cost_usd}` (null agent = deleted agent); `ModelCostSlice {model:string|null, cost_usd}` (null model = unknown model).
    - `AgentPerformanceOverview {repo:{id,full_name}, range:{from,to}, totals:{runs,failed,total_cost_usd,not_priced_runs,cost_by_source,accept,most_active:{agent_id,name,runs,accept}|null}, previous_period:{total_cost_usd,has_runs}, buckets:[{start,runs}], rows:[Row], cost_by_agent:[AgentCostSlice], cost_by_model:[ModelCostSlice]}`.
    - `AgentPerformanceDetail = AgentPerformanceRow.extend({repo, range, cost_by_model, not_priced_runs, cost_by_source, undecided:int, runs_by_source:{local,ci}})`.
  - modify `server/src/vendor/shared/index.ts` — one `export *` line (barrel convention: extend by new file).
  - create `client/src/vendor/shared/contracts/agent-performance.ts` and modify `client/src/vendor/shared/index.ts` — byte-identical copies.
- Designs: —
- Skills to apply: zod § object/superRefine/infer, onion-architecture § zod-contracts
- Depends on: S1 (both touch shared; keeps one editor at a time)
- Tests (single-agent mode): T-4
- Done when: both copies are identical; `AgentPerformanceQuery` rejects each AC-24 case and accepts `Z` and offset instants.
- Verify: `ST` and `CTC` and `SU`

### S4 Module `agent-performance` core: types, constants, aggregation, repository
- Module / layer: server application (pure) + persistence. **The only step that creates a new module.**
- Files (all create, in `server/src/modules/agent-performance/`):
  - `constants.ts` — `COUNTED_STATUSES = ['done','failed','cancelled']`, `MIN_DECISIONS = 10`, `HOUR_MS`, `DAY_MS`.
  - `types.ts` — plain TS (no Zod): `RunFact {id, agentId|null, ranAt:Date, status, source:'local'|'ci', costUsd|null, costSource|null, durationMs|null, model|null}`, `DecisionCount {runId, accepted, dismissed, undecided}`, `LastRun {agentId, at:Date}`, `AgentRef {id,name,enabled}`, `RepoRef {id,fullName}`, `PerformanceRepo` port (methods below), `AgentPerformanceDeps`.
  - `aggregate.ts` — pure functions, no Drizzle, the single implementation of AC-7..AC-18, AC-53..AC-58: `buildAgentStats(agent, runs, decisions, lastRun)` (used by BOTH reads → AC-21), `buildOverview(input)`, `buildDetail(input)`. Rules: counted = status in `COUNTED_STATUSES` (running excluded here, not in SQL); averages over `done`; accept stats only from `local` runs' decisions; `low_sample = 1 ≤ decisions ≤ 9`; listed agents = enabled ∪ disabled-with-counted-run; rows ordered by `name` (case-insensitive code-point compare) then id; most-active by runs, last run, name; slices by amount desc, then name, then model/agent id; cost source = `cost_source ?? 'unknown'` for priced runs (D-1); buckets from `from` (Q-2: `ceil(span/1h)` hourly when span ≤ 24 h, else daily; last cut at `to`; ran_at → bucket by floor); previous period = same rules on `[from−(to−from), from)`; sums accumulated in (ran_at, id) order.
  - `repository.ts` — `class AgentPerformanceRepository { constructor(private db: Db) }`, every method workspace-scoped, total ORDER BY: `getRepo(ws, repoId)`, `getAgent(ws, agentId)`, `listAgents(ws)` (order name, id), `listRunFacts(ws, repo, range, agentId?)` (scope below, no status filter, order ran_at, id), `decisionCounts(ws, repo, range, agentId?)` (join `reviews.run_id = agent_runs.id`, `findings.review_id`; accepted = `accepted_at` not null; dismissed = `dismissed_at` not null and `accepted_at` null; undecided = both null; grouped by run id), `lastRuns(ws, repo, statuses, agentId?)` (max `ran_at` per agent, any time, status in the passed list). Repository scope (AC-65, SQL scoping only): `(source='local' AND pr_id IN (SELECT id FROM pull_requests WHERE repo_id=? AND workspace_id=?)) OR (source='ci' AND lower(repo)=lower(full_name))`. Returns the internal types.
- Designs: —
- Skills to apply: onion-architecture § persistence ring, drizzle-orm-patterns § aggregates/`count(*) filter`/`inArray`, postgresql-table-design § indexes
- Depends on: S2, S3
- Tests (single-agent mode): T-5
- Done when: `buildOverview` over fixture facts matches every AC rule; no file other than `repository.ts` imports drizzle/db schema (onion grep passes).
- Verify: `ST` and `SU`; then `rg -n "from '.*db/schema|from 'drizzle-orm" server/src/modules/agent-performance --glob '!**/repository*'` returns nothing

### S5 Service, routes, registration
- Module / layer: server application + transport + composition root
- Files:
  - create `server/src/modules/agent-performance/service.ts` — `AgentPerformanceService({ repo })`: `getOverview(ws, query)` (repo → `NotFoundError('Repository not found')`; loads agents, run facts for range and previous period, decisions, last runs; calls `buildOverview`), `getAgentDetail(ws, agentId, query)` (agent and repo 404; same loaders restricted to the agent; `buildDetail`). No other dependency (AC-25: no PriceBook, LLM, GitHub, fetch).
  - create `server/src/modules/agent-performance/routes.ts` — default plugin: `GET /agent-performance` (`querystring: AgentPerformanceQuery`, `response 200: AgentPerformanceOverview`), `GET /agents/:id/performance` (`params: IdParams`, query, `response 200: AgentPerformanceDetail`); each handler: `getContext` + one service call. No `rateLimit` option (NFR-5).
  - modify `server/src/modules/index.ts` — one import + entry `agentPerformance`.
  - modify `server/src/platform/container.ts` — lazy `agentPerformanceService` getter next to `ciService` (container.ts:383-418 pattern), `new AgentPerformanceRepository(this.db)`.
- Designs: —
- Skills to apply: onion-architecture § fastify/ports-di, fastify-best-practices § routes/schemas, zod
- Depends on: S4
- Tests (single-agent mode): T-6, T-7, T-8, T-9
- Done when: both routes answer per AC-19..AC-24; invalid query → 422; unknown agent/repo → 404; per-agent row equals the overview row; no write or outbound call.
- Verify: `ST`, `SU`, `SI`

### S6 Client data layer, sidebar entry, shell repo switch, i18n
- Module / layer: client data layer + shell + vendor exception
- Files:
  - modify `client/src/vendor/ui/nav.ts` — GLOBAL items: add `{ key: "agent-performance", label: "Agent Performance", icon: "Activity", href: "/agent-performance?repo=:repoId" }` before "CI Runs" (nav.ts:46-49); nothing else (owner-approved exception). `activeKeyFor` and `nav.agent-performance` label already exist (helpers.ts:37, shell.json:28).
  - create `client/src/lib/hooks/agent-performance.ts` + modify `client/src/lib/hooks/index.ts` (barrel) — `useAgentPerformance(repoId|null, rangeKey, resolveRange: () => {from,to}, enabled)` → `api.get<AgentPerformanceOverview>('/agent-performance?repoId=…&from=…&to=…')`, key `["agent-performance", repoId, rangeKey]` (no instants in the key; `resolveRange()` runs inside `queryFn`, so "now" is the send moment, AC-5); `useAgentPerformanceDetail(agentId|null, repoId, applied: {from,to}|null)` → `/agents/:id/performance?...` with the overview's applied range, key includes it. Both: `staleTime: 0`, `refetchOnWindowFocus: false`, `refetchOnMount: "always"`, `retry: false`, no `refetchInterval` (NG-3; provider default staleTime is 30 s, providers.tsx:28). `import type` from shared only.
  - modify `client/src/components/app-shell/helpers.ts` + `client/src/components/app-shell/hooks/useShellContext.ts` — `onSelectRepo`: when `pathname` starts with `/agent-performance`, `router.push` to `/agent-performance` with the current `window.location.search` (read at click time, avoiding `useSearchParams` in the shell) where `repo=<id>` is set and `expanded` removed (pure `repoSwitchHref(pathname, search, id)` in helpers.ts); other pages keep `/repos/${id}/pulls` (AC-62).
  - rewrite `client/messages/en/agentPerformance.json` — the existing file is a stale placeholder (title/subtitle differ from the spec, keys unused); new keys cover every string of AC-2..AC-67 (ICU plurals for runs/decisions).
- Designs: —
- Skills to apply: frontend-ui-architecture § data layer, i18n; next-best-practices § client boundary
- Depends on: S3
- Tests (single-agent mode): T-21, T-22
- Done when: sidebar shows the item above CI Runs; hook builds the right URLs; shell switch on the new page keeps range/sort and drops `expanded`.
- Verify: `CT` and `CTC`

### S7 Client rules (`_model/`): address, range, accept-rate, sort, breakdown
- Module / layer: client feature, framework-free functions
- Files (create in `client/src/app/agent-performance/_model/`): `constants.ts` (presets, `MIN_DECISIONS`, thresholds 70/50, `TOP_SLICES=6`, `MAX_CUSTOM_DAYS=366`), `range.ts` (preset/custom → `{from,to}` ISO via local-time midnights `new Date(y,m,d)` and `d+1`; AC-6 validation returning a reason code; card label "(1D)", "(30D)", "(start – end)"), `address.ts` (parse/serialize `repo`, `range` (`1d|30d|custom`), `start`, `end`, `sort`, `dir`, `expanded`; `resolveAddress(params, {repos, activeRepoId, agentIds})` → values + list of reset parts, AC-64), `accept-rate.ts` (tone high ≥70 / medium 50–69 / low <50 on the unrounded rate, neutral when `low_sample`; description keys), `sort.ts` (Accept groups: ≥10 decisions, low sample, no rate; other columns nulls last; name tie-break; one active column), `breakdown.ts` (slices → top 6 + "Other", whole-% shares, Q-3 zero-total guard, order amount desc then name).
- Designs: —
- Skills to apply: frontend-ui-architecture § business logic in plain modules, constants
- Depends on: S6
- Tests (single-agent mode): T-10, T-11, T-12, T-13, T-14
- Done when: each function satisfies its AC without React; no value import from `@devdigest/shared`.
- Verify: `CT` and `CTC`

### S8 Accept-rate text, agent avatar, summary cards
- Module / layer: client feature components
- Files (create in `client/src/app/agent-performance/_components/`): `AcceptRate/{AcceptRate.tsx,index.ts,styles.ts}` (percentage · accepted/decisions, tone class, "Low sample" text, description via `title` + `aria-description`/visually-hidden text on focus, "—" for null), `AgentAvatar/{AgentAvatar.tsx,index.ts}` (letter avatar, decorative, Q-26), `SummaryCards/{SummaryCards.tsx,TotalRunsCard.tsx (sparkline private, with sr-only text equivalent),TotalCostCard.tsx,AvgAcceptCard.tsx (ring + text equivalent),MostActiveCard.tsx (button, `onOpen(agentId)`),index.ts,styles.ts}`.
- Designs: `specs/agent-performance-dashboard/designs/1-agent-performance-dashboard.webp` — four stat cards (Total runs 253 + sparkline, Total cost $8.74 −$1.20, Avg accept ring 61 %, Most-active card)
- Skills to apply: frontend-ui-architecture § splitting, react-best-practices, ui-ux-pro-max § cards/accessibility
- Depends on: S7
- Tests (single-agent mode): T-15, T-16
- Done when: every card state of AC-26..AC-29, AC-66, AC-59, AC-42 renders; all text through `useTranslations("agentPerformance")`; truncated names carry `title` and are focusable.
- Verify: `CT` and `CTC`

### S9 Agents table (with expanded row) and cost breakdown
- Module / layer: client feature components
- Files (create): `AgentsTable/{AgentsTable.tsx (header buttons with `aria-sort`, rows as buttons with `aria-expanded`),AgentRow.tsx (Disabled label, View link `/agents/:id`, "Last run" via `useNow`),ExpandedRow.tsx (uses `useAgentPerformanceDetail`; skeleton / error+Retry / by-model amounts, accepted/dismissed/undecided, local vs CI, cost by source),index.ts,styles.ts}`, `CostBreakdown/{CostBreakdown.tsx (two panels, AC-39 message, Q-3),CostDonut.tsx (recharts `PieChart` directly; sr-only table with the same values),index.ts,styles.ts}`.
- Designs: `specs/agent-performance-dashboard/designs/1-agent-performance-dashboard.webp` — agents table (columns, Accept sort arrow, View action) and the two donuts with legends
- Skills to apply: frontend-ui-architecture, react-best-practices, ui-ux-pro-max § table/chart
- Depends on: S8
- Tests (single-agent mode): T-17, T-18
- Done when: AC-30..AC-36, AC-44, AC-52, AC-60, AC-38, AC-39, AC-51 hold; sort and expansion are controlled by props (address state lives in S10).
- Verify: `CT` and `CTC`

### S10 Page frame: route, range control, address state, states
- Module / layer: client route + feature container
- Files (create): `client/src/app/agent-performance/page.tsx` (thin, `<Suspense fallback={null}><AgentPerformanceView/></Suspense>` as client/src/app/multi-agent-review/page.tsx), `_components/AgentPerformanceView/{AgentPerformanceView.tsx,use-performance-address.ts (useSearchParams → `resolveAddress`, `router.replace` to rewrite invalid parts and write `repo` when absent, reset notice),index.ts,styles.ts}`, `_components/RangeControl/{RangeControl.tsx,index.ts,styles.ts}`, `_components/PageStates/{PageStates.tsx,index.ts}` (skeletons, error+Retry, no repository, no agents, no runs). The view: `AppShell` crumb, title/subtitle, "Repository: …" line, range control, "Data as of" + Refresh (`refetch()`), states per AC-40..AC-43, Most-active card → scroll to row and set `expanded`, sync active repo to address repo (Q-4), repo-not-in-workspace detection only after `reposLoaded`.
- Designs: `specs/agent-performance-dashboard/designs/1-agent-performance-dashboard.webp` — header, "30 days" range button, overall layout/spacing
- Skills to apply: frontend-ui-architecture § thin pages, next-best-practices § useSearchParams/Suspense, react-best-practices
- Depends on: S9
- Tests (single-agent mode): T-19, T-20
- Done when: all page-level ACs hold; load `/agent-performance` once in a real browser (INSIGHTS 2026-10-04: only a browser catches shared value imports).
- Verify: `CT` and `CTC`; hands-on `./scripts/dev.sh` then open `/agent-performance`

### I1 Shared seed helper for the new integration tests (recommended)
- Module / layer: server tests
- Files: create `server/test/helpers/agent-performance.ts` — `seedPerfFixture(env, …)` (repos, PRs, agents, runs, reviews, findings, CI runs across two workspaces) reused by T-6..T-8 (pattern of server/test/ci/it-env.ts). Cost S, recommended: one seam keeps the three suites small.
- Skills to apply: onion-architecture § testing
- Depends on: S2 · Tests: — · Done when: T-6..T-8 import it · Verify: `SI`

### I2 Compensated summation for exact AC-18 equality (optional)
- Module / layer: server `aggregate.ts` — Neumaier sum for costs. Cost S, optional: only if the 1e-9 tolerance in T-5/T-6 is judged too weak; changes no observable behaviour.
- Files: modify `server/src/modules/agent-performance/aggregate.ts`
- Skills to apply: typescript-expert
- Depends on: S4 · Tests: T-5 · Done when: both breakdown sums equal `total_cost_usd` exactly · Verify: `SU`

### I3 Expression index on `lower(agent_runs.repo)` for CI runs (optional)
- Module / layer: server schema/migration. Cost S, optional: add (as a second generated migration) only if T-8 misses the 2 s budget; measure first.
- Files: modify `server/src/db/schema/runs.ts`; create a second generated migration
- Skills to apply: drizzle-orm-patterns, postgresql-table-design
- Depends on: S2, T-8 · Tests: T-8 · Done when: T-8 passes · Verify: `SI`

## Execution modes
Single-agent: one implementer runs S1 → S10 in order and writes T-n inside its steps. Because ~60 files exceed the ~12-files-per-instance limit, run it as consecutive fresh sessions at the checkpoints S1–S2, S3–S5, S6–S7, S8, S9, S10 (never in parallel).
Multi-agent:
| Wave | Instance | Steps | Owned files / area |
|------|----------|-------|--------------------|
| 1 | implementer #1 | S1, S2 | reviewer-core `src/`, `adapters.ts` ×2, `server/src/db/schema/runs.ts`, migration, reviews run repo/executor (~11 files) |
| 2 | implementer #1 | S3, S4, S5 | shared contract ×2 + barrels ×2, `server/src/modules/agent-performance/**`, `modules/index.ts`, `container.ts` (~12 files) |
| 3 | implementer #1 | S6, S7 | client hooks, nav, shell, messages, `_model/` (~13 files) |
| 3 | test-writer #1 (same wave; different packages) | T-1 … T-9 + I1 | `reviewer-core/test/*`, `server/test/**` only |
| 4 | implementer #1 | S8 | `_components/AcceptRate`, `AgentAvatar`, `SummaryCards` (12 files) |
| 5 | implementer #1 | S9 | `_components/AgentsTable`, `CostBreakdown` (9 files) |
| 6 | implementer #1 | S10 | `page.tsx`, `AgentPerformanceView`, `RangeControl`, `PageStates` (10 files) |
| 7 | test-writer #2 | T-10 … T-22 | `client/src/**/*.test.ts(x)` (all client tests) |
No split of the client or the server into parallel implementers qualifies: every candidate group shares one package's verification state (same `pnpm test`/`typecheck`), and S4–S5 depend on the schema (S2) and contract (S3). Only wave 3 overlaps, because its two instances use disjoint packages (client vs server + reviewer-core), disjoint files and no shared DB/port.
Recommended: multi-agent — it enforces the per-instance size limit, hands the large test volume (13 client + 9 server/reviewer-core tests) to independent writers, and overlaps the server tests with the client build.

## Cross-module contracts & sync points
- `StructuredResult.costSource` (adapters.ts) — `server/src/vendor/shared/adapters.ts` and `client/src/vendor/shared/adapters.ts`; consumers type-checked: reviewer-core, server, agent-runner (`AR`), mcp (aliases shared; `cd mcp && npm run typecheck`). Optional field → no consumer breaks.
- `agent-performance` contract — server canonical file + barrel, client copy + barrel (S3); response shape ↔ `lib/hooks/agent-performance.ts` ↔ `_components/**` (types only).
- `agent_runs.cost_source` — `schema/runs.ts` ↔ migration 0018 ↔ `run.repo.ts` / `repository.ts` / `run-executor.ts` ↔ agent-performance repository (S4). CI collector and the committed runner bundle (`.devdigest/runner/**`) stay untouched (NG-11).
- Nav entry key `agent-performance` ↔ `shell.json` `nav.agent-performance` (exists) ↔ `activeKeyFor` (exists) ↔ nav.ts (S6).
- Docs affected (for doc-writer, not planned here): `server/src/db/schema/runs.ts:37-42`, `run.repo.ts:150-153`, `reviews/repository.ts:155-158` ("USD billed… OpenRouter's real cost, otherwise a PriceBook estimate" — now also stored as `cost_source`; the S2 step edits these three comments); `server/src/vendor/shared/contracts/trace.ts:76,137` and its client copy ("USD billed for this run" — the value can be an estimate); `client/README.md:35` route map (new `/agent-performance`); `client/specs/pages.md` (new page section; "Not here yet" paragraph at :238-241 says other dashboards are later lessons); `server/README.md` API map and `TESTING.md` suite lists (two new routes, new tests); `docs/export-to-ci.md` mentions of CI run cost (CI runs keep `unknown` source); the old `client/messages/en/agentPerformance.json` placeholder wording.

## Test plan
- Existing suites to run: `SU`, `SI` (reviews, ci, multi-agent suites touch `agent_runs` and the executor), `RC`, `AR`, `CT`, `CTC`, `ST`.
- T-1 AC-45, EC-28 — unit — `reviewer-core/test/cost-source.test.ts`: provider/estimate/mixed/null aggregation over single-pass and map-reduce — single: S1 · multi: test-writer #1
- T-2 AC-45 — unit with loopback stub (pattern of `reviewer-core/test/openrouter-single-attempt.test.ts`) — `reviewer-core/test/openrouter-cost-source.test.ts`: `usage.cost` present / absent / present on one of two attempts — single: S1 · multi: test-writer #1
- T-3 AC-45, EC-28 — integration — `server/test/run-cost-source.it.test.ts`: scripted provider returns provider/estimate/mixed → stored `cost_source`; failed and unpriced runs store null (the `unknown` read for old and CI rows is asserted in T-6) — single: S2 · multi: test-writer #1
- T-4 AC-24, NFR-2 — unit — `server/test/agent-performance-contracts.test.ts`: every invalid query shape, `Z`/offset accepted, span bound — single: S3 · multi: test-writer #1
- T-5 AC-7..AC-18, AC-53..AC-58, AC-22, AC-56, AC-57, NFR-4, EC-3, EC-4, EC-5, EC-6, EC-7, EC-10, EC-14, EC-16, EC-17, EC-18, EC-34 — unit on pure `aggregate.ts` — `server/test/agent-performance-aggregate.test.ts` — single: S4 · multi: test-writer #1
- T-6 AC-65, AC-7, AC-8, AC-13..AC-16, AC-19..AC-23, AC-45 (read side), AC-53..AC-55, AC-57, NFR-2, EC-8, EC-9, EC-11, EC-12, EC-13, EC-15, EC-21, EC-24, EC-25, EC-27, EC-29, EC-32, EC-35..EC-37 — integration through `app.inject()` — `server/test/agent-performance.it.test.ts` (incl. parity: every overview row equals the per-agent read) — single: S5 · multi: test-writer #1
- T-7 AC-25, AC-37 — integration — `server/test/agent-performance-readonly.it.test.ts`: table row counts unchanged, `fetch` trapped, Mock LLM/GitHub/PriceBook never called — single: S5 · multi: test-writer #1
- T-8 NFR-1, NFR-4 — integration — `server/test/agent-performance-perf.it.test.ts`: 10 000 counted + 10 000 previous-period runs with decisions, each read `< 2000 ms`, two reads deep-equal — single: S5 · multi: test-writer #1
- T-9 AC-24, NFR-2 — unit via `app.inject()` without DB (pattern server/test/routes-smoke.test.ts:57-67) — `server/test/agent-performance-routes.test.ts`: 422 `validation_error` for bad query and non-uuid `:id` — single: S5 · multi: test-writer #1
- T-10 AC-47, AC-64, EC-30, EC-31, EC-39 — unit — `client/src/app/agent-performance/_model/address.test.ts` — single: S7 · multi: test-writer #2
- T-11 AC-5, AC-6, AC-4 labels, EC-20, EC-26 — unit — `_model/range.test.ts` (dates built with the local-time constructor so it passes in any TZ) — single: S7 · multi: test-writer #2
- T-12 AC-68, AC-14 — unit — `_model/accept-rate.test.ts` (49.9 / 50 / 69.9 / 70 boundaries, low sample neutral) — single: S7 · multi: test-writer #2
- T-13 AC-33, AC-34, AC-52 — unit — `_model/sort.test.ts` — single: S7 · multi: test-writer #2
- T-14 AC-38, AC-51, AC-39 (Q-3), EC-17, EC-18 — unit — `_model/breakdown.test.ts` — single: S7 · multi: test-writer #2
- T-15 AC-31, AC-32, AC-68, NFR-3 — component — `_components/AcceptRate/AcceptRate.test.tsx` — single: S8 · multi: test-writer #2
- T-16 AC-26..AC-29, AC-66, AC-59, AC-67, AC-42, EC-33 — component — `_components/SummaryCards/SummaryCards.test.tsx` — single: S8 · multi: test-writer #2
- T-17 AC-30..AC-36, AC-44, AC-52, AC-60, NFR-3, EC-13, EC-19 — component (fetch fixture as client/src/test/context-docs-fixtures) — `_components/AgentsTable/AgentsTable.test.tsx` — single: S9 · multi: test-writer #2
- T-18 AC-38, AC-39, AC-51, NFR-3, EC-17 — component — `_components/CostBreakdown/CostBreakdown.test.tsx` — single: S9 · multi: test-writer #2
- T-19 AC-3, AC-6, NFR-3 — component — `_components/RangeControl/RangeControl.test.tsx` — single: S10 · multi: test-writer #2
- T-20 AC-2, AC-40..AC-43, AC-47, AC-50, AC-61..AC-64, AC-67, AC-37, EC-1, EC-2, EC-23, EC-38, EC-40 — component (fetch fixture records every request; asserts GET only) — `_components/AgentPerformanceView/AgentPerformanceView.test.tsx` — single: S10 · multi: test-writer #2
- T-21 AC-1, AC-62 — unit — extend `client/src/components/app-shell/nav.test.ts` (GLOBAL item above CI Runs, active key, Multi-Agent Review unchanged) and new `client/src/components/app-shell/helpers.test.ts` (`repoSwitchHref`) — single: S6 · multi: test-writer #2
- T-22 AC-5, AC-37, NG-3 — hook test — `client/src/lib/hooks/agent-performance.test.tsx`: instants resolved at fetch time, refetch recomputes "now", no refetch on focus, detail key follows the applied range — single: S6 · multi: test-writer #2
- Not tested: NFR-5 — rate limit is disabled under `NODE_ENV=test` (server/AGENTS.md); verified by the grep in the traceability row. Visual match to the design and NFR-3 with a real screen reader — manual hands-on pass.

## Risks & open questions
- [non-blocking] Q-1 — see Requirements review — suggested default: AC-43 when `rows` is empty.
- [non-blocking] Q-2 — suggested default: `ceil(span/1h)` hourly buckets for spans ≤ 24 h.
- [non-blocking] Q-3 — suggested default: message only when no counted run is priced; free-only runs show `$0.00 · 0%`.
- [non-blocking] Q-4 — suggested default: sync active repo to a valid address repo.
- Float sums: AC-18 equality is asserted with tolerance 1e-9; I2 makes it exact if wanted.
- `drizzle-kit generate` can hang or ask a rename question; follow S2 exactly and read the SQL. If the generated SQL contains anything besides the column and index, stop and ask.
- Provider default `staleTime` 30 s would serve a cached page on reopen; hooks override it (S6). Verify in the browser that re-opening the page triggers a read.
- `useSearchParams` outside Suspense breaks `next build`; page is wrapped (S10).
- Run counts: previous-period facts are loaded with the same function (up to 2× rows); T-8 is the guard, I3 the fallback.

## Self-check
1 pass (65 ACs and 5 NFRs listed verbatim with ids, one traceability row each) · 2 pass · 3 fixed: S6/S7 Verify uses the client alias; I-steps carry their own files, skills and Verify · 4 fixed: T-3 no longer asserts the module's `unknown` read (moved to T-6, which belongs to S5) · 5 pass (waves are sequential except wave 3 on disjoint packages) · 6 pass · 7 pass (Q-1..Q-4 and D-1..D-3 are implementation readings; behaviour ideas sit under suggestions) · 8 pass (Status ready: no blocking R or open question) · 9 pass (all cited paths read this run) · 10 pass (only this file written; Q-mode asked in the reply)

## Out of scope for the implementer
Architecture and security review are done by separate agents. Requirements are fixed by the spec or task; a needed change goes back to the user, not into the code.

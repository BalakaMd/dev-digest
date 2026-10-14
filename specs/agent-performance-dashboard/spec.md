# Spec: Agent Performance Dashboard
Spec ID: SPEC-10
Status: approved
Supersedes: —

## Problem and user
A workspace user runs several review agents on a repository (single runs, multi-agent runs, CI
runs). Today the only place that shows numbers for an agent's past runs is a PR's run history or one
multi-agent result. Nothing shows, across all agents and over a period, how often each agent runs on
the repository, what it costs, how long it takes, and how often its findings are accepted. The user
cannot tell which agents earn their keep, which ones cost the most, or whether a high accept rate
rests on 3 decisions or on 300. There is no per-agent metrics read either, so no two screens can be
compared.

## Goals / Non-goals
Goals:
- G-1 One "Agent Performance" page, reached from the GLOBAL sidebar group, that summarises every
  agent's stored runs and finding decisions on the active repository for a chosen period: 1 day,
  30 days or a custom range.
- G-2 One set of aggregation rules, written here, served through two reads: an all-agents read and a
  per-agent read, both for one repository. Both give the same numbers for the same agent, repository
  and period.
- G-3 Make accept rate honest: always show its denominator and mark and separate small samples.
- G-4 Show where the money goes (by agent, by model) with totals that add up, and say which part of
  the cost is a DevDigest estimate and which part is provider-reported.
- G-5 The page and both reads only read stored data. They never start a review and never call a
  model.
Non-goals:
- NG-1 A "Stats" tab in the agent editor. The per-agent read is built and can back such a tab later;
  the tab itself is a possible follow-up spec.
- NG-2 Any change to how runs, costs or finding decisions are produced, except recording the cost
  source of a local run (AC-45). Costs of runs that ended before this feature are not re-classified.
- NG-3 Live updates while the page is open (polling or push). The page reads data when it opens,
  when the repository, range or address changes, and on reload, Refresh or Retry.
- NG-4 Editing, re-running or deleting runs or findings from this page.
- NG-5 A "Memory" page, and moving "Multi-Agent Review" into the GLOBAL group. The design shows both;
  this spec adds only the "Agent Performance" item. (Q-14)
- NG-6 Reconciling costs with provider invoices or a provider billing API (Q-5). "Provider-reported"
  means the cost the provider returned with the model call.
- NG-7 Showing the cost source on other screens (PR run history, multi-agent result, CI Runs).
- NG-8 Per-agent trend arrows next to the accept rate (shown in the design). (Q-13)
- NG-9 Eval suite runs and model calls of features without an agent (PR brief, intent, conventions,
  onboarding). The dashboard covers agent review runs only. (Q-15)
- NG-10 A workspace-wide view across repositories, and a repository filter on this page. The page
  always shows one repository. (Q-18)
- NG-11 Any change to the CI runner or its result artifact; CI runs keep an unknown cost source.
  (Q-21)

## User stories
- US-1 As a workspace user, I want the run count, cost, duration and accept rate of every agent on
  my repository for a period, so that I can see which agents are worth running.
- US-2 As a workspace user, I want to know how many decisions an accept rate rests on, so that I do
  not trust a rate built on a handful of findings.
- US-3 As a workspace user, I want cost split by agent and by model, with estimates told apart from
  provider-reported amounts, so that I know where the money goes and how sure the number is.
- US-4 As a workspace user, I want to open the dashboard, reload it and sort it without spending
  money, so that looking at numbers never costs anything.

## Acceptance criteria (EARS)

### Navigation and page frame
- AC-1 (Ubiquitous): The sidebar SHALL show an "Agent Performance" item in the GLOBAL group, placed
  directly above "CI Runs", that opens the Agent Performance page for the active repository. The
  "Multi-Agent Review" item SHALL stay where it is. (Q-14) [covers US-1]
- AC-2 (Ubiquitous): The Agent Performance page SHALL show the title "Agent Performance" and the
  subtitle "Which agents earn their keep — accept rate is the quality signal".
- AC-61 (Ubiquitous): The page SHALL show every number for one repository — the repository its
  address names, else the active repository — and SHALL state that repository's full name
  (`owner/name`) under the subtitle as "Repository: <owner/name>". (Q-18)
- AC-62 (Event-driven): WHEN the user selects another repository in the repository selector, the
  page SHALL read and show that repository's numbers for the same range and sort, and SHALL collapse
  any expanded row. (Q-18)
- AC-63 (State-driven): WHILE the workspace has no repository, the page SHALL show "No repository
  yet" with a link to import one in place of the cards, the table and the cost breakdown, and SHALL
  send no read. (Q-18)
- AC-47 (Ubiquitous): The page SHALL keep the repository, the selected range (preset, or custom start
  and end dates), the sort column and direction, and the expanded row in its address. Opening that
  address, reloading it or following a shared link SHALL show the same repository, range, sort and
  expanded row. (accepted P-1, Q-18)
- AC-64 (Unwanted behaviour): IF a part of the address is invalid — a repository that is not in the
  workspace, a range that AC-6 rejects, an unknown sort column or direction, or an expanded row that
  names no listed agent — THEN the page SHALL replace only that part with its default (the active
  repository; "30 days"; Accept descending; no expanded row), SHALL show a short notice naming what
  was reset, and SHALL keep the valid parts. (Q-22)
- AC-50 (Ubiquitous): The page SHALL show "Data as of <time>", the time of the last successful read,
  and a "Refresh" control that reads the same repository and range again. (accepted P-4)

### Period
- AC-3 (Ubiquitous): The page SHALL offer a range control with the choices "1 day", "30 days" and
  "Custom range". "30 days" SHALL be selected when the page opens with no range in its address.
- AC-4 (Event-driven): WHEN the user selects another range, the page SHALL read the all-agents
  aggregation (AC-19) for that range and show it in the cards, the table and the cost breakdown. Card
  labels SHALL name the range: "(1D)", "(30D)", or "(<start date> – <end date>)" for a custom range.
- AC-5 (Ubiquitous): The page SHALL send every range to the API as two instants, `from` (inclusive)
  and `to` (exclusive):
  - "1 day": `from` = now − 24 hours, `to` = now;
  - "30 days": `from` = now − 30 × 24 hours, `to` = now;
  - custom: `from` = 00:00 of the start date and `to` = 00:00 of the day after the end date, both in
    the browser's time zone, so both dates are included in full.
  "now" is the moment the page sends the read. A run SHALL belong to a range when
  `from ≤ ran_at < to`, by its start time `ran_at`. (Q-6)
- AC-6 (Unwanted behaviour): IF a custom range has its end date before its start date, an end date
  after today, or covers more than 366 calendar days, THEN the range control SHALL show an inline
  error naming the problem and the page SHALL send no read. (Q-6)

### Aggregation rules (shared by both reads)
- AC-65 (Ubiquitous): A run SHALL **belong to a repository** when either:
  - it is a local run whose pull request belongs to that repository; or
  - it is a CI run whose recorded repository (`owner/name`) equals that repository's full name,
    compared without regard to letter case [default of non-blocking Q-27].
  A local run whose pull request no longer exists, and a CI run whose repository is not imported into
  the workspace, SHALL belong to no repository and SHALL not be shown on this page. (Q-18)
- AC-7 (Ubiquitous): A **counted run** SHALL be an agent run of the caller's workspace that belongs
  to the selected repository (AC-65), whose start time is inside the range, whose status is `done`,
  `failed` or `cancelled`, and whose source is `local` or `ci`. A run with status `running` SHALL
  never be counted. (Q-1, Q-2, Q-18)
- AC-8 (Ubiquitous): Each agent run that belongs to a multi-agent run SHALL be counted as one run of
  its own agent, like a single-agent run (consistent with SPEC-08 AC-25).
- AC-9 (Ubiquitous): **Runs** of an agent SHALL be the number of its counted runs, and **Failed** SHALL
  be the number of its counted runs with status `failed`.
- AC-10 (Ubiquitous): **Total cost** SHALL be the sum of the recorded costs of the counted runs that
  have a cost. A run with no recorded cost (null) SHALL add nothing and SHALL never be treated as 0.
  The reads SHALL also return the number of counted runs without a cost ("not priced"). (Q-7)
- AC-11 (Ubiquitous): **Avg cost** of an agent SHALL be the mean recorded cost over the agent's
  counted runs with status `done` that have a cost, and SHALL be null when there is none. (Q-1, Q-7)
- AC-12 (Ubiquitous): **Avg duration** of an agent SHALL be the mean recorded duration over the
  agent's counted runs with status `done` that have a duration, and SHALL be null when there is
  none. (Q-1)
- AC-13 (Ubiquitous): **Accept rate** of an agent SHALL be `accepted / (accepted + dismissed)` over
  the findings of the reviews produced by the agent's counted runs with source `local`, using each
  finding's decision as stored at the time of the read. A finding counts as accepted when it has an
  accept decision and as dismissed when it has a dismiss decision; findings with no decision SHALL be
  excluded. CI runs SHALL contribute no findings. The reads SHALL return `accepted`, `dismissed` and
  the denominator `accepted + dismissed` with the rate, and SHALL return the rate as null when the
  denominator is 0. (Q-2, Q-3) [covers US-2]
- AC-14 (Ubiquitous): An accept rate SHALL be marked **low sample** when its denominator is between
  1 and 9. The reads SHALL return this mark for every agent row and for Avg accept rate. (Q-4)
- AC-15 (Ubiquitous): **Avg accept rate** SHALL be the pooled rate
  `Σ accepted / Σ (accepted + dismissed)` over the findings selected by AC-13 for all listed agents
  and for counted runs of deleted agents, and the all-agents read SHALL return `accepted`,
  `dismissed` and that denominator, and a null rate when it is 0. (Q-8, Q-23)
- AC-16 (Ubiquitous): **Last run** of an agent SHALL be the latest start time among all of the
  agent's runs that belong to the selected repository and have status `done`, `failed` or
  `cancelled`, of any source and at any time, whether or not that run is inside the range; it SHALL
  be null when there is no such run. (Q-16, Q-18)
- AC-17 (Ubiquitous): **Most-active agent** SHALL be the listed agent with the most counted runs in
  the range. On a tie, the agent with the latest Last run (AC-16) SHALL win, and on a further tie the
  agent whose name comes first alphabetically. WHILE no listed agent has a counted run, there SHALL be
  no most-active agent. (Q-9)
- AC-18 (Ubiquitous): The **cost breakdown by agent** SHALL sum each agent's counted-run costs, and
  the **cost breakdown by model** SHALL sum counted-run costs per stored model name. The sum of the
  by-agent amounts and the sum of the by-model amounts SHALL each equal Total cost, computed on
  unrounded values. [covers US-3]
- AC-53 (Ubiquitous): Counted runs whose agent was deleted SHALL count in the totals (Runs, Failed,
  Total cost, cost by source, not-priced count, Avg accept rate) and SHALL form one "Deleted agent"
  slice in the by-agent breakdown. They SHALL have no table row and SHALL never be the most-active
  agent. (Q-10, Q-23)
- AC-54 (Ubiquitous): Counted runs with a cost and no stored model name SHALL form one "Unknown model"
  slice in the by-model breakdown. (Q-10)
- AC-55 (Ubiquitous): The **listed agents** SHALL be every enabled agent of the workspace, plus every
  disabled agent with at least one counted run in the selected repository and range. (Q-11)
- AC-58 (Ubiquitous): **Cost per accepted finding** of an agent SHALL be the sum of recorded costs of
  its counted runs with source `local` that have a cost, divided by its `accepted` count (AC-13). It
  SHALL be null when `accepted` is 0 or none of those runs has a cost. (accepted P-7, Q-25)
- AC-45 (Event-driven): WHEN a local agent run ends with a recorded cost, the API SHALL store with the
  run its **cost source**: `provider` when every model call of the run returned a provider-reported
  cost, `estimate` when none did, and `mixed` otherwise. Runs that ended before this feature, and every
  CI run, SHALL have the cost source `unknown`. A run with no recorded cost SHALL have no cost source.
  (Q-5, Q-21)
- AC-56 (Ubiquitous): The all-agents read SHALL split the range into consecutive buckets that start
  at `from`: 24 one-hour buckets for a range of 24 hours or less, and 24-hour buckets otherwise, the
  last bucket ending at `to`. It SHALL return the number of counted runs starting in each bucket; the
  bucket counts SHALL add up to Runs. (Q-13, Q-24)
- AC-57 (Ubiquitous): The **previous period** SHALL be `[from − (to − from), from)` for the same
  repository, and its total cost SHALL be computed by AC-7 and AC-10. (Q-13)

### Reads (API)
- AC-19 (Ubiquitous): The API SHALL expose an all-agents read
  `GET /agent-performance?repoId=&from=&to=` that returns, for the repository and range:
  - the repository id and full name, and the range actually applied (`from`, `to` as ISO-8601
    instants);
  - totals: runs, failed, total cost, the number of counted runs not priced, the cost split by cost
    source (`provider`, `estimate`, `mixed`, `unknown`), avg accept rate with `accepted`, `dismissed`,
    denominator and low-sample mark, and the most-active agent (id, name, runs, accept rate with
    denominator) or null;
  - the previous-period total cost and whether the previous period has any counted run (AC-57), and
    the runs per bucket (AC-56);
  - one row per listed agent (AC-55): agent id, name, enabled flag, runs, failed, avg cost, avg
    duration in milliseconds, accept rate, `accepted`, `dismissed`, denominator, low-sample mark, last
    run time, cost per accepted finding;
  - the by-agent and by-model cost breakdowns.
- AC-20 (Ubiquitous): The API SHALL expose a per-agent read
  `GET /agents/:id/performance?repoId=&from=&to=` for any agent of the workspace, enabled or disabled.
  It SHALL return the same row fields as one AC-19 row, plus, for that agent in that repository: the
  by-model cost breakdown, the number of counted runs not priced, the cost split by cost source, the
  number of undecided findings selected by AC-13, and the number of counted runs per source (`local`,
  `ci`). (Q-12)
- AC-21 (Ubiquitous): For every listed agent, repository and range, the per-agent read and that
  agent's row in the all-agents read SHALL return equal runs, failed, avg cost, avg duration, accept
  rate, `accepted`, `dismissed`, denominator, low-sample mark, last run and cost per accepted finding,
  because both apply AC-7 to AC-18, AC-55, AC-58 and AC-65.
- AC-22 (State-driven): WHILE an agent of the workspace has no counted run in the repository and
  range, the per-agent read SHALL return runs 0, failed 0, a null avg cost, avg duration, accept rate
  and cost per accepted finding, a denominator of 0, and an empty by-model breakdown, with status 200.
- AC-23 (Unwanted behaviour): IF a read names an agent or a repository that does not exist in the
  caller's workspace, THEN the API SHALL answer 404.
- AC-24 (Unwanted behaviour): IF `repoId`, `from` or `to` is missing, `repoId` is not an id, `from` or
  `to` is not an ISO-8601 instant, `from` is not before `to`, or `to − from` exceeds 366 × 24 hours
  plus 1 hour (one daylight-saving shift), THEN both reads SHALL reject the request with a validation
  error and read nothing. (Q-6)
- AC-25 (Ubiquitous): Both reads SHALL only read stored repositories, pull requests, agents, runs,
  reviews and findings. They SHALL write nothing, start no review run, and make no model call,
  embedding call or other outbound network request (including price look-ups and GitHub calls); costs
  are taken as stored. [covers US-4]

### Summary cards
- AC-26 (Ubiquitous): The "Total runs" card SHALL show the number of counted runs in the range and a
  sparkline of counted runs per bucket (AC-56). (Q-13)
- AC-27 (Ubiquitous): The "Total cost" card SHALL show Total cost and, below it, one text line per
  cost source with a non-zero amount, each with its share of Total cost as a whole percentage:
  "Provider-reported $X (P%)", "DevDigest estimate $Y (P%)", "Mixed $Z (P%)", "Source unknown $W
  (P%)". WHILE at least one counted run has no cost, the card SHALL show "K runs not priced".
  (Q-5, Q-7, accepted P-8) [covers US-3]
- AC-66 (Ubiquitous): The "Total cost" card SHALL show the difference "Total cost − previous-period
  total cost" (AC-57) with its sign and the text "vs previous period". IF the previous period has no
  counted run, THEN the card SHALL show "No previous data" in place of the difference. (Q-13)
- AC-59 (Ubiquitous): The page SHALL state "Agent review runs only — eval runs and other model calls
  are not included" next to the Total cost card. (Q-15)
- AC-28 (Ubiquitous): The "Avg accept rate" card SHALL show the rate as a whole percentage, a ring of
  the same value, its denominator as "of N decisions", and the note "local runs only". WHILE the rate
  is low sample (AC-14), the card SHALL show the label "Low sample". WHILE the denominator is 0, the
  card SHALL show "—" and "No decisions yet" in place of the rate and the ring.
- AC-29 (Ubiquitous): The "Most-active agent" card SHALL show the agent's name, its runs and its
  accept rate with denominator. WHILE there is no most-active agent (AC-17), the card SHALL show "—".
- AC-67 (Event-driven): WHEN the user activates the "Most-active agent" card, the page SHALL scroll to
  that agent's table row and expand it (AC-35). (accepted P-9)

### Accept-rate colour
- AC-68 (Ubiquitous): Every accept rate the page shows (table cell, Avg accept rate card and ring,
  Most-active agent card) SHALL be coloured green at 70 % or more, amber from 50 % to 69 %, and red
  below 50 %, by its unrounded value. A low-sample rate SHALL use a neutral colour. Each coloured rate
  SHALL carry the text description "High (≥70%)", "Medium (50–69%)" or "Low (<50%)", available on hover,
  on focus and to assistive technology. (Q-19)

### Agents table
- AC-30 (Ubiquitous): The agents table SHALL have the columns Agent, Runs, Failed, Avg cost,
  Avg dur., Accept, Cost / accepted, Last run, and a "View" action, with one row per listed agent
  (AC-55). A disabled agent's row SHALL show the text label "Disabled" next to its name.
  (Q-11, accepted P-3, accepted P-7)
- AC-31 (Ubiquitous): A null avg cost, avg duration, accept rate, cost per accepted finding or last
  run SHALL be shown as "—", never as 0.
- AC-32 (Ubiquitous): The Accept cell SHALL show the rate as a whole percentage together with its
  decisions as "accepted/denominator" (for example "78% · 45/58"). WHILE the rate is low sample
  (AC-14), the cell SHALL also show the text label "Low sample". The Accept column header SHALL carry
  the description "Accepted / (accepted + dismissed), local runs only". [covers US-2]
- AC-33 (Ubiquitous): The table SHALL be sorted by Accept, descending, when the page opens with no
  sort in its address.
- AC-34 (Event-driven): WHEN the user activates the Accept column header, the table SHALL toggle the
  Accept sort between descending and ascending. In both directions, rows SHALL be ordered as: rates
  with 10 or more decisions, then low-sample rates, then rows with no rate; each group is sorted by
  rate in the chosen direction, and equal values are ordered by agent name. (Q-4)
- AC-52 (Event-driven): WHEN the user activates the Runs, Avg cost, Avg dur. or Last run column
  header, the table SHALL sort by that column, toggling between descending and ascending on each
  activation. Rows with no value SHALL come last in both directions, equal values SHALL be ordered by
  agent name, and only one column SHALL drive the sort at a time. (accepted P-6)
- AC-35 (Event-driven): WHEN the user expands a table row, the page SHALL read that agent through the
  per-agent read (AC-20) for the same repository and range and show, in the expanded row:
  - the agent's cost by model, with amounts;
  - its findings decided as accepted, dismissed, and the undecided count;
  - its counted runs from local and from CI;
  - its cost split by cost source.
  (Q-12)
- AC-60 (State-driven): WHILE the per-agent read of an expanded row is in flight, the expanded row
  SHALL show loading placeholders and no number; IF it fails, THEN the expanded row SHALL show an
  error message and a "Retry" control, and the rest of the page SHALL stay as it is.
- AC-36 (Event-driven): WHEN the user activates "View" on a row, the page SHALL open that agent's
  editor page (`/agents/:id`). (Q-17)
- AC-37 (Ubiquitous): Opening the page, reloading it, changing the repository or the range, sorting,
  expanding a row, activating the Most-active card, Refresh, Retry or "View" SHALL NOT start a review
  run or any model call; they only read stored data through AC-19 or AC-20. [covers US-4]

### Cost breakdown
- AC-38 (Ubiquitous): The "Cost breakdown" section SHALL show two donut charts, "By agent" and "By
  model". Each has a legend that lists every slice's name, amount and share of Total cost as a whole
  percentage, in text; the amounts of each legend add up to Total cost (AC-18). (accepted P-2)
- AC-51 (State-driven): WHILE a breakdown has more than 6 slices, its donut SHALL show the 6 largest
  slices on their own and one "Other" segment with the sum of the rest, and its legend SHALL still
  list every slice. Slices are ordered by amount, descending, then by name. (accepted P-5)
- AC-39 (State-driven): WHILE Total cost is 0 because no counted run has a cost, the "Cost breakdown"
  section SHALL show the message "No priced runs in this period" in place of the charts.

### Loading, error and empty states
- AC-40 (State-driven): WHILE a read is in flight, the page SHALL show loading placeholders in the
  cards, the table and the cost breakdown, and SHALL show no number, no zero and no "—" in them.
- AC-41 (Unwanted behaviour): IF the read fails, THEN the page SHALL show an error message and a
  "Retry" control in place of the cards, the table and the cost breakdown, SHALL show no number or
  zero, and SHALL keep the range control and the repository selector usable.
- AC-42 (State-driven): WHILE the workspace has agents but the selected repository has no counted run
  in the range, the page SHALL show "No agent runs on <owner/name> in this period" with a hint to
  choose a longer range in place of the table and the cost breakdown; the Total runs card SHALL show
  0 and the Avg accept rate and Most-active agent cards SHALL show "—".
- AC-43 (State-driven): WHILE the workspace has a repository but no agent, the page SHALL show "No
  agents yet" with a link to the Agents page in place of the cards, the table and the cost breakdown.
- AC-44 (State-driven): WHILE the range has counted runs and a listed agent has none, that agent's
  row SHALL show Runs 0, Failed 0 and "—" for Avg cost, Avg dur., Accept and Cost / accepted, distinct
  from the page-level empty state of AC-42.

## Edge cases
- EC-1 Repository with no runs in the range → AC-42
- EC-2 Workspace with no agents → AC-43
- EC-3 Agent with runs on this repository in other periods but none in this one → AC-44, AC-22; Last
  run shows its latest run on this repository (AC-16)
- EC-4 Agent with runs but no decided finding → Accept "—", denominator 0 (AC-13, AC-31)
- EC-5 Agent with 1–9 decisions → AC-14, AC-32, AC-34, neutral colour (AC-68)
- EC-6 Every counted run unpriced (model not in the price book, failed before the model) → AC-10,
  AC-27, AC-39
- EC-7 Some counted runs unpriced → AC-10, AC-27 ("K runs not priced")
- EC-8 A run still `running` when the page opens → not counted (AC-7); it appears after a Refresh or
  reload once it ends
- EC-9 A run cancelled while its model call was in flight that later ends `done` (server INSIGHTS
  2026-10-12) → counted with its final stored status (AC-7)
- EC-10 Runs reaped as `failed` on API boot → counted as failed (AC-7, AC-9); excluded from averages
  (AC-11, AC-12)
- EC-11 Agent deleted after it ran (its runs lose the agent link) → AC-53
- EC-12 Run with a cost but no stored model name (CI artifact without model) → AC-54
- EC-13 Agent disabled → listed only with runs in the repository and range, labelled "Disabled"
  (AC-55, AC-30); its runs still count (AC-7); its per-agent read still answers (AC-20)
- EC-14 Agent renamed → its rows and slices show the current name; runs stay attributed by id
- EC-15 A finding toggled between accepted, dismissed and undecided → the read uses the decision
  stored at read time (AC-13)
- EC-16 Two agents tie for most runs → AC-17
- EC-17 Many agents or many models → AC-51
- EC-18 Legend amounts rounded to cents do not add up to the rounded total by one cent, or whole
  percentages do not add up to 100 → AC-18 holds on unrounded values; display rounding is accepted
- EC-19 Very long agent, model or repository names → truncated in table, card, legend and header,
  with the full name on hover and focus (NFR-3)
- EC-20 Custom range end before start, in the future, or too long → AC-6, AC-24
- EC-21 Runs from CI (`source = ci`) → counted for runs, failed, cost and duration on the repository
  they ran in (AC-7, AC-65); no accept-rate contribution (AC-13). Runs from multi-agent runs → AC-8
- EC-22 Eval suite runs and non-agent model calls (PR brief, intent, conventions, onboarding) → not
  counted (NG-9), stated on the page (AC-59)
- EC-23 Reload, double-click on Retry or Refresh, rapid range or repository switching → reads only
  (AC-37); the page shows the answer for the repository and range selected last
- EC-24 A read for an agent or repository of another workspace → 404 (AC-23)
- EC-25 A run that started just before the range start and ended inside it → not counted (AC-5)
- EC-26 A custom range that spans a daylight-saving change (a 23- or 25-hour day) → AC-5, AC-24,
  AC-56 (the last bucket ends at `to`)
- EC-27 Runs that ended before cost source was recorded → "Source unknown" (AC-45, AC-27)
- EC-28 A run whose calls mix provider-reported and estimated costs (several calls or retries) →
  `mixed` (AC-45)
- EC-29 CI runs → cost source `unknown` (AC-45, NG-11)
- EC-30 An address with an invalid repository, range or sort → AC-64
- EC-31 The expanded row in the address names an agent not listed in the table → AC-64
- EC-32 A custom range in the past while the agent ran after it → Last run is later than the range
  end (AC-16)
- EC-33 Previous period empty (new repository, or first period with data) → AC-66 "No previous data"
- EC-34 A tie for most runs where the tied agents also share Last run → name order (AC-17)
- EC-35 Local runs whose pull request was deleted (PR removed, or its repository removed) → belong to
  no repository and are not shown (AC-65)
- EC-36 CI runs of a repository that is not imported into the workspace → not shown (AC-65)
- EC-37 The same agent runs on several repositories → each repository's page shows only its runs; the
  agent's Last run is per repository (AC-16)
- EC-38 The workspace has no repository → AC-63
- EC-39 The repository named in the address was removed after the link was shared → AC-64 (reset to
  the active repository with a notice)
- EC-40 The repository is switched while a row is expanded → AC-62 (row collapses)

## Non-functional requirements
- NFR-1 (performance): WHEN the range holds up to 10 000 counted runs, each read SHALL answer within
  2 seconds on a developer machine. [default of non-blocking Q-20]
- NFR-2 (security): Both reads SHALL scope every row to the caller's workspace and the requested
  repository, and SHALL validate `repoId`, `from`, `to` and `:id` against their schema before any
  query (AC-24).
- NFR-3 (accessibility): The range control, every sortable column header (with its current sort
  state exposed to assistive technology), row expansion, the Most-active card, "View", "Refresh" and
  "Retry" SHALL be operable by keyboard and have accessible names. Each chart, the ring and the
  sparkline SHALL have a text equivalent with the same values. "Low sample", accept-rate quality
  (AC-68) and cost source SHALL be conveyed by text, not by colour alone. Truncated text SHALL be
  available in full on focus.
- NFR-4 (reliability): The reads SHALL be deterministic: the same stored data, repository and range
  give the same values and the same row, slice and bucket order. Rounding SHALL happen only for
  display.
- NFR-5 (security): Both reads SHALL be covered by the API's existing rate limit.

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| Repository id | page address or repository selector → query string | workspace user | untrusted, validated and checked against the workspace (AC-23, AC-24, AC-64) |
| Range (`from`, `to`) | range control or page address → query string | workspace user | untrusted, validated (AC-6, AC-24) |
| Sort and expanded row | page address | workspace user | untrusted, validated on the page (AC-64) |
| Agent id (per-agent read) | path parameter | workspace user | untrusted, checked against the workspace (AC-23) |
| Agent name | `agents` rows | workspace user | trusted, rendered as text |
| Repository full name | `repos` rows | GitHub (imported) | rendered as text |
| Run start time, status, source, duration, model, pull request | `agent_runs` rows | DevDigest (local runs); CI artifact (CI runs) | trusted for local; CI values come from a validated artifact |
| CI run repository (`owner/name`) | `agent_runs.repo` | CI collector | trusted (from the installation); matched to `repos` (AC-65) |
| Run cost | `agent_runs.cost_usd` | provider-reported or PriceBook estimate (local); CI artifact (CI) | stored as recorded |
| Run cost source | recorded at run end (AC-45) | DevDigest | trusted (derived); `unknown` for older runs and CI runs |
| Finding decisions | `findings.accepted_at` / `dismissed_at` via `reviews` | workspace user | trusted |
| Model name | `agent_runs.model` | agent config (local); CI artifact (CI) | rendered as text |

## Untrusted inputs
- `repoId`, `from` and `to` — parsed by the route schema (id; ISO-8601 instants), bounded in span,
  rejected before any query (AC-24); `repoId` and `:id` are checked against the caller's workspace
  (AC-23).
- Page address parameters (repository, range, sort, expanded row) — validated on the page before use,
  reset part by part when invalid (AC-64); never injected into markup.
- Agent names, model names and repository names — rendered as plain text, never as HTML, in the
  header, table, cards, legends and tooltips. Model names of CI runs come from a GitHub Actions
  artifact; they are displayed only.
- No stored text from runs or findings (finding text, review summaries, logs) is shown by this
  feature; the expanded row (AC-35) shows only counts, amounts and model names.

## Open questions
No blocking question is left. Q-1..Q-19 and Q-21..Q-25 are answered (see the Decisions log in
design-review.md). Non-blocking, with the default the planner uses unless the user says otherwise:
- Q-20 [non-blocking] Performance bound in NFR-1 — default: 2 seconds for up to 10 000 counted runs.
- Q-26 [non-blocking] Agent icons in the table and Most-active card (agents have no icon field) —
  default: a letter avatar from the agent's name; no new agent field.
- Q-27 [non-blocking] Matching a CI run's `owner/name` to an imported repository — default: compared
  without regard to letter case (AC-65).

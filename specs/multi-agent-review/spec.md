# Spec: Multi-Agent Review with live per-agent status
Spec ID: SPEC-08
Status: approved
Supersedes: —

## Problem and user
A reviewer opening a pull request (PR) wants to know if the change has security, performance or
domain-rule problems. One PR often has all three. Today the PR page can run one agent or "all enabled
agents". Every run is a separate entry in the run history. Nothing shows that two agents flagged the
same line, or that one flagged it and another did not. The cost and time of a run are visible only
after it ends. With several specialised agents the reviewer reads the same issue more than once, cannot
see where the agents disagree, and pays an unknown price. The reviewer needs a way to pick a set of
agents, see what the run is expected to cost first, follow each agent live, and read one combined
result. That result groups duplicate findings without losing who found what.

## Goals / Non-goals
Goals:
- G-1 Pick any set of agents for one PR (from the PR page or from a dedicated Configure-run screen)
  and run them as one grouped multi-agent run.
- G-2 Before starting, show a time and cost estimate based on past runs.
- G-3 While the run is in progress, show each agent's own status, updated live. One agent failing does
  not stop or hide the others.
- G-4 Show one result page with two modes: Columns (per agent, live) and Tabs + detail (per agent,
  with finding actions).
- G-5 Group similar findings across agents. Every original finding stays available with its author
  and its original text.
- G-6 Show where the agents disagree, location by location, including agents that did not flag the
  location.
- G-7 From each agent, open its trace. The trace explains tokens, cost and grounding-gate decisions.
- G-8 Record the measured cost and time of a 1-agent run against a 3-agent run as they are, without
  fitting them to an expected ratio.
Non-goals:
- NG-1 Any change under `ci/` or `agent-runner/`.
- NG-2 Changing the grounding gate, the scope filter, or untrusted-input handling of the review engine.
- NG-3 Memory, Agent Performance and CI Runs pages, even though the mock-ups show them in the sidebar.
- NG-4 Semantic or LLM-based de-duplication of findings (no model or embedding call to group findings).
  (Q-3)
- NG-5 Persisting or remembering the agent selection between visits. Every picker and Configure-run
  screen opens with no agent checked. (Q-19)
- NG-6 Isolated working copies ("worktrees") per agent. Agents run inside the API process, against the
  one diff loaded for the run. The mock-up wording "fan-out via worktrees" is not used.
- NG-7 A working "Learn" action and a "Reply to author" action on the result page (Q-7).
- NG-8 Retrying a failed agent inside the same multi-agent run (rejected P-2).
- NG-9 Recording cache-read tokens in the run trace (rejected P-5).
- NG-10 Announcing each agent's completion or failure to assistive technology (rejected P-6).

## User stories
- US-1 As a reviewer on a PR page, I want to tick the agents I need and start them together, so that
  I get several specialised reviews in one action.
- US-2 As a reviewer, I want a Configure-run screen where I pick a PR and agents and see the expected
  time and cost, so that I know the price before I commit.
- US-3 As a reviewer, I want to see each agent's status change while the run is in progress, and open
  its live log or trace, so that I know who finished, who is still working, and who failed.
- US-4 As a reviewer, I want duplicate findings grouped and disagreements made explicit, while still
  seeing each agent's original finding, so that I read every issue once without losing attribution.
- US-5 As a reviewer, I want to act on each finding (Accept, Dismiss, Turn into eval case) from the
  result page, so that I can triage there.
- US-6 As the feature owner, I want the actual cost and time of 1 agent against 3 agents recorded,
  so that the claims about multi-agent cost rest on measurement.

## Acceptance criteria (EARS)

### Starting a run from the PR page (agent picker)
- AC-1 (Event-driven): WHEN the user opens the "Run Review" control on the PR page, the PR page SHALL
  list every enabled agent of the workspace, with no agent checked. Each agent has a checkbox, its
  name, and its estimated duration (AC-15). The list replaces the previous "Run all enabled agents"
  and single-agent items, which SHALL no longer be shown. [covers US-1] (Q-5, Q-19)
- AC-2 (State-driven): WHILE N ≥ 1 agents are checked, the picker SHALL show an enabled button
  labelled "Run multi-agent review (N)", where N is the number of checked agents.
- AC-3 (State-driven): WHILE no agent is checked, the picker SHALL show the run button disabled.
- AC-4 (Event-driven): WHEN the user activates "Clear", the picker SHALL uncheck every agent.
- AC-5 (Event-driven): WHEN the user activates "Run multi-agent review (N)", the PR page SHALL send
  the trigger (AC-19) for this PR with exactly the checked agents, including when N = 1. Once the
  trigger succeeds, the PR page SHALL open the result page of the new multi-agent run (AC-27).
  (Q-5, Q-9)
- AC-6 (Unwanted behaviour): IF the workspace has no enabled agent, THEN the picker SHALL show the
  existing "no enabled agents" message with a link to the Agents page, and SHALL offer no run button.
- AC-7 (Event-driven): WHEN the user activates "Configure agents…", the picker SHALL navigate to the
  Agents page. (Q-13)
- AC-8 (State-driven): WHILE the PR is merged or closed, the picker SHALL show today's muted warning
  that the PR is merged or closed, and SHALL still allow the run. (Q-16)
- AC-59 (State-driven): WHILE the PR has at least one multi-agent run, the PR page SHALL show a
  "Latest multi-agent run" link. The link opens the result page of that PR's most recent multi-agent
  run, by start time. WHILE the PR has none, the PR page SHALL show no such link. (Q-25)

### Configure run screen
- AC-9 (Ubiquitous): The sidebar SHALL contain a "Multi-Agent Review" item that opens the Configure-run
  screen. (Q-12)
- AC-10 (Ubiquitous): The Configure-run screen SHALL show step 1 "Pull request", a PR selector that
  lists the open PRs of the active repository. Each option shows `#<number> · <title>`. (Q-17)
- AC-58 (Unwanted behaviour): IF there is no active repository, or the active repository has no open
  PR, THEN the Configure-run screen SHALL show a message saying so in place of the selector, and SHALL
  keep the run button disabled.
- AC-11 (State-driven): WHILE no PR is selected, the Configure-run screen SHALL show step 2 "Agents to
  run" with the placeholder "Pick a pull request first" and keep the run button disabled.
- AC-12 (Event-driven): WHEN a PR is selected, the Configure-run screen SHALL list every enabled agent
  as a card, with no agent checked. Each card has a checkbox, the agent name, its estimated duration
  and cost (AC-15), and the agent's description; the description line is omitted when the description
  is empty. (Q-15, Q-19)
- AC-13 (Event-driven): WHEN the user activates "Select all", the Configure-run screen SHALL check
  every listed agent.
- AC-14 (State-driven): WHILE a PR is selected and N ≥ 1 agents are checked, the Configure-run screen
  SHALL show an enabled button "Run multi-agent review (N)". Next to it is the summary
  "≈ <time> · <cost> · parallel fan-out". <time> is the maximum of the checked agents' duration
  estimates, and <cost> is the sum of their cost estimates. (Q-2)
- AC-15 (Ubiquitous): The duration estimate of an agent SHALL be the median duration of that agent's
  last 10 completed (`done`) runs. Its cost estimate SHALL be the median cost of its last 10 completed
  runs that have a recorded cost. The picker and Configure run show these estimates. (Q-6)
- AC-16 (Unwanted behaviour): IF an agent has no completed run with a recorded duration, or none with a
  recorded cost, THEN the picker and Configure run SHALL show "—" for the missing estimate, and the
  Configure-run summary SHALL leave that agent out of the matching total. (Q-6)
- AC-53 (Ubiquitous): Each Configure-run agent card SHALL show the number of runs its estimate is
  based on ("based on N runs"). WHILE K ≥ 1 checked agents are left out of a total (AC-16), the summary
  SHALL state "K agents without history not included". (accepted P-3)
- AC-17 (Event-driven): WHEN the user activates the run button on Configure run, the screen SHALL send
  the trigger (AC-19) for the selected PR with exactly the checked agents. Once the trigger succeeds,
  the screen SHALL open the result page of the new multi-agent run (AC-27).
- AC-18 (State-driven): WHILE the trigger request is in flight, the picker and Configure run SHALL keep
  the run button disabled and busy, so that a double activation starts at most one multi-agent run.

### Grouped execution (API)
- AC-19 (Event-driven): WHEN `POST /pulls/:id/review` receives a set of agent ids (one or more),
  the API SHALL do the following before any agent starts working:
  1. create one multi-agent run record for that PR;
  2. create one agent run per distinct selected agent, linked to that record;
  3. respond with today's `{ pr_id, runs: [{ run_id, agent_id, agent_name }], reviews }` plus the
     multi-agent run id.
  An id listed more than once SHALL produce one agent run. (Q-1, Q-5, Q-20)
- AC-52 (Ubiquitous): `POST /pulls/:id/review` with `{ agentId }` or `{ all: true }` SHALL keep its
  current request and response shape and SHALL create no multi-agent run record, so existing callers
  (the MCP client) keep working unchanged. (Q-1)
- AC-20 (Unwanted behaviour): IF the agent set is empty, contains an id that names no agent of the
  workspace, or contains an id of a disabled agent, THEN the API SHALL reject the request and create no
  record and no run. A disabled agent is rejected with status 400 and an error message that names the
  agent. (Q-20)
- AC-21 (Ubiquitous): For every review trigger (an agent set, `{ all: true }`, `{ agentId }`, and a
  rerun), the API SHALL start every agent of the batch without waiting for another agent of the same
  batch to finish. (Q-2)
- AC-22 (Ubiquitous): The API SHALL load the PR diff and resolve the PR intent once per multi-agent
  run and share them with every agent of that run, as for today's "all agents" run.
- AC-23 (Unwanted behaviour): IF one agent's run fails or is cancelled, THEN the API SHALL record that
  run as `failed` or `cancelled` with its error text and its trace, and SHALL let every other agent
  run of the same batch continue to its own end. [covers US-3]
- AC-24 (Unwanted behaviour): IF the shared diff load fails, THEN the API SHALL record every agent run
  of that multi-agent run as `failed` with the same error text, as for today's "all agents" run.
- AC-25 (Ubiquitous): Each agent run of a multi-agent run SHALL pass through the same untrusted-input
  wrapping, grounding gate, scope filter, citation filter and persistence as a single-agent run, and
  SHALL be counted in the PR's run history and Findings tab like any other run.
- AC-26 (Ubiquitous): The API SHALL expose a read of one multi-agent run. The read returns:
  - the PR id, number and title, the start time and the agent count;
  - one entry per agent run: run id, agent id and name, provider, model, status (`running`, `done`,
    `failed`, `cancelled`), error text, verdict, score, summary, duration, tokens in and out, cost,
    its findings as persisted records, and, while `running`, its latest log line;
  - the finding groups (AC-42) and the disagreement rows (AC-45);
  - the total time, once every agent run has ended. It is the wall-clock time from the creation of
    the multi-agent run record to the end of its last agent run. (Q-10)
  - the total cost, which is the sum of the non-null agent costs, with a flag when at least one agent
    cost is null;
  - the estimate recorded at trigger time (AC-56).

### Result page — common
- AC-27 (Ubiquitous): The result page SHALL have its own address per multi-agent run. Opening that
  address directly, or reloading it, SHALL show the same run.
- AC-28 (Ubiquitous): The result page header SHALL show:
  - the PR number and title;
  - the number of agents and the label "parallel";
  - the total time and the total cost (AC-26), or "—" for a total that is not yet known.
  A total cost that excludes unpriced agents SHALL be marked as such.
- AC-56 (Event-driven): WHEN every agent run of the multi-agent run has ended, the result page header
  SHALL show the actual total time (AC-26) and the actual total cost next to the estimate. The
  estimate is computed by the AC-14 to AC-16 rules for the checked agents at trigger time and recorded
  with the multi-agent run. (accepted P-4)
- AC-29 (Event-driven): WHEN the user switches between "Columns" and "Tabs", the result page SHALL show
  the same multi-agent run in the other mode, without starting a run and without losing finding
  decisions.
- AC-30 (Ubiquitous): The result page SHALL show a "Configure run" control. It opens the Configure-run
  screen with this run's PR selected.

### Result page — Columns mode and live status
- AC-31 (Ubiquitous): The Columns mode SHALL show one column per agent run of the multi-agent run.
  Each column shows:
  - the agent name and its status;
  - its duration and cost once known, and its score once `done`;
  - one card per finding, with severity, title and `file:line`;
  - the finding count and a "View trace" link.
- AC-60 (State-driven): WHILE the columns do not fit the page width, the Columns mode SHALL scroll
  horizontally, keeping every column reachable by mouse and keyboard. (Q-26)
- AC-32 (State-driven): WHILE an agent run is `running`, its column SHALL show:
  - a running status that is not conveyed by colour alone;
  - the elapsed time;
  - the latest line of that agent run's log.
  The full live log SHALL be shown only in the run trace drawer (AC-35), not in the column. (Q-21)
- AC-33 (Event-driven): WHEN an agent run ends, its column SHALL change to `done`, `failed` or
  `cancelled` and show its result, without a page reload and without changing the other columns.
  [covers US-3]
- AC-34 (Unwanted behaviour): IF an agent run is `failed` or `cancelled`, THEN its column SHALL show
  that status and the recorded error text in place of findings, while the other columns keep their
  results.
- AC-54 (Event-driven): WHEN the user activates "Cancel" in the column of a `running` agent run, the
  result page SHALL cancel that agent run through the existing run cancel action, leaving the other
  agent runs untouched. (accepted P-1)
- AC-55 (Event-driven): WHEN the user activates "Cancel remaining" in the result page header, the
  result page SHALL cancel every agent run of the multi-agent run that is still `running`, and SHALL
  keep the results of agent runs that already ended. The control is shown only while at least one
  agent run is `running`. (accepted P-1)
- AC-35 (Event-driven): WHEN the user activates "View trace" for an agent, in either mode, the result
  page SHALL open the existing run trace drawer for that agent's run. The drawer opens on its live-log
  tab while the run is `running` and on its trace tab otherwise.
- AC-36 (Ubiquitous): The run trace drawer opened from the result page SHALL show, for that agent's
  run:
  - tokens in and out, cost, and the grounding summary;
  - the run log, including every finding dropped by the grounding gate or the scope filter, with its
    reason.
  The content is the same as when the drawer is opened from the PR page. [covers US-3]

### Result page — Tabs + detail mode
- AC-37 (Ubiquitous): The Tabs mode SHALL show one tab per agent run, labelled with the agent name and
  its score, or its status while the run has no score.
- AC-38 (Ubiquitous): The selected tab SHALL show an agent summary (score, review summary, duration,
  cost, "View trace") and that agent's findings.
- AC-39 (Event-driven): WHEN the user expands a finding in the Tabs mode, the result page SHALL show
  its confidence as a percentage, its rationale and its suggested fix when present. It SHALL also show
  the actions Accept, Dismiss and Turn into eval case, and a disabled "Learn" control whose accessible
  description reads "not available yet". The page SHALL NOT show a "Reply to author" action. (Q-7)
- AC-40 (Event-driven): WHEN the user accepts or dismisses a finding on the result page, the API
  SHALL store the decision through the existing finding actions. The decision SHALL then show on the
  result page in both modes and on the PR page Findings tab.
- AC-41 (Ubiquitous): "Turn into eval case" on the result page SHALL behave as in SPEC-06 and SPEC-07
  (offered for accepted or dismissed findings).

### Finding groups (de-duplication)
- AC-42 (Ubiquitous): The API SHALL put two findings of one multi-agent run into the same group when
  they are in the same file and their inclusive line ranges `[start_line, end_line]` overlap. The
  relation is transitive: when A overlaps B and B overlaps C, all three form one group. The API SHALL
  compute groups without any LLM or embedding call. (Q-3)
- AC-43 (Ubiquitous): Grouping SHALL NOT delete, merge or rewrite any stored finding. For every finding
  in a group, the result page SHALL keep reachable the author agent and the original title, severity,
  rationale and suggestion. [covers US-4]
- AC-44 (Ubiquitous): The result page SHALL present every finding group as one row of the
  "Where agents disagree" block (AC-45). (Q-4)
- AC-57 (Ubiquitous): In both modes, a finding whose group contains findings of other agents SHALL
  show "also flagged by <agent names>", naming each other agent with a finding in the group. (Q-4)

### Where agents disagree
- AC-45 (Ubiquitous): Both modes SHALL show a "Where agents disagree" block with one row per finding
  group. [covers US-4] Each row shows:
  - `file:line`;
  - the title of the group's most severe finding; on a tie, the first such finding in the group's
    deterministic order (NFR-2) (Q-24);
  - one cell per agent run of the multi-agent run.
  A cell shows one of:
  - when the agent has findings in the group: the severity and title of its most severe finding there,
    plus "+N more", where N counts its other findings in the group (N ≥ 1 only) (Q-23);
  - when the agent run is `done` and has no finding in the group: "did not flag". A second line labelled
    "Agent summary:" carries the agent's overall review summary on one line, truncated, with the full
    text on hover and focus. The line is omitted when the summary is empty. It is presented as the
    agent's overall summary, not as a reason for this location (Q-11);
  - when the agent run ended `failed` or `cancelled`: that status. (Q-14)
- AC-46 (State-driven): WHILE the "Show only conflicts" switch is on, the block SHALL show only
  conflict rows. Cells of `failed` or `cancelled` agent runs SHALL be ignored when deciding this. A
  conflict row is one where either:
  - at least one agent flagged the location and at least one `done` agent run did not; or
  - the agents that flagged it gave different severities.
  WHILE the switch is off, the block SHALL show every row. The switch SHALL be off when the page
  opens. (Q-8, Q-14)
- AC-47 (State-driven): WHILE the multi-agent run has no finding group, or the switch hides every
  row, the block SHALL show an empty-state message in place of rows.
- AC-48 (State-driven): WHILE at least one agent run of the multi-agent run is `running`, the block
  SHALL show that it is incomplete and SHALL update when each agent run ends.

### Live status across navigation
- AC-49 (Event-driven): WHEN the user leaves the result page during a run and comes back, or reloads
  it, the result page SHALL show each agent's current status from the API, and SHALL keep updating
  until every agent run has ended.

### Measuring 1 agent against 3 agents
- AC-50 (Ubiquitous): `docs/multi-agent-review.md` SHALL contain a measurement record with at least
  one 1-agent run and one 3-agent multi-agent run, both on the same PR at the same head commit. The
  agent of the 1-agent run is one of the three. For each run, the record lists:
  - the date, provider and model per agent;
  - the wall-clock time from trigger to the end of the last agent;
  - the duration, tokens in, tokens out and cost of each agent run;
  - the duration of the shared diff and intent preparation;
  - the run ids, so every number can be checked against the stored runs and traces.
  [covers US-6] (Q-18)
- AC-51 (Ubiquitous): The measurement record SHALL state the 3-agent / 1-agent ratio for wall-clock
  time, for total cost and for total tokens, each computed from the numbers in the record. For each
  factor it names as a cause of the ratio (for example caching, shared diff preparation, or different
  response lengths), the record SHALL cite the recorded number or trace line that shows it.

## Edge cases
- EC-1 Zero agents checked (the default state) → AC-1, AC-3, AC-11, AC-12, AC-14
- EC-2 Exactly one agent checked → AC-5, AC-19 (a one-agent multi-agent run)
- EC-3 Double-click on the run button → AC-18
- EC-4 An agent has no completed run (new agent) or only unpriced runs → AC-16, AC-53
- EC-5 One agent fails (missing provider key, LLM error, timeout) → AC-23, AC-34
- EC-6 Every agent fails → AC-23, AC-34. The page shows every column failed, and every
  disagreement-block cell reads "failed". Total cost is "—" because no agent has a cost (AC-28).
- EC-7 Diff load fails → AC-24
- EC-8 The user cancels one agent run, or every remaining one → AC-54, AC-55, AC-23, AC-34, AC-45
- EC-9 The API restarts during a run: in-flight runs are reaped as failed on boot (existing) → AC-34,
  AC-49
- EC-10 An agent returns zero findings → its column shows 0 findings. In the disagreement block it
  shows "did not flag" for every row, with its summary line (AC-45).
- EC-11 The same agent has two findings in one group → its most severe one + "+1 more" (AC-45)
- EC-12 Two agents flag one location with different severities → AC-46 (a conflict row)
- EC-13 Two different issues on overlapping lines → one group (AC-42). This trade-off is accepted:
  each original finding stays visible (AC-43).
- EC-14 Many agents (more than the result page width holds) → AC-60 (horizontal scroll)
- EC-15 Very long finding titles, file paths or agent summaries in columns and disagreement rows →
  truncated with the full text available on hover and focus (NFR-4)
- EC-16 The PR gets new commits after the run → the result page keeps showing the run as recorded. The
  PR page's existing stale and needs-review signals apply.
- EC-17 Another review is already running on the same PR → the new trigger is accepted and runs
  alongside it (Q-20)
- EC-18 An agent is deleted after the run → the column keeps the run with the agent name shown as
  "Unknown agent". Its findings stay readable.
- EC-19 An agent is disabled between opening the picker and starting the run → AC-20 (400 naming the
  agent). An agent edited in that window runs with its configuration as stored at trigger time.
- EC-20 A finding is accepted on the PR page while the result page is open → AC-40 (decisions are shared;
  the result page shows the new state after its next refresh)
- EC-21 A deep link to a multi-agent run of another workspace, or a deleted PR → the result page shows a
  "not found" state, and the API answers 404.
- EC-22 The trace is requested at the moment a run turns `done`, before the trace is stored (server
  INSIGHTS 2026-09-24) → AC-35 (the drawer shows the persisted trace once it exists)
- EC-23 The agents start together and hit the same provider at once. The provider rate-limits some of
  them (HTTP 429) → each limited agent run fails on its own (AC-23, AC-34), and the others complete.
- EC-24 The actual total time exceeds the estimate by about the time of the shared diff and intent
  preparation. The cause: the estimate comes from per-agent durations, and the actual time is
  wall-clock (Q-10). → AC-56 shows both numbers; AC-50 records the preparation time separately.
- EC-25 The user leaves the result page and later wants to see that run again → AC-59 (the PR page's
  "Latest multi-agent run" link). An older run of the same PR is reachable only by its address
  (AC-27).

## Non-functional requirements
- NFR-1 (performance): WHEN an agent run changes status, the result page SHALL show the new status
  within 5 seconds. (Q-22)
- NFR-2 (reliability): The API SHALL compute finding groups and disagreement rows deterministically,
  so that the same stored findings always give the same groups, rows, titles and order.
- NFR-3 (security): The API SHALL scope every multi-agent read and trigger to the caller's workspace,
  and SHALL keep the existing per-route rate limit of `POST /pulls/:id/review`.
- NFR-4 (accessibility): The following SHALL be operable by keyboard and SHALL have accessible names:
  - every checkbox and the run button;
  - the Columns/Tabs switch and the agent tabs;
  - "View trace", "Cancel", "Cancel remaining" and the finding actions;
  - the "Show only conflicts" switch and the "Latest multi-agent run" link.
  Text truncated on screen SHALL be available in full on focus.
- NFR-5 (accessibility): Severity, agent status, "did not flag", "failed", "cancelled" and "also
  flagged by" SHALL be conveyed by text or icon in addition to colour.
- NFR-6 (observability): Each agent run of a multi-agent run SHALL keep its own run log and trace, with
  the shared diff and intent steps present in each agent's log, as for today's "all agents" run.

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| Selected PR id and agent ids | picker / Configure run → `POST /pulls/:id/review` | workspace user | validated against the workspace; disabled rejected, duplicates collapsed (AC-19, AC-20) |
| Agent name, description, model | `agents` rows | workspace user | trusted |
| Past durations and costs for estimates | last 10 completed `agent_runs` rows per agent | DevDigest | trusted (derived) |
| Estimate recorded at trigger time | computed by the API at trigger (AC-56) | DevDigest | trusted (derived) |
| Finding title, rationale, suggestion, file, lines, severity, confidence | `findings` rows | model output (after grounding) | untrusted |
| Review summary and verdict (incl. the "Agent summary:" line of a disagreement cell) | `reviews` rows | model output | untrusted |
| Run status, error text, tokens, cost | `agent_runs` rows | DevDigest (error text may quote a provider message) | trusted, error text rendered as plain text |
| Run log lines (incl. the latest line shown in a column) | run bus / `run_traces` | DevDigest, may quote PR and model text | untrusted text |
| PR title and number | `pull_requests` rows | PR author (title) | title untrusted |
| Latest multi-agent run of a PR | multi-agent run records | DevDigest | trusted (derived) |
| Measurement numbers | stored runs and traces → `docs/multi-agent-review.md` | DevDigest | trusted (copied, checkable by run id) |

## Untrusted inputs
- The following are rendered as plain text or the existing safe Markdown renderer:
  - finding text and PR title;
  - review summaries, including the one-line "Agent summary:" under "did not flag" (AC-45);
  - log lines, including the latest log line shown in a column (AC-32).
  They are never rendered as raw HTML and never executed. They are never fed back to any model as
  instructions by this feature. The "Agent summary:" line is plain text only.
- The agent id set is validated against the caller's workspace before any record is created (AC-20).
  Its size is bounded by the number of agents in the workspace.
- PR diff and PR body reach each agent only through the existing engine wrapping (AC-25). This feature
  adds no prompt path.

## Open questions
None. Q-1..Q-26 are answered (see the Decisions log in design-review.md).

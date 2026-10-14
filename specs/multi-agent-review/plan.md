# Development Plan: Multi-Agent Review with live per-agent status

Created: 2026-10-11 · Branch: claude/multi-agent-review-live-status-8da701 · HEAD: 8099446 · Status: ready
Spec: specs/multi-agent-review/spec.md · SPEC-08 · approved
Recommended mode: multi-agent — ~19 steps, ~100 files (incl. two mechanical folder moves), two packages that can run in parallel for the first two waves, independent test-writers per package. The instance-size rule (≤ ~12 files) cannot be met by one implementer.

Verify codes (used in steps and tables; run from the package folder):
- **VS** = `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- **VSI** = `cd server && pnpm exec vitest run .it.test` (Docker; self-skips without it)
- **VC** = `cd client && pnpm typecheck && pnpm test`
- **VM** = `cd mcp && npm run typecheck && npm test`
There is no linter. Never run `git commit`/`git push`. Do not touch `server/package.json` (skip-worktree, TESTING.md § Conventions).

## Requirements
Copied verbatim from `specs/multi-agent-review/spec.md`. Non-goals NG-1..NG-10 are in "Scope — Out" with inverse checks.

- AC-1: "(Event-driven): WHEN the user opens the "Run Review" control on the PR page, the PR page SHALL list every enabled agent of the workspace, with no agent checked. Each agent has a checkbox, its name, and its estimated duration (AC-15). The list replaces the previous "Run all enabled agents" and single-agent items, which SHALL no longer be shown. [covers US-1] (Q-5, Q-19)" → S13, S14
- AC-2: "(State-driven): WHILE N ≥ 1 agents are checked, the picker SHALL show an enabled button labelled "Run multi-agent review (N)", where N is the number of checked agents." → S13
- AC-3: "(State-driven): WHILE no agent is checked, the picker SHALL show the run button disabled." → S13
- AC-4: "(Event-driven): WHEN the user activates "Clear", the picker SHALL uncheck every agent." → S13
- AC-5: "(Event-driven): WHEN the user activates "Run multi-agent review (N)", the PR page SHALL send the trigger (AC-19) for this PR with exactly the checked agents, including when N = 1. Once the trigger succeeds, the PR page SHALL open the result page of the new multi-agent run (AC-27). (Q-5, Q-9)" → S10, S13, S14
- AC-6: "(Unwanted behaviour): IF the workspace has no enabled agent, THEN the picker SHALL show the existing "no enabled agents" message with a link to the Agents page, and SHALL offer no run button." → S13
- AC-7: "(Event-driven): WHEN the user activates "Configure agents…", the picker SHALL navigate to the Agents page. (Q-13)" → S13
- AC-8: "(State-driven): WHILE the PR is merged or closed, the picker SHALL show today's muted warning that the PR is merged or closed, and SHALL still allow the run. (Q-16)" → S13
- AC-59: "(State-driven): WHILE the PR has at least one multi-agent run, the PR page SHALL show a "Latest multi-agent run" link. The link opens the result page of that PR's most recent multi-agent run, by start time. WHILE the PR has none, the PR page SHALL show no such link. (Q-25)" → S1, S4, S6, S10, S14
- AC-9: "(Ubiquitous): The sidebar SHALL contain a "Multi-Agent Review" item that opens the Configure-run screen. (Q-12)" → S11, S15
- AC-10: "(Ubiquitous): The Configure-run screen SHALL show step 1 "Pull request", a PR selector that lists the open PRs of the active repository. Each option shows `#<number> · <title>`. (Q-17)" → S15
- AC-58: "(Unwanted behaviour): IF there is no active repository, or the active repository has no open PR, THEN the Configure-run screen SHALL show a message saying so in place of the selector, and SHALL keep the run button disabled." → S15
- AC-11: "(State-driven): WHILE no PR is selected, the Configure-run screen SHALL show step 2 "Agents to run" with the placeholder "Pick a pull request first" and keep the run button disabled." → S15
- AC-12: "(Event-driven): WHEN a PR is selected, the Configure-run screen SHALL list every enabled agent as a card, with no agent checked. Each card has a checkbox, the agent name, its estimated duration and cost (AC-15), and the agent's description; the description line is omitted when the description is empty. (Q-15, Q-19)" → S15
- AC-13: "(Event-driven): WHEN the user activates "Select all", the Configure-run screen SHALL check every listed agent." → S15
- AC-14: "(State-driven): WHILE a PR is selected and N ≥ 1 agents are checked, the Configure-run screen SHALL show an enabled button "Run multi-agent review (N)". Next to it is the summary "≈ <time> · <cost> · parallel fan-out". <time> is the maximum of the checked agents' duration estimates, and <cost> is the sum of their cost estimates. (Q-2)" → S15
- AC-15: "(Ubiquitous): The duration estimate of an agent SHALL be the median duration of that agent's last 10 completed (`done`) runs. Its cost estimate SHALL be the median cost of its last 10 completed runs that have a recorded cost. The picker and Configure run show these estimates. (Q-6)" → S4, S5, S6, S13, S15 · assumes Q-2
- AC-16: "(Unwanted behaviour): IF an agent has no completed run with a recorded duration, or none with a recorded cost, THEN the picker and Configure run SHALL show "—" for the missing estimate, and the Configure-run summary SHALL leave that agent out of the matching total. (Q-6)" → S5, S13, S15
- AC-53: "(Ubiquitous): Each Configure-run agent card SHALL show the number of runs its estimate is based on ("based on N runs"). WHILE K ≥ 1 checked agents are left out of a total (AC-16), the summary SHALL state "K agents without history not included". (accepted P-3)" → S5, S15 · assumes Q-1
- AC-17: "(Event-driven): WHEN the user activates the run button on Configure run, the screen SHALL send the trigger (AC-19) for the selected PR with exactly the checked agents. Once the trigger succeeds, the screen SHALL open the result page of the new multi-agent run (AC-27)." → S10, S15
- AC-18: "(State-driven): WHILE the trigger request is in flight, the picker and Configure run SHALL keep the run button disabled and busy, so that a double activation starts at most one multi-agent run." → S13, S15
- AC-19: "(Event-driven): WHEN `POST /pulls/:id/review` receives a set of agent ids (one or more), the API SHALL do the following before any agent starts working: 1. create one multi-agent run record for that PR; 2. create one agent run per distinct selected agent, linked to that record; 3. respond with today's `{ pr_id, runs: [{ run_id, agent_id, agent_name }], reviews }` plus the multi-agent run id. An id listed more than once SHALL produce one agent run. (Q-1, Q-5, Q-20)" → S1, S2, S4, S6
- AC-52: "(Ubiquitous): `POST /pulls/:id/review` with `{ agentId }` or `{ all: true }` SHALL keep its current request and response shape and SHALL create no multi-agent run record, so existing callers (the MCP client) keep working unchanged. (Q-1)" → S6, S7
- AC-20: "(Unwanted behaviour): IF the agent set is empty, contains an id that names no agent of the workspace, or contains an id of a disabled agent, THEN the API SHALL reject the request and create no record and no run. A disabled agent is rejected with status 400 and an error message that names the agent. (Q-20)" → S6 · assumes Q-3, Q-5
- AC-21: "(Ubiquitous): For every review trigger (an agent set, `{ all: true }`, `{ agentId }`, and a rerun), the API SHALL start every agent of the batch without waiting for another agent of the same batch to finish. (Q-2)" → S3
- AC-22: "(Ubiquitous): The API SHALL load the PR diff and resolve the PR intent once per multi-agent run and share them with every agent of that run, as for today's "all agents" run." → S3, S6
- AC-23: "(Unwanted behaviour): IF one agent's run fails or is cancelled, THEN the API SHALL record that run as `failed` or `cancelled` with its error text and its trace, and SHALL let every other agent run of the same batch continue to its own end. [covers US-3]" → S3
- AC-24: "(Unwanted behaviour): IF the shared diff load fails, THEN the API SHALL record every agent run of that multi-agent run as `failed` with the same error text, as for today's "all agents" run." → S3
- AC-25: "(Ubiquitous): Each agent run of a multi-agent run SHALL pass through the same untrusted-input wrapping, grounding gate, scope filter, citation filter and persistence as a single-agent run, and SHALL be counted in the PR's run history and Findings tab like any other run." → S3, S6
- AC-26: "(Ubiquitous): The API SHALL expose a read of one multi-agent run. The read returns: the PR id, number and title, the start time and the agent count; one entry per agent run: run id, agent id and name, provider, model, status (`running`, `done`, `failed`, `cancelled`), error text, verdict, score, summary, duration, tokens in and out, cost, its findings as persisted records, and, while `running`, its latest log line; the finding groups (AC-42) and the disagreement rows (AC-45); the total time, once every agent run has ended. It is the wall-clock time from the creation of the multi-agent run record to the end of its last agent run. (Q-10); the total cost, which is the sum of the non-null agent costs, with a flag when at least one agent cost is null; the estimate recorded at trigger time (AC-56)." → S1, S2, S4, S5, S6
- AC-27: "(Ubiquitous): The result page SHALL have its own address per multi-agent run. Opening that address directly, or reloading it, SHALL show the same run." → S19
- AC-28: "(Ubiquitous): The result page header SHALL show: the PR number and title; the number of agents and the label "parallel"; the total time and the total cost (AC-26), or "—" for a total that is not yet known. A total cost that excludes unpriced agents SHALL be marked as such." → S19
- AC-56: "(Event-driven): WHEN every agent run of the multi-agent run has ended, the result page header SHALL show the actual total time (AC-26) and the actual total cost next to the estimate. The estimate is computed by the AC-14 to AC-16 rules for the checked agents at trigger time and recorded with the multi-agent run. (accepted P-4)" → S5, S6, S19
- AC-29: "(Event-driven): WHEN the user switches between "Columns" and "Tabs", the result page SHALL show the same multi-agent run in the other mode, without starting a run and without losing finding decisions." → S19
- AC-30: "(Ubiquitous): The result page SHALL show a "Configure run" control. It opens the Configure-run screen with this run's PR selected." → S19
- AC-31: "(Ubiquitous): The Columns mode SHALL show one column per agent run of the multi-agent run. Each column shows: the agent name and its status; its duration and cost once known, and its score once `done`; one card per finding, with severity, title and `file:line`; the finding count and a "View trace" link." → S16
- AC-60: "(State-driven): WHILE the columns do not fit the page width, the Columns mode SHALL scroll horizontally, keeping every column reachable by mouse and keyboard. (Q-26)" → S16
- AC-32: "(State-driven): WHILE an agent run is `running`, its column SHALL show: a running status that is not conveyed by colour alone; the elapsed time; the latest line of that agent run's log. The full live log SHALL be shown only in the run trace drawer (AC-35), not in the column. (Q-21)" → S6, S16
- AC-33: "(Event-driven): WHEN an agent run ends, its column SHALL change to `done`, `failed` or `cancelled` and show its result, without a page reload and without changing the other columns. [covers US-3]" → S10, S16, S19
- AC-34: "(Unwanted behaviour): IF an agent run is `failed` or `cancelled`, THEN its column SHALL show that status and the recorded error text in place of findings, while the other columns keep their results." → S16
- AC-54: "(Event-driven): WHEN the user activates "Cancel" in the column of a `running` agent run, the result page SHALL cancel that agent run through the existing run cancel action, leaving the other agent runs untouched. (accepted P-1)" → S16, S19
- AC-55: "(Event-driven): WHEN the user activates "Cancel remaining" in the result page header, the result page SHALL cancel every agent run of the multi-agent run that is still `running`, and SHALL keep the results of agent runs that already ended. The control is shown only while at least one agent run is `running`. (accepted P-1)" → S19
- AC-35: "(Event-driven): WHEN the user activates "View trace" for an agent, in either mode, the result page SHALL open the existing run trace drawer for that agent's run. The drawer opens on its live-log tab while the run is `running` and on its trace tab otherwise." → S9, S10, S19
- AC-36: "(Ubiquitous): The run trace drawer opened from the result page SHALL show, for that agent's run: tokens in and out, cost, and the grounding summary; the run log, including every finding dropped by the grounding gate or the scope filter, with its reason. The content is the same as when the drawer is opened from the PR page. [covers US-3]" → S9, S19
- AC-37: "(Ubiquitous): The Tabs mode SHALL show one tab per agent run, labelled with the agent name and its score, or its status while the run has no score." → S17
- AC-38: "(Ubiquitous): The selected tab SHALL show an agent summary (score, review summary, duration, cost, "View trace") and that agent's findings." → S17
- AC-39: "(Event-driven): WHEN the user expands a finding in the Tabs mode, the result page SHALL show its confidence as a percentage, its rationale and its suggested fix when present. It SHALL also show the actions Accept, Dismiss and Turn into eval case, and a disabled "Learn" control whose accessible description reads "not available yet". The page SHALL NOT show a "Reply to author" action. (Q-7)" → S17
- AC-40: "(Event-driven): WHEN the user accepts or dismisses a finding on the result page, the API SHALL store the decision through the existing finding actions. The decision SHALL then show on the result page in both modes and on the PR page Findings tab." → S17, S19
- AC-41: "(Ubiquitous): "Turn into eval case" on the result page SHALL behave as in SPEC-06 and SPEC-07 (offered for accepted or dismissed findings)." → S8, S17
- AC-42: "(Ubiquitous): The API SHALL put two findings of one multi-agent run into the same group when they are in the same file and their inclusive line ranges `[start_line, end_line]` overlap. The relation is transitive: when A overlaps B and B overlaps C, all three form one group. The API SHALL compute groups without any LLM or embedding call. (Q-3)" → S5
- AC-43: "(Ubiquitous): Grouping SHALL NOT delete, merge or rewrite any stored finding. For every finding in a group, the result page SHALL keep reachable the author agent and the original title, severity, rationale and suggestion. [covers US-4]" → S5, S17
- AC-44: "(Ubiquitous): The result page SHALL present every finding group as one row of the "Where agents disagree" block (AC-45). (Q-4)" → S18
- AC-57: "(Ubiquitous): In both modes, a finding whose group contains findings of other agents SHALL show "also flagged by <agent names>", naming each other agent with a finding in the group. (Q-4)" → S12, S16, S17
- AC-45: "(Ubiquitous): Both modes SHALL show a "Where agents disagree" block with one row per finding group. [covers US-4] Each row shows: `file:line`; the title of the group's most severe finding; on a tie, the first such finding in the group's deterministic order (NFR-2) (Q-24); one cell per agent run of the multi-agent run. A cell shows one of: when the agent has findings in the group: the severity and title of its most severe finding there, plus "+N more", where N counts its other findings in the group (N ≥ 1 only) (Q-23); when the agent run is `done` and has no finding in the group: "did not flag". A second line labelled "Agent summary:" carries the agent's overall review summary on one line, truncated, with the full text on hover and focus. The line is omitted when the summary is empty. It is presented as the agent's overall summary, not as a reason for this location (Q-11); when the agent run ended `failed` or `cancelled`: that status. (Q-14)" → S5, S18 · assumes Q-4
- AC-46: "(State-driven): WHILE the "Show only conflicts" switch is on, the block SHALL show only conflict rows. Cells of `failed` or `cancelled` agent runs SHALL be ignored when deciding this. A conflict row is one where either: at least one agent flagged the location and at least one `done` agent run did not; or the agents that flagged it gave different severities. WHILE the switch is off, the block SHALL show every row. The switch SHALL be off when the page opens. (Q-8, Q-14)" → S5, S18
- AC-47: "(State-driven): WHILE the multi-agent run has no finding group, or the switch hides every row, the block SHALL show an empty-state message in place of rows." → S18
- AC-48: "(State-driven): WHILE at least one agent run of the multi-agent run is `running`, the block SHALL show that it is incomplete and SHALL update when each agent run ends." → S18
- AC-49: "(Event-driven): WHEN the user leaves the result page during a run and comes back, or reloads it, the result page SHALL show each agent's current status from the API, and SHALL keep updating until every agent run has ended." → S10, S19
- AC-50: "(Ubiquitous): `docs/multi-agent-review.md` SHALL contain a measurement record with at least one 1-agent run and one 3-agent multi-agent run, both on the same PR at the same head commit. The agent of the 1-agent run is one of the three. For each run, the record lists: the date, provider and model per agent; the wall-clock time from trigger to the end of the last agent; the duration, tokens in, tokens out and cost of each agent run; the duration of the shared diff and intent preparation; the run ids, so every number can be checked against the stored runs and traces. [covers US-6] (Q-18)" → S3 (data support only) · record document out of this run
- AC-51: "(Ubiquitous): The measurement record SHALL state the 3-agent / 1-agent ratio for wall-clock time, for total cost and for total tokens, each computed from the numbers in the record. For each factor it names as a cause of the ratio (for example caching, shared diff preparation, or different response lengths), the record SHALL cite the recorded number or trace line that shows it." → S3 (data support only) · record document out of this run
- NFR-1: "(performance): WHEN an agent run changes status, the result page SHALL show the new status within 5 seconds. (Q-22)" → S10
- NFR-2: "(reliability): The API SHALL compute finding groups and disagreement rows deterministically, so that the same stored findings always give the same groups, rows, titles and order." → S5
- NFR-3: "(security): The API SHALL scope every multi-agent read and trigger to the caller's workspace, and SHALL keep the existing per-route rate limit of `POST /pulls/:id/review`." → S4, S6
- NFR-4: "(accessibility): The following SHALL be operable by keyboard and SHALL have accessible names: every checkbox and the run button; the Columns/Tabs switch and the agent tabs; "View trace", "Cancel", "Cancel remaining" and the finding actions; the "Show only conflicts" switch and the "Latest multi-agent run" link. Text truncated on screen SHALL be available in full on focus." → S12, S13, S14, S15, S16, S17, S18, S19
- NFR-5: "(accessibility): Severity, agent status, "did not flag", "failed", "cancelled" and "also flagged by" SHALL be conveyed by text or icon in addition to colour." → S12, S16, S17, S18
- NFR-6: "(observability): Each agent run of a multi-agent run SHALL keep its own run log and trace, with the shared diff and intent steps present in each agent's log, as for today's "all agents" run." → S3

## Traceability
Hints: **UI** = run `./scripts/dev.sh` (migrate first: `cd server && pnpm db:migrate`); a real review needs an `openrouter` key, otherwise every agent column ends `failed`, which is itself a check of AC-23/34. **API** = `curl` against :3001. See "Hands-on verification".

| Requirement | Steps | Tests | Verify | Verification hint | State |
|---|---|---|---|---|---|
| AC-1 | S13,S14 | T-21 | VC | UI: PR page → Run Review: only agent rows, none checked, no "Run all enabled agents" | planned |
| AC-2 | S13 | T-21 | VC | UI: tick 2 agents → "Run multi-agent review (2)" enabled | planned |
| AC-3 | S13 | T-21 | VC | UI: nothing ticked → button disabled | planned |
| AC-4 | S13 | T-21 | VC | UI: tick, click Clear → all unticked | planned |
| AC-5 | S10,S13,S14 | T-21 | VC | UI: run with 1 agent → lands on /multi-agent-review/<id> | planned |
| AC-6 | S13 | T-21 | VC | UI: disable all agents → "No enabled agents" + link to /agents, no run button | planned |
| AC-7 | S13 | T-21 | VC | UI: "Configure agents…" → /agents | planned |
| AC-8 | S13 | T-21 | VC | UI: merged/closed PR → muted warning, run still works | planned |
| AC-59 | S1,S4,S6,S10,S14 | T-11,T-22 | VSI,VC | API: GET /pulls/<id>/multi-agent-runs/latest → {latest:null} then run; UI: link only after a run | planned |
| AC-9 | S11,S15 | T-19 | VC | UI: sidebar item "Multi-Agent Review" → /multi-agent-review | planned |
| AC-10 | S15 | T-23 | VC | UI: selector lists open PRs as "#n · title" | planned |
| AC-58 | S15 | T-23 | VC | UI: repo without open PR → message, run disabled | planned |
| AC-11 | S15 | T-23 | VC | UI: step 2 shows "Pick a pull request first" | planned |
| AC-12 | S15 | T-23 | VC | UI: select PR → cards, none ticked; empty description → no line | planned |
| AC-13 | S15 | T-23 | VC | UI: Select all ticks every card | planned |
| AC-14 | S15 | T-23 | VC | UI: summary "≈ max time · sum cost · parallel fan-out" | planned |
| AC-15 | S4,S5,S6,S13,S15 | T-3,T-11,T-13 | VS,VSI | API: GET /review-estimates; compare with last 10 done runs in DB | assumes Q-2 |
| AC-16 | S5,S13,S15 | T-3,T-21,T-23 | VS,VC | UI: new agent shows "—" and is left out of totals | planned |
| AC-53 | S5,S15 | T-3,T-23 | VS,VC | UI: card "based on N runs"; summary "K agents without history not included" | assumes Q-1 |
| AC-17 | S10,S15 | T-23 | VC | UI: run on Configure → result page | planned |
| AC-18 | S13,S15 | T-21,T-23 | VC | UI: double-click run → one multi-agent run in DB | planned |
| AC-19 | S1,S2,S4,S6 | T-5,T-6,T-13 | VS,VSI | API: POST /pulls/<id>/review {"agentIds":[a,b,a]} → 2 runs + multi_agent_run_id | planned |
| AC-52 | S6,S7 | T-8,T-14 | VSI,VM | API: {agentId}/{all} → same shape, no multi_agent_runs row | planned |
| AC-20 | S6 | T-7 | VSI | API: [], unknown id, disabled id → 400 naming agent; no rows | assumes Q-3,Q-5 |
| AC-21 | S3 | T-9 | VSI | Test: gated provider A finishes only after B started | planned |
| AC-22 | S3,S6 | T-6,T-9 | VSI | Test: git mock diff called once per batch; log lines in every trace | planned |
| AC-23 | S3 | T-9 | VSI | Test: one provider throws → failed+error+trace, other done | planned |
| AC-24 | S3 | T-9 | VSI | Test: git throws → every run failed, same error | planned |
| AC-25 | S3,S6 | T-6 | VSI | Test: findings grounded; runs in /pulls/:id/runs and /reviews | planned |
| AC-26 | S1,S2,S4,S5,S6 | T-4,T-10 | VS,VSI | API: GET /multi-agent-runs/<id> shape | planned |
| AC-27 | S19 | T-27 | VC | UI: reload result URL → same run | planned |
| AC-28 | S19 | T-27 | VC | UI: header number/title, N agents, "parallel", total or "—", unpriced marker | planned |
| AC-56 | S5,S6,S19 | T-3,T-6,T-27 | VS,VSI,VC | UI: after end header shows actual next to estimate | planned |
| AC-29 | S19 | T-27 | VC | UI: toggle Columns/Tabs; no new request to POST /review | planned |
| AC-30 | S19 | T-27 | VC | UI: "Configure run" → /multi-agent-review?pr=<id> with PR selected | planned |
| AC-31 | S16 | T-24 | VC | UI: one column per agent: name, status, duration, cost, score, cards, count, View trace | planned |
| AC-60 | S16 | T-24 | VC | UI: 6+ agents / narrow window → horizontal scroll, Tab key reaches all columns (jsdom has no layout: manual) | planned |
| AC-32 | S6,S16 | T-10,T-24 | VSI,VC | UI: running column: status text, elapsed, latest log line, no full log | planned |
| AC-33 | S10,S16,S19 | T-18,T-24,T-27 | VC | UI: columns flip to done/failed within 5 s without reload | planned |
| AC-34 | S16 | T-24 | VC | UI: failed column shows status + error text | planned |
| AC-54 | S16,S19 | T-12,T-24,T-27 | VSI,VC | UI: Cancel in one running column | planned |
| AC-55 | S19 | T-12,T-27 | VSI,VC | UI: "Cancel remaining" only while running | planned |
| AC-35 | S9,S10,S19 | T-17,T-27 | VC | UI: View trace → drawer on Live log while running, Trace after | planned |
| AC-36 | S9,S19 | T-16,T-10 | VC,VSI | UI: drawer shows tokens, cost, grounding, dropped findings with reason | planned |
| AC-37 | S17 | T-25 | VC | UI: tabs "Name 82" or "Name running" | planned |
| AC-38 | S17 | T-25 | VC | UI: selected tab summary + findings | planned |
| AC-39 | S17 | T-25 | VC | UI: expand finding: confidence %, rationale, fix, Accept/Dismiss/Turn into eval case, Learn disabled "not available yet", no Reply | planned |
| AC-40 | S17,S19 | T-12,T-25 | VSI,VC | UI: Accept → shows in both modes and PR Findings tab | planned |
| AC-41 | S8,S17 | T-15,T-25 | VC | UI: eval-case button enabled only after a decision | planned |
| AC-42 | S5 | T-1 | VS | API: groups in GET payload; overlap incl. transitive | planned |
| AC-43 | S5,S17 | T-1,T-25 | VS,VC | UI/API: columns[].findings unchanged; each member keeps author | planned |
| AC-44 | S18 | T-26 | VC | UI: one disagree row per group | planned |
| AC-57 | S12,S16,S17 | T-20,T-24,T-25 | VC | UI: "also flagged by <names>" on a shared finding, both modes | planned |
| AC-45 | S5,S18 | T-2,T-26 | VS,VC | UI: row file:line, title, one cell per agent, "+N more", "did not flag" + "Agent summary:" | assumes Q-4 |
| AC-46 | S5,S18 | T-2,T-26 | VS,VC | UI: switch off by default; on hides agreeing rows | planned |
| AC-47 | S18 | T-26 | VC | UI: no groups / filtered-out → empty-state message | planned |
| AC-48 | S5,S18 | T-2,T-26 | VS,VC | UI: while running block says incomplete; updates when a run ends | planned |
| AC-49 | S10,S19 | T-18,T-27 | VC | UI: leave during a run, come back → live statuses | planned |
| AC-50 | S3 | — | — | Not tested — the record is a document (doc step dropped by caller). Data support: "Shared preparation (diff + intent) done (Nms)" line in every trace | deferred (document) |
| AC-51 | S3 | — | — | Not tested — same. Ratio computed from stored runs/traces via GET /multi-agent-runs/<id> | deferred (document) |
| NFR-1 | S10 | T-18 | VC | UI: stopwatch status change → ≤ 5 s (poll 3 s) | planned |
| NFR-2 | S5 | T-1,T-2,T-4 | VS | Same stored findings, shuffled input → identical output | planned |
| NFR-3 | S4,S6 | T-10,T-13 | VSI | API: foreign-workspace id → 404; `config.rateLimit` on POST kept (code review; rate limit off in test) | planned |
| NFR-4 | S12–S19 | T-21,T-23–T-27 | VC | UI: Tab through every named control; role/name queries in tests | planned |
| NFR-5 | S12,S16,S17,S18 | T-20,T-24–T-26 | VC | UI: statuses/severity readable with colour removed (text/icon) | planned |
| NFR-6 | S3 | T-6,T-10 | VSI | API: GET /runs/<id>/trace log has diff + intent + shared-preparation lines in each run | planned |

## Non-functional requirements
| NFR / quality | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 status ≤ 5 s | spec | Result page polls `GET /multi-agent-runs/:id` every 3 s while any column is `running`; stops when none (S10) | T-18 asserts interval ≤ 5000 ms and `false` when idle; manual stopwatch |
| NFR-2 determinism | spec | Pure functions with total ordering: findings sorted by (file, start_line, end_line, id); columns by (agent name casefold, run id); groups by (file, start_line) (S5) | T-1/T-2/T-4 shuffle-input tests |
| NFR-3 workspace scope, rate limit | spec | Every repo method takes `workspaceId` and filters in the query (S4); POST keeps `config.rateLimit {max:10,timeWindow:'1 minute'}` (S6) | T-10 cross-workspace 404; rate limit by code review (disabled under NODE_ENV=test, server/AGENTS.md:50) |
| NFR-4 keyboard + names | spec | Native `button`/`input`/`label`, `role=tablist/tab`, `aria-pressed`, `role=switch` inside `<label>`; truncated text via `title` and focusable element (S12–S19) | RTL `getByRole(name)`; manual Tab pass |
| NFR-5 not colour only | spec | `AgentStatus` = icon + text; severity via vendor `SeverityBadge`; state words in cells (S12) | T-20 and component tests |
| NFR-6 per-run log/trace | spec | Existing fan-out `RunLogger` kept (run-executor.ts:75-80); S3 adds one timing line | T-6/T-10 read trace |
| Untrusted text plain | spec § Untrusted inputs, client AGENTS | Titles, summaries, log lines, PR title, error text rendered as React text nodes; rationale/suggestion only via vendor `Markdown` (as FindingCard.tsx:94-100) | T-24/T-25/T-26 render `<img onerror>` text, assert no element |
| Workspace-validated ids | spec | `agentIds` uuid-typed in schema (422), resolved against `agents.list(workspaceId)` before any write (S6) | T-7 |

## Requirements review
No blocking findings.
- Q-1 [non-blocking] AC-53 — "based on N runs" can count the duration basis or the cost basis, which differ for unpriced runs — planned with: N = number of runs behind the duration estimate (cost basis is in the contract as `cost_runs` and not shown).
- Q-2 [non-blocking] AC-15 — "last 10 completed runs that have a recorded cost": window before or after dropping unpriced runs — planned with: after (newest 10 done runs that have the value, separately for duration and cost).
- Q-3 [non-blocking] AC-19/AC-52 — body with `agentIds` together with `agentId` or `all` is not specified — planned with: 400 `invalid_run_request`.
- Q-4 [non-blocking] AC-45 — a disagreement cell for a still-`running` agent with no finding in the group has no defined text — planned with: the cell shows the status "running" (never "did not flag"); not counted as "done agent that did not flag" in AC-46.
- Q-5 [non-blocking] AC-20 — only the disabled agent is given a status (400); empty set and unknown id are not — planned with: 400 `invalid_run_request` for all three.
- Requirements suggestions for the spec author (not planned, would change behaviour):
  1. AC-18 protects only the client; a server-side double POST creates two multi-agent runs (idempotency key would be a new requirement).
  2. `GET /runs/:id/trace` and `POST /runs/:id/cancel` are not workspace-scoped today (reviews/routes.ts:115-127, run.repo.ts:94-101); NFR-3 covers only the new endpoints.
  3. Runs reaped on boot get status `failed` with no error text (run.repo.ts:105-111), so AC-34 shows only the status for EC-9.
  4. Deleting one run of a multi-agent run from the PR history (`DELETE /runs/:id`) shrinks the result page; not covered by any criterion.
  5. AC-28 "total cost … not yet known" while agents run: planned as shown only once all ended.

## Scope
In: server `reviews` module (executor concurrency, multi-agent repository/service/pure helpers, new routes, trigger by agent set), one migration, both `@devdigest/shared` copies, MCP regression test, client: PR-page picker, Configure run, results page (Columns, Tabs, disagreement block), shared trace drawer, sidebar item.
Out (Non-goals as inverse checks):
- NG-1 no change under `ci/`, `agent-runner/` — check `git diff --stat main -- ci agent-runner` is empty.
- NG-2 grounding gate, scope filter, untrusted-input handling untouched — `git diff --stat main -- reviewer-core` is empty; no edit to `reviewer-core` at all.
- NG-3 no Memory / Agent Performance / CI Runs pages — only one new nav entry.
- NG-4 no LLM/embedding call to group — `rg -n "llm|embed" server/src/modules/reviews/multi-agent` returns nothing.
- NG-5 no persistence of the agent selection — `rg -n "localStorage|sessionStorage" client/src/app/multi-agent-review client/src/app/repos/*/pulls/*/_components/AgentPicker` returns nothing.
- NG-6 no worktrees; the text "worktrees" must not appear in new UI strings.
- NG-7 no "Reply to author" on the result page; Learn only disabled.
- NG-8 no retry control in a column.
- NG-9 no cache-read token field added to the trace.
- NG-10 no `aria-live` / `role=status` announcement of agent completion in columns.
- Documentation (doc-writer is not scheduled; the caller dropped it): `docs/multi-agent-review.md` (AC-50/51 record), `server/specs/review-flow.md` ("Isolation between agents" becomes concurrent), `client/specs/pages.md`, `server/README.md`/`client/README.md` route and hook maps, a CLAUDE.md "Read When" row, `docs/skill-examples/README.md` and `docs/agent-prompts/choosing-a-model.md` wording "Run Review → agent". INSIGHTS.md only if something genuinely new turns up.

## Context used
- Guidance read: CLAUDE.md, AGENTS.md (root), server/AGENTS.md, client/AGENTS.md, mcp/AGENTS.md, TESTING.md, specs/multi-agent-review/{spec,design-review}.md, `.claude/skills/onion-architecture/{SKILL.md,rules/drizzle.md,rules/zod-contracts.md,rules/testing.md}`, `.claude/skills/frontend-ui-architecture/SKILL.md`, drizzle-orm-patterns and react-best-practices SKILL.md (head).
- Lessons applied:
  - server/INSIGHTS 2026-10-09 (optional body needs `.nullish()`) → S6 uses `RunRequest.nullish()` and `req.body ?? {}`.
  - server/INSIGHTS 2026-09-25 (drizzle-kit hangs without TTY) → S2 uses the pty command; only column additions are planned, so no rename prompt is expected.
  - server/INSIGHTS 2026-09-24 (done before trace saved) → T-6/T-10 poll the trace endpoint; S10 gives the drawer a bounded retry for a missing trace (EC-22).
  - server/INSIGHTS 2026-09-26 (hermetic intent) → new it-tests inject `llm.openrouter` intent fixture and `MockSecretsProvider({})` as in reviews.it.test.ts:125-144.
  - server/INSIGHTS 2026-09-24 (list ORDER BY) → every list query in S4 has a total order.
  - client/INSIGHTS 2026-10-04 (value imports from `@devdigest/shared` blank the page) → client uses `import type` only; Severity ranks and status lists are repeated locally.
  - client/INSIGHTS 2026-09-26 (no user-event) → tests use `fireEvent`.
  - client/INSIGHTS 2026-09-26 (sticky `top:0` under PR header) → result page must not add sticky headers under the PR route (it is a separate route, so no issue; no sticky elements planned).
  - client/INSIGHTS 2026-09-19 (border shorthands) → longhand border styles in new styles.ts.
  - client/INSIGHTS 2026-09-25 (relativeTime) → pass `useNow()` if relative time is shown.
  - root INSIGHTS 2026-09-24 (vendor/shared drift) → S1 diffs each touched file in both copies before copying.
- Designs: `specs/multi-agent-review/designs/01-pr-page-agent-picker.png` → S13, S14; `02-configure-run-empty.png`, `03-configure-run-selected.png` → S15; `04-results-columns.png` → S12, S16, S18, S19; `05-results-tabs-detail.png` → S12, S17, S18, S19. The spec overrides the designs (nothing pre-checked, no "worktrees", enabled/disabled run button, Learn disabled).
- Reference codebase `inbox/dev-digest-lesson-7-lab-multiagents-finish` (data only): `multi-agent-conflicts.ts` union-find idea; client `AgentPicker`, `ColumnsView`. Do not copy its `POST /pulls/:id/multi-agent-run` route, `has_history` agent fields or pre-checked default.
- Skills: onion-architecture (S3–S6), fastify-best-practices (S6), drizzle-orm-patterns + postgresql-table-design (S2, S4), zod (S1), security (S1, S6, S16–S19: plain-text rendering, workspace scope), typescript-expert (S5), frontend-ui-architecture (S8–S19), react-best-practices (S10–S19), next-best-practices (S15, S19 routes), react-testing-library (all client tests), engineering-insights (end of work).

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| Only a repository imports drizzle/db schema; repository owns transactions, workspace scoping; no business rules in SQL | onion rules/drizzle.md | S4 `repository/multi-agent.repo.ts` returns samples/rows; medians, grouping, totals computed in pure S5 |
| Service takes explicit deps, not `Container` | onion SKILL | S6 `MultiAgentService({repo, agents, runBus, executor})`; `ReviewService` (already container-based, known deviation) only constructs it |
| Route = schema + `getContext` + one service call | onion SKILL, server/AGENTS | S6 |
| Contracts in `vendor/shared`, both copies | CLAUDE.md, rules/zod-contracts | S1 owns both copies |
| Migrations by drizzle-kit only, never edited, never hand-named | CLAUDE.md | S2 |
| DB-backed tests end `.it.test.ts` | server/AGENTS | T-6..T-13 |
| Pure logic with no IO lives in a testable file; precedent `reviews/smart-diff/*` | repo | S5 in `reviews/multi-agent/` (not `reviewer-core`: NG-2 and shared with CI runner) |
| Client data via `lib/hooks` → `lib/api.ts`; thin pages; colocated `_components/<Name>/` + test; strings via next-intl; no cross-feature imports; promotion on second consumer | client AGENTS, frontend-ui-architecture | S8/S9 promote `EvalCaseButton` and `RunTraceDrawer` to `src/components/`; one messages namespace file per owning step |
| Client imports only types from `@devdigest/shared` | client INSIGHTS 2026-10-04 | `import type` everywhere |
| Vendor untouched except `nav.ts` | CLAUDE.md | S11 edits `nav.ts` only; `LiveLogStream` used as is |
| Dynamic `useSearchParams` page needs Suspense | next-best-practices | S15 wraps the view in `<Suspense>` |

## Steps

### S1 Contracts and vendor sync
- Module / layer: `@devdigest/shared` (ring 2); owns BOTH copies.
- Files:
  - modify `server/src/vendor/shared/contracts/observability.ts:18-86` — replace the unused A5 multi-agent block (nothing else references it) with the shapes below; keep `AgentStats`, `CuratorResult`.
  - modify `server/src/vendor/shared/contracts/review-api.ts:52-57` — `ReviewRunResponse` gains `multi_agent_run_id: z.string().optional()`.
  - modify `server/src/vendor/shared/contracts/platform.ts:275-279` — `RunRequest` gains `agentIds: z.array(z.string().uuid()).optional()`.
  - the same three files in `client/src/vendor/shared/contracts/`. Diff each pair first: if the only drift is comments, copy the canonical file whole; otherwise apply the identical edit to both.
- Shapes (names fixed so later steps agree; all snake_case like the rest):
  - `RunStatus = enum(running|done|failed|cancelled)`.
  - `AgentColumn`: `run_id, agent_id|null, agent_name|null, provider|null, model|null, status, error|null, verdict|null, score|null, summary|null, duration_ms|null, tokens_in|null, tokens_out|null, cost_usd|null, started_at, latest_log|null, findings: FindingRecord[]` (import `FindingRecord` from `./review-api.js`; no cycle).
  - `FindingGroup`: `id` (`${file}:${start_line}-${end_line}`), `file, start_line, end_line, title, severity, members: {finding_id, run_id}[]`.
  - `ConflictTake` (one cell): `run_id, agent_id|null, agent_name|null, state: flagged|did_not_flag|running|failed|cancelled, severity|null, title|null, finding_id|null, more_count: int, agent_summary|null`.
  - `Conflict` (one row): `group_id, file, line, title, is_conflict: boolean, takes: ConflictTake[]`.
  - `RunEstimate`: `time_ms|null, cost_usd|null, agents_without_time, agents_without_cost`.
  - `AgentEstimate`: `agent_id, duration_ms|null, cost_usd|null, runs` (duration basis, Q-1)`, cost_runs`.
  - `ReviewEstimates = {estimates: AgentEstimate[]}`.
  - `MultiAgentRun`: `id, pr_id, repo_id, pr_number, pr_title, ran_at, agent_count, total_duration_ms|null, total_cost_usd|null, cost_incomplete: boolean, estimate: RunEstimate|null, columns, groups, conflicts`.
  - `LatestMultiAgentRun = {latest: {id, ran_at} | null}`.
- Skills to apply: zod; onion § zod-contracts; typescript-expert.
- Depends on: —
- Tests (single-agent mode): T-5
- Done when: both copies of the three files match for the touched exports; server and client typecheck.
- Verify: `cd server && pnpm typecheck` and `cd client && pnpm typecheck` and `cd mcp && npm run typecheck`

### S2 DB schema and migration
- Module / layer: `server/src/db` (ring 4a). Owns the migration and snapshots.
- Files:
  - modify `server/src/db/schema/runs.ts:8-56`: `agent_runs.multi_agent_run_id uuid null → multi_agent_runs.id ON DELETE SET NULL` (index `agent_runs_multi_idx`); `agent_runs.finished_at timestamptz null`; `multi_agent_runs.estimate jsonb null` typed `RunEstimate`; index on `multi_agent_runs (pr_id, ran_at)`.
  - generated: `server/src/db/migrations/0016_<generated>.sql`, `meta/_journal.json`, `meta/0016_snapshot.json`.
- Procedure: `cd server && (for i in $(seq 1 20); do sleep 2; printf '\r'; done) | script -q /dev/null pnpm db:generate` (server/INSIGHTS 2026-09-25). Only columns/indexes are added, so no rename prompt should appear; if one does, accept "create column". Read the SQL: it must contain only `ADD COLUMN`, `CREATE INDEX`, one `ADD CONSTRAINT … FOREIGN KEY`. Never hand-name or edit the file.
- Skills to apply: drizzle-orm-patterns § migrations; postgresql-table-design § indexes/constraints.
- Depends on: S1 (type import for `RunEstimate`; use `import type`).
- Tests (single-agent mode): — (exercised by every `*.it.test.ts`, which migrates a fresh container)
- Done when: migration generated; `pnpm typecheck` passes; `pnpm db:migrate` applies on a dev DB.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/reviews.it.test.ts`

### S3 Executor: concurrent batch + shared-preparation timing
- Module / layer: reviews application ring.
- Files: modify `server/src/modules/reviews/run-executor.ts:122-149` — replace the sequential `for…await` by `await Promise.allSettled(jobs.map(runJob))`, where `runJob` keeps today's per-agent try/catch and logging (failure isolation already inside `runOneAgent`, :344-367). After the intent step (:120) record one line through the fan-out logger: `Shared preparation (diff + intent) done (<N>ms)` measured from the start of diff loading (:107). Do not touch `reviewer-core`, grounding, scope filter, citation filter (NG-2). No limit on parallelism (AC-21).
- Why here: this one function serves set, `{all}`, `{agentId}`, MCP and rerun (service.ts:127, :178), so AC-21 is met for all.
- Skills to apply: onion § rings (application); typescript-expert.
- Depends on: —
- Tests (single-agent mode): T-9
- Done when: `{all:true}` with two agents starts both before either finishes; existing review suites stay green.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run .it.test` (reviews, skills-prompt, reviews-context-docs, intent-review suites rely on order; fix any sequential assumption in the test, not in the engine)

### S4 Repository: multi-agent aggregate
- Module / layer: persistence (ring 4a), `reviews` module.
- Files:
  - create `server/src/modules/reviews/repository/multi-agent.repo.ts`: `createMultiAgentRun({workspaceId, prId, estimate, targets})` in ONE transaction (insert record, insert N `agent_runs` `running` with `multi_agent_run_id`) → `{id, ranAt, runIds}`; `getMultiAgentRun(ws, id)` joined to the PR (`repoId, number, title`) filtered by workspace on both; `listEntries(ws, id)` → agent run rows + agent name (left join) + review (verdict, summary, score) + findings (`FindingRow[]`, total order file, start_line, end_line, id); `latestForPull(ws, prId)` ordered `ran_at desc, id desc`; `estimateSamples(ws, agentIds)` → per agent newest ≤10 `done` durations and newest ≤10 `done` costs that are non-null (Q-2), ordered `ran_at desc, id desc`.
  - modify `server/src/modules/reviews/repository.ts` — facade methods delegating to the new file.
  - modify `server/src/modules/reviews/repository/run.repo.ts:94-180` — `completeAgentRun`, `cancelRunIfRunning`, `reapStaleRunningRuns` also set `finished_at = now()`.
- Skills to apply: onion § drizzle; drizzle-orm-patterns § transactions; postgresql-table-design.
- Depends on: S2
- Tests (single-agent mode): T-13
- Done when: methods typecheck and T-13 passes.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/multi-agent-repository.it.test.ts`

### S5 Pure multi-agent domain helpers
- Module / layer: application ring, pure (no IO, no `drizzle`, no container) — folder `server/src/modules/reviews/multi-agent/` (precedent: `reviews/smart-diff/`).
- Files (create):
  - `groups.ts` — `groupFindings(findings)`: sort by (file, start_line, end_line, id), union-find over same file and inclusive overlap `a.start<=b.end && b.start<=a.end` (transitive). Group `title/severity` = most severe member (CRITICAL>WARNING>SUGGESTION), ties → first in the sort order; `members` list every finding (nothing dropped, AC-43). No LLM/embedding (NG-4).
  - `conflicts.ts` — `buildConflicts(columns, groups, findingsById)`: one row per group; one cell per column (run). Cell states: agent has findings in the group → `flagged` with its most severe finding (tie → sort order), `more_count` = its other findings in that group; run `done` without findings → `did_not_flag` with `agent_summary` (trimmed; null when empty); `failed`/`cancelled` → that state; `running` → `running` (Q-4). `is_conflict` = (some `flagged` and some `did_not_flag` cell) OR (flagged cells have more than one distinct severity); `running`/`failed`/`cancelled` cells are ignored for that test (AC-46). Row `line` = group start_line.
  - `estimate.ts` — `median` (even count → mean of the two middle values; durations rounded to int), `toAgentEstimate(samples)`, `summariseEstimate(estimates, agentIds)` → `RunEstimate` (time = max of known durations, cost = sum of known costs, `agents_without_*` counts) — the same rules as AC-14..16 for the recorded estimate (AC-56).
  - `view.ts` — `buildMultiAgentRun(record, entries, latestLogs, now?)` → `MultiAgentRun`: maps rows with `findingRowToDto` (`helpers.ts:95`), columns ordered by (agent name casefold, null last, run id), status mapping total (unknown/null → `failed`), `agent_count`, `latest_log` only for `running`, `total_duration_ms` = max(`finished_at`) − `ran_at` only when no run is `running`, else null; `total_cost_usd` = sum of non-null costs (null when none), `cost_incomplete` = any column cost null.
- Skills to apply: typescript-expert; onion § testing (logic must be testable without Postgres).
- Depends on: S1
- Tests (single-agent mode): T-1, T-2, T-3, T-4
- Done when: unit tests green; `rg -n "drizzle|llm|embed" server/src/modules/reviews/multi-agent` returns nothing.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/multi-agent-groups.test.ts test/multi-agent-conflicts.test.ts test/multi-agent-estimate.test.ts test/multi-agent-view.test.ts`

### S6 Service and routes
- Module / layer: application + transport, `reviews` module.
- Files:
  - create `server/src/modules/reviews/multi-agent/service.ts` — `MultiAgentService` (deps injected: repo, `agents` repo, `runBus`, executor): `trigger(workspaceId, prId, agentIds, logger)`: (1) dedupe preserving order; (2) empty → 400; resolve against `agents.list(workspaceId)`; unknown id → 400 (Q-5); disabled → 400 with the agent name in the message (AC-20) — all before any write; (3) PR/repo lookup (404); (4) estimate from `estimateSamples` + `summariseEstimate`; (5) `repo.createMultiAgentRun` (one tx); (6) fire `executor.executeRuns(...)` not awaited with a `.catch` log, as service.ts:178-180; (7) return `{runs, reviews: [], multi_agent_run_id}`. `get(ws, id)` (404 when absent/foreign; `latest_log` from `runBus.buffer(runId).at(-1)?.msg` for running runs), `latestForPull(ws, prId)` (404 for foreign PR), `estimates(ws)` (all workspace agents).
  - modify `server/src/modules/reviews/service.ts` — construct `MultiAgentService` and expose pass-through methods; `resolveTargets` and the legacy paths unchanged (AC-52). Agent rows are read at trigger and passed to the executor, so later edits do not change the run (EC-19).
  - modify `server/src/modules/reviews/routes.ts:28-45` — body schema `RunRequest.nullish()` and `req.body ?? {}` (server/INSIGHTS 2026-10-09); `agentIds` present together with `agentId`/`all` → 400 (Q-3); `agentIds` → multi path, else old path. Keep `config.rateLimit {max:10, timeWindow:'1 minute'}` (NFR-3). New routes, each `getContext` + one service call + `IdParams` where an id exists: `GET /multi-agent-runs/:id` → `MultiAgentRun`; `GET /pulls/:id/multi-agent-runs/latest` → `LatestMultiAgentRun`; `GET /review-estimates` → `ReviewEstimates`. Update the header comment of the file.
- Skills to apply: onion § routes/services; fastify-best-practices § schemas, error handling; security § access control.
- Depends on: S1, S3, S4, S5
- Tests (single-agent mode): T-6, T-7, T-8, T-10, T-11, T-12
- Done when: the API scenarios in "Hands-on verification" pass; MCP flows unchanged.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run .it.test`

### S7 MCP compatibility check
- Module / layer: `mcp` (no production code change expected).
- Files: modify `mcp/test/api-client.test.ts` — add cases for `startReview` (T-14). If a production change turns out to be needed, stop and report: AC-52 says the MCP client keeps working unchanged.
- Skills to apply: —
- Depends on: S1
- Tests (single-agent mode): T-14
- Done when: `startReview(prId, {agentId})` and `{all:true}` post exactly the old body and parse a response with and without `multi_agent_run_id`.
- Verify: `cd mcp && npm run typecheck && npm test`

### S8 Promote EvalCaseButton to a shared component (mechanical move)
- Module / layer: client shared components.
- Files: `git mv` the folder `client/src/app/repos/[repoId]/pulls/[number]/_components/EvalCaseButton/` (EvalCaseButton.tsx + test, index.ts, styles.ts, use-eval-case-flow.ts, range-model.ts + test, `_components/RangeDialog/*`) to `client/src/components/eval-case-button/`; fix relative imports inside; modify the two consumers `…/_components/FindingCard/FindingCard.tsx:25` and `…/_components/DiffTab/_components/InlineFinding/InlineFinding.tsx:11` to import from `@/components/eval-case-button`; fix the `messages/en/*.json` relative paths in the moved tests. Behaviour unchanged. Reason: the result page is the second consumer; features must not import each other's private folders.
- Skills to apply: frontend-ui-architecture § promotion rule.
- Depends on: —
- Tests (single-agent mode): T-15 (moved tests pass unchanged)
- Done when: `rg -n "EvalCaseButton" client/src` shows imports only via `@/components/eval-case-button`.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S9 Promote RunTraceDrawer to a shared component (mechanical move)
- Module / layer: client shared components.
- Files: `git mv` `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/` (whole tree: drawer, tests, `_components/*`, constants, helpers, styles, index) to `client/src/components/run-trace-drawer/`; modify `…/pulls/[number]/page.tsx:19` import; fix messages-path imports in `RunTraceDrawer.test.tsx:5`, `TraceBody.test.tsx:5`, `SkillsPromptBlock.test.tsx:5`. No behaviour change.
- Skills to apply: frontend-ui-architecture § file placement.
- Depends on: S8 only for a clean verify run (disjoint files; wave 1 runs them in one instance)
- Tests (single-agent mode): T-16 (moved tests pass unchanged)
- Done when: the PR page still opens the drawer from `?trace=`.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S10 Client data hooks and trace-lag retry
- Module / layer: client data layer.
- Files:
  - create `client/src/lib/hooks/multi-agent-review.ts` — `useReviewEstimates()` (`GET /review-estimates`), `useMultiAgentRun(id)` (`GET /multi-agent-runs/:id`; exported `multiAgentRefetchInterval(data)` → 3000 while any column is `running`, else `false`; stale-while-polling so a transient error keeps the last data), `useLatestMultiAgentRun(prId)` (`GET /pulls/:id/multi-agent-runs/latest`).
  - modify `client/src/lib/hooks/reviews.ts:117-136` — `RunReviewInput` gains `agentIds?: string[]`; body sends `agentIds` only when given; on success also invalidate `["pr-active-runs", prId]`, `["pr-runs", prId]`, `["latest-multi-agent-run", prId]`. `useRunReview` is the single trigger hook (AC-5, AC-17).
  - modify `client/src/lib/hooks/trace.ts:12-19` — optional third arg `{ retryMissing?: boolean }`: when true, retry a 404 up to 5 times with 1 s delay (EC-22); default unchanged.
  - modify `client/src/components/run-trace-drawer/RunTraceDrawer.tsx` (moved in S9) — pass `{ retryMissing: true }`.
- Skills to apply: react-best-practices § data fetching; frontend-ui-architecture § data layer.
- Depends on: S1, S9
- Tests (single-agent mode): T-17, T-18
- Done when: unit tests green; no component calls `fetch`.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S11 Sidebar item
- Module / layer: client shell; the single owner-approved vendor edit (CLAUDE.md § Do not touch).
- Files: modify `client/src/vendor/ui/nav.ts:21-45` — add `{ key: "multi-agent", label: "Multi-Agent Review", icon: "Layers", href: "/multi-agent-review" }` to the `WORKSPACE` group (no `gKey`); `activeKeyFor` already returns `"multi-agent"` for such paths (`client/src/components/app-shell/helpers.ts:28`). Modify `client/src/components/app-shell/nav.test.ts` (T-19).
- Skills to apply: —
- Depends on: —
- Tests (single-agent mode): T-19
- Done when: the item shows and is highlighted on `/multi-agent-review` and `/multi-agent-review/<id>`.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/components/app-shell/nav.test.ts`

### S12 Results foundation (shared by Columns, Tabs, Disagree)
- Module / layer: client feature `app/multi-agent-review/_components/` (shared inside the feature).
- Files (create): `AgentStatus/{AgentStatus.tsx,styles.ts,index.ts}` (icon + text label per status, a running pulse that is not colour only; no `aria-live`, NG-10); `group-helpers.ts` (`alsoFlaggedBy(finding_id, groups, columns)` → other agents' names, `Unknown agent` fallback via i18n key; `findingsByRun`); `format.ts` (duration `12.3 s`, cost via `formatCostUsd` from `@/lib/format`, "—" for null); `messages/en/multiAgentCommon.json` (status words, "Unknown agent", "also flagged by {names}", "—").
- Designs: `04-results-columns.png`, `05-results-tabs-detail.png` — status and severity visuals.
- Skills to apply: frontend-ui-architecture; react-best-practices (derive, don't store); ui-ux-pro-max § accessibility (optional).
- Depends on: S1
- Tests (single-agent mode): T-20
- Done when: component renders every status with text and icon.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/multi-agent-review`

### S13 AgentPicker (PR page)
- Module / layer: client feature `…/pulls/[number]/_components/AgentPicker/`.
- Files (create): `AgentPicker.tsx`, `helpers.ts` (display of estimate: `~12 s` or "—"), `styles.ts`, `constants.ts`, `index.ts`, `messages/en/agentPicker.json`. Trigger button "Run Review" (`aria-haspopup`, `aria-expanded`); panel `role=dialog` with an accessible name, closes on Escape and outside click; rows = `useAgents()` filtered `enabled`, vendor `Checkbox` (label wraps name), per-row estimate from `useReviewEstimates()`, nothing checked on open (no persistence, NG-5); "Clear"; footer "Configure agents…" → `router.push("/agents")`; button "Run multi-agent review (N)" disabled at N=0; no enabled agent → existing `prReview` message `runReview.noEnabledAgents` + link to `/agents` and no run button (also for zero agents); merged/closed → existing `runReview.mergedWarning`, run still allowed; in flight → `loading` + disabled, guarded by a ref so a double click sends one request; success → `router.push("/multi-agent-review/<multi_agent_run_id>")`; failure keeps the panel open (global error toast).
- Designs: `01-pr-page-agent-picker.png` (layout; overridden: no pre-checked agent).
- Skills to apply: frontend-ui-architecture; react-best-practices; next-best-practices.
- Depends on: S10
- Tests (single-agent mode): T-21
- Done when: the component works standalone in its test.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/AgentPicker"`

### S14 PR page wiring
- Module / layer: client PR page.
- Files: modify `…/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:5,114-121` (use `AgentPicker`; add the "Latest multi-agent run" link from `useLatestMultiAgentRun(prId)`, rendered only when `latest` is non-null, `href=/multi-agent-review/<id>`, with an accessible name); modify `…/pulls/[number]/page.tsx` (drop the `onRunStart → setTab("findings")` hand-off, AC-5 navigates away; keep the other run tracking); delete `…/_components/RunReviewDropdown/` (5 files incl. its test, replaced by T-21). Keep the old `prReview.json` keys that the picker reuses; unused keys may stay.
- Designs: `01-pr-page-agent-picker.png`.
- Skills to apply: frontend-ui-architecture; react-best-practices.
- Depends on: S9, S10, S13
- Tests (single-agent mode): T-22
- Done when: `rg -n "RunReviewDropdown" client/src` returns nothing.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S15 Configure run screen
- Module / layer: client route `/multi-agent-review`.
- Files (create): `client/src/app/multi-agent-review/page.tsx` (thin; view inside `<Suspense>`), `_components/ConfigureRunView/{ConfigureRunView.tsx,styles.ts,helpers.ts,index.ts}`, `_components/ConfigureRunView/_components/AgentCard/{AgentCard.tsx,styles.ts,index.ts}`, `messages/en/multiAgentConfigure.json`. Behaviour: step 1 PR select from `usePulls(activeRepo.id)` filtered `status` not `merged|closed` and `id` present, option `#<number> · <title>` as text; message in place of the selector when no active repo or no open PR (run disabled); `?pr=<id>` preselects when it is in the list; step 2 placeholder "Pick a pull request first" until a PR is selected; then one card per enabled agent (checkbox, name, "~time · cost" or "—", "based on N runs" (Q-1), description line omitted when empty), none checked; "Select all"; summary "≈ <max time> · <sum cost> · parallel fan-out" and "K agents without history not included" when K ≥ 1 (pure `helpers.ts`, reuse of `summariseEstimate` logic client-side over `AgentEstimate`); button "Run multi-agent review (N)" disabled at N=0, no PR, or in flight; success → `/multi-agent-review/<id>`.
- Designs: `02-configure-run-empty.png`, `03-configure-run-selected.png` (overridden: nothing pre-checked; run button disabled before PR selection).
- Skills to apply: frontend-ui-architecture; react-best-practices; next-best-practices § routes, Suspense.
- Depends on: S10, S11
- Tests (single-agent mode): T-23
- Done when: UI flow in "Hands-on verification" § Configure passes.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/multi-agent-review/_components/ConfigureRunView`

### S16 ColumnsView
- Module / layer: client feature `app/multi-agent-review/_components/ColumnsView/`.
- Files (create): `ColumnsView.tsx` (horizontal scroll container, `tabIndex=0`, `overflow-x: auto`, an accessible name), `ColumnCard.tsx`, `use-elapsed.ts` (1 s ticker for running columns, from `started_at`), `styles.ts`, `index.ts`, `messages/en/multiAgentColumns.json`. Per column: agent name (`Unknown agent` when null) + `AgentStatus`; duration, cost once known (null → "—"), score once `done`; running → elapsed + `latest_log` as plain text (no full log); `failed|cancelled` → status + `error` text instead of findings; compact finding cards (severity badge, title, `file:line`, `title` attribute with full text, "also flagged by …" from `alsoFlaggedBy`); finding count; "View trace" button (`onViewTrace(runId)`); "Cancel" button only while running (`onCancel(runId)`). Props are callbacks; no data fetching.
- Designs: `04-results-columns.png`.
- Skills to apply: frontend-ui-architecture; react-best-practices; security § XSS (text nodes only).
- Depends on: S12
- Tests (single-agent mode): T-24
- Done when: all column states render from fixtures.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/multi-agent-review/_components/ColumnsView`

### S17 TabsView and result finding card
- Module / layer: client feature `app/multi-agent-review/_components/TabsView/`.
- Files (create): `TabsView.tsx` (own `role=tablist/tab/aria-selected` buttons; label = name + score, or status while no score), `AgentSummary.tsx`, `ResultFindingCard/{ResultFindingCard.tsx,styles.ts,index.ts}` (expand: confidence as percent, rationale and suggestion via vendor `Markdown` as in `FindingCard.tsx:94-100`, "also flagged by …", Accept/Dismiss via callback, `EvalCaseButton` from `@/components/eval-case-button` with `decided`, disabled "Learn" button with `aria-describedby` text "not available yet", no "Reply to author"), `styles.ts`, `index.ts`, `messages/en/multiAgentTabs.json`. Reuses the `prReview` keys `finding.accept`, `finding.dismiss`, `finding.suggestedFix` is NOT required: own namespace strings.
- Designs: `05-results-tabs-detail.png`.
- Skills to apply: frontend-ui-architecture; react-best-practices; security; react-testing-library (tests).
- Depends on: S8, S12
- Tests (single-agent mode): T-25
- Done when: expanded finding shows all required parts.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/multi-agent-review/_components/TabsView`

### S18 DisagreeBlock
- Module / layer: client feature `app/multi-agent-review/_components/DisagreeBlock/`.
- Files (create): `DisagreeBlock.tsx`, `helpers.ts` (`visibleRows(conflicts, onlyConflicts)` using `is_conflict`), `styles.ts`, `index.ts`, `messages/en/multiAgentDisagree.json`. "Show only conflicts" = vendor `Toggle` inside a `<label>` (gives the switch an accessible name), off at mount. One row per `Conflict`: `file:line`, title, one cell per take: flagged = severity badge + title + "+N more" (only N ≥ 1); `did_not_flag` = the words "did not flag" plus a line "Agent summary: <text>" truncated, full text in `title` and focusable, omitted when empty; `running` = "running" (Q-4); `failed|cancelled` = the status word. Empty-state text when there are no rows or the switch hides all; "incomplete" notice while any take is `running`. All text as text nodes.
- Designs: `04-results-columns.png`, `05-results-tabs-detail.png` (block at the bottom).
- Skills to apply: frontend-ui-architecture; react-best-practices; security.
- Depends on: S12
- Tests (single-agent mode): T-26
- Done when: every cell state and the empty state render.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/multi-agent-review/_components/DisagreeBlock`

### S19 Results page
- Module / layer: client route `/multi-agent-review/[id]`.
- Files (create): `client/src/app/multi-agent-review/[id]/page.tsx` (thin), `[id]/_components/ResultsView/{ResultsView.tsx,RunHeader.tsx,styles.ts,index.ts}`, `_components/ViewToggle/{ViewToggle.tsx,styles.ts,index.ts}` (two buttons with `aria-pressed`), `messages/en/multiAgentResults.json`.
  - `ResultsView`: `useMultiAgentRun(id)`; view mode from `?view=columns|tabs` (default columns, kept in the URL); loading skeleton; 404 → "not found" state (EC-21); both modes render the same data plus `DisagreeBlock`.
  - `RunHeader`: PR `#number` + title (text), "N agents · parallel", total time/cost or "—" until all ended, "excludes unpriced agents" marker when `cost_incomplete`, estimate next to actual once ended, "Configure run" (calls `setRepoId(repo_id)` from `useActiveRepo`, then `router.push("/multi-agent-review?pr=<pr_id>")`), "Cancel remaining" only while any column is `running` (calls `POST /runs/:id/cancel` per running run via `useCancelRun`, results of ended runs untouched).
  - `View trace` → state `traceRunId`; mounts shared `RunTraceDrawer` with `runId`, `agentName`, `prNumber`, that run's `findings`, `running = status==='running'`.
  - Accept/Dismiss via `useFindingAction({findingId, action, prId})`; refetch the run after it.
- Designs: `04-results-columns.png`, `05-results-tabs-detail.png`.
- Skills to apply: frontend-ui-architecture; next-best-practices § dynamic route; react-best-practices § URL state; security.
- Depends on: S9, S10, S16, S17, S18
- Tests (single-agent mode): T-27
- Done when: hands-on scenarios 3–8 pass.
- Verify: `cd client && pnpm typecheck && pnpm test`

### I1 Share the finding card with the PR page (optional, M)
- Promote `…/pulls/[number]/_components/FindingCard` to `src/components/finding-card/` and use it in S17 instead of `ResultFindingCard`. Rationale: removes duplicated expanded-card markup; cost M (9 files, extra props for Learn and "also flagged by"). Not recommended now: it widens the PR-page change surface.

### I2 Server seed helper for multi-agent rows (recommended, S)
- Create `server/test/helpers/multi-agent.ts` that inserts a `multi_agent_runs` record, linked `agent_runs`, reviews and findings directly, so T-10..T-12 do not need an LLM. Depends on: S2. Verify: `cd server && pnpm exec vitest run .it.test`.

### I3 Browser e2e smoke (optional, M)
- One deterministic flow in `e2e/specs`: sidebar → Multi-Agent Review → select PR → no agent ticked, run disabled; PR page picker opens with nothing ticked. No LLM. Needs the full stack (`./scripts/e2e.sh`).

## Execution modes
Single-agent: one implementer runs S1 → S19 in order (S3 can run before S1; S8/S9 first is also fine) and writes each T-n inside its step. Risk: ~100 files exceed one instance; split into sessions at wave boundaries below.

Multi-agent (one instance per package per wave; migrations, lockfiles and both contract copies only in wave 1 / instance A; implementers do not write new tests):
| Wave | Instance | Steps | Owned files / area |
|---|---|---|---|
| 1 | implementer A (server) | S1, S2, S3 | `vendor/shared` (both copies), schema + migration, `run-executor.ts` (~11 files) |
| 1 | implementer B (client) | S8, S9 | the two folder moves + 5 import/test-path fixes |
| 2 | implementer C (server+mcp) | S4, S5, S6 | `reviews/repository*`, `reviews/multi-agent/*`, `service.ts`, `routes.ts` (~10 files; S7 test goes to test-writer) |
| 2 | implementer D (client) | S10, S11, S12 | hooks, `nav.ts`, foundation (~10 files) |
| 3 | implementer E (client) | S13, S14 | AgentPicker, PrDetailHeader, page.tsx, delete RunReviewDropdown |
| 3 | test-writer F (server+mcp) | T-1…T-14 | `server/test/*`, `mcp/test/api-client.test.ts` |
| 4 | implementer G (client) | S15, S18 | Configure run, DisagreeBlock (~12 files) |
| 5 | implementer H (client) | S16, S17 | Columns, Tabs, ResultFindingCard (~14 files; split if context runs out) |
| 6 | implementer I (client) | S19 | results page |
| 7 | test-writer J (client) | T-15…T-23 | tests of S8–S15 |
| 8 | test-writer K (client) | T-24…T-27 | tests of S16–S19 |
Wave 3 runs one client instance and one server instance (distinct packages, so checks do not collide). Server and MCP tests of wave 3 need S1–S6 done (wave 2).
Recommended: multi-agent — size, server/client parallelism in waves 1–3, and independent test authors for 27 tests. If the user prefers one session, single-agent in the order above works but should be broken into the same wave checkpoints.

## Cross-module contracts & sync points
- `RunRequest.agentIds`, `ReviewRunResponse.multi_agent_run_id`, `MultiAgentRun`/`AgentColumn`/`FindingGroup`/`Conflict`/`ConflictTake`/`RunEstimate`/`AgentEstimate`/`ReviewEstimates`/`LatestMultiAgentRun` — S1 both copies → consumers: S6 (routes), S5 (helpers), S10, S12–S19, S7 (MCP validates `ReviewRunResponse`; additive and optional).
- New HTTP surface: `POST /pulls/:id/review` (changed), `GET /multi-agent-runs/:id`, `GET /pulls/:id/multi-agent-runs/latest`, `GET /review-estimates` ↔ hooks in S10.
- DB: `multi_agent_runs.estimate`, `agent_runs.multi_agent_run_id`, `agent_runs.finished_at` (S2) ↔ repository (S4) ↔ view builder (S5).
- Existing, reused unchanged: `GET /runs/:id/events` (SSE), `GET /runs/:id/trace`, `POST /runs/:id/cancel`, `POST /findings/:id/accept|dismiss`, `POST /findings/:id/eval-case`.
- Files that move (S8, S9): update every importer in the same step.
- Messages namespaces (one file per owning step): `agentPicker` (S13), `multiAgentCommon` (S12), `multiAgentConfigure` (S15), `multiAgentColumns` (S16), `multiAgentTabs` (S17), `multiAgentDisagree` (S18), `multiAgentResults` (S19). `src/i18n/request.ts` loads every `*.json` automatically.
- MCP tools `devdigest_list_agents` / `devdigest_run_review`: unchanged.

## Test plan
- Existing suites to run: `VS`, `VSI`, `VC`, `VM` after the last step of each package (the executor change affects every review test).
- T-1 AC-42/43, NFR-2, EC-11, EC-13 — unit — `server/test/multi-agent-groups.test.ts`: inclusive overlap, adjacent non-overlap (10 vs 11) stays apart, transitive A~B~C, other file apart, same agent twice, shuffled input gives identical output, no finding dropped — single: S5 · multi: test-writer F.
- T-2 AC-45/46/47/48, EC-6, EC-10, EC-12 — unit — `server/test/multi-agent-conflicts.test.ts`: representative title (severity, tie), cell states incl. `+N more`, summary line empty/non-empty, failed/cancelled/running cells, `is_conflict` rules, all-failed run — S5 · F.
- T-3 AC-15/16/53/56, EC-4 — unit — `server/test/multi-agent-estimate.test.ts`: odd/even median, missing values, `agents_without_*`, run counts — S5 · F.
- T-4 AC-26, NFR-2, EC-18 — unit — `server/test/multi-agent-view.test.ts`: totals (null until all ended, cost sum + incomplete flag, all-null cost), column order, null agent name, latest log only when running — S5 · F.
- T-5 AC-19/52 shapes — unit — extend `server/test/contracts.test.ts`: `RunRequest` with/without `agentIds` and non-uuid id rejected; `ReviewRunResponse` with/without `multi_agent_run_id`; `MultiAgentRun` round trip — S1 · F.
- T-6 AC-19/22/25/56, NFR-6 — integration — `server/test/multi-agent.it.test.ts`: POST with `agentIds [a,b,a]` → 2 runs, 1 record, `multi_agent_run_id`, estimate recorded; runs appear in `/pulls/:id/runs` and `/reviews`; git mock asked for the diff once; each trace (poll the trace endpoint) holds diff, intent and shared-preparation lines — S6 · F.
- T-7 AC-20, EC-19 — integration — same file: `[]`, unknown uuid, disabled agent (400, message names it) → no `multi_agent_runs` / `agent_runs` rows — S6 · F.
- T-8 AC-52 — integration — same file: `{agentId}` and `{all:true}` unchanged response, no record; `agentIds`+`all` → 400 (Q-3) — S6 · F.
- T-9 AC-21/23/24, EC-5/7/23 — integration — `server/test/reviews-concurrency.it.test.ts`: scripted providers (pattern `server/test/eval/scripted-llm.ts`): provider A waits on a gate that provider B's call opens, so a sequential executor would deadlock/time out; one provider throws → that run `failed` with error + trace, other `done`; git mock throws → every run `failed` with the same error — S3 · F.
- T-10 AC-26/32/36, NFR-3, EC-21 — integration — `server/test/multi-agent-read.it.test.ts`: read payload (columns, groups, conflicts, totals, `latest_log` while a gated run is running), 404 for unknown and for another workspace's id, trace holds dropped-finding lines — S6 · F.
- T-11 AC-59, AC-15 — integration — same file: latest by start time; `{latest:null}` when none; `GET /review-estimates` equals medians of seeded done runs (window per Q-2) — S6 · F.
- T-12 AC-40/54/55, EC-8/20 — integration — same file: accept via `/findings/:id/accept` visible in the read; cancel one running run → read shows `cancelled`, the other still ends `done` — S6 · F.
- T-13 AC-19/26/15, NFR-3 — integration — `server/test/multi-agent-repository.it.test.ts`: transaction creates record + linked runs atomically; `finished_at` set on complete/cancel/reap; workspace filters; estimate sample window — S4 · F.
- T-14 AC-52 — unit (fake fetch) — `mcp/test/api-client.test.ts` — S7 · F.
- T-15 AC-41 — moved EvalCaseButton tests pass unchanged — S8 · J. T-16 AC-36 — moved drawer tests pass unchanged — S9 · J.
- T-17 EC-22/AC-35 — `components/run-trace-drawer/RunTraceDrawer.test.tsx`: 404 then 200 on retry shows the trace; running → Live log tab first — S10 · J.
- T-18 NFR-1/AC-33/49 — `lib/hooks/multi-agent-review.test.ts`: `multiAgentRefetchInterval` ≤ 5000 with a running column, `false` otherwise — S10 · J.
- T-19 AC-9 — `components/app-shell/nav.test.ts` — S11 · J.
- T-20 NFR-5, AC-57 — `AgentStatus.test.tsx`, `group-helpers.test.ts` (text + icon per status; "also flagged by" names, unknown agent) — S12 · J.
- T-21 AC-1…8, 18, EC-1/2/3 — `AgentPicker.test.tsx`: none checked on open, only enabled agents, "—" estimate, button label/disabled, Clear, run sends exactly the checked ids (also N=1), navigates to result page, double activation = one call, no-agents message + link without run button, "Configure agents…" → /agents, merged warning and run allowed — S13 · J.
- T-22 AC-59 — `PrDetailHeader.test.tsx`: link present only when a latest run exists, correct href — S14 · J.
- T-23 AC-9…18, 53, 58, EC-1/4 — `ConfigureRunView.test.tsx` + `helpers.test.ts` — S15 · J.
- T-24 AC-31/32/33/34/54/57/60, EC-14/15 — `ColumnsView.test.tsx` — S16 · K. (Horizontal scroll itself needs layout: manual check.)
- T-25 AC-37…41/43/57 — `TabsView.test.tsx`, `ResultFindingCard.test.tsx` (Learn disabled with "not available yet", no "Reply to author", decisions call the hook) — S17 · K.
- T-26 AC-44…48 — `DisagreeBlock.test.tsx` — S18 · K.
- T-27 AC-27/28/29/30/35/49/55/56, EC-21 — `ResultsView.test.tsx` — S19 · K.
- Untrusted text: T-24, T-25, T-26 each render a title/summary/log line/PR title containing `<img src=x onerror=…>` and assert it is shown as text.
- Not tested: rate limit of `POST /pulls/:id/review` (NFR-3; disabled under test) — code review of `routes.ts`; real horizontal scroll and 5 s latency (manual); AC-50/51 (document, not in this run); `git diff` checks for NG-1/NG-2 (run by the caller).

## Hands-on verification
Start: `./scripts/dev.sh` (docker → migrate → seed → API :3001 + web :3000). Without a model key the agents fail, which exercises the failure path. For a real run set an `openrouter` key (Settings → API Keys).
1. PR page `/repos/<repoId>/pulls/<n>` → "Run Review": agent rows only, nothing ticked, button disabled; tick two → "(2)"; Clear; tick one and run → result page.
2. Configure: sidebar "Multi-Agent Review" → select PR → cards, nothing ticked, Select all, summary and "based on N runs", "K agents without history not included".
3. Result page, Columns: statuses update without reload (≤ 5 s), running column shows elapsed + latest log line, "View trace" opens the drawer on Live log.
4. Fail one agent (remove its provider key) → failed column with error text; the others finish.
5. Tabs mode: expand a finding → confidence %, fix, Accept/Dismiss, Turn into eval case after a decision, Learn disabled; the decision shows in Columns and on the PR Findings tab.
6. "Where agents disagree": overlapping findings of two agents form one row; "also flagged by …"; toggle "Show only conflicts".
7. Cancel one running column; "Cancel remaining" only while something runs.
8. Reload during a run → statuses continue; PR page shows "Latest multi-agent run".
9. API: `curl -s localhost:3001/multi-agent-runs/<id> | jq '.columns[].status, .total_duration_ms, .estimate'`; `curl -s -X POST localhost:3001/pulls/<prId>/review -H 'content-type: application/json' -d '{"agentIds":[]}'` → 400.

## Risks & open questions
- [non-blocking] Q-1 · tag Estimate basis — see Questions in the reply; planned with the duration basis.
- [non-blocking] Q-2 · Last 10 window — planned with newest 10 that have the value.
- [non-blocking] Q-3 · agentIds mixed with agentId/all — planned with 400.
- [non-blocking] Q-4 · running cell text — planned with "running".
- [non-blocking] Q-5 · unknown/empty set status — planned with 400.
- Making every batch concurrent changes behaviour of "all", MCP and rerun (design-review § notes); existing tests that script mocks in call order may need adjusting (S3 Verify).
- Provider 429s under parallel start fail some runs by design (EC-23).
- `latest_log` is in-memory (`runBus`); after an API restart a running column has no log line (runs are reaped as failed on boot anyway).
- S8/S9 are large mechanical moves: run them first and alone in their wave so conflicts with other client work cannot happen.
- AC-50/51 stay open until someone runs the 1-vs-3 measurement and writes `docs/multi-agent-review.md`; do not fit the numbers to an expected 3× (spec G-8). The numbers come from `GET /multi-agent-runs/:id` and the traces.
- drizzle-kit may open an interactive prompt in a non-TTY shell (S2 procedure).

## Self-check
1 pass (all 60 AC, 6 NFR verbatim, one traceability row each, ids not renumbered) · 2 pass (AC-50/51 carry a "not tested — document" reason and state `deferred`) · 3 pass · 4 pass · 5 fixed: wave 3 and the other waves run one instance per package so checks do not collide; wave 5 is ~14 files, flagged · 6 pass · 7 pass (estimate-basis, window, running-cell, mixed-body, status readings are Q-n, suggestions are listed separately) · 8 pass (no blocking R-n or blocking question, Status ready) · 9 pass (every path:line cited was read in this run) · 10 pass (no file outside the plan path is written by the planner; Q-mode question is in the reply).

## Out of scope for the implementer
Architecture and security review are done by separate agents. Requirements are fixed by the spec or task; a needed change goes back to the user, not into the code.

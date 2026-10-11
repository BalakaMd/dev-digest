# Development Plan: Eval pipeline — regression harness for review agents

Created: 2026-10-07 (re-planned 2026-10-08 for SPEC-06) · Branch: hw-06 · HEAD: 64faaaa · Status: ready
Spec: specs/eval-pipeline/spec.md · SPEC-06 · approved (supersedes SPEC-05; AC-73 removed, NG-7 added, EC-14 reworded; every other id and wording unchanged)
Recommended mode: multi-agent — ~75 files across server and client; after the contracts (S1) the server chain (S3→S7) and the client chain (S9→S15) are independent, so at most 2 implementers run in parallel, one per package (test-writer is not used: every implementer writes the T-n of its own steps in both modes).

Status is `ready`: no blocking requirement finding remains (the former R-1 is resolved by SPEC-06). Open questions Q-1…Q-6 and the mode question are non-blocking and are left to the user (checkpoint A); each is planned with its recommended option. Size note: copying all requirements verbatim makes this file larger than the usual ~25 KB.

Key facts found (verified in code, details under Context):
- `eval_cases` / `eval_runs` exist but `eval_runs` is per case (case_id NOT NULL) — no run-level record, no agent version, no status, no source-finding link, no case created_at (`server/src/db/schema/eval.ts:7-35`). Gap = migration 0015 + new `eval_suite_runs` table.
- Agent snapshots (`agent_versions.config_json`) carry: provider, model, system_prompt, output_schema, strategy, ci_fail_on, repo_intel, **skills (ordered ids)**, context_docs (`agents/repository.ts:274-294`). Promote must restore all of them in ONE new version. The seeded agents have NO snapshot row until first edited (`db/seed.ts:245-251` inserts into `agents` only) — eval run start must ensure the snapshot of the current version exists.
- `reviewPullRequest` returns kept findings + `dropped` with reasons (`reviewer-core/src/review/run.ts:104-126, 211-216`); with no `intent` the scope filter is skipped (`:225-241`). Eval runs call it directly and never touch `container.intent` (`reviews/run-executor.ts:120`).
- The demo PR #482 seed has no `pr_files.patch` and its sample review has no `agent_id` (`db/seed.ts:124-129, 139-152`): cases cannot be made from demo findings — VA-1 needs real reviews (see verification hints H12).
- No diff size limit exists in regular reviews (`reviews/diff-loader.ts:12-30`, `reviews/run-executor.ts:220-252`); SPEC-06 therefore has no case size check — only the global 1 MB body limit (`app.ts:49`) applies to manual cases (HTTP 413, EC-14).

## Requirements
- AC-1: "(Event-driven): WHEN the user activates "Turn into eval case" on an accepted finding, the API SHALL create one eval case owned by the agent that produced the finding, with expectation type `must_find`, the finding's file, start line and end line, and the case input defined in AC-13. [covers US-1]" → S6, S7, S10
- AC-2: "(Event-driven): WHEN the user activates "Turn into eval case" on a dismissed finding, the API SHALL create one eval case owned by the agent that produced the finding, with expectation type `must_not_flag`, the finding's file, start line and end line, and the case input defined in AC-13. [covers US-2]" → S6, S7, S10
- AC-3: "(Ubiquitous): The finding card SHALL create the case on a single activation of the button, without opening a dialog or form. [covers US-1, US-2]" → S10
- AC-4: "(State-driven): WHILE a finding is neither accepted nor dismissed, the finding card SHALL keep the "Turn into eval case" button disabled, with an accessible description stating that the finding must be accepted or dismissed first. [covers EC-1]" → S10 (server guard in S6)
- AC-5: "(Event-driven): WHEN the API has created the case, the finding card SHALL show a confirmation naming the case, and the confirmation SHALL be announced to assistive technology." → S10
- AC-6: "(Unwanted behaviour): IF case creation fails, THEN the finding card SHALL show the error message returned by the API and keep the button available for another attempt." → S10
- AC-7: "(Unwanted behaviour): IF the agent that produced the finding no longer exists, THEN the API SHALL reject the request with an error stating that the agent was deleted and SHALL create no case. [covers EC-3]" → S6, S10
- AC-8: "(Ubiquitous): The API SHALL name a case created from a finding with the slug of the finding's title (lower-case, words joined by `-`), adding the suffix `-2`, `-3`, … when the agent already owns a case with that name." → S3, S6
- AC-9: "(Unwanted behaviour): IF a case already exists for the same finding, THEN the API SHALL create no new case and SHALL return the existing case, and the finding card SHALL state that the finding is already an eval case, naming that case. [covers EC-2]" → S2, S6, S10
- AC-65: "(Event-driven): WHEN the decision on a finding changes after a case was created from it, the API SHALL leave that case's expectation type unchanged. [covers EC-4]" → S6
- AC-66: "(Ubiquitous): The finding card SHALL offer "Turn into eval case" for accepted or dismissed findings of every kind, including `secret_leak`, `lethal_trifecta`, `phantom` and `hook`. [covers EC-5]" → S6, S10
- AC-10: "(Ubiquitous): The Evals tab of the agent editor SHALL list every eval case owned by the agent, each with its name, expectation type (`must_find` / `must_not_flag`), `file:start–end`, and the result of its latest scored execution (passed, failed, or "never run"). [covers US-3]" → S4, S6, S7, S11
- AC-11: "(State-driven): WHILE the agent has no eval cases, the Evals tab SHALL show an empty state explaining that cases are created from accepted or dismissed findings with "Turn into eval case" or with "New eval case"." → S11
- AC-12: "(Event-driven): WHEN the user confirms deletion of a case in a confirmation dialog, the API SHALL remove the case, and the Evals tab SHALL no longer list it. [covers US-3]" → S6, S7, S11
- AC-13: "(Ubiquitous): WHEN a case is created from a finding, the API SHALL store as the case's input the complete patch of the finding's file from that PR's diff (new-side line numbers preserved) and a snapshot of the PR's title and body. [covers G-2]" → S3, S6
- AC-14: "(Ubiquitous): During an eval run, the API SHALL review each case using only the case's stored input and the agent's configuration at run start (provider, model, system prompt, strategy, and its enabled linked skills in link order); it SHALL NOT add repo-intel context, project-context documents, a PR intent or memory. [covers G-2]" → S6
- AC-15: "(Event-driven): WHEN the user starts an eval run for an agent, the API (`POST /agents/:id/eval-runs`) SHALL create one run record holding the agent and the agent version used, and SHALL run the agent once on every eval case the agent owns at that moment. [covers US-4]" → S2, S4, S6, S7
- AC-16: "(Event-driven): WHEN the API accepts an eval run request, it SHALL respond with the run's id before calling any model and SHALL execute the cases in the background." → S6, S7
- AC-17: "(Unwanted behaviour): IF the agent owns no eval cases, THEN the API SHALL reject the run with an error stating that the set is empty, and the run button SHALL be disabled with that reason shown." → S6, S11
- AC-18: "(Unwanted behaviour): IF the agent's provider key is not configured, THEN the API SHALL reject the run before calling any model, with an error naming the missing key." → S6
- AC-19: "(State-driven): WHILE an eval run of an agent is in progress, the API SHALL reject a new run request for the same agent with an error stating that a run is already in progress, and the run button SHALL be disabled. [covers EC-10]" → S2, S6, S11
- AC-20: "(Unwanted behaviour): IF the agent call for one case fails, THEN the API SHALL mark that case "error" with the error message, exclude it from every metric and from passed/total, and continue with the remaining cases. [covers EC-8]" → S6
- AC-67: "(Ubiquitous): The run history, the run's case results and the compare view SHALL show the number of cases in "error" for each run, and the case results SHALL show each errored case with its error message." → S4, S6, S14, S15
- AC-61: "(State-driven): WHILE an eval run is in progress, the Evals tab and the agent's dashboard view SHALL show the run as running with the number of completed cases out of the total." → S6, S11, S14
- AC-62: "(Event-driven): WHEN the user opens the Evals tab or the agent's dashboard view while a run of that agent is in progress, the studio SHALL show that run's current progress. [covers EC-12]" → S11, S14
- AC-21: "(Ubiquitous): The scorer SHALL count an agent finding as matching an expectation when the file paths are equal and the finding's line range intersects the expectation's line range (inclusive bounds; a reversed range is normalised first). Findings are matched only against the expectations of the case they were produced for." → S3
- AC-22: "(Ubiquitous): The scorer SHALL compute a run's recall as the total number of `must_find` expectations matched by at least one finding, divided by the total number of `must_find` expectations across all scored cases of the run." → S3
- AC-23: "(Ubiquitous): The scorer SHALL compute a run's precision as 1 − (findings matching a `must_not_flag` expectation ÷ all findings), both totalled across all scored cases of the run, where "findings" are the findings that passed the grounding gate." → S3
- AC-24: "(Ubiquitous): The scorer SHALL compute a run's citation accuracy as the total number of findings that passed the grounding gate, divided by the total number of findings the model returned before the gate, across all scored cases of the run." → S3
- AC-63: "(Unwanted behaviour): IF a metric's denominator is 0 for a run, THEN the scorer SHALL record the metric as having no value, and the studio SHALL display it as "—". [covers EC-6, EC-7]" → S3, S11
- AC-25: "(Ubiquitous): The scorer SHALL mark a case passed when every `must_find` expectation of the case is matched by at least one finding and no finding matches any `must_not_flag` expectation of the case; findings that match no expectation SHALL NOT affect the outcome." → S3
- AC-68: "(Ubiquitous): The scorer SHALL report, for each run, the number of passed cases out of the scored (non-error) cases." → S3, S6, S11
- AC-69: "(Ubiquitous): The scorer SHALL ignore an expectation's optional title, severity and category." → S3
- AC-26: "(Ubiquitous): The scorer SHALL compute every metric without invoking any LLM provider. [covers G-3]" → S3, S6
- AC-27: "(Event-driven): WHEN an eval run completes, the Evals tab SHALL show the run's recall, precision, citation accuracy and passed/total cases, each metric with its signed change in percentage points against the previous completed run of the same agent. [covers US-4]" → S11, S14
- AC-28: "(Ubiquitous): The agent's run history SHALL list its eval runs newest first, each with start time, agent version, recall, precision, citation accuracy, passed/total cases and cost." → S4, S7, S14
- AC-29: "(Ubiquitous): The studio SHALL display metrics as whole percentages and SHALL display a metric that has no value as "—", never as 0 %." → S11
- AC-64: "(Ubiquitous): The studio SHALL describe an agent's set as its eval cases with their count (for example "12 eval cases"), not as a "gold set" or "traces"." → S9, S11, S13, S14
- AC-39: "(Event-driven): WHEN the user opens a case's result within a run, the studio SHALL show the case's expectation (type, file, line range), every finding the agent returned that passed grounding with its file, line range, title and whether it matched the expectation, and the case's pass/fail outcome. [covers US-7]" → S6, S7, S15
- AC-40: "(Event-driven): WHEN the user opens a case's result within a run, the studio SHALL list the findings that the grounding gate dropped for that case, each with its drop reason. [covers US-7]" → S6, S7, S15
- AC-30: "(State-driven): WHILE fewer or more than two runs are selected in a run history, the Compare button SHALL be disabled." → S14
- AC-31: "(Event-driven): WHEN the user compares two runs of the same agent, the compare view SHALL show, for recall, precision and citation accuracy, the older value, the newer value and the signed difference in percentage points. [covers US-5]" → S3, S7, S15
- AC-32: "(Event-driven): WHEN the user compares two runs, the compare view SHALL show the difference between the two agent configurations: a line diff of the system prompt, the provider and model of each run when they differ, and the linked skills added, removed or reordered." → S3, S6, S15
- AC-33: "(Unwanted behaviour): IF the two compared runs did not score the same set of cases, THEN the compare view SHALL show a notice listing the cases present in only one of the runs, and SHALL compute the metric values, deltas and flipped cases over the cases scored in both runs. [covers EC-9]" → S3, S15
- AC-41: "(Event-driven): WHEN the user compares two runs, the compare view SHALL list every case whose outcome differs between them (passed → failed, failed → passed), each with its name and expectation type. [covers US-5; accepted P-2]" → S3, S15
- AC-59: "(Event-driven): WHEN the user activates "Promote" in the compare view, the API SHALL make the configuration of the agent version used by the newer of the two runs the agent's current configuration, saved as a new agent version, and the compare view SHALL confirm the new version number." → S5, S15
- AC-70: "(State-driven): WHILE the newer compared run used the agent's current version, the compare view SHALL keep "Promote" disabled with an accessible description stating that this version is already current. [covers EC-18]" → S5, S15
- AC-45: "(Ubiquitous): The run history and the compare view SHALL show each run's cost as the sum of its cases' model costs, the compare view with the older value, the newer value and the signed difference." → S3, S14, S15
- AC-76: "(Unwanted behaviour): IF the cost of any scored case of a run is unknown, THEN the API SHALL record the run's cost as unknown, and the studio SHALL display it as "—", never as $0. [covers EC-16]" → S3, S6, S14, S15
- AC-46: "(Event-driven): WHEN the user activates "New eval case" in the Evals tab, the studio SHALL open the case editor with a required Name, an Input section with the tabs Diff, Files and PR meta, an Expected output editor, a "Run on save" toggle, and the actions Cancel, Run case and Save. [covers US-3]" → S12
- AC-71: "(Ubiquitous): The API SHALL accept as a case's expected output a non-empty list of expectations, each with `type` (`must_find` or `must_not_flag`), `file`, `start_line` and `end_line`, and optional `title`, `severity` and `category` kept as notes." → S1, S6, S7, S12
- AC-47: "(State-driven): WHILE the Expected output text is not valid JSON or does not match the expected-output shape of AC-71, the case editor SHALL show "invalid JSON" with the reason and SHALL disable Save and Run case." → S12
- AC-48: "(Event-driven): WHEN the user activates "Finding skeleton", the case editor SHALL append one expectation with every AC-71 field present and empty values to the end of the list." → S12
- AC-49: "(Unwanted behaviour): IF Name is empty, THEN the case editor SHALL mark the field as required and SHALL disable Save." → S12
- AC-50: "(Event-driven): WHEN the user activates Edit on a case, the studio SHALL open the case editor filled with that case's stored name, input and expectations, with Name and Expected output editable and the Diff and PR meta inputs read-only." → S12
- AC-72: "(Ubiquitous): The API SHALL reject any change to an existing case's stored input." → S1, S7
- AC-51: "(Event-driven): WHEN the user activates "Run case" (in the editor or on a case row), the API SHALL run the agent's current configuration on that single case, update only the case's latest outcome (AC-53), and create no run in the run history, the metrics or the dashboard." → S6, S7, S11, S12
- AC-52: "(State-driven): WHERE "Run on save" is on, WHEN the user saves the case, the studio SHALL run that case as in AC-51 after the save succeeds." → S12
- AC-53: "(Ubiquitous): The case editor SHALL show the case's latest scored outcome as "Last run passed" or "Last run failed" with the number of expected and returned findings, the duration and the cost, or nothing when the case was never run." → S6, S7, S12
- AC-54: "(Ubiquitous): The Files tab of the case editor SHALL show, read-only, the paths of the files contained in the case's diff, and SHALL add nothing to the agent's input." → S12
- AC-73: "Removed — superseded, see Change log vs SPEC-05. (No case-specific diff size limit; see EC-14 and NG-7.)" → no step; EC-14 handling is an implementation note in S7 and S12 (no size check; global 1 MB body limit → HTTP 413)
- AC-75: "(Unwanted behaviour): IF an expectation names a file that is not in the case's diff, or a line range that intersects no hunk of that file, THEN the API SHALL reject the save with the reason, and the case editor SHALL show the reason and keep Save disabled until it is fixed. [covers EC-17]" → S3, S6, S12 · assumes Q-2
- AC-34: "(Ubiquitous): The sidebar SHALL show an "Eval Dashboard" item in the SKILLS LAB section that opens the Eval Dashboard page and is highlighted while that page or an agent's dashboard view is open. [covers US-6]" → S9 · assumes Q-1
- AC-35: "(Ubiquitous): The Eval Dashboard page SHALL list every agent of the workspace, including disabled agents and agents never run, each with its name, model, latest run's recall, precision, citation accuracy, passed/total cases, agent version, run time and a sparkline of recall over its recent runs, or "never run". [covers EC-15]" → S4, S7, S13
- AC-36: "(Ubiquitous): The Eval Dashboard page SHALL list the 10 most recent eval runs of all agents, newest first, each with agent name, run time, agent version, the three metrics and passed/total cases." → S4, S7, S13 · assumes Q-6
- AC-37: "(Event-driven): WHEN the user selects an agent on the Eval Dashboard, the studio SHALL open that agent's dashboard view with its metric tiles (AC-27), run history (AC-28), Compare (AC-30, AC-31) and a "Run eval" button, and an "All agents" link back to the dashboard." → S14
- AC-58: "(Event-driven): WHEN the user activates "View full dashboard" in the Evals tab, the studio SHALL open that agent's dashboard view." → S11
- AC-56: "(Event-driven): WHEN the user picks another agent in the agent switcher of an agent's dashboard view, the studio SHALL show that agent's dashboard view." → S14
- AC-55: "(Ubiquitous): The agent's dashboard view SHALL offer a period filter that limits the trend chart and the run history to runs started within the chosen period — 7 days, 30 days, 90 days or all — with 30 days selected when the view opens." → S7, S14
- AC-43: "(Ubiquitous): The agent's dashboard view SHALL show a trend chart of recall, precision and citation accuracy per completed run in chronological order, with a legend and a value scale. [accepted P-4]" → S14
- AC-42: "(Event-driven): WHEN the latest completed run of an agent has a lower recall, precision or citation accuracy than the previous completed run by at least 1 percentage point, the agent's dashboard view SHALL show a warning banner naming each lowered metric with its drop in percentage points and the cases that went from passed to failed. [accepted P-3]" → S14
- AC-44: "(Event-driven): WHEN the user activates "Run all agents" on the Eval Dashboard, the API SHALL start one eval run for each enabled agent that owns at least one case and has no run in progress, and the dashboard SHALL show each started run's progress. [accepted P-5]" → S6, S7, S13
- AC-60: "(Ubiquitous): The agent editor SHALL NOT show Stats or CI tabs, and the finding card SHALL NOT show Learn or Reply to author buttons. [NG-3, NG-4]" → S10, S11
- AC-74: "(Event-driven): WHEN the API starts, it SHALL mark every eval run left in progress by a previous process as failed with a reason stating that the API restarted. [covers EC-11]" → S6, S7
- AC-38: "(Ubiquitous): The server package SHALL provide a `pnpm verify:l06` script that runs the server typecheck, the scoring unit tests and the eval integration tests with a mocked LLM provider, and exits non-zero when any of them fails." → S8
- NFR-1: "(reliability): The scorer SHALL produce identical metrics when given the same findings and the same cases, on every invocation." → S3
- NFR-2: "(security): The API SHALL pass a case's stored diff and PR text to the agent only as untrusted content, through the same prompt-injection protection that regular reviews use." → S6
- NFR-3: "(security): The studio SHALL render stored diff text, PR text, expected-output JSON and model output as plain text (rationale through the existing safe markdown renderer), never as raw HTML." → S11, S12, S14, S15
- NFR-4: "(accessibility): Every eval control (Turn into eval case, Run, Run case, Run all agents, row-selection checkboxes, Compare, Promote, period filter, agent switcher, icon-only per-case Run / Edit / Delete) SHALL be reachable and operable by keyboard and SHALL have an accessible name." → S10, S11, S12, S13, S14, S15
- NFR-5: "(accessibility): The studio SHALL convey a metric's direction of change and a case's pass/fail state with a sign, arrow, icon or text in addition to colour." → S11, S14, S15
- NFR-6: "(accessibility): WHEN an eval run finishes or fails, the studio SHALL announce the outcome to assistive technology." → S11, S14
- NFR-7: "(observability): For every case in a run, the API SHALL keep the agent's findings, the findings dropped by the grounding gate with their reasons, and the per-case match result, readable after the run (AC-39, AC-40)." → S2, S6
- NFR-8: "(reliability): `pnpm verify:l06` SHALL make no network call to any LLM provider." → S8
- VA-1: "The user's set for the agent under test holds at least 8 cases created from real findings, with at least one `must_find` and one `must_not_flag` case." → verification activity (S10 one-click; I1 optional bulk helper)
- VA-2: "Two runs that differ only in the agent's system prompt show a non-zero change in recall or precision in the compare view." → verification activity (S3, S6, S15 make it measurable)
- VA-3: "A run after a deliberately degraded system prompt shows lower precision than the baseline run." → verification activity
- VA-4: "`pnpm verify:l06` in `server/` passes (AC-38)." → verification activity (S8)

## Traceability
Commands: K1 `cd server && pnpm typecheck` · K2 `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` · K3 `cd server && pnpm exec vitest run .it.test` (Docker) · K4 `cd client && pnpm typecheck` · K5 `cd client && pnpm test` · K6 `cd server && pnpm verify:l06` (after S8). Hints H1–H12 are listed below the table.

| Req | Steps | Tests | Verify | Hint | State |
|---|---|---|---|---|---|
| AC-1 | S6,S7,S10 | T-6,T-12 | K3,K5 | H1 | planned |
| AC-2 | S6,S7,S10 | T-6,T-12 | K3,K5 | H1 | planned |
| AC-3 | S10 | T-12 | K5 | H1 | planned |
| AC-4 | S10,S6 | T-12,T-6 | K5,K3 | H1: undecided finding → button disabled, description text | planned |
| AC-5 | S10 | T-12 | K5 | H1: toast/status region names the case | planned |
| AC-6 | S10,S7 | T-12 | K5 | H1: force a 4xx (agent deleted) → message shown, button enabled | planned |
| AC-7 | S6,S10 | T-6,T-12 | K3,K5 | `POST /findings/<id>/eval-case` after deleting the agent → 409 "agent was deleted" | planned |
| AC-8 | S3,S6 | T-3,T-6 | K2,K3 | two findings with equal title → `<slug>`, `<slug>-2` | planned |
| AC-9 | S2,S6,S10 | T-6,T-12 | K3,K5 | H1: click twice → "already an eval case: <name>" | planned |
| AC-65 | S6 | T-6 | K3 | accept→case→dismiss the finding→`GET /agents/:id/eval-cases` type unchanged | planned |
| AC-66 | S6,S10 | T-6,T-12 | K3,K5 | decided `secret_leak` finding → button enabled, case created | planned |
| AC-10 | S4,S6,S7,S11 | T-7,T-14 | K3,K5 | H2 | planned |
| AC-11 | S11 | T-14 | K5 | H2: agent without cases → empty state text | planned |
| AC-12 | S6,S7,S11 | T-7,T-14 | K3,K5 | H2: delete icon → confirm dialog → row gone | planned |
| AC-13 | S3,S6 | T-3,T-6 | K2,K3 | `GET /eval-cases/:id` → `input_diff` = whole file patch, `input_meta` = {title, body} | planned |
| AC-14 | S6 | T-8 | K3 | request recorded by scripted LLM has no repo-map/callers/specs/intent sections; `container.intent` never called | planned |
| AC-15 | S2,S4,S6,S7 | T-8 | K3 | `POST /agents/:id/eval-runs` → run row with `agent_version`, N case rows | planned |
| AC-16 | S6,S7 | T-8 | K3 | response arrives with `run_id` while the scripted LLM is still gated | planned |
| AC-17 | S6,S11 | T-8,T-14 | K3,K5 | agent without cases → 422 "set is empty"; button disabled + reason | planned |
| AC-18 | S6 | T-8 | K3 | no key (MockSecretsProvider empty) → 422 naming `OPENROUTER_API_KEY`; LLM call count 0 | planned |
| AC-19 | S2,S6,S11 | T-8,T-14 | K3,K5 | second `POST` while running → 409; button disabled | planned |
| AC-67 | S4,S6,S14,S15 | T-8,T-18,T-19 | K3,K5 | H5: errored case listed with message; error count in history and compare | planned |
| AC-20 | S6 | T-8 | K3 | LLM throws for one case → that row `error`, run `done`, metrics from the rest | planned |
| AC-61 | S6,S11,S14 | T-8,T-14,T-18 | K3,K5 | H3 | planned |
| AC-62 | S11,S14 | T-14,T-18 | K5 | H3: reload mid-run → progress shown again | planned |
| AC-21 | S3 | T-1 | K2 | boundary lines, reversed range, other file, other case | planned |
| AC-22 | S3 | T-1 | K2 | micro-average across cases | planned |
| AC-23 | S3 | T-1 | K2 | 1 − hits/kept, kept = grounded findings | planned |
| AC-24 | S3 | T-1 | K2 | kept / (kept+dropped) | planned |
| AC-63 | S3,S11 | T-1,T-13,T-14 | K2,K5 | denominator 0 → `null` → "—" (EC-6, EC-7) | planned |
| AC-25 | S3 | T-1 | K2 | unmatched findings do not change pass | planned |
| AC-68 | S3,S6,S11 | T-1,T-8,T-14 | K2,K3,K5 | `cases_passed` / scored cases | planned |
| AC-69 | S3 | T-1 | K2 | same result with notes stripped or changed | planned |
| AC-26 | S3,S6 | T-1,T-8 | K2,K3 | scorer has no provider parameter; LLM calls == number of cases, all `schemaName: 'Review'` | planned |
| AC-27 | S11,S14 | T-13,T-14,T-18 | K5 | H4 | planned |
| AC-28 | S4,S7,S14 | T-9,T-18 | K3,K5 | H4: newest first with all columns | planned |
| AC-29 | S11 | T-13 | K5 | 0.824 → "82%", null → "—" | planned |
| AC-64 | S9,S11,S13,S14 | T-14,T-17,T-18 | K5 | text "12 eval cases"; no "gold set"/"traces" in `eval.json` | planned |
| AC-39 | S6,S7,S15 | T-8,T-20 | K3,K5 | H5 | planned |
| AC-40 | S6,S7,S15 | T-8,T-20 | K3,K5 | H5: dropped list with reasons | planned |
| AC-30 | S14 | T-18 | K5 | H6: Compare enabled only with exactly 2 | planned |
| AC-31 | S3,S7,S15 | T-2,T-9,T-19 | K2,K3,K5 | H6 | planned |
| AC-32 | S3,S6,S15 | T-2,T-9,T-19 | K2,K3,K5 | H6: prompt line diff, model change, skills added/removed/reordered | planned |
| AC-33 | S3,S15 | T-2,T-9,T-19 | K2,K3,K5 | add a case between runs → notice lists it; metrics over shared cases | planned |
| AC-41 | S3,S15 | T-2,T-19 | K2,K5 | H6: flipped list with name + type | planned |
| AC-59 | S5,S15 | T-5,T-19 | K3,K5 | H7 | planned |
| AC-70 | S5,S15 | T-5,T-19 | K3,K5 | H7: newer run on current version → Promote disabled + description | planned |
| AC-45 | S3,S14,S15 | T-2,T-18,T-19 | K2,K5 | run cost = sum of scored cases; compare shows old, new, delta | planned |
| AC-76 | S3,S6,S14,S15 | T-2,T-8 | K2,K3 | one null case cost → run `cost_usd` null → "—" | planned |
| AC-46 | S12 | T-16 | K5 | H8 | planned |
| AC-71 | S1,S6,S7,S12 | T-4,T-7 | K2,K3 | `POST /agents/:id/eval-cases` with `[]` / bad type → 422; optional notes accepted | planned |
| AC-47 | S12 | T-15,T-16 | K5 | H8: break the JSON → "invalid JSON" + reason, Save/Run case disabled | planned |
| AC-48 | S12 | T-16 | K5 | H8: skeleton appends all fields empty | planned |
| AC-49 | S12 | T-16 | K5 | H8: empty Name → required marker, Save disabled | planned |
| AC-50 | S12 | T-16 | K5 | H8: Edit → Diff/PR meta read-only | planned |
| AC-72 | S1,S7 | T-4,T-7 | K2,K3 | `PUT /eval-cases/:id` with `input_diff` → 422 (strict schema) | planned |
| AC-51 | S6,S7,S11,S12 | T-7,T-14,T-16 | K3,K5 | `POST /eval-cases/:id/run` → case's last result changes, `eval_suite_runs` row count unchanged | planned |
| AC-52 | S12 | T-16 | K5 | H8: toggle on → Save → run request follows | planned |
| AC-53 | S6,S7,S12 | T-7,T-16 | K3,K5 | H8: "Last run passed · expected 1, got 1 · 1.8s · $0.02" | planned |
| AC-73 | — (EC-14 notes in S7, S12) | T-7,T-16 | K3,K5 | Removed. EC-14: `POST /agents/:id/eval-cases` with a body > 1 MB → 413, nothing stored; the editor shows the API message | Removed |
| AC-75 | S3,S6,S12 | T-3,T-7,T-16 | K2,K3,K5 | manual case naming a file/lines outside the diff → 422 with reason; Save disabled | assumes Q-2 |
| AC-34 | S9 | T-11 | K5 | H9 | assumes Q-1 |
| AC-35 | S4,S7,S13 | T-9,T-17 | K3,K5 | H9: disabled and never-run agents listed | planned |
| AC-36 | S4,S7,S13 | T-9,T-17 | K3,K5 | H9: 10 newest runs | assumes Q-6 |
| AC-37 | S14 | T-18 | K5 | H4 | planned |
| AC-58 | S11 | T-14 | K5 | H2: "View full dashboard" → `/eval/<agentId>` | planned |
| AC-56 | S14 | T-18 | K5 | H4: switcher navigates | planned |
| AC-55 | S7,S14 | T-9,T-18 | K3,K5 | H4: default 30 days; 7/30/90/all | planned |
| AC-43 | S14 | T-18 | K5 | H4: 3 lines, legend, value scale | planned |
| AC-42 | S14 | T-18 | K5 | H4/H10: ≥1 pp drop → banner with metric, pp and flipped cases | planned |
| AC-44 | S6,S7,S13 | T-9,T-17 | K3,K5 | H9: "Run all agents" starts only enabled agents with cases, none already running | planned |
| AC-60 | S10,S11 | T-12,T-14 | K5 | no Stats/CI tab, no Learn/Reply buttons | planned |
| AC-74 | S6,S7 | T-9 | K3 | insert a `running` run, rebuild the app → `failed`, reason "API restarted" | planned |
| AC-38 | S8 | — (script) | K6 | H11 | planned |
| NFR-1 | S3 | T-1 | K2 | same input twice and shuffled finding order → deep-equal | planned |
| NFR-2 | S6 | T-8 | K3 | diff and PR text appear in the LLM request only inside `<untrusted>` wrappers; fixed trusted task line contains no PR text | planned |
| NFR-3 | S11,S12,S14,S15 | T-14,T-16,T-18,T-20 | K5 | payload `<img onerror>` in diff/title/finding → shown as text | planned |
| NFR-4 | S10–S15 | T-12,T-14,T-16–T-20 | K5 | `getByRole(..., {name})` for every listed control; Tab order | planned |
| NFR-5 | S11,S14,S15 | T-14,T-18,T-19 | K5 | ▲/▼ + signed pp text; "passed"/"failed" text next to icons | planned |
| NFR-6 | S11,S14 | T-14,T-18 | K5 | status region text on done / failed | planned |
| NFR-7 | S2,S6 | T-8 | K3 | `GET /eval-runs/:id/cases/:row` after the run returns findings, dropped + reasons, matches | planned |
| NFR-8 | S8 | T-6–T-9 | K6 | it-tests inject `llm` overrides + a global `fetch` trap that fails on any call | planned |
| VA-1 | S10 (I1) | — | — | H12 | verification activity |
| VA-2 | S3,S6,S15 | T-8 | — | H12 | verification activity |
| VA-3 | S3,S6,S15 | T-8 | — | H12 | verification activity |
| VA-4 | S8 | — | K6 | `cd server && pnpm verify:l06` | verification activity |

Hands-on hints:
- H1 PR page → Findings tab, open a finding card. Accepted/dismissed → "Turn into eval case" enabled, one click, confirmation names the case (e.g. `hardcoded-stripe-secret-key`); second click → "already an eval case". Undecided → disabled with description. (Design 1.)
- H2 `/agents/<id>?tab=evals`: case rows with type + `file:start–end` + passed/failed/never run; Run / Edit / Delete icons; empty state; "View full dashboard →". (Design 5.)
- H3 Start a run (Run button) → row/tiles show "Running 2/8"; reload the page → still shown; on finish a status announcement.
- H4 `/eval/<agentId>`: tiles with ▲/▼ pp, trend chart + legend, 30-day default filter, history with checkboxes, Run eval, agent switcher, "All agents". (Design 3.)
- H5 History → open a run → case rows → open one: expectation, findings with matched yes/no, dropped list with reasons; errored case shows its message.
- H6 Select 2 completed runs → Compare enabled → modal: metric old→new Δpp, cost, system-prompt line diff, skills changes, flipped cases, notice for cases in only one run. (Design 4.)
- H7 In Compare, Promote on the newer run: toast "now v<N+1>"; `GET /agents/:id/versions/<N+1>` equals the older-config snapshot incl. skills; with the newer run on the current version Promote is disabled.
- H8 Evals tab → "New eval case": Name, tabs Diff / Files / PR meta, Expected output JSON, valid/invalid badge, Finding skeleton, Run on save, Cancel / Run case / Save; paste a >1 MB diff and Save → the editor shows the API's error message (EC-14). (Design 6.)
- H9 Sidebar → SKILLS LAB → "Eval Dashboard" highlighted on `/eval` and `/eval/<agentId>`; agents list incl. disabled/never run, recent runs, "Run all agents". (Design 2.)
- H10 Regression: run twice, second with a worse prompt → banner on the agent view naming the metric, pp drop and cases passed → failed.
- H11 `cd server && pnpm verify:l06` exits 0; break a scoring assertion → non-zero; unplug network → still passes.
- H12 Experiment (user, after implementation). Prerequisites: the agent has ≥8 decided findings on real PRs (the seeded demo review cannot be used: no patches, no agent id). Steps: review ≥3 real PRs with the agent → accept some / dismiss others → click "Turn into eval case" on ≥8 (≥1 of each type) → Run eval (baseline, v_n) → edit the system prompt (new version v_n+1; a wording change that should alter findings) → Run eval → select both runs → Compare: recall/precision Δ non-zero (VA-2) → degrade the prompt on purpose (e.g. "Flag every line of the diff") → Run eval → Compare with baseline: precision lower (VA-3), flipped must_not_flag cases listed. LLM output is non-deterministic: re-run if a delta is exactly 0.

## Non-functional requirements
| NFR / quality | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 determinism | SPEC-06 | scorer is a pure function over plain data, no clock/random/IO, stable iteration order (S3) | T-1 same input twice + shuffled findings → deep-equal |
| NFR-2 untrusted input | SPEC-06; `reviewer-core/CLAUDE.md` invariants | executor calls `reviewPullRequest` with `diff` (wrapped by `assemblePrompt`) and passes PR title + body only through `prDescription` (wrapped + truncated, `prompt.ts:69,194`); `task` is a fixed trusted constant with no PR text (S6) | T-8 asserts request text |
| NFR-3 plain-text rendering | SPEC-06 | no `dangerouslySetInnerHTML`; diff/JSON in `<pre>`/`<code>`; rationale via `Markdown` from `@devdigest/ui` (S11–S15) | T-14/16/18/20 with HTML payloads |
| NFR-4/5/6 accessibility | SPEC-06 + guidance (`lib/toast.tsx:90-91` is a polite live region) | labelled controls, text + icon for state, toasts/status region for outcomes (S10–S15) | RTL role/name queries |
| NFR-7 observability | SPEC-06 | per-case row stores `actual_output` (findings + matched flags), dropped + reasons, expectation matches, counters (S2, S6) | T-8 reads detail endpoint |
| NFR-8 no network | SPEC-06; server INSIGHTS 2026-09-26 | `llm` overrides in every it-test, `test/setup/hermetic.ts` already blanks keys, extra `fetch` trap (S8, S7 tests) | `pnpm verify:l06` offline |
| Bounded input / abuse (guidance) | `server/docs/architecture.md:96-99`, `security` skill; SPEC-06 EC-14 | per-route rate limits (run 10/min, single-case run 10/min, run-all 5/min), case name ≤120 chars (`knowledge.ts:278` precedent), the existing global Fastify body cap 1 MB (`app.ts:49`) is the only size bound of a manual case (no extra check, no raised limit); cases from findings are unbounded like regular reviews; concurrency bound per run (p-queue, 3) (S7, S6) | T-7: name > 120 → 422; body > 1 MB → 413 and nothing stored |

## Requirements review
- No blocking findings. The former R-1 (SPEC-05 AC-73 referred to a non-existent review diff limit: `reviews/diff-loader.ts:12-30`, `reviews/run-executor.ts:220-252`) is resolved by SPEC-06: AC-73 removed, NG-7 added. The new EC-14 behaviour was checked against the code: the 1 MB `bodyLimit` is set at `app.ts:49`; Fastify rejects a larger body with 413 before any handler runs, and the shared error handler forwards the status with code `internal_error` and Fastify's message (`app.ts:160-170`) — feasible with no server code. The client's `apiFetch` turns a failed response into an `ApiError` carrying the message (`client/docs/ui-architecture.md`, data-flow section), so the editor can show it. A case from a finding sends only the finding id (its patch is read server-side), so it is never subject to the cap.
- Q-1 [non-blocking] AC-34 — the sidebar items come only from `client/src/vendor/ui/nav.ts:21-44` (read by `Sidebar.tsx:45`), a `vendor/**` do-not-touch path (root CLAUDE.md, client/CLAUDE.md). Precedent: earlier plans edited the same file by owner exception (`specs/project-context-folder/plan.md:236,429`, `specs/onboarding-tour/plan.md:157`) and its WORKSPACE group now holds those entries — planned with: one minimal entry `{ key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval" }` after Conventions, no `gKey`; S9 is the only step that touches it.
- Q-2 [non-blocking] AC-75 — "reject the save": applies to manual create and edit; applying it to cases created from a finding would reject full-file kinds that are valid by AC-66 (grounding exempts them, `reviewer-core/src/grounding.ts:16,66`) — planned with: manual create/edit only.
- Q-3 [non-blocking] AC-13 — no stated behaviour when the file's patch cannot be obtained (git diff empty and `pr_files.patch` null) — planned with: 422 `diff_unavailable`, no case stored.
- Q-4 [non-blocking] AC-59 — a snapshot lists skill ids that may have been deleted since — planned with: restore the existing skills, skip missing ones, return `skipped_skill_ids`, the compare view mentions them next to the new version number.
- Q-5 [non-blocking] G-3/AC-26 — scorer location: `onion-architecture` SKILL.md "Where does this code go?" sends deterministic no-IO logic to `reviewer-core`, but scoring is studio-only (the CI runner does not use it) and AC-38 needs its unit tests in `server/` — planned with: `server/src/modules/eval/scoring.ts`, imports only types.
- Q-6 [non-blocking] AC-28/AC-36 — "its eval runs" / "most recent eval runs" are silent about failed and running runs — planned with: both lists include them with a status marker ("running 3/8", "failed: <reason>", metrics "—"); latest run, deltas, trend, banner and Compare use completed runs only (the spec says "completed" in AC-27, AC-42, AC-43).
- Requirements suggestions for the spec author: (a) AC-45 does not say whether an errored case's cost counts — planned: only scored cases are summed; (b) the sparkline length for "recent runs" (AC-35) is not stated — planned: last 10 completed runs (`EVAL_SPARK_POINTS`); (c) the `eval.json` strings "gold set"/"traces passed" conflict with AC-64 and are rewritten in S9; (d) a retired-agent clean-up of its cases is not specified (I3); (e) EC-14's 413 arrives with code `internal_error` (Fastify status forwarded by `app.ts:166-170`), not a dedicated code — acceptable because the editor shows the message only.

## Scope
In: migration + schema for run-level record and case/finding link; shared contracts (both copies); server `eval` module (cases, runs, scoring, compare, dashboard, restart reaping); agents `restore` (Promote); `verify:l06`; FindingCard button; Evals tab; case editor; Eval Dashboard pages, sidebar item, Compare modal, case-result drill-down.
Out: skill-owned cases (NG-1); LLM grading (NG-2); schedules/CI (NG-5); scoring on severity/category/title (NG-6); a case-specific diff size limit — no check and no raised body limit (NG-7, AC-73 removed); Learn / Reply to author (NG-3); Stats / CI tabs (NG-4); the experiment of step 6 (user, H12); docs pages (doc-writer); changes to the existing unused contracts `EvalCaseInput`/`EvalRunRecord`/`EvalDashboard` in `eval-ci.ts` (left as is; new names are used, see S1).

## Context used
- Guidance read: CLAUDE.md, server/AGENTS.md, server/docs/architecture.md, server/specs/review-flow.md, reviewer-core/CLAUDE.md, client/AGENTS.md, client/docs/ui-architecture.md, client/specs/pages.md:150-215, TESTING.md, specs/eval-pipeline/{spec.md (SPEC-06), design-review.md (v2; its [SPEC-06] note: no size check for eval cases, do not raise the body limit, surface the API error message in the editor)}.
- Lessons applied: server/INSIGHTS 2026-09-24 (ORDER BY) → every list query in S4 has a total order (created_at, id); 2026-09-25 (drizzle-kit rename prompt) → S2 only ADDS columns/tables and relaxes one FK (no drop+add), generated with the pty trick, SQL read before use; 2026-09-26 (unmocked provider = real network) → every it-test injects `llm`, a `MockSecretsProvider` and an intent fake that throws; 2026-09-24 trace gap → tests poll the run status and then the detail endpoint. client/INSIGHTS 2026-10-04 → client imports only TYPES from `@devdigest/shared` (so the expected-output validator is a local mirror, S12); 2026-09-26 `user-event` is not installed → `fireEvent`; 2026-09-19 → no shorthand border props in new `styles.ts`; 2026-09-25 → `format.relativeTime` needs `now`. Root INSIGHTS 2026-09-24 → compare only the touched shared files (S1 uses `diff` on the new file + `index.ts`).
- Designs: `specs/eval-pipeline/designs/1-finding-card-turn-into-eval-case.webp` → S10; `2-eval-dashboard-agents-list.png` → S13 (+ S9 sidebar); `3-eval-dashboard-agent-detail.webp` → S14; `4-eval-compare-modal.webp` → S15; `5-agent-editor-evals-tab.webp` → S11; `6-eval-case-modal.webp` → S12. Design vs spec: designs show Stats/CI tabs, Learn/Reply, "gold set", severity chips and count-based subtitles — the spec wins (AC-60, AC-64, AC-10).
- Skills: onion-architecture (read in full + rules/drizzle.md, rules/testing.md) — S3–S8; frontend-ui-architecture (read) — S9–S15; drizzle-orm-patterns, postgresql-table-design — S2, S4 (description-level; partial unique index, FK `set null`); fastify-best-practices, zod — S1, S7 (description-level); security — S6, S12 (untrusted text); react-best-practices, react-testing-library, next-best-practices — S10–S15; ui-ux-pro-max — S11–S15 (a11y, designs); engineering-insights — end of each wave, add an entry only if something new turned up.

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| New module = `modules/eval/{routes,service,repository}.ts` + one line in `modules/index.ts` | server/AGENTS.md:26-27 | S4, S6, S7 |
| Only a repository imports drizzle/schema; repository takes `Db`, scoped by workspace, owns transactions | onion SKILL.md table, rules/drizzle.md | all SQL in `eval/repository.ts` + `eval/repository/*.repo.ts`; promote transaction in `AgentsRepository` (S5) |
| Services take explicit deps, never `Container`; the module must not import another module's folder | onion SKILL.md, `reviews/run-executor.ts:519` comment | `EvalService` deps (types in `eval/types.ts`): `repo`, `agents` port (getById, list, listEnabled, getVersion, ensureVersionSnapshot, enabledSkillsForPrompt), `findings` port, `prDiff` port, `parseDiff`, `skillBlock`, `llm(provider)`, `hasSecret(provider)`, `now`; wired in `platform/container.ts` like `brief` (`container.ts:227-264`) as lazy singleton `container.evalService` (S7) |
| Routes: Zod schema-first, one service call per handler, 422 before handler, expensive routes tightened | server/AGENTS.md:33-35, architecture.md:96-99 | S7 |
| `reviewer-core` stays untouched; grounding is mandatory, no bypass | reviewer-core/CLAUDE.md | eval calls `reviewPullRequest` as is (S6) |
| Contracts canonical in `server/src/vendor/shared`, client copy synced | CLAUDE.md, server/AGENTS.md:54 | S1 creates the new file in both and edits both `index.ts` |
| Migrations generated by drizzle-kit, never hand-named/edited | CLAUDE.md "Do not touch" | S2 `pnpm db:generate`, new `0015_*.sql` |
| `server/package.json` is `skip-worktree` | TESTING.md:100-102 | S8 edits it; the user must run `git update-index --no-skip-worktree server/package.json` before committing the script (never run by the implementer) |
| DB-backed tests end `*.it.test.ts` | CLAUDE.md Naming | T-5…T-9 |
| Client: data only via `lib/hooks/*` → `lib/api.ts`; text via next-intl; pages thin; feature folders with sibling tests | client/AGENTS.md:22-31 | S9–S15 |
| Client may import only types from `@devdigest/shared` | client/INSIGHTS 2026-10-04 | S9–S15 use `import type`; value constants repeated locally |
| `src/vendor/**` untouched except the one `nav.ts` entry (Q-1); no new dependencies | client/AGENTS.md:36-38, client/INSIGHTS 2026-09-26 | trend chart built with the existing `recharts` dependency inside the feature (the vendored `LineChart` draws missing values as 0, `LineChart.tsx:32-37`, wrong for AC-63); sparkline uses the vendored `Sparkline` |
| Global body limit stays 1 MB; no eval-specific size check | SPEC-06 EC-14/NG-7, design-review [SPEC-06] note | S7 adds no `bodyLimit` override and no size guard; T-7 pins the 413 |
| No git commit/push | CLAUDE.md | never |

## Steps
Conventions for all steps: workspace-scoped queries; `import type` from shared on the client; Zod schemas from `@devdigest/shared` in routes; each step ends with its listed Verify green. Waves: see Execution modes.

### S1 Shared contracts (server canonical + client copy)
- Module / layer: ring 2 contracts
- Files: create `server/src/vendor/shared/contracts/eval-pipeline.ts` and the byte-identical `client/src/vendor/shared/contracts/eval-pipeline.ts`; modify both `src/vendor/shared/index.ts` (add `export * from './contracts/eval-pipeline.js';`); create `server/test/eval/contracts.test.ts`.
- Content (new names only; existing `EvalCaseInput`/`EvalRunRecord`/`EvalDashboard`/`EvalRun` in `eval-ci.ts`/`knowledge.ts` stay untouched — `server/test/contracts.test.ts:174-192` covers them): `EvalExpectationType` (`must_find`|`must_not_flag`); `EvalExpectation` {type, file min(1), start_line int, end_line int, title/severity/category nullish} (AC-71); `EvalExpectedOutput` = array(EvalExpectation).min(1); `EvalCaseMeta` {title, body}; `EvalCaseCreateInput` {name 1..120, input_diff min(1), input_meta, expected_output}; `EvalCaseUpdateInput` = `z.object({name?, expected_output?}).strict()` (AC-72); `EvalCaseSummary` (+ `last_result`: passed, expected_count, returned_count, duration_ms, cost_usd, ran_at | null), `EvalCaseDetail` (+ input_diff, input_meta, input_files: string[]); `EvalCaseFromFindingResponse` {case, created}; `EvalSuiteRun` (id, agent_id, agent_name?, agent_version, status running|done|failed, error, started_at, finished_at, cases_total, cases_done, cases_errored, cases_passed, recall, precision, citation_accuracy, cost_usd, duration_ms — metrics 0..1 or null); `EvalCaseRun` (row of a run: id, case_id|null, case_name, expectation types, status ok|error, error, passed, expected_count, returned_count, duration_ms, cost_usd); `EvalCaseRunDetail` (+ expectations, findings [{file,start_line,end_line,title,severity,category,rationale,matched}], dropped [{…, reason}], expectation_matches); `EvalRunDetail` {run, cases}; `EvalStartRunResponse` {run_id}; `EvalRunAllResponse` {started: [{agent_id, run_id}]}; `EvalDashboardOverview` {agents:[{agent_id,name,provider,model,enabled,cases_total,latest,running,recall_spark}], recent_runs}; `EvalCompare` (metrics older/newer/delta_pp, cost, shared_case_count, only_in_older/newer, flipped, errored, config_diff {system_prompt: DiffLine[], provider, model, skills {added, removed, reordered}}); `DiffLine` {kind same|add|del, text}; `AgentRestoreResponse` = Agent + `skipped_skill_ids`.
- Skills to apply: zod; onion-architecture rules/zod-contracts.md
- Depends on: —
- Tests (single-agent mode): T-4
- Done when: both copies identical; both packages typecheck; T-4 covers AC-71/AC-72 shapes (empty list, bad type, extra input key rejected, optional notes accepted).
- Verify: `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts && diff server/src/vendor/shared/index.ts client/src/vendor/shared/index.ts` (empty output), `cd server && pnpm typecheck`, `cd client && pnpm typecheck`

### S2 Schema + migration
- Module / layer: ring 4a persistence (`server/src/db`)
- Files: modify `server/src/db/schema/eval.ts`; modify `server/src/db/rows.ts` (row types if needed); generate `server/src/db/migrations/0015_<generated>.sql` + `meta/0015_snapshot.json` + `meta/_journal.json` (drizzle-kit only).
- Changes: (1) `eval_cases` + `created_at` (`now()`, from `_shared`), `source_finding_id uuid` FK `findings.id` ON DELETE SET NULL, index (`owner_id`, `created_at`, `id`), partial UNIQUE index on `source_finding_id` WHERE not null (AC-9 under double click — a unique violation is mapped to "return existing"). (2) new `eval_suite_runs`: id, workspace_id FK cascade, agent_id FK `agents` cascade, agent_version int, status text enum running|done|failed, error, started_at, finished_at, cases_total, cases_done, cases_errored, cases_passed int default 0, recall, precision, citation_accuracy, cost_usd doublePrecision nullable, duration_ms; index (agent_id, started_at desc); partial UNIQUE index on `agent_id` WHERE `status='running'` (AC-19 atomic). (3) `eval_runs` (per case): `case_id` becomes nullable with FK ON DELETE SET NULL (a deleted case keeps its history, EC-9), + `suite_run_id` FK `eval_suite_runs` cascade (NULL = single-case run, AC-51), `case_name`, `status` ok|error default ok, `error`, `expected_snapshot jsonb`, counters `findings_returned`, `findings_kept`, `must_find_total`, `must_find_matched`, `must_not_flag_hits` int; existing `actual_output` holds findings + dropped + matches (NFR-7); existing `pass/recall/precision/citation_accuracy/duration_ms/cost_usd` hold the per-case values.
- Skills to apply: drizzle-orm-patterns § schema/indexes; postgresql-table-design § constraints; onion rules/drizzle.md
- Depends on: S1 (none technically; ordering only)
- Tests (single-agent mode): — (exercised by T-5…T-9)
- Done when: migration generated with `ALTER TABLE … ADD COLUMN` / new table only (read the SQL: no RENAME, no DROP of existing columns — server INSIGHTS 2026-09-25: `(for i in $(seq 1 20); do sleep 2; printf '\r'; done) | script -q /dev/null pnpm db:generate`); `pnpm db:migrate` applies on Postgres :5433.
- Verify: `cd server && pnpm typecheck`, then `cd server && pnpm db:migrate`

### S3 Pure logic: scoring, compare, helpers
- Module / layer: ring 3 pure functions in `server/src/modules/eval/` (no imports except `@devdigest/shared` types, Q-5)
- Files: create `eval/constants.ts` (name max 120, spark points 10, concurrency 3, fixed `EVAL_TASK_LINE`), `eval/types.ts` (service deps/ports), `eval/helpers.ts`, `eval/scoring.ts`, `eval/compare.ts`; tests `server/test/eval/scoring.test.ts`, `compare.test.ts`, `helpers.test.ts`.
- `scoring.ts`: `matches(finding, expectation)` (file equal, reversed range normalised, inclusive intersection — AC-21); `scoreCase({expectations, kept, dropped})` → counters + per-finding matched flags + expectation_matches + `passed` (AC-25) — notes ignored (AC-69); a finding that matches two `must_not_flag` expectations counts once; `scoreRun(caseResults)` micro-averages over scored (status ok) cases: recall = Σmatched/Σmust_find_total, precision = 1 − Σhits/Σkept, citation = Σkept/Σ(kept+dropped), each `null` at denominator 0 (AC-22/23/24/63), `cases_passed`/scored (AC-68), cost = Σ cost of scored cases or `null` if any is null (AC-76/AC-45). No clock, random or IO (NFR-1).
- `compare.ts`: `compareRuns(older, newer, caseRows)` over cases scored in both (match by `case_id`; null `case_id` rows count as "only in one run"), recomputed with `scoreRun`; delta in percentage points; flipped (passed↔failed) with name and expectation types; only_in lists; cost older/newer/delta (run totals); error counts; `diffConfigs(olderSnapshot, newerSnapshot, skillNames)` → system prompt `DiffLine[]` (LCS line diff), provider/model if different, skills added/removed/reordered.
- `helpers.ts`: `slugify(title)` + `uniqueName(base, taken)` (AC-8; empty slug → `eval-case`); `patchForFile(diffRaw, path)` exact-header slice (do not reuse `sliceDiff` blindly: it falls back to the whole diff, `reviewer-core/src/review/reduce.ts:58-72`); `validateExpectationsAgainstDiff(diff, expectations)` → reasons (file not in diff / range intersects no hunk — uses `UnifiedDiff.files[].hunks[].newLineNumbers`, AC-75); `filesOf(diff)`.
- Skills to apply: onion-architecture § ring 3; typescript-expert; security (no regex on untrusted text beyond bounded slugging)
- Depends on: S1
- Tests (single-agent mode): T-1, T-2, T-3
- Done when: unit tests cover every AC-21…25/63/68/69, NFR-1 (shuffled order), AC-33/41/45/76, AC-32 diff, AC-8, AC-13 slice, AC-75 reasons.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/eval/scoring.test.ts test/eval/compare.test.ts test/eval/helpers.test.ts`

### S4 Eval repository
- Module / layer: ring 4a
- Files: create `eval/repository.ts` (facade class `EvalRepository(db)`), `eval/repository/cases.repo.ts`, `eval/repository/runs.repo.ts`, `eval/repository/dashboard.repo.ts`.
- Methods (all workspace-scoped, contract-typed returns, total ORDER BY with id tie-break): cases — insert (catching the unique violation → return existing by `source_finding_id`), list by agent (created_at, id) with latest ok execution per case (`DISTINCT ON (case_id) … ORDER BY ran_at DESC, id DESC`), get, update name/expected_output, delete, names taken by agent; runs — `createSuiteRun` (maps the running-unique violation to a typed "already running" result), `bumpProgress`, `finishSuiteRun`, `failSuiteRun`, `failStaleRunning` (AC-74), insert case-run row, list suite runs by agent (`days`, `status`, `limit`, newest first), get run + case rows, get case-run detail, rows for compare; dashboard — per agent latest done run, running run, last N recall values, 10 most recent runs of all agents with agent name; findingContext/agents are NOT here (ports).
- Skills to apply: drizzle-orm-patterns § queries/transactions; onion rules/drizzle.md; postgresql-table-design
- Depends on: S2
- Tests (single-agent mode): — (through T-6…T-9)
- Done when: typechecks; no `drizzle-orm` import outside `repository*`.
- Verify: `cd server && pnpm typecheck`; `rg -n "from '.*db/schema|from 'drizzle-orm" server/src/modules/eval --glob '!**/repository*'` (no output)

### S5 Agents: restore a version (Promote) + guaranteed snapshot
- Module / layer: agents repository / service / routes
- Files: modify `agents/repository.ts`, `agents/service.ts`, `agents/routes.ts`, `agents/helpers.ts` (mapping if needed); create `server/test/eval/agents-restore.it.test.ts`.
- Changes: `ensureVersionSnapshot(row)` (public wrapper over the private `snapshotVersion`, `repository.ts:274-294`, `onConflictDoNothing`) — needed because seeded agents have no snapshot until edited (`db/seed.ts:245-251`); `restoreVersion(workspaceId, agentId, version)`: ONE transaction that reads the snapshot, sets provider, model, system_prompt, output_schema, strategy, ci_fail_on, repo_intel, context_docs on the agent, replaces `agent_skills` with the snapshot's ordered skill ids (existing skills only, Q-4), bumps `version` exactly once (not the 3 bumps that `setSkills`/`setContextDocs`/`update` would do separately, `repository.ts:154-228,383-392`) and writes the new snapshot (so the new version equals the restored config, skills included); name, description, enabled untouched. Route `POST /agents/:id/versions/:version/restore` → `AgentRestoreResponse` (the new Agent + `skipped_skill_ids`); 404 unknown agent/version; 409 when `:version` equals the agent's current version (AC-70 server-side). Rate limit not needed.
- Skills to apply: onion-architecture (transaction in repository); drizzle-orm-patterns § transactions; fastify-best-practices
- Depends on: S1
- Tests (single-agent mode): T-5
- Done when: T-5 proves: all snapshot fields + skill order restored, exactly one new version, new snapshot equals old config, unchanged name/enabled, 409 on current version, missing skill skipped and reported.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/eval/agents-restore.it.test.ts` (Docker) + K3 `agents-versions.it.test.ts` still green.

### S6 EvalService + background executor
- Module / layer: ring 3
- Files: create `eval/service.ts` (cases, queries, compare, promote orchestration), `eval/run-executor.ts` (background run).
- Cases from a finding (`createFromFinding(workspaceId, findingId)`): load finding facts via the `findings` port → undecided → 422 (message: must be accepted or dismissed first); agent missing (`reviews.agent_id` null or `agents.getById` undefined — `reviews.ts:17` has no FK, so a dangling id is possible) → 409 `agent_deleted` "The agent that produced this finding was deleted" (AC-7); existing case for `source_finding_id` → return it with `created:false` (AC-9); load the PR diff through the `prDiff` port, `patchForFile` (missing → 422 `diff_unavailable`, Q-3); no size check (EC-14/NG-7: a case from a finding is not size-bounded, as regular reviews); name = `uniqueName(slugify(title), taken)`; expectation `{type: accepted ? must_find : must_not_flag, file, start_line, end_line, title/severity/category as notes}`; `input_diff` = patch, `input_meta` = {title, body} (AC-13); never updates the type later (AC-65); every kind allowed (AC-66).
- Manual cases: create/update/delete/get/list; update accepts only name + expected_output (AC-72 schema-level); manual create/update validate expectations against the diff via `parseDiff` + `validateExpectationsAgainstDiff` (AC-75, Q-2) → 422 with the reasons; `input_files` = file paths of the diff (AC-54). No size check of the diff (EC-14): the global 1 MB body limit rejects an oversized request before the service is reached.
- Run one case (AC-51): config of the agent now (current row + enabled skills), single `reviewCase` call, insert a case-run row with `suite_run_id = null`; no suite row.
- Start run (`startRun(workspaceId, agentId)`): 404 agent → 0 cases ⇒ 422 `empty_set` (AC-17) → `hasSecret(agent.provider)` false ⇒ 422 `missing_key` naming `OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY` (`settings/constants.ts:8-13`, AC-18) → `agents.ensureVersionSnapshot` → read the config ONCE (agent row, `enabledSkillsForPrompt`, cases with expectations) → `createSuiteRun` (status running, `agent_version = agent.version`; unique violation ⇒ 409 `already_running`, AC-19) → return `{run_id}` and fire the executor without awaiting (`void … .catch(...)`, as `reviews/service.ts:134-136`) (AC-16). `startAll(workspaceId)`: enabled agents with ≥1 case and no running run, each through the same path, errors per agent swallowed into "not started" (AC-44).
- Executor: per case (p-queue, concurrency 3, constants) call `reviewPullRequest({systemPrompt, model, diff: parseDiff(case.input_diff), llm, strategy: agent.strategy, skills: blocks via skillBlock, prDescription: "Title: …\n\n<body>", task: EVAL_TASK_LINE, sessionId: "eval:<agent>:<run>"})` — NO `intent`, `callers`, `repoMap`, `specs`, `memory` (AC-14), `container.intent` never touched; kept = `outcome.review.findings`, dropped = `outcome.dropped`; `scoreCase`; insert the case row (counters, `actual_output`, `expected_snapshot`, duration, `outcome.costUsd`); catch per case ⇒ row `status=error` + message, continue (AC-20); after each case `bumpProgress`; at the end `scoreRun` → `finishSuiteRun` (status `done`, metrics, `cases_errored`, `cases_passed`, cost, duration); an unexpected crash ⇒ `failSuiteRun(error)`. `failStaleRuns()` for AC-74.
- Queries: history (`days`, `status`, `limit`), run detail, case-run detail, dashboard overview, compare (`compareRuns` + `diffConfigs`; both runs must be `done`, same agent, else 422; snapshots via `agents.getVersion`, skill ids → names), promote helper (resolve the newer run's version → `agents.restoreVersion`).
- Skills to apply: onion-architecture § ring 3 (deps through constructor); security § untrusted input; fastify-best-practices (error mapping via `AppError` subclasses, `platform/errors.ts`)
- Depends on: S1–S5
- Tests (single-agent mode): — (T-6…T-9 live in S7)
- Done when: typechecks; no `Container`/adapter import in `eval/service.ts` or `run-executor.ts`.
- Verify: `cd server && pnpm typecheck`; `rg -n "from '\.\./\.\./adapters|constructor\(private container: Container" server/src/modules/eval` (no output)

### S7 Routes, registration, wiring, it-tests
- Module / layer: ring 5 + composition root
- Files: create `eval/routes.ts`; modify `server/src/modules/index.ts` (+ `eval`), `server/src/platform/container.ts` (lazy `evalService` getter wiring ports: `agents: this.agentsRepo`, `findings` via `reviewRepo.findingContext`, `prDiff` via `reviewRepo.getPull/getRepo` + `loadDiff` from `reviews/diff-loader.ts`, `parseDiff` from `adapters/git/diff-parser.ts`, `skillBlock: toSkillPromptBlock` from `reviews/helpers.ts`, `llm`, `hasSecret` as `container.ts:233-258` does for brief, `now`), `server/src/app.ts` (await `container.evalService.failStaleRuns()` next to the reap, `app.ts:87-92`, warn on failure); create tests `server/test/eval/cases-from-finding.it.test.ts`, `cases-manual.it.test.ts`, `runs.it.test.ts`, `dashboard-compare-restart.it.test.ts`, helper `server/test/eval/scripted-llm.ts` (an `LLMProvider` returning findings chosen from the request, e.g. keyed on the system prompt; can throw per case; counts calls; `MockLLMProvider` returns one fixed fixture, `adapters/mocks.ts:105-121`).
- Routes (all via `getContext`, Zod params/body/response from shared): `POST /findings/:id/eval-case` (201 created / 200 existing); `GET|POST /agents/:id/eval-cases`; `GET|PUT|DELETE /eval-cases/:id`; `POST /eval-cases/:id/run` (rate limit 10/min); `POST /agents/:id/eval-runs` (202 `{run_id}`, 10/min); `GET /agents/:id/eval-runs?days=&status=&limit=`; `POST /eval/run-all` (5/min); `GET /eval/dashboard`; `GET /eval-runs/:id`; `GET /eval-runs/:id/cases/:caseRunId`; `GET /eval/compare?a=&b=`. Handler = one service call.
- Implementation note (EC-14): do NOT add a diff size check and do NOT raise `bodyLimit` for the eval routes (`app.ts:49` stays 1 MB). A manual-case body over 1 MB is rejected by Fastify with 413 before the handler (nothing stored; the shared error handler answers with Fastify's status and message, code `internal_error`, `app.ts:160-170`); T-7 asserts status 413 and an unchanged case count.
- Skills to apply: fastify-best-practices; onion-architecture § ring 5/6; zod
- Depends on: S1–S6
- Tests (single-agent mode): T-6, T-7, T-8, T-9
- Done when: every route covered by an it-test through `app.inject()`; reap runs on `buildApp`.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/eval/` (Docker); `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit regression)

### S8 `pnpm verify:l06`
- Module / layer: tooling
- Files: modify `server/package.json` (skip-worktree file, see constraints).
- Script: `"verify:l06": "pnpm run typecheck && vitest run test/eval/"` — typecheck, then every test under `test/eval/` (unit scoring/compare/helpers/contracts + the `*.it.test.ts` with scripted LLM); a failing step exits non-zero. No real LLM: the suite is hermetic (`test/setup/hermetic.ts`), it-tests inject `llm`/secrets and trap `fetch` (NFR-8). The it-suites self-skip without Docker — see I2.
- Skills to apply: —
- Depends on: S7
- Tests (single-agent mode): —
- Done when: green with Docker; red when a scoring assertion is broken.
- Verify: `cd server && pnpm verify:l06`

### S9 Client foundation: hooks, messages, sidebar item
- Module / layer: client data layer + shell
- Files: create `client/src/lib/hooks/eval.ts`; modify `client/src/lib/hooks/index.ts` (export), `client/messages/en/eval.json` (rewrite copy: "eval cases", no "gold set"/"traces", add keys for every string of S10–S15), `client/messages/en/prReview.json` (button, confirmation, already-exists, disabled hint), `client/src/vendor/ui/nav.ts` (Q-1: one entry), `client/src/components/app-shell/nav.test.ts`.
- Hooks (TanStack Query → `api`, keys `["eval-cases",agentId]`, `["eval-runs",agentId,params]`, `["eval-run",id]`, `["eval-dashboard"]`, `["eval-compare",a,b]`): `useEvalCases`, `useCreateEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase`, `useRunEvalCase`, `useCaseFromFinding`, `useEvalRuns` (`refetchInterval` 2 s while any run is running), `useEvalRun`, `useEvalCaseRun`, `useStartEvalRun`, `useRunAllAgents`, `useEvalDashboard`, `useEvalCompare`, `useRestoreAgentVersion`; mutations invalidate the keys they affect (also `["agent",id]`/`["agents"]` after restore). Types only from `@devdigest/shared`.
- Skills to apply: frontend-ui-architecture § data layer; next-best-practices
- Depends on: S1
- Tests (single-agent mode): T-11
- Done when: nav test asserts the item in SKILLS LAB, href `/eval`, highlighted for `/eval` and `/eval/<id>` via the existing `activeKeyFor` (`helpers.ts:35`), not for `/agents`.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S10 FindingCard "Turn into eval case"
- Module / layer: client feature (PR page)
- Designs: `specs/eval-pipeline/designs/1-finding-card-turn-into-eval-case.webp` — button after Accept/Dismiss, flask icon; only that button (no Learn / Reply, AC-60)
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` (render the sub-component at `FindingCard.tsx:102-123` actions row), `FindingCard.test.tsx` (wrap renders in `QueryClientProvider` — existing tests render without one); create `…/FindingCard/_components/EvalCaseButton/{EvalCaseButton.tsx,index.ts,styles.ts,EvalCaseButton.test.tsx}`.
- Behaviour: `useCaseFromFinding(f.id)`; disabled + `aria-describedby` text when neither `accepted_at` nor `dismissed_at`; one click, no dialog; pending disables; success → toast (`lib/toast.tsx`, polite live region) and inline text naming the case; `created:false` → "already an eval case: <name>"; error → `role="alert"` with the API message, button stays enabled; `secret_leak`/`lethal_trifecta`/`phantom`/`hook` kinds allowed. Case name rendered as text.
- Skills to apply: frontend-ui-architecture § component splitting; react-best-practices; react-testing-library (`fireEvent`); ui-ux-pro-max (a11y)
- Depends on: S9
- Tests (single-agent mode): T-12
- Done when: AC-3…AC-9, AC-65-neutral (client never changes type), AC-66, AC-60 covered.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S11 Evals tab (+ shared metric tiles and formatting)
- Module / layer: client feature (agent editor)
- Designs: `specs/eval-pipeline/designs/5-agent-editor-evals-tab.webp` — tab after Context; metric tiles with ▲/▼ pp; case rows (name, type chip, file:lines, status icon, Run/Edit/Delete); "View full dashboard →"; "Run all evals" = run this agent's set; "New eval case". Not shown: Stats/CI tabs, severity chips, "expected N, got M" subtitle (replaced by type + `file:start–end`, AC-10).
- Files: modify `AgentEditor/AgentEditor.tsx`, `AgentEditor/constants.ts` (add `{key:"evals", labelKey:"editor.tabs.evals", icon:"FlaskConical"}` after context, `constants.ts:11-15`), `AgentEditor/AgentEditor.test.tsx:74-78` (Evals present, Stats/CI absent), `client/messages/en/agents.json` (tab label), `client/src/lib/format.ts` + `format.test.ts` (`formatMetricPct` → "82%"/"—", `formatDeltaPts` → "▲ 4 pt"/"▼ 2 pt"/none, `formatCostOrDash`); create `AgentEditor/_components/EvalsTab/{EvalsTab.tsx,index.ts,styles.ts,EvalsTab.test.tsx}`, `…/EvalsTab/_components/CaseRow/{CaseRow.tsx,index.ts,styles.ts}`, `client/src/components/eval-metric-tiles/{EvalMetricTiles.tsx,index.ts,styles.ts}` (shared by S11 and S14: two known consumers).
- Behaviour: cases list (loading skeleton, empty state text AC-11), delete via `components/confirm-dialog`, row Run (`useRunEvalCase`), "New eval case" opens the editor (S12 wires it; until then a prop callback), "Run" button disabled with reason when the set is empty / a run is running (reason text visible), running state "Running n/m" from `useEvalRuns` (AC-61/62), tiles from the two latest completed runs (deltas, "—" for null, no delta with one run, EC-19), passed/total, errored count, announce finish/failure via toast, "View full dashboard →" to `/eval/<id>`; copy "N eval cases".
- Skills to apply: frontend-ui-architecture; react-best-practices; react-testing-library; ui-ux-pro-max
- Depends on: S9
- Tests (single-agent mode): T-13, T-14
- Done when: AC-10…12, 17, 19, 27, 29, 58, 60, 61, 62, 63, 64 render as specified; NFR-4/5/6 asserted.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S12 Case editor modal
- Module / layer: client feature
- Designs: `specs/eval-pipeline/designs/6-eval-case-modal.webp` — modal "Eval case · name", Name*, Input tabs Diff/Files/PR meta, Expected output JSON editor with valid/invalid badge and "Finding skeleton", last-run box, "Run on save", Cancel / Run case / Save. Expected output differs from the design: array of `{type,file,start_line,end_line,…notes}` (AC-71).
- Files: create `…/EvalsTab/_components/CaseEditorModal/{CaseEditorModal.tsx,index.ts,styles.ts,CaseEditorModal.test.tsx,expected-output.ts,expected-output.test.ts}`; modify `EvalsTab.tsx` (open for New/Edit).
- Behaviour: `expected-output.ts` is a local pure mirror of AC-71 (value import of the shared schema would blank the page, client/INSIGHTS 2026-10-04) returning ok or a reason; the API remains the authority (also AC-75: show the 422 reason, keep Save disabled until the text changes); skeleton appends `{type:"",file:"",start_line:null,end_line:null,title:"",severity:"",category:""}`; Name required marker; Edit mode: name + JSON editable, Diff / PR meta read-only; Files tab lists diff paths read-only (parsed locally from `input_diff`, nothing added to input); create sends `input_diff`, `input_meta`; "Run on save" runs `useRunEvalCase` after save success; last-run box "Last run passed/failed · expected N, got M · 1.8s · $0.02" or nothing; all stored text rendered in `<pre>`/inputs (NFR-3). Implementation note (EC-14): any failed save or run (including HTTP 413 for a body over the API's 1 MB limit) shows the `ApiError` message returned by the API in a `role="alert"` block and keeps the editor open with the entered text; the client adds no size check of its own and does not branch on the error code.
- Skills to apply: frontend-ui-architecture; react-best-practices; react-testing-library; ui-ux-pro-max
- Depends on: S11
- Tests (single-agent mode): T-15, T-16
- Done when: AC-46…54, 75 (display) and the EC-14 error display (mocked 413 response) covered.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S13 Eval Dashboard page (agents list)
- Module / layer: client route `/eval`
- Designs: `specs/eval-pipeline/designs/2-eval-dashboard-agents-list.png` — agent rows with model chip, "Last run v7 · date · 17/20 pass", sparkline, RECALL/PREC/CITE, chevron; "Recent eval runs · all agents" table; "Run all agents".
- Files: create `client/src/app/eval/page.tsx` (thin), `client/src/app/eval/_components/EvalDashboardView/{EvalDashboardView.tsx,index.ts,styles.ts,EvalDashboardView.test.tsx}`, `…/_components/AgentEvalRow/{AgentEvalRow.tsx,index.ts,styles.ts}`.
- Behaviour: `useEvalDashboard`; every agent (disabled badge, "never run" text), vendored `Sparkline` over non-null recall points, "N eval cases"; runs table (10 newest, running/failed markers, Q-6); "Run all agents" (`useRunAllAgents`) then each started run's progress ("Running n/m") by polling; row click → `/eval/<agentId>`; breadcrumbs Skills Lab › Eval Dashboard (`eval.json page.*`).
- Skills to apply: frontend-ui-architecture; next-best-practices § file conventions; react-testing-library
- Depends on: S9
- Tests (single-agent mode): T-17
- Done when: AC-35, 36, 44, 64 behave; NFR-4/5.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S14 Agent dashboard view
- Module / layer: client route `/eval/[agentId]`
- Designs: `specs/eval-pipeline/designs/3-eval-dashboard-agent-detail.webp` — "All agents" link, agent switcher, period filter (30 days), "Run eval", warning banner, three tiles with sparklines, "Metric trend" chart with legend and scale, "Recent runs" with checkboxes and Compare.
- Files: create `client/src/app/eval/[agentId]/page.tsx`, `…/eval/_components/AgentEvalView/{AgentEvalView.tsx,index.ts,styles.ts,AgentEvalView.test.tsx,regression.ts,regression.test.ts}`, `…/AgentEvalView/_components/{TrendChart/TrendChart.tsx,RunHistoryTable/RunHistoryTable.tsx,RegressionBanner/RegressionBanner.tsx}` (+ `index.ts`).
- Behaviour: `EvalMetricTiles` (S11); trend with `recharts` directly (chronological completed runs, three series, null points skipped, legend, 0–1 value scale; a text/table alternative for assistive tech); period filter 7/30/90/all default 30 → `days` param; history table (newest first, version, three metrics, passed/total, cost "—" for null, errored count, status marker), checkboxes only on completed rows with accessible names, Compare enabled iff exactly 2 selected (AC-30), opens S15; `regression.ts` pure: banner when latest vs previous completed run dropped ≥1 pp, names metrics + pp, the "passed → failed" case names come from `useEvalCompare(previous, latest)`; no banner/delta with one completed run; "Run eval" disabled with reasons (empty set / running / missing key surfaced from the API error); progress from `useEvalRuns`; agent switcher navigates; announce finish/failure (NFR-6).
- Skills to apply: frontend-ui-architecture; react-best-practices; react-testing-library; ui-ux-pro-max
- Depends on: S11, S13
- Tests (single-agent mode): T-18
- Done when: AC-30, 37, 42, 43, 45, 55, 56, 61, 62, 67 (history) + NFR-6 covered.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S15 Compare modal, case-result drill-down, Promote
- Module / layer: client feature
- Designs: `specs/eval-pipeline/designs/4-eval-compare-modal.webp` — "Compare runs · v6 → v7", tiles old → new ▲/▼ pt incl. cost, "System prompt diff" with v_old/v_new legend, Close / "Promote v7".
- Files: create `…/AgentEvalView/_components/CompareModal/{CompareModal.tsx,index.ts,styles.ts,CompareModal.test.tsx}`, `…/CompareModal/_components/ConfigDiff/{ConfigDiff.tsx,index.ts}`, `…/AgentEvalView/_components/CaseResultDrawer/{CaseResultDrawer.tsx,index.ts,styles.ts,CaseResultDrawer.test.tsx}`; modify `RunHistoryTable.tsx` (open a run → case list → drawer).
- Behaviour: `useEvalCompare`; metrics older → newer ▲/▼ pp (null "—"), cost old → new Δ, only-in-one-run notice listing case names, flipped cases (name + type + direction text), errored counts, `ConfigDiff` (prompt `DiffLine[]` as plain `<pre>` lines with +/− text markers, provider/model when different, skills added/removed/reordered by name); Promote → `useRestoreAgentVersion` with the newer run's version, confirms "now v<N>" (+ skipped skills, Q-4), disabled with accessible description when the newer run's version equals `agent.version` (AC-70); drawer: expectation (type, file, lines), kept findings with matched yes/no and title, dropped findings with reasons, pass/fail text + icon, errored case with message; rationale through `Markdown`.
- Skills to apply: frontend-ui-architecture; react-best-practices; react-testing-library; security (plain-text rendering)
- Depends on: S14
- Tests (single-agent mode): T-19, T-20
- Done when: AC-31…33, 39, 40, 41, 45, 59, 67, 70, 76 render; NFR-3/4/5.
- Verify: `cd client && pnpm typecheck && pnpm test`

### I1 (optional) Bulk "cases from decided findings" helper — S
- Files: create `server/src/db/seed-eval-cases.ts`; modify `server/package.json` (`db:seed:eval`). A CLI that builds an `EvalService` over `createDb` and calls `createFromFinding` for every accepted/dismissed finding of one agent not yet a case (AC-9 keeps it idempotent). Gets the user from "N decided findings" to ≥8 cases for VA-1 without 8 clicks; cases are still created from real findings. Depends on S7. Verify: `cd server && pnpm typecheck`.
### I2 (recommended) Strict Docker mode for the verification script — S
- `server/test/eval/*.it.test.ts` use a shared `describeDb` helper: with `EVAL_VERIFY_STRICT=1` and no Docker the suite FAILS instead of `describe.skip` (helpers/pg.ts pattern, `agents-versions.it.test.ts:13-19`); `verify:l06` sets the variable. Without it `pnpm verify:l06` can be green with all DB tests skipped. Depends on S7, S8.
### I3 (optional) Remove an agent's eval cases when the agent is deleted — S
- `eval_cases.owner_id` has no FK (polymorphic), so deleting an agent orphans its cases (suite runs cascade). Add `deleteByOwner` to `EvalRepository` and call it from `AgentsService.delete` through a container-wired hook. Behaviour not covered by the spec — decide with the spec author before doing it.

## Execution modes
Single-agent: one implementer runs S1 → S15 in order, writing each step's T-n inside the step (about 75 files; run K1/K2 after S3, K3 after S7, K6 after S8, K4/K5 after each client step).
Multi-agent (implementer instances only; no test-writer — each instance writes the T-n of its own steps). At most one instance per package per wave (shared typecheck/test state); no file appears in two groups; contract copies, `index.ts` files and `server/package.json` each belong to exactly one group.
| Wave | Instance | Steps | Owned files / area | Independent of |
|---|---|---|---|---|
| 1 | implementer #1 | S1, S2 | shared contracts (both copies), `db/schema/eval.ts`, `rows.ts`, migration 0015, `test/eval/contracts.test.ts` (~9 files) | — |
| 2 | implementer #1 | S3 | `modules/eval/{constants,types,helpers,scoring,compare}.ts` + 3 unit tests (8) | client wave 2 |
| 2 | implementer #2 | S9, S10 | `client/src/lib/hooks/eval.ts`, `hooks/index.ts`, `messages/en/{eval,prReview}.json`, `vendor/ui/nav.ts`, `nav.test.ts`, `FindingCard/**` (~11) | server wave 2 |
| 3 | implementer #1 | S4, S5 | `modules/eval/repository*` (4), `modules/agents/{repository,service,routes,helpers}.ts`, `agents-restore.it.test.ts` (~9) | client wave 3 |
| 3 | implementer #2 | S11 | `AgentEditor/**` (tab, EvalsTab, CaseRow), `components/eval-metric-tiles/**`, `lib/format.ts(+test)`, `messages/en/agents.json` (~14) | server wave 3 |
| 4 | implementer #1 | S6, S7, S8 | `modules/eval/{service,run-executor,routes}.ts`, `modules/index.ts`, `platform/container.ts`, `app.ts`, `server/package.json`, 4 it-tests + `scripted-llm.ts` (~14) | client wave 4 |
| 4 | implementer #2 | S12 | `EvalsTab/_components/CaseEditorModal/**`, `EvalsTab.tsx` (~8) | server wave 4 |
| 5 | implementer #2 | S13 | `app/eval/page.tsx`, `EvalDashboardView/**`, `AgentEvalRow/**` (~8) | — (server is done; I1/I2 may run as implementer #1) |
| 6 | implementer #2 | S14 | `app/eval/[agentId]/**`, `AgentEvalView/**` (~14) | — |
| 7 | implementer #2 | S15 | `CompareModal/**`, `CaseResultDrawer/**`, `RunHistoryTable.tsx` (~10) | — |
Client waves need S1 only (they mock `fetch`); end-to-end hands-on checks (H1–H12) need S7 + the client waves. Wave 1 must finish first (contracts and migration are shared by both chains).
Recommended: multi-agent — size and the server/client independence after wave 1; a single instance would carry ~75 files and 4 skill areas in one context. If the user prefers fewer moving parts, single-agent in the same order is equivalent (more wall-clock time).

## Cross-module contracts & sync points
- `@devdigest/shared` new file `contracts/eval-pipeline.ts` + `index.ts` — server canonical, client copy identical (S1; wave 1 only). Existing eval contracts untouched.
- HTTP surface (S7) ⇄ client hooks (S9): `POST /findings/:id/eval-case`; `GET|POST /agents/:id/eval-cases`; `GET|PUT|DELETE /eval-cases/:id`; `POST /eval-cases/:id/run`; `POST /agents/:id/eval-runs`; `GET /agents/:id/eval-runs`; `POST /eval/run-all`; `GET /eval/dashboard`; `GET /eval-runs/:id`; `GET /eval-runs/:id/cases/:caseRunId`; `GET /eval/compare`; `POST /agents/:id/versions/:version/restore` (S5). Error envelope `{error:{code,message,details}}` (`app.ts:160-165`): codes `agent_deleted`, `empty_set`, `missing_key`, `already_running`, `diff_unavailable`, `validation_error`; an oversized manual case arrives as HTTP 413 with Fastify's message (code `internal_error`, `app.ts:166-170`).
- Agent version snapshot ⇄ restore: the snapshot field list (`agents/repository.ts:281-291`) and `restoreVersion` must change together; `AgentVersionConfig` (`knowledge.ts:354-366`) mirrors it.
- DB: `eval_cases` (+created_at, source_finding_id), `eval_runs` (+suite_run_id, status…), `eval_suite_runs` (new) ⇄ repository ⇄ contracts.
- `AgentEditor` `TABS`/`VALID_TABS` ⇄ `AgentEditor.test.tsx` ⇄ `messages/en/agents.json`; `nav.ts` `eval` key ⇄ `activeKeyFor` (`helpers.ts:35`).
- Client expected-output validator (S12) mirrors `EvalExpectedOutput` (S1): change both together.

### Proposed edits (not steps — for the caller / doc-writer)
- `server/specs/review-flow.md:135-138` says the eval pipeline is "a later lesson" — update: eval runs call `reviewPullRequest` directly, never the intent classifier; scoring is code-only.
- `client/specs/pages.md:211-214` (Not here yet) and `:160-184` (Agents tabs: now Config, Skills, Context, Evals) — add Evals tab and `/eval` pages.
- `docs/eval-pipeline.md` (new, doc-writer): data model, scoring formulas, run lifecycle, promote semantics, size bound (global 1 MB body limit only), experiment recipe H12.
- `server/README.md` API map; `TESTING.md` suite map (`test/eval/`, `verify:l06`); `client/README.md` route map (`/eval`, `/eval/[agentId]`).
- Root `CLAUDE.md` "Do not touch": note that `client/src/vendor/ui/nav.ts` entries are the accepted exception (three features now rely on it).

## Test plan
- Existing suites to run: K2 + K3 (server regression: reviews, agents-versions, contracts), K5 (client: FindingCard, AgentEditor, nav tests are edited).
- T-1 scoring — unit — `server/test/eval/scoring.test.ts` — AC-21…26, 63, 68, 69, NFR-1 (S3)
- T-2 compare — unit — `…/compare.test.ts` — AC-31, 32, 33, 41, 45, 76 (S3)
- T-3 helpers — unit — `…/helpers.test.ts` — AC-8, AC-13 slice, AC-75 reasons (S3)
- T-4 contracts — unit — `…/contracts.test.ts` — AC-71, AC-72 (S1)
- T-5 restore — it — `…/agents-restore.it.test.ts` — AC-59, AC-70 (S5)
- T-6 case from finding — it — `…/cases-from-finding.it.test.ts` — AC-1, 2, 4(server), 7, 8, 9, 13, 65, 66; double-click race → one case; a large finding patch is stored without a size check (EC-14) (S7)
- T-7 manual cases — it — `…/cases-manual.it.test.ts` — AC-10 list/last result, 12, 51, 53, 71, 72, 75, name > 120 → 422, EC-14: body > 1 MB → 413 and nothing stored (S7)
- T-8 runs — it — `…/runs.it.test.ts` — AC-14 (no intent/repo-intel/specs; intent fake throws), 15–20, 26 (call count), 61 (status/progress), 67, 68, 76, NFR-2, NFR-7, VA-2 analogue (scripted LLM answers differently per system prompt → metrics differ in compare) (S7)
- T-9 dashboard/compare/restart — it — `…/dashboard-compare-restart.it.test.ts` — AC-28, 31–33, 35, 36, 44, 55, 74, EC-9 (case added/deleted between runs), EC-13 (agent edited during a run uses start config), disabled agent listed/skipped (S7)
- T-11 nav — unit — `client/src/components/app-shell/nav.test.ts` — AC-34 (S9)
- T-12 EvalCaseButton + FindingCard — component — AC-3…9, 66, 60 (S10)
- T-13 format — unit — `client/src/lib/format.test.ts` — AC-29, 63 (S11)
- T-14 EvalsTab + AgentEditor — component — AC-10…12, 17, 19, 27, 58, 60–62, NFR-3/5/6 (S11)
- T-15 expected-output — unit — AC-47, 48, 71 mirror (S12)
- T-16 CaseEditorModal — component — AC-46, 47, 49–54, 75 display, EC-14 (mocked 413 → API message shown), NFR-3 (S12)
- T-17 EvalDashboardView — component — AC-35, 36, 44 (S13)
- T-18 AgentEvalView + regression.ts — component/unit — AC-30, 37, 42, 43, 55, 56, 61, 62, 28, 45 (S14)
- T-19 CompareModal — component — AC-31–33, 41, 45, 59, 67, 70, 76 (S15)
- T-20 CaseResultDrawer — component — AC-39, 40, 67, NFR-3 (S15)
- T-10 (with I2) strict-Docker guard — only if I2 is taken.
- Edge cases → criteria: EC-1→AC-4; EC-2→AC-9; EC-3→AC-7; EC-4→AC-65; EC-5→AC-66; EC-6/7→AC-63 (T-1); EC-8→AC-20/67 (T-8); EC-9→AC-33/41 (T-2, T-9); EC-10→AC-19/44 (T-8, T-9); EC-11→AC-74 (T-9); EC-12→AC-62 (T-14, T-18); EC-13→AC-14/15 (T-9); EC-14→global 1 MB body limit, 413 for manual cases; no bound for finding cases (T-7, T-6, T-16; AC-73 removed); EC-15→AC-35/44 (T-9, T-17); EC-16→AC-76 (T-2); EC-17→AC-75 (T-7); EC-18→AC-70 (T-19); EC-19→AC-27/42 (T-14, T-18).
- Not tested: LLM output quality / the real experiment (VA-2, VA-3 are user activities, H12); browser-level pixel fidelity to designs (no e2e flow is planned — `e2e/` runs on seeded data without an LLM).

## Risks & open questions
- [non-blocking] Q-1…Q-6 and the execution-mode question (see Requirements review) — left open for the user at checkpoint A; each is planned with its recommended option; I1–I3 are optional.
- [non-blocking] A case from a finding is not size-bounded (EC-14), so a very large file patch is stored and sent to the model whole, as in a regular review; a manual case over 1 MB gets a 413 whose body has code `internal_error` (Fastify status forwarded), so the client must show the message and not branch on the code.
- [non-blocking] `server/package.json` is `skip-worktree` locally (TESTING.md:100-102): the S8 edit will not show in `git status`; the user must run `git update-index --no-skip-worktree server/package.json` before committing it (and CI invokes vitest directly, so it is unaffected).
- [non-blocking] Case diff comes from `loadDiff` (real `git diff base...head`, else `pr_files`) — if the PR head moved since the review, a finding's lines may not intersect the current patch; the case is still stored (Q-2) and its expectation will simply never match. Show the finding's `file:lines` in the confirmation so the user can spot it.
- [non-blocking] Agent version does not capture skill BODY edits (skill versions are separate) — two runs of "v7" can differ if a skill body changed between them; Compare's skill diff shows ids/names only.
- [non-blocking] Model non-determinism makes VA-2/VA-3 deltas noisy; the pipeline does not retry or average (spec has no such requirement).
- [non-blocking] Rate limit/concurrency constants (10/min, 5/min, p-queue 3) are implementation choices, not spec bounds.

## Self-check
1 pass · 2 pass · 3 pass · 4 fixed: no test-writer exists, so T-n are owned by the implementer of the step in both modes (stated in Execution modes) · 5 pass: client and server groups use disjoint packages and files, one instance per package per wave · 6 pass · 7 pass: Q-1…Q-6 and I-n choices keep to spec behaviour; the extra server guard for an undecided finding only mirrors AC-4; suggestions are listed under review · 8 fixed: Status is ready — no blocking R-n or blocking open question after SPEC-06 (AC-73 removed; no size check planned) · 9 pass: all `path:line` citations were read in this run; the lessons come from server/, client/ and root logs only (reviewer-core INSIGHTS not read: reviewer-core is not changed) · 10 pass: only `specs/eval-pipeline/plan.md` is written; Q-mode is in the reply.

## Out of scope for the implementer
Architecture and security review are done by separate agents. Requirements are fixed by the spec or task; a needed change goes back to the user, not into the code.

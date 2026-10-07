# Spec: Eval pipeline — regression harness for review agents
Spec ID: SPEC-05
Status: approved
Supersedes: —

## Problem and user
A DevDigest user who tunes a review agent (edits its system prompt, switches its model, links or
reorders a skill) today has no way to tell whether the change made the agent better or worse. The
only signal is reading new reviews by eye, PR by PR. The data needed to measure it already exists:
every finding the user accepted ("this is a real issue") or dismissed ("this is noise") is a
labelled example. Without a harness, a prompt regression ships silently and is noticed only when
reviews get noisier or miss issues on real PRs.

## Goals / Non-goals
Goals:
- G-1 Turn a decided finding into a regression case in one click: accepted → "must find X at
  file:line", dismissed → "must not flag Y at file:line".
- G-2 Run an agent on every case of its set with fixed inputs, so runs of different agent versions
  are comparable.
- G-3 Score each run in code only — no LLM call — as recall, precision and citation accuracy.
- G-4 Show an agent's run history and compare two runs side by side ("old prompt vs new"), down to
  the individual case that changed.
- G-5 Give one Eval Dashboard page (sidebar, SKILLS LAB) with the latest eval results of all agents
  and a per-agent view.
Non-goals:
- NG-1 Eval cases owned by a skill (`owner_kind = skill`); only agent-owned cases are in scope.
- NG-2 Any LLM-based grading (LLM-as-judge) of agent output.
- NG-5 Running evals automatically on a schedule or in CI (the per-case "Run on save" toggle is
  covered by AC-52).
- NG-6 Scoring on severity, category or title — a match is file + line overlap only (AC-69).
- NG-3 The "Learn" and "Reply to author" finding actions shown in the FindingCard design — not shown;
  a separate spec.
- NG-4 The "Stats" and "CI" tabs shown in the AgentEditor design — not shown; a separate spec.

## User stories
- US-1 As an agent author, I want to turn an accepted finding into a "must find" case with one
  click, so that the agent keeps catching that issue after I change it.
- US-2 As an agent author, I want to turn a dismissed finding into a "must not flag" case with one
  click, so that noise I already rejected does not come back.
- US-3 As an agent author, I want to see, create, edit and delete the eval cases of an agent, so that
  I control what its set covers.
- US-4 As an agent author, I want to run the agent on all its cases and see recall, precision and
  citation accuracy, so that I can tell in numbers whether my change helped.
- US-5 As an agent author, I want to compare two runs side by side, including which cases flipped, so
  that I can see which configuration change moved which expectation.
- US-6 As a workspace user, I want one dashboard with the latest eval results of every agent, so
  that I can spot a regressed agent without opening each one.
- US-7 As an agent author, I want to read what the agent actually returned for a case, so that I can
  tell whether a metric change comes from the agent, the case or the scoring.

## Acceptance criteria (EARS)

### Creating cases from findings
- AC-1 (Event-driven): WHEN the user activates "Turn into eval case" on an accepted finding, the API
  SHALL create one eval case owned by the agent that produced the finding, with expectation type
  `must_find`, the finding's file, start line and end line, and the case input defined in AC-13.
  [covers US-1]
- AC-2 (Event-driven): WHEN the user activates "Turn into eval case" on a dismissed finding, the API
  SHALL create one eval case owned by the agent that produced the finding, with expectation type
  `must_not_flag`, the finding's file, start line and end line, and the case input defined in
  AC-13. [covers US-2]
- AC-3 (Ubiquitous): The finding card SHALL create the case on a single activation of the button,
  without opening a dialog or form. [covers US-1, US-2]
- AC-4 (State-driven): WHILE a finding is neither accepted nor dismissed, the finding card SHALL keep
  the "Turn into eval case" button disabled, with an accessible description stating that the finding
  must be accepted or dismissed first. [covers EC-1]
- AC-5 (Event-driven): WHEN the API has created the case, the finding card SHALL show a confirmation
  naming the case, and the confirmation SHALL be announced to assistive technology.
- AC-6 (Unwanted behaviour): IF case creation fails, THEN the finding card SHALL show the error
  message returned by the API and keep the button available for another attempt.
- AC-7 (Unwanted behaviour): IF the agent that produced the finding no longer exists, THEN the API
  SHALL reject the request with an error stating that the agent was deleted and SHALL create no case.
  [covers EC-3]
- AC-8 (Ubiquitous): The API SHALL name a case created from a finding with the slug of the finding's
  title (lower-case, words joined by `-`), adding the suffix `-2`, `-3`, … when the agent already owns
  a case with that name.
- AC-9 (Unwanted behaviour): IF a case already exists for the same finding, THEN the API SHALL create
  no new case and SHALL return the existing case, and the finding card SHALL state that the finding is
  already an eval case, naming that case. [covers EC-2]
- AC-65 (Event-driven): WHEN the decision on a finding changes after a case was created from it, the
  API SHALL leave that case's expectation type unchanged. [covers EC-4]
- AC-66 (Ubiquitous): The finding card SHALL offer "Turn into eval case" for accepted or dismissed
  findings of every kind, including `secret_leak`, `lethal_trifecta`, `phantom` and `hook`.
  [covers EC-5]

### Case set
- AC-10 (Ubiquitous): The Evals tab of the agent editor SHALL list every eval case owned by the
  agent, each with its name, expectation type (`must_find` / `must_not_flag`), `file:start–end`, and
  the result of its latest scored execution (passed, failed, or "never run"). [covers US-3]
- AC-11 (State-driven): WHILE the agent has no eval cases, the Evals tab SHALL show an empty state
  explaining that cases are created from accepted or dismissed findings with "Turn into eval case" or
  with "New eval case".
- AC-12 (Event-driven): WHEN the user confirms deletion of a case in a confirmation dialog, the API
  SHALL remove the case, and the Evals tab SHALL no longer list it. [covers US-3]

### Fixed inputs
- AC-13 (Ubiquitous): WHEN a case is created from a finding, the API SHALL store as the case's input
  the complete patch of the finding's file from that PR's diff (new-side line numbers preserved)
  and a snapshot of the PR's title and body. [covers G-2]
- AC-14 (Ubiquitous): During an eval run, the API SHALL review each case using only the case's stored
  input and the agent's configuration at run start (provider, model, system prompt, strategy, and its
  enabled linked skills in link order); it SHALL NOT add repo-intel context, project-context
  documents, a PR intent or memory. [covers G-2]

### Running the set
- AC-15 (Event-driven): WHEN the user starts an eval run for an agent, the API
  (`POST /agents/:id/eval-runs`) SHALL create one run record holding the agent and the agent version
  used, and SHALL run the agent once on every eval case the agent owns at that moment. [covers US-4]
- AC-16 (Event-driven): WHEN the API accepts an eval run request, it SHALL respond with the run's id
  before calling any model and SHALL execute the cases in the background.
- AC-17 (Unwanted behaviour): IF the agent owns no eval cases, THEN the API SHALL reject the run with
  an error stating that the set is empty, and the run button SHALL be disabled with that reason shown.
- AC-18 (Unwanted behaviour): IF the agent's provider key is not configured, THEN the API SHALL reject
  the run before calling any model, with an error naming the missing key.
- AC-19 (State-driven): WHILE an eval run of an agent is in progress, the API SHALL reject a new run
  request for the same agent with an error stating that a run is already in progress, and the run
  button SHALL be disabled. [covers EC-10]
- AC-20 (Unwanted behaviour): IF the agent call for one case fails, THEN the API SHALL mark that case
  "error" with the error message, exclude it from every metric and from passed/total, and continue
  with the remaining cases. [covers EC-8]
- AC-67 (Ubiquitous): The run history, the run's case results and the compare view SHALL show the
  number of cases in "error" for each run, and the case results SHALL show each errored case with its
  error message.
- AC-61 (State-driven): WHILE an eval run is in progress, the Evals tab and the agent's dashboard view
  SHALL show the run as running with the number of completed cases out of the total.
- AC-62 (Event-driven): WHEN the user opens the Evals tab or the agent's dashboard view while a run of
  that agent is in progress, the studio SHALL show that run's current progress. [covers EC-12]

### Scoring (code only)
- AC-21 (Ubiquitous): The scorer SHALL count an agent finding as matching an expectation when the
  file paths are equal and the finding's line range intersects the expectation's line range
  (inclusive bounds; a reversed range is normalised first). Findings are matched only against the
  expectations of the case they were produced for.
- AC-22 (Ubiquitous): The scorer SHALL compute a run's recall as the total number of `must_find`
  expectations matched by at least one finding, divided by the total number of `must_find`
  expectations across all scored cases of the run.
- AC-23 (Ubiquitous): The scorer SHALL compute a run's precision as 1 − (findings matching a
  `must_not_flag` expectation ÷ all findings), both totalled across all scored cases of the run,
  where "findings" are the findings that passed the grounding gate.
- AC-24 (Ubiquitous): The scorer SHALL compute a run's citation accuracy as the total number of
  findings that passed the grounding gate, divided by the total number of findings the model returned
  before the gate, across all scored cases of the run.
- AC-63 (Unwanted behaviour): IF a metric's denominator is 0 for a run, THEN the scorer SHALL record
  the metric as having no value, and the studio SHALL display it as "—". [covers EC-6, EC-7]
- AC-25 (Ubiquitous): The scorer SHALL mark a case passed when every `must_find` expectation of the
  case is matched by at least one finding and no finding matches any `must_not_flag` expectation of
  the case; findings that match no expectation SHALL NOT affect the outcome.
- AC-68 (Ubiquitous): The scorer SHALL report, for each run, the number of passed cases out of the
  scored (non-error) cases.
- AC-69 (Ubiquitous): The scorer SHALL ignore an expectation's optional title, severity and category.
- AC-26 (Ubiquitous): The scorer SHALL compute every metric without invoking any LLM provider.
  [covers G-3]

### Results and history
- AC-27 (Event-driven): WHEN an eval run completes, the Evals tab SHALL show the run's recall,
  precision, citation accuracy and passed/total cases, each metric with its signed change in
  percentage points against the previous completed run of the same agent. [covers US-4]
- AC-28 (Ubiquitous): The agent's run history SHALL list its eval runs newest first, each with start
  time, agent version, recall, precision, citation accuracy, passed/total cases and cost.
- AC-29 (Ubiquitous): The studio SHALL display metrics as whole percentages and SHALL display a
  metric that has no value as "—", never as 0 %.
- AC-64 (Ubiquitous): The studio SHALL describe an agent's set as its eval cases with their count
  (for example "12 eval cases"), not as a "gold set" or "traces".

### Reading a case result (accepted P-1)
- AC-39 (Event-driven): WHEN the user opens a case's result within a run, the studio SHALL show the
  case's expectation (type, file, line range), every finding the agent returned that passed grounding
  with its file, line range, title and whether it matched the expectation, and the case's pass/fail
  outcome. [covers US-7]
- AC-40 (Event-driven): WHEN the user opens a case's result within a run, the studio SHALL list the
  findings that the grounding gate dropped for that case, each with its drop reason. [covers US-7]

### Comparing two runs
- AC-30 (State-driven): WHILE fewer or more than two runs are selected in a run history, the Compare
  button SHALL be disabled.
- AC-31 (Event-driven): WHEN the user compares two runs of the same agent, the compare view SHALL show,
  for recall, precision and citation accuracy, the older value, the newer value and the signed
  difference in percentage points. [covers US-5]
- AC-32 (Event-driven): WHEN the user compares two runs, the compare view SHALL show the difference
  between the two agent configurations: a line diff of the system prompt, the provider and model of
  each run when they differ, and the linked skills added, removed or reordered.
- AC-33 (Unwanted behaviour): IF the two compared runs did not score the same set of cases, THEN the
  compare view SHALL show a notice listing the cases present in only one of the runs, and SHALL compute
  the metric values, deltas and flipped cases over the cases scored in both runs. [covers EC-9]
- AC-41 (Event-driven): WHEN the user compares two runs, the compare view SHALL list every case whose
  outcome differs between them (passed → failed, failed → passed), each with its name and
  expectation type. [covers US-5; accepted P-2]
- AC-59 (Event-driven): WHEN the user activates "Promote" in the compare view, the API SHALL make the
  configuration of the agent version used by the newer of the two runs the agent's current
  configuration, saved as a new agent version, and the compare view SHALL confirm the new version
  number.
- AC-70 (State-driven): WHILE the newer compared run used the agent's current version, the compare
  view SHALL keep "Promote" disabled with an accessible description stating that this version is
  already current. [covers EC-18]

### Cost (accepted P-6)
- AC-45 (Ubiquitous): The run history and the compare view SHALL show each run's cost as the sum of
  its cases' model costs, the compare view with the older value, the newer value and the signed
  difference.
- AC-76 (Unwanted behaviour): IF the cost of any scored case of a run is unknown, THEN the API SHALL
  record the run's cost as unknown, and the studio SHALL display it as "—", never as $0.
  [covers EC-16]

### Manual case editor (design 6)
- AC-46 (Event-driven): WHEN the user activates "New eval case" in the Evals tab, the studio SHALL open
  the case editor with a required Name, an Input section with the tabs Diff, Files and PR meta, an
  Expected output editor, a "Run on save" toggle, and the actions Cancel, Run case and Save.
  [covers US-3]
- AC-71 (Ubiquitous): The API SHALL accept as a case's expected output a non-empty list of
  expectations, each with `type` (`must_find` or `must_not_flag`), `file`, `start_line` and
  `end_line`, and optional `title`, `severity` and `category` kept as notes.
- AC-47 (State-driven): WHILE the Expected output text is not valid JSON or does not match the
  expected-output shape of AC-71, the case editor SHALL show "invalid JSON" with the reason and SHALL
  disable Save and Run case.
- AC-48 (Event-driven): WHEN the user activates "Finding skeleton", the case editor SHALL append one
  expectation with every AC-71 field present and empty values to the end of the list.
- AC-49 (Unwanted behaviour): IF Name is empty, THEN the case editor SHALL mark the field as required
  and SHALL disable Save.
- AC-50 (Event-driven): WHEN the user activates Edit on a case, the studio SHALL open the case editor
  filled with that case's stored name, input and expectations, with Name and Expected output editable
  and the Diff and PR meta inputs read-only.
- AC-72 (Ubiquitous): The API SHALL reject any change to an existing case's stored input.
- AC-51 (Event-driven): WHEN the user activates "Run case" (in the editor or on a case row), the API
  SHALL run the agent's current configuration on that single case, update only the case's latest
  outcome (AC-53), and create no run in the run history, the metrics or the dashboard.
- AC-52 (State-driven): WHERE "Run on save" is on, WHEN the user saves the case, the studio SHALL run
  that case as in AC-51 after the save succeeds.
- AC-53 (Ubiquitous): The case editor SHALL show the case's latest scored outcome as "Last run passed"
  or "Last run failed" with the number of expected and returned findings, the duration and the cost,
  or nothing when the case was never run.
- AC-54 (Ubiquitous): The Files tab of the case editor SHALL show, read-only, the paths of the files
  contained in the case's diff, and SHALL add nothing to the agent's input.
- AC-73 (Unwanted behaviour): IF a case's diff exceeds the diff size limit that regular reviews apply,
  THEN the API SHALL reject the case's creation with an error stating the limit, and SHALL store
  nothing. [covers EC-14]
- AC-75 (Unwanted behaviour): IF an expectation names a file that is not in the case's diff, or a line
  range that intersects no hunk of that file, THEN the API SHALL reject the save with the reason, and
  the case editor SHALL show the reason and keep Save disabled until it is fixed. [covers EC-17]

### Eval Dashboard
- AC-34 (Ubiquitous): The sidebar SHALL show an "Eval Dashboard" item in the SKILLS LAB section that
  opens the Eval Dashboard page and is highlighted while that page or an agent's dashboard view is
  open. [covers US-6]
- AC-35 (Ubiquitous): The Eval Dashboard page SHALL list every agent of the workspace, including
  disabled agents and agents never run, each with its name, model, latest run's recall, precision,
  citation accuracy, passed/total cases, agent version, run time and a sparkline of recall over its
  recent runs, or "never run". [covers EC-15]
- AC-36 (Ubiquitous): The Eval Dashboard page SHALL list the 10 most recent eval runs of all agents,
  newest first, each with agent name, run time, agent version, the three metrics and passed/total
  cases.
- AC-37 (Event-driven): WHEN the user selects an agent on the Eval Dashboard, the studio SHALL open that
  agent's dashboard view with its metric tiles (AC-27), run history (AC-28), Compare (AC-30, AC-31) and
  a "Run eval" button, and an "All agents" link back to the dashboard.
- AC-58 (Event-driven): WHEN the user activates "View full dashboard" in the Evals tab, the studio
  SHALL open that agent's dashboard view.
- AC-56 (Event-driven): WHEN the user picks another agent in the agent switcher of an agent's dashboard
  view, the studio SHALL show that agent's dashboard view.
- AC-55 (Ubiquitous): The agent's dashboard view SHALL offer a period filter that limits the trend
  chart and the run history to runs started within the chosen period
  — 7 days, 30 days, 90 days or all — with 30 days selected when the view opens.
- AC-43 (Ubiquitous): The agent's dashboard view SHALL show a trend chart of recall, precision and
  citation accuracy per completed run in chronological order, with a legend and a value scale.
  [accepted P-4]
- AC-42 (Event-driven): WHEN the latest completed run of an agent has a lower recall, precision or
  citation accuracy than the previous completed run by at least 1 percentage point, the agent's
  dashboard view SHALL show a warning banner naming each lowered metric with its drop in percentage
  points and the cases that went from passed to failed. [accepted P-3]
- AC-44 (Event-driven): WHEN the user activates "Run all agents" on the Eval Dashboard, the API SHALL
  start one eval run for each enabled agent that owns at least one case and has no run in progress, and the dashboard SHALL show each started run's progress.
  [accepted P-5]

### Other design elements
- AC-60 (Ubiquitous): The agent editor SHALL NOT show Stats or CI tabs, and the finding card SHALL NOT
  show Learn or Reply to author buttons. [NG-3, NG-4]

### Restart
- AC-74 (Event-driven): WHEN the API starts, it SHALL mark every eval run left in progress by a
  previous process as failed with a reason stating that the API restarted. [covers EC-11]

### Verification
- AC-38 (Ubiquitous): The server package SHALL provide a `pnpm verify:l06` script that runs the server
  typecheck, the scoring unit tests and the eval integration tests with a mocked LLM provider, and
  exits non-zero when any of them fails.

### Verification activities (run after implementation; not product behaviour)
- VA-1 The user's set for the agent under test holds at least 8 cases created from real findings, with
  at least one `must_find` and one `must_not_flag` case.
- VA-2 Two runs that differ only in the agent's system prompt show a non-zero change in recall or
  precision in the compare view.
- VA-3 A run after a deliberately degraded system prompt shows lower precision than the baseline run.
- VA-4 `pnpm verify:l06` in `server/` passes (AC-38).

## Edge cases
- EC-1 Finding not yet accepted or dismissed → AC-4
- EC-2 The same finding turned into a case twice (double click, or later again) → AC-9
- EC-3 The finding's agent was deleted → AC-7
- EC-4 The finding's decision changes after the case was created (accepted → dismissed) → AC-65
- EC-5 Full-file finding kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) as cases → AC-66
- EC-6 The model returns no findings for any case → AC-63
- EC-7 A set with only `must_not_flag` cases (recall has no denominator) → AC-63
- EC-8 A case's agent call fails or times out mid-run → AC-20, AC-67; every case errored → AC-63
- EC-9 A case was added or deleted between two compared runs → AC-33; a case's expectations were edited
  between runs → each run keeps the outcome scored at its time, AC-41 lists the flip
- EC-10 Run started again while one is in progress (double click, second tab, "Run all agents") →
  AC-19, AC-44
- EC-11 The API restarts while an eval run is in progress → AC-74
- EC-12 The user leaves the page during a run and comes back → AC-62
- EC-13 Agent edited (new version) while its eval run is in progress → AC-14, AC-15
- EC-14 Very large diff fragment or manually pasted diff → AC-73
- EC-15 Agent disabled (`enabled = false`) → listed on the dashboard (AC-35), skipped by "Run all
  agents" (AC-44)
- EC-16 Model is unpriced → AC-76
- EC-17 Expected output in the editor names a file or lines not in the case's diff → AC-75
- EC-18 Promote on a run whose version equals the agent's current version → AC-70
- EC-19 Only one completed run exists (no previous run for deltas or banner) → AC-27, AC-42: no delta
  and no banner are shown.

## Non-functional requirements
- NFR-1 (reliability): The scorer SHALL produce identical metrics when given the same findings and the
  same cases, on every invocation.
- NFR-2 (security): The API SHALL pass a case's stored diff and PR text to the agent only as untrusted
  content, through the same prompt-injection protection that regular reviews use.
- NFR-3 (security): The studio SHALL render stored diff text, PR text, expected-output JSON and model
  output as plain text (rationale through the existing safe markdown renderer), never as raw HTML.
- NFR-4 (accessibility): Every eval control (Turn into eval case, Run, Run case, Run all agents,
  row-selection checkboxes, Compare, Promote, period filter, agent switcher, icon-only per-case Run /
  Edit / Delete) SHALL be reachable and operable by keyboard and SHALL have an accessible name.
- NFR-5 (accessibility): The studio SHALL convey a metric's direction of change and a case's
  pass/fail state with a sign, arrow, icon or text in addition to colour.
- NFR-6 (accessibility): WHEN an eval run finishes or fails, the studio SHALL announce the outcome to
  assistive technology.
- NFR-7 (observability): For every case in a run, the API SHALL keep the agent's findings, the
  findings dropped by the grounding gate with their reasons, and the per-case match result, readable
  after the run (AC-39, AC-40).
- NFR-8 (reliability): `pnpm verify:l06` SHALL make no network call to any LLM provider.

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| Finding (file, lines, decision, agent) | `findings` / `reviews` rows | DevDigest (model output, user decision) | model text untrusted; decision trusted |
| Diff fragment (whole patch of the finding's file) | PR diff as stored for the review | PR author | untrusted |
| PR title / body snapshot | `pull_requests` row at case creation | PR author | untrusted |
| Manually entered diff, PR meta, expected output | case editor | workspace user | untrusted content (diff/PR text), validated shape (expected output) |
| Agent configuration and version | `agents`, `agent_versions`, linked skills | workspace user | trusted (skills are instructions by design) |
| Agent output during a run | LLM provider | model | untrusted |
| Metrics, pass/fail | scorer (code) | DevDigest | trusted |

## Untrusted inputs
- Diff fragment and manually pasted diff — treated as data; passed to the model only through the
  engine's untrusted wrapper; rendered as text; size bounded by the review's diff limit (AC-73); never executed or followed as
  instructions.
- PR title / body — same rules as the diff.
- Expected output JSON — parsed and validated against the expected-output contract (AC-71) before
  saving; rejected with the reason when invalid; never evaluated as code.
- Model output (findings, rationale) — validated against the shared `Finding` contract before scoring;
  rendered with the existing safe renderer; never followed as instructions.
- Case name — validated non-empty and length-bounded, rendered as text.

## Open questions
None. All questions Q-1..Q-28 are answered; see the Decisions log in design-review.md.

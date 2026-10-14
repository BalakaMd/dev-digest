# Spec: Export to CI
Spec ID: SPEC-09
Status: approved
Supersedes: —

Designs: specs/export-to-ci/designs/01-wizard-target.png, 02-agent-ci-tab.png, 03-wizard-preview.png,
04-wizard-configure.png, 05-wizard-install.png (visual reference; where they differ from this spec,
this spec wins — see design-review.md).

## Problem and user
An agent author tunes a review agent in the studio (model, system prompt, linked skills, gate
policy), but the agent only runs on that author's machine, on demand. The team cannot rely on it
for every pull request, and nobody else sees what it found. Today the only way to get the same agent
into CI is to copy its configuration by hand into another repository, with no guarantee that the
copy matches the studio and no way to see the CI results back in the studio. Export to CI
serializes the agent into a versioned manifest in the target repository, installs a GitHub Actions
workflow that runs the bundled agent-runner on pull requests, and brings each CI run back into the
studio as a run with `source='ci'`.

## Goals / Non-goals
Goals:
- G-1 From the agent's CI tab, the author installs the agent into an imported repository's GitHub
  Actions through a four-step Export Wizard (Target → Preview → Configure → Install), always through
  a pull request from the branch `devdigest/ci`, or downloads the same files as a zip.
- G-2 The studio and the agent-runner validate the agent manifest with one and the same schema, so
  the configuration that runs in CI is the configuration the author exported.
- G-3 The generated workflow is safe by construction: least-privilege permissions, secrets only from
  GitHub Secrets, no comment-triggered runs, no reliance on an unpublished marketplace action, no
  secret in any exported file.
- G-4 CI runs come back into the studio only by the studio pulling workflow runs and their result
  artifacts from GitHub Actions, and are listed on a global CI Runs page and on the agent's CI tab,
  each with enough trace data (manifest version, model, dependencies, commit SHA) to explain why two
  runs of one manifest differ.

Non-goals:
- NG-1 Changes to the multi-run review service, the local review executor or the PR feed. CI runs
  are not linked to imported PR pages and do not appear in a PR's run history.
- NG-2 Byte-identical results between a local run and a CI run. The same manifest guarantees the
  same configuration only; model output and CI tool versions can differ, which is why the trace
  records them (AC-51).
- NG-3 Publishing `devdigest/review-action` or any other marketplace action. `uses:
  devdigest/review-action@v1` from the mock-up stays a placeholder and is never generated.
- NG-4 Merging the export PR, configuring branch protection or creating repository secrets on the
  user's behalf. These stay manual steps that the wizard explains (AC-71).
- NG-5 A GitHub App, an inbound GitHub webhook receiver, or any API endpoint through which CI pushes
  results into the studio (Q-1).
- NG-6 Shipping the agent's project context documents (SPEC-01) or repo-intel context into CI. The
  manifest carries model, system prompt, skills and parameters only; the wizard says so (AC-70).
- NG-7 Real memory content. `.devdigest/memory.jsonl` ships empty; the runner does not read it.
- NG-8 The agent "Stats" tab and the sidebar items "Memory", "Multi-Agent Review" and "Agent
  Performance" shown in the mock-ups.
- NG-9 Changing any reviewer-core invariant: the grounding gate stays mandatory, untrusted input
  stays wrapped with the injection guard, and the verdict stays computed from findings and the gate
  policy, never from the model's self-report.
- NG-10 Generators for CircleCI, Jenkins and Generic CLI; their cards are shown disabled (Q-3).
- NG-11 CI for agents whose provider is not OpenRouter (Q-7).
- NG-12 Reviewing changes to files under `.github/workflows/` in CI: the agent-runner keeps leaving
  that whole folder out of the reviewed diff, so a pull request that changes any workflow file gets
  no finding on those files (Q-21; known limitation).
- NG-13 A failure reason or error category for a failed CI run in the studio; a failed run is shown
  from the workflow run's conclusion only, with the job link (Q-11).
- NG-14 The single workflow file name `.github/workflows/devdigest-review.yml` from the feature
  description: each agent gets its own `devdigest-review-<agent-slug>.yml` so that several agents can
  live in one repository (Q-5, Q-25; deliberate deviation).

## User stories
- US-1 As an agent author, I want to install my tuned agent into a repository's GitHub Actions from
  the agent page, so that it reviews every pull request without me.
- US-2 As an agent author, I want to see and adjust every file before it lands, so that I know
  exactly what the repository will run.
- US-3 As a repository maintainer, I want the installation to arrive as a pull request from
  `devdigest/ci`, so that the configuration that reviews our code is itself reviewed.
- US-4 As a team lead, I want to choose when CI fails ("Fail CI on"), so that a required status check
  can block merges on serious findings.
- US-5 As an agent author, I want CI runs to appear in the studio with verdict, findings, cost,
  duration, a job link and their trace data, so that I can follow the agent's work in one place and
  explain differences between runs.

## Acceptance criteria (EARS)

### Entry points and wizard frame
- AC-1 (Event-driven): WHEN the user activates "Add to CI" or the "Add repository" row on the agent's
  CI tab, the agent page SHALL open the "Export to CI" dialog with the subtitle "Run <agent name>
  automatically on pull requests" and a stepper "Target → Preview → Configure → Install" with
  Target as the current step.   [covers US-1]
- AC-2 (Ubiquitous): The wizard's stepper SHALL mark completed steps with a check, the current step
  as current, and later steps as not yet reached, using text and an icon in addition to colour.
   [covers US-1, NFR-3]
- AC-3 (Event-driven): WHEN the user activates "Back", the wizard SHALL return to the previous step
  with every choice and every edit of the earlier steps kept.   [covers US-2]
- AC-4 (Event-driven): WHEN the user closes the wizard before Install completes and confirms when
  AC-72 asks, the wizard SHALL discard its state and SHALL NOT create a branch, a pull request, an
  installation or a file.   [covers EC-12]
- AC-72 (Event-driven): WHEN the user closes the wizard (close button or Escape) after editing the
  workflow file, the wizard SHALL ask "Discard your workflow edits?" with "Discard" and "Keep
  editing", and "Keep editing" SHALL return to the wizard unchanged.   [covers EC-12; P-6]

### Step 1 — Target
- AC-5 (Ubiquitous): The Target step SHALL show "GitHub Actions" with the badge "recommended" and the
  text "Runs on pull_request events", selected by default.   [covers US-1]
- AC-6 (Ubiquitous): The Target step SHALL show "CircleCI", "Jenkins" and "Generic CLI" as disabled,
  non-selectable cards labelled "Coming soon", each with that label as its accessible description.
   [covers EC-1; Q-3]
- AC-7 (Ubiquitous): The Target step SHALL offer a repository picker listing the workspace's imported
  repositories as owner/name, with the active repository preselected, and repositories where this
  agent is already installed marked "installed".   [covers EC-2; Q-2]
- AC-66 (Unwanted behaviour): IF the workspace has no imported repository, THEN the Target step SHALL
  show the picker empty with a link to import a repository and keep "Continue" disabled with that
  reason.   [covers EC-2]
- AC-8 (State-driven): WHILE the agent's provider is not `openrouter`, the CI tab SHALL show "Add to
  CI", "Add repository" and "Update CI config" disabled with the reason "CI runs use OpenRouter.
  Switch this agent's provider to OpenRouter in Config to export." and a link to the Config tab, and
  the API SHALL reject an export request for that agent with 422.   [covers EC-3; Q-7]

### Step 2 — Preview
- AC-9 (Event-driven): WHEN the Preview step opens, the wizard SHALL list under "FILES TO CREATE"
  every file that Install would commit or put into the zip, and no other file: the manifest
  `.devdigest/agents/<agent-slug>.yaml`, one `.devdigest/skills/<skill-slug>.md` per linked skill in
  the agent's skill order, an empty (0-byte) `.devdigest/memory.jsonl`, the bundled agent-runner, and
  the agent's workflow file (AC-76).   [covers US-2, EC-4, EC-5, NG-7]
- AC-10 (Event-driven): WHEN the user selects a file in the list, the Preview step SHALL show its path
  and its contents in the editor pane — the runner bundle as read-only with its size and without
  rendering its contents [Q-15] — and SHALL mark only the workflow file "editable" and editable,
  every other file read-only.   [covers US-2; P-5]
- AC-11 (withdrawn — merged into AC-10)
- AC-12 (Ubiquitous): The manifest SHALL be built from the agent's last saved version and SHALL carry
  its name, provider, model, system prompt, linked skill slugs in skill order, strategy, Fail CI on
  value and the agent version number.   [covers G-2, EC-6; Q-6]
- AC-13 (Ubiquitous): The API SHALL validate the manifest it generates against the shared agent
  manifest schema — the same schema the agent-runner uses — before returning it to the Preview step,
  and SHALL return an error instead of files when validation fails.   [covers G-2]
- AC-14 (Ubiquitous): The agent slug and every skill slug SHALL match `^[a-z0-9][a-z0-9-]*$`, two
  skills whose names produce the same slug SHALL get distinct slugs, and the agent slug of an
  installation SHALL stay the one used at its first export even after the agent is renamed [Q-18].
   [covers EC-7, EC-32]
- AC-15 (withdrawn — merged into AC-9)
- AC-70 (Ubiquitous): The Preview step SHALL show the note "Not carried into CI: project context
  documents (N), repo intel", with N the number of context documents attached to the agent.
   [covers NG-6; P-3]

### Step 3 — Configure
- AC-24 (Ubiquitous): The Configure step SHALL show the triggers `pull_request:opened` and
  `pull_request:synchronize` selected by default and `pull_request:reopened` not selected, each as a
  toggle button whose pressed state is exposed to assistive technology.   [covers US-1]
- AC-25 (Unwanted behaviour): IF the user deselects every trigger, THEN the Configure step SHALL keep
  "Continue" disabled with the reason "Select at least one trigger" [Q-16].   [covers EC-13]
- AC-26 (Ubiquitous): The Configure step SHALL list "Secrets expected": `OPENROUTER_API_KEY` ("Your
  OpenRouter key") with the status "set" or "not set" according to whether a secret of that name
  exists among the target repository's Actions secret names, or "unknown" when the studio's GitHub
  token is not permitted to read those names; and `GITHUB_TOKEN` ("Auto-provided by Actions") with
  the status "ready"; followed by "Add these to your repo's Actions secrets before the workflow
  runs." The API SHALL read secret names only, never values.   [covers EC-14, EC-39; Q-10, P-5]
- AC-27 (Ubiquitous): The Configure step SHALL offer "Post results as" as a radio group with "GitHub
  review" (badge "recommended", selected by default), "PR comment" and "None (exit code only)".
   [covers US-1]
- AC-28 (Ubiquitous): The Configure step SHALL show the note that merges are blocked by setting "Fail
  CI on" on the CI tab and adding a required status check in the repository's branch protection.
   [covers US-4]
- AC-16 (Event-driven): WHEN the user leaves the Configure step with triggers or "Post results as"
  different from those the workflow file was generated with, the wizard SHALL regenerate the
  workflow file if it has no user edits, and otherwise SHALL ask "Replace your workflow edits?" with
  "Replace edits" (regenerate) and "Keep my edits" (file unchanged).   [covers EC-8; Q-4]
- AC-67 (State-driven): WHILE the user has kept workflow edits over changed Configure choices, the
  Install step SHALL state that the Configure choices are not applied to the workflow file.
   [covers EC-8; Q-4]

### Generated workflow
- AC-76 (Ubiquitous): Each exported agent SHALL get its own workflow file
  `.github/workflows/devdigest-review-<agent-slug>.yml`, so that installing a second agent in a
  repository leaves the first agent's workflow and manifest in place.   [covers EC-29; Q-5, Q-25, NG-14]
- AC-17 (Ubiquitous): The generated workflow SHALL trigger only on the `pull_request` event with the
  activity types selected in Configure, and SHALL NOT contain `pull_request_target`,
  `issue_comment`, `pull_request_review_comment`, `workflow_run` or any other trigger.
   [covers G-3, EC-9]
- AC-18 (Ubiquitous): The generated workflow SHALL declare the permissions `contents: read` and
  `pull-requests: write` and no other permission.   [covers G-3]
- AC-19 (Ubiquitous): The generated workflow SHALL reference the model key only as
  `${{ secrets.OPENROUTER_API_KEY }}` and the GitHub token only as `${{ secrets.GITHUB_TOKEN }}`.
   [covers G-3, NFR-1; P-5]
- AC-20 (Ubiquitous): The review step of the generated workflow SHALL run the bundled agent-runner
  committed in the same pull request for this agent's manifest, and the workflow SHALL NOT reference
  `devdigest/review-action`.   [covers G-3, NG-3; P-5]
- AC-21 (Ubiquitous): The generated workflow SHALL pass the "Post results as" choice to the
  agent-runner, so that the runner posts a GitHub review, a PR comment or nothing exactly as chosen.
   [covers EC-10]
- AC-73 (Ubiquitous): The generated workflow SHALL upload the runner's result file, when the runner
  wrote one, as a workflow artifact named for the agent, also when the review step exits non-zero.
   [covers G-4; Q-1]
- AC-22 (Event-driven): WHEN a pull request comes from a fork, the generated workflow SHALL skip the
  review job, so that no step receives `OPENROUTER_API_KEY` and the check shows as skipped [Q-9].
   [covers G-3, EC-11]

### Checks before Install
- AC-23 (Unwanted behaviour): IF the edited workflow file is not valid YAML, THEN the wizard SHALL
  show the parse error with its line number and keep "Install" disabled.   [covers EC-9; Q-8]
- AC-74 (Unwanted behaviour): IF the edited workflow file contains a trigger other than
  `pull_request`, a permission beyond `contents: read` and `pull-requests: write`, or no fork skip
  of AC-22, THEN the wizard SHALL list each such construct with its risk and enable "Install" only
  after the user ticks "I understand the risk".   [covers EC-9; Q-8]
- AC-75 (Unwanted behaviour): IF an install request carries a workflow with a construct of AC-74 and
  no risk acknowledgement, THEN the API SHALL reject it with 422 naming each construct.
   [covers EC-9; Q-8]
- AC-68 (Unwanted behaviour): IF any exported file (manifest, skill files, workflow) contains a value
  that the studio's secret-leak detector flags, THEN the wizard SHALL name the file and line with the
  value masked, and the wizard and the API SHALL refuse both "Open a PR" and the zip until the file no
  longer contains it.   [covers G-3, EC-35; Q-8, P-1]

### Step 4 — Install
- AC-29 (Ubiquitous): The Install step SHALL offer "Open a PR with these files" (badge "recommended",
  selected by default), stating the target repository, the PR title "Add DevDigest CI review" and
  the number of files, and "Copy files as a zip" ("add them manually").   [covers US-1, US-3]
- AC-30 (Event-driven): WHEN the user activates "Install" with "Open a PR with these files", the API
  SHALL commit exactly the Preview files, including the edited workflow, as one commit on the branch
  `devdigest/ci` of the target repository and open a pull request from `devdigest/ci` into the
  repository's default branch as reported by GitHub, and SHALL NOT write to any other branch.
   [covers US-3, G-1; Q-19]
- AC-31 (Unwanted behaviour): IF an open pull request from `devdigest/ci` already exists in the target
  repository, THEN the API SHALL add the commit to that branch, keeping the files of other agents
  already on it, and return that pull request instead of opening a second one.   [covers EC-15, EC-29]
- AC-32 (Unwanted behaviour): IF the branch `devdigest/ci` exists without an open pull request, THEN
  the pull request the API opens SHALL contain, relative to the current head of the default branch,
  only changes to the exported file paths.   [covers EC-16]
- AC-33 (Event-driven): WHEN the pull request is opened or updated, the wizard SHALL show a success
  state with a link to the pull request that opens in a new tab, SHALL announce the result through a
  polite live region, and the CI tab SHALL list the installation for that repository with the status
  "PR open".   [covers US-1, NFR-3]
- AC-71 (Event-driven): WHEN the pull request is opened or updated, the success state SHALL show the
  next steps in order: add `OPENROUTER_API_KEY` to the repository's Actions secrets (linking to the
  repository's secrets settings on GitHub), review and merge the pull request, and add the workflow's
  check as a required status check if CI is to block merges.   [covers NG-4, EC-14; P-4]
- AC-34 (Unwanted behaviour): IF GitHub rejects any step of the install (missing or insufficient
  token permission, including permission to write workflow files; repository not found; rate limit;
  network error), THEN the wizard SHALL stay on the Install step, show GitHub's reason together with
  the token permissions the install needs, keep every choice and edit, allow a retry, and the API
  SHALL NOT record an installation.   [covers EC-17, NFR-5]
- AC-35 (State-driven): WHILE an install request is in progress, the Install step SHALL disable
  "Install" and "Back" and show progress, so that a second activation sends no second request.
   [covers EC-18]
- AC-36 (Unwanted behaviour): IF no GitHub token is configured in the studio, THEN the Install step
  SHALL show "Open a PR with these files" disabled with the reason and a link to Settings → API Keys,
  and "Copy files as a zip" SHALL stay available.   [covers EC-19]
- AC-37 (Event-driven): WHEN the user activates "Install" with "Copy files as a zip", the client SHALL
  download one zip containing exactly the Preview files at their repository paths, including the
  edited workflow, the API SHALL make no GitHub write, and the API SHALL record an installation for
  the target repository with the status "Awaiting manual install".   [covers G-1, EC-40; Q-12]
- AC-77 (Ubiquitous): The Install step's help link "Need help? See the GitHub Action setup docs" SHALL
  open GitHub's documentation on Actions secrets in a new tab [Q-24].

### Agent CI tab
- AC-38 (Ubiquitous): The agent editor SHALL have a "CI" tab after "Evals", reachable through
  `?tab=ci`.   [covers US-1]
- AC-39 (Ubiquitous): The CI tab SHALL show the heading "CI deployment" with the badge "Active in N
  repos" (N = the agent's installations with the status "Installed"), the buttons "Update CI config"
  and "Add to CI", one row per installation and a dashed "Add repository" row.   [covers US-1]
- AC-40 (Ubiquitous): Each installation row SHALL show the repository, the target "GitHub Actions",
  the installation status as text — "PR open", "PR closed" (closed without merge), "Awaiting manual
  install" (zip, workflow file not yet on the default branch) or "Installed" (the agent's workflow
  file is on the repository's default branch) — the result of the latest CI run next to it, the
  installed version as "v<agent version last exported>", and the relative time of the last status
  change; the status SHALL be re-evaluated at every collection of AC-59.   [covers US-5, EC-40, EC-41; Q-13]
- AC-69 (State-driven): WHILE the agent's current version is newer than the agent version an
  installation was last exported with, its row SHALL show the text badge "Config out of date" and an
  "Update" action that opens the wizard for that repository.   [covers EC-22; P-2]
- AC-41 (State-driven): WHILE the agent has no installation, the CI tab SHALL show an empty state
  that explains Export to CI in one sentence and offers "Add to CI", and SHALL NOT show the "Active in
  N repos" badge or "Update CI config".   [covers EC-20]
- AC-42 (Event-driven): WHEN the user activates "Update CI config", the CI tab SHALL ask which of the
  agent's installations to update (skipping the question when there is exactly one) and open the
  wizard with that repository selected and with the triggers and "Post results as" of that
  installation's last export preselected.   [covers EC-21; Q-20]
- AC-43 (Ubiquitous): The CI tab SHALL show the CI run history of the agent, newest first, with the
  same columns as the CI Runs page (AC-47), filterable by installation.   [covers US-5]
- AC-44 (Ubiquitous): The CI tab SHALL show a "Fail CI on" selector with the values never, critical,
  warning and any, bound to the same agent field as the Config tab's "Fail CI on"; saving it SHALL
  create a new agent version exactly as a Config tab save does.   [covers US-4]
- AC-45 (Ubiquitous): Next to the "Fail CI on" selector, the CI tab SHALL state that a changed value
  reaches a repository only after its CI config is updated, because each installed manifest keeps the
  value it was exported with.   [covers US-4, EC-22]

### CI Runs page
- AC-46 (Ubiquitous): The sidebar SHALL contain a "CI Runs" item in a new "GLOBAL" group that opens
  the CI Runs page [Q-14].   [covers US-5]
- AC-47 (Ubiquitous): The CI Runs page SHALL list every CI run of the workspace, newest first, each
  with repository, PR number linking to the pull request on GitHub, agent name, verdict, findings
  count, cost, duration and a link to the Actions job that opens in a new tab.   [covers US-5]
- AC-48 (Ubiquitous): The verdict shown for a reviewed CI run SHALL be the verdict the agent-runner
  computed in that run from the grounded findings and the manifest's Fail CI on value, shown as the
  text "Approve", "Comment" or "Request changes" and not by colour alone, and SHALL NOT be recomputed
  from the agent's current Fail CI on value.   [covers EC-22]
- AC-49 (Ubiquitous): The CI Runs page SHALL show "—" for a value the run did not report and SHALL
  show durations in seconds or minutes, never as raw milliseconds.   [covers EC-23, EC-36]
- AC-50 (State-driven): WHILE the workspace has no CI run, the CI Runs page SHALL show an empty state
  that explains where CI runs come from and links to the Agents page.   [covers EC-20]
- AC-51 (Ubiquitous): For each reviewed CI run, the API SHALL return and the CI Runs page SHALL show in
  the run's details: the manifest version (agent version and SHA-256 of the manifest file as read in
  CI), the model, the dependencies (runner bundle version, reviewer-core revision, Node.js version,
  SHA-256 of each skill file read) and the reviewed commit SHA.   [covers US-5, G-4, NG-2; Q-6]
- AC-52 (Unwanted behaviour): IF a workflow run of an installation concluded as failed and has no
  result artifact, THEN the API SHALL store it as one `agent_runs` row with `source='ci'` and status
  "failed", carrying repository, PR number, agent, commit SHA and the Actions job link, and the CI
  Runs page SHALL show it with the verdict text "Failed" and "—" for findings, cost and trace data.
   [covers EC-14, EC-24; Q-11, NG-13]

### Ingest
- AC-53 (Ubiquitous): The API SHALL obtain CI runs only by reading, with the studio's GitHub token,
  the `pull_request` workflow runs of an installation's workflow file in that installation's
  repository and downloading their result artifacts, and SHALL NOT expose any endpoint through which
  a caller outside the studio writes a CI run.   [covers G-4, NG-5, NFR-1; Q-1]
- AC-59 (Event-driven): WHEN the user opens the CI Runs page or the CI tab, or activates their
  "Refresh" button, the API SHALL collect the workflow runs completed since the last collection for
  every installation of the workspace [Q-23].   [covers US-5]
- AC-54 (Event-driven): WHEN a CI run result is accepted, the API SHALL store it as one `agent_runs`
  row with `source='ci'`, linked to the installation's agent, with status, findings count, cost,
  duration, blockers, verdict, repository, PR number, Actions job link and the trace data of AC-51.
   [covers G-4]
- AC-55 (Unwanted behaviour): IF a workflow run's repository and workflow file path match no
  installation of the workspace, or its result names an agent other than the installation's agent,
  THEN the API SHALL discard it and create no row.   [covers EC-25]
- AC-56 (Unwanted behaviour): IF the same CI run (same repository, workflow run and run attempt) is
  collected more than once, THEN the API SHALL keep exactly one row for it.   [covers EC-26]
- AC-57 (Unwanted behaviour): IF the result artifact of a workflow run that did not conclude as failed
  is missing or expired, or any result artifact is larger than the limit of NFR-2 or fails
  validation against the shared CI result schema, THEN the API SHALL discard that run, create no row,
  log the reason, and continue with the other runs.   [covers EC-27]
- AC-58 (Unwanted behaviour): IF GitHub is unreachable or rate-limits the API during a collection,
  THEN the CI Runs page and the CI tab SHALL show the previously stored runs unchanged with a notice
  that the list could not be refreshed, and the API SHALL create no partial row.   [covers EC-28]

### Agent-runner in CI
- AC-60 (Unwanted behaviour): IF the checked-in manifest fails validation against the shared agent
  manifest schema, THEN the agent-runner SHALL exit non-zero before any model call and post nothing.
   [covers G-2]
- AC-61 (Ubiquitous): The agent-runner SHALL read the manifest of the agent named by its workflow,
  and IF that manifest file is missing, THEN SHALL exit non-zero with a message naming the expected
  path, whatever other manifests the repository holds.   [covers EC-29; Q-5]
- AC-62 (Ubiquitous): The agent-runner SHALL exit non-zero exactly when the deterministic gate (the
  manifest's Fail CI on value applied to the grounded findings) requests changes or the run fails,
  and SHALL exit zero otherwise.   [covers US-4]
- AC-63 (Ubiquitous): The agent-runner SHALL write into its result the agent name, the trace data of
  AC-51, the verdict and the blocker count, and SHALL NOT write any secret value into the result, the
  log or a posted review or comment.   [covers G-4, NFR-1; Q-6]
- AC-64 (Ubiquitous): The agent-runner SHALL leave out of the reviewed diff every file under
  `.devdigest/` and every file under `.github/workflows/`.   [covers EC-30, EC-31; Q-21, NG-12]

## Edge cases
- EC-1 CircleCI, Jenkins or Generic CLI chosen → AC-6 (disabled, "Coming soon")
- EC-2 Several imported repositories, or none → AC-7, AC-66
- EC-3 Agent uses the `openai` or `anthropic` provider → AC-8
- EC-4 Agent with zero linked skills → AC-9 (no skill file; manifest skill list empty)
- EC-5 Agent with many skills or long file paths → AC-9 (file list wraps paths and scrolls; the extension stays visible)
- EC-6 Unsaved edits in the Config tab when the wizard opens → AC-12 (export uses the last saved version)
- EC-7 Two skills whose names produce the same slug → AC-14
- EC-8 Workflow edited in Preview, then triggers or "Post results as" changed → AC-16, AC-67
- EC-9 Edited workflow is invalid YAML, adds `pull_request_target`, a comment trigger, broader permissions or drops the fork skip → AC-23, AC-74, AC-75
- EC-10 "Post results as: None" → AC-21, AC-62 (exit code only)
- EC-11 Pull request from a fork → AC-22; the skipped workflow run creates no row (EC-38)
- EC-12 Wizard closed mid-way, or navigation away → AC-4, AC-72
- EC-13 Every trigger deselected → AC-25
- EC-14 `OPENROUTER_API_KEY` missing in the repository's secrets → AC-26, AC-71; the CI run fails and is listed as "Failed" (AC-52)
- EC-15 Re-export while the previous `devdigest/ci` PR is still open → AC-31
- EC-16 `devdigest/ci` left over from a merged or closed PR → AC-32
- EC-17 Token without permission to write `.github/workflows/`, repository archived or not found → AC-34
- EC-18 Double activation of "Install" → AC-35
- EC-19 No GitHub token in the studio → AC-36
- EC-20 No installation / no CI run yet → AC-41, AC-50
- EC-21 "Update CI config" with several installations → AC-42
- EC-22 Agent edited (including "Fail CI on") after export → AC-45, AC-48, AC-69
- EC-23 Run without reported cost → AC-49
- EC-24 CI run fails before a review (missing key, invalid manifest, missing manifest, model error) → AC-52
- EC-25 Workflow run of an uninstalled repository, workflow or agent → AC-55
- EC-26 Same run collected twice, or a re-run attempt of the same workflow run (a new attempt is a new row) → AC-56
- EC-27 Malformed, oversized or expired artifact → AC-57
- EC-28 GitHub unavailable or rate-limited during collection → AC-58
- EC-29 Two agents exported to the same repository, also while one `devdigest/ci` PR is open → AC-76, AC-31, AC-61
- EC-30 A pull request that changes workflow files under `.github/workflows/` → AC-64, NG-12 (those files are not reviewed)
- EC-31 The export PR itself triggers the workflow (its diff holds only exported files) → AC-64; the run reviews an empty diff and returns a zero-finding Approve
- EC-32 Agent renamed after export → AC-14
- EC-33 Agent deleted after export → its installations are removed with it; its stored CI runs stay listed with the agent name "—" (AC-49)
- EC-34 Agent disabled (`enabled = false`) → export allowed; the CI tab shows "This agent is disabled in the studio; CI runs are not affected" [Q-22]
- EC-35 System prompt or a skill body contains a key-like value → AC-68
- EC-36 Result from an older runner bundle without the trace fields → AC-49 (fields shown as "—")
- EC-37 A skill linked by two agents installed in one repository → its file holds the body of the most recent export; the trace's skill hashes show the change [Q-26]
- EC-38 A workflow run concluded as skipped (fork PR) or cancelled → no row (AC-52 covers only failed runs; AC-57 for runs without artifact)
- EC-39 Studio token not permitted to read the repository's secret names → AC-26 ("unknown")
- EC-40 Files from the zip added to the repository by hand → AC-37, AC-40 (status becomes "Installed" once the workflow file is on the default branch; runs are collected from then on)
- EC-41 Export PR closed without merge → AC-40 ("PR closed"); a later export opens a new PR (AC-32)

## Non-functional requirements
- NFR-1 (security): The API and the agent-runner SHALL NOT log, return to the client, commit or post
  the GitHub token or the model key; the workflow SHALL receive secrets only through
  `${{ secrets.* }}` (AC-19); the API SHALL read repository secret names only, never values (AC-26);
  CI runs SHALL enter the studio only through AC-53.
- NFR-2 (security): The API SHALL reject a result artifact larger than 1 MiB before parsing it [Q-17],
  and SHALL render every string from a result or a workflow run (agent name, model, dependency names)
  as text, never as HTML or a followed link; Actions job and PR links SHALL point to
  `https://github.com/` only.
- NFR-3 (accessibility): The wizard SHALL be a modal dialog with an accessible name, trap focus while
  open, return focus to the control that opened it on close, expose the current step with
  `aria-current="step"`, and be completable by keyboard alone; the workflow editor SHALL have an
  accessible label naming the file; every status badge (installation status, "Config out of date",
  verdict, secret status, "Coming soon") SHALL carry text, not colour alone.
- NFR-4 (performance): The Preview step SHALL show its files within 2 s for an agent with 20 linked
  skills, and the CI Runs page SHALL show its first page of 50 runs within 1 s with 10,000 stored CI
  runs [Q-17].
- NFR-5 (reliability): A PR install SHALL either produce one commit on `devdigest/ci` with all files
  and a recorded installation, or leave no installation record; a failed install SHALL be safely
  retryable (AC-31, AC-34).
- NFR-6 (observability): Each collection SHALL log, per installation, the number of runs stored as
  reviewed, stored as failed, discarded as duplicate and discarded as invalid with the reason; each
  install SHALL log the repository, branch and PR URL, without secrets.

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| Agent configuration (name, provider, model, system prompt, strategy, Fail CI on, version) | `agents`, `agent_versions` | Workspace user | Trusted; serialized as data, re-validated (AC-13), secret-scanned (AC-68) |
| Linked skill bodies | `skills`, `agent_skills` | Workspace user | Trusted instructions by design; exported as files, secret-scanned (AC-68) |
| Target repository (owner/name) | Imported repositories of the workspace (AC-7) | Workspace user | Trusted list; access checked by GitHub |
| Default branch | GitHub API (AC-30) | GitHub | Validated by GitHub |
| Repository Actions secret names | GitHub API (AC-26) | Repository admins | Names only; shown as a status, never values |
| Trigger types, "Post results as" | Configure step | Workspace user | Validated against fixed enums |
| Edited workflow text | Preview editor | Workspace user | Untrusted text; checked (AC-23, AC-74, AC-75, AC-68) |
| Risk acknowledgement | Install request | Workspace user | Boolean; required only for AC-74 constructs |
| Bundled agent-runner | Built from `agent-runner/` in this repository | DevDigest | Trusted build artifact |
| GitHub token | Studio secrets (`~/.devdigest/secrets.json` / env) | Workspace user | Secret; sent only to GitHub |
| PR diff, title, body in CI | GitHub, via the runner | PR author (any contributor) | Untrusted; wrapped with the injection guard |
| CI result artifact (verdict, counts, cost, duration, trace data) | Runner in the target repository's CI, downloaded from GitHub Actions (AC-53) | DevDigest runner in a third-party environment | Untrusted until matched (AC-55), size-checked and schema-validated (AC-57) |
| Workflow run metadata (run id, attempt, workflow path, conclusion, job URL, head SHA, PR number) | GitHub API | GitHub | Validated shape; links restricted to github.com |
| Installation status inputs (PR state, workflow file on default branch) | GitHub API (AC-40) | GitHub | Validated shape |

## Untrusted inputs
- PR diff, title and body in CI — wrapped by the runner with the untrusted delimiter and the shared
  injection guard before they reach the model (existing reviewer-core path); never followed as
  instructions; comments never trigger a run (AC-17).
- CI result artifact — pulled only from runs of an installed workflow file (AC-53, AC-55),
  size-limited before parsing (NFR-2), validated against the shared CI result schema (AC-57), stored
  as data and rendered as text. A collaborator who can change the workflow in a same-repository PR
  can still shape an artifact; it is data shown in the studio only and grants nothing.
- Workflow run metadata — only the fields listed in provenance are used; URLs shown only when they
  point to `https://github.com/`.
- Edited workflow text — never executed by the studio; checked before Install (AC-23, AC-74, AC-75,
  AC-68); committed only to `devdigest/ci` for human review.
- Agent system prompt and skill bodies — serialized into YAML and Markdown so that their text cannot
  add or change manifest keys; the generated manifest is parsed back and validated (AC-13).
- Checked-in manifest and skill files in CI — validated by the runner before use (AC-60, AC-61).

## Open questions
None. Defaults taken without objection are logged in design-review.md (Decisions log, Round 2).

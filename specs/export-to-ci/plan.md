# Development Plan: Export to CI

Created: 2026-10-11 · Branch: claude/export-to-ci-d99f5e · HEAD: 140b6ed · Status: ready
Spec: specs/export-to-ci/spec.md · SPEC-09 · approved
Recommended mode: multi-agent — three packages (server, agent-runner, client) are independent after the contracts step, the work is ~100 files, and the security-heavy generators/ingest benefit from a separate test-writer.

Language note: this file is English because repo files must be English (`pr-self-review` repo-invariants §8 flags Cyrillic in a diff). The planner's reply to the caller is in Russian.

## Requirements
(Verbatim from the spec; the trailing `[covers …]` traceability tags are omitted. `S` = step below.)

Entry points and wizard frame
- AC-1: "WHEN the user activates "Add to CI" or the "Add repository" row on the agent's CI tab, the agent page SHALL open the "Export to CI" dialog with the subtitle "Run <agent name> automatically on pull requests" and a stepper "Target → Preview → Configure → Install" with Target as the current step." → S11, S12
- AC-2: "The wizard's stepper SHALL mark completed steps with a check, the current step as current, and later steps as not yet reached, using text and an icon in addition to colour." → S12
- AC-3: "WHEN the user activates "Back", the wizard SHALL return to the previous step with every choice and every edit of the earlier steps kept." → S12
- AC-4: "WHEN the user closes the wizard before Install completes and confirms when AC-72 asks, the wizard SHALL discard its state and SHALL NOT create a branch, a pull request, an installation or a file." → S12
- AC-72: "WHEN the user closes the wizard (close button or Escape) after editing the workflow file, the wizard SHALL ask "Discard your workflow edits?" with "Discard" and "Keep editing", and "Keep editing" SHALL return to the wizard unchanged." → S12, S13

Step 1 — Target
- AC-5: "The Target step SHALL show "GitHub Actions" with the badge "recommended" and the text "Runs on pull_request events", selected by default." → S12
- AC-6: "The Target step SHALL show "CircleCI", "Jenkins" and "Generic CLI" as disabled, non-selectable cards labelled "Coming soon", each with that label as its accessible description." → S12
- AC-7: "The Target step SHALL offer a repository picker listing the workspace's imported repositories as owner/name, with the active repository preselected, and repositories where this agent is already installed marked "installed"." → S9, S12
- AC-66: "IF the workspace has no imported repository, THEN the Target step SHALL show the picker empty with a link to import a repository and keep "Continue" disabled with that reason." → S12
- AC-8: "WHILE the agent's provider is not `openrouter`, the CI tab SHALL show "Add to CI", "Add repository" and "Update CI config" disabled with the reason "CI runs use OpenRouter. Switch this agent's provider to OpenRouter in Config to export." and a link to the Config tab, and the API SHALL reject an export request for that agent with 422." → S6, S7, S11

Step 2 — Preview
- AC-9: "WHEN the Preview step opens, the wizard SHALL list under "FILES TO CREATE" every file that Install would commit or put into the zip, and no other file: the manifest `.devdigest/agents/<agent-slug>.yaml`, one `.devdigest/skills/<skill-slug>.md` per linked skill in the agent's skill order, an empty (0-byte) `.devdigest/memory.jsonl`, the bundled agent-runner, and the agent's workflow file (AC-76)." → S4, S6, S13
- AC-10: "WHEN the user selects a file in the list, the Preview step SHALL show its path and its contents in the editor pane — the runner bundle as read-only with its size and without rendering its contents [Q-15] — and SHALL mark only the workflow file "editable" and editable, every other file read-only." → S6, S13
- AC-12: "The manifest SHALL be built from the agent's last saved version and SHALL carry its name, provider, model, system prompt, linked skill slugs in skill order, strategy, Fail CI on value and the agent version number." → S1, S4, S6
- AC-13: "The API SHALL validate the manifest it generates against the shared agent manifest schema — the same schema the agent-runner uses — before returning it to the Preview step, and SHALL return an error instead of files when validation fails." → S4, S6
- AC-14: "The agent slug and every skill slug SHALL match `^[a-z0-9][a-z0-9-]*$`, two skills whose names produce the same slug SHALL get distinct slugs, and the agent slug of an installation SHALL stay the one used at its first export even after the agent is renamed [Q-18]." → S4, S6 · assumes Q-2
- AC-70: "The Preview step SHALL show the note "Not carried into CI: project context documents (N), repo intel", with N the number of context documents attached to the agent." → S6, S13

Step 3 — Configure
- AC-24: "The Configure step SHALL show the triggers `pull_request:opened` and `pull_request:synchronize` selected by default and `pull_request:reopened` not selected, each as a toggle button whose pressed state is exposed to assistive technology." → S12
- AC-25: "IF the user deselects every trigger, THEN the Configure step SHALL keep "Continue" disabled with the reason "Select at least one trigger" [Q-16]." → S12
- AC-26: "The Configure step SHALL list "Secrets expected": `OPENROUTER_API_KEY` ("Your OpenRouter key") with the status "set" or "not set" according to whether a secret of that name exists among the target repository's Actions secret names, or "unknown" when the studio's GitHub token is not permitted to read those names; and `GITHUB_TOKEN` ("Auto-provided by Actions") with the status "ready"; followed by "Add these to your repo's Actions secrets before the workflow runs." The API SHALL read secret names only, never values." → S2, S6, S12 · open item O-1
- AC-27: "The Configure step SHALL offer "Post results as" as a radio group with "GitHub review" (badge "recommended", selected by default), "PR comment" and "None (exit code only)"." → S12
- AC-28: "The Configure step SHALL show the note that merges are blocked by setting "Fail CI on" on the CI tab and adding a required status check in the repository's branch protection." → S12
- AC-16: "WHEN the user leaves the Configure step with triggers or "Post results as" different from those the workflow file was generated with, the wizard SHALL regenerate the workflow file if it has no user edits, and otherwise SHALL ask "Replace your workflow edits?" with "Replace edits" (regenerate) and "Keep my edits" (file unchanged)." → S12
- AC-67: "WHILE the user has kept workflow edits over changed Configure choices, the Install step SHALL state that the Configure choices are not applied to the workflow file." → S13

Generated workflow
- AC-76: "Each exported agent SHALL get its own workflow file `.github/workflows/devdigest-review-<agent-slug>.yml`, so that installing a second agent in a repository leaves the first agent's workflow and manifest in place." → S4, S6
- AC-17: "The generated workflow SHALL trigger only on the `pull_request` event with the activity types selected in Configure, and SHALL NOT contain `pull_request_target`, `issue_comment`, `pull_request_review_comment`, `workflow_run` or any other trigger." → S4
- AC-18: "The generated workflow SHALL declare the permissions `contents: read` and `pull-requests: write` and no other permission." → S4
- AC-19: "The generated workflow SHALL reference the model key only as `${{ secrets.OPENROUTER_API_KEY }}` and the GitHub token only as `${{ secrets.GITHUB_TOKEN }}`." → S4
- AC-20: "The review step of the generated workflow SHALL run the bundled agent-runner committed in the same pull request for this agent's manifest, and the workflow SHALL NOT reference `devdigest/review-action`." → S4, S8
- AC-21: "The generated workflow SHALL pass the "Post results as" choice to the agent-runner, so that the runner posts a GitHub review, a PR comment or nothing exactly as chosen." → S4, S8
- AC-73: "The generated workflow SHALL upload the runner's result file, when the runner wrote one, as a workflow artifact named for the agent, also when the review step exits non-zero." → S4
- AC-22: "WHEN a pull request comes from a fork, the generated workflow SHALL skip the review job, so that no step receives `OPENROUTER_API_KEY` and the check shows as skipped [Q-9]." → S4

Checks before Install
- AC-23: "IF the edited workflow file is not valid YAML, THEN the wizard SHALL show the parse error with its line number and keep "Install" disabled." → S4, S6, S13 · assumes Q-1
- AC-74: "IF the edited workflow file contains a trigger other than `pull_request`, a permission beyond `contents: read` and `pull-requests: write`, or no fork skip of AC-22, THEN the wizard SHALL list each such construct with its risk and enable "Install" only after the user ticks "I understand the risk"." → S4, S6, S13 · assumes Q-1
- AC-75: "IF an install request carries a workflow with a construct of AC-74 and no risk acknowledgement, THEN the API SHALL reject it with 422 naming each construct." → S6, S7
- AC-68: "IF any exported file (manifest, skill files, workflow) contains a value that the studio's secret-leak detector flags, THEN the wizard SHALL name the file and line with the value masked, and the wizard and the API SHALL refuse both "Open a PR" and the zip until the file no longer contains it." → S4, S6, S13 · assumes Q-6

Step 4 — Install
- AC-29: "The Install step SHALL offer "Open a PR with these files" (badge "recommended", selected by default), stating the target repository, the PR title "Add DevDigest CI review" and the number of files, and "Copy files as a zip" ("add them manually")." → S13
- AC-30: "WHEN the user activates "Install" with "Open a PR with these files", the API SHALL commit exactly the Preview files, including the edited workflow, as one commit on the branch `devdigest/ci` of the target repository and open a pull request from `devdigest/ci` into the repository's default branch as reported by GitHub, and SHALL NOT write to any other branch." → S2, S6
- AC-31: "IF an open pull request from `devdigest/ci` already exists in the target repository, THEN the API SHALL add the commit to that branch, keeping the files of other agents already on it, and return that pull request instead of opening a second one." → S2, S6
- AC-32: "IF the branch `devdigest/ci` exists without an open pull request, THEN the pull request the API opens SHALL contain, relative to the current head of the default branch, only changes to the exported file paths." → S2, S6
- AC-33: "WHEN the pull request is opened or updated, the wizard SHALL show a success state with a link to the pull request that opens in a new tab, SHALL announce the result through a polite live region, and the CI tab SHALL list the installation for that repository with the status "PR open"." → S6, S11, S13
- AC-71: "WHEN the pull request is opened or updated, the success state SHALL show the next steps in order: add `OPENROUTER_API_KEY` to the repository's Actions secrets (linking to the repository's secrets settings on GitHub), review and merge the pull request, and add the workflow's check as a required status check if CI is to block merges." → S13
- AC-34: "IF GitHub rejects any step of the install (missing or insufficient token permission, including permission to write workflow files; repository not found; rate limit; network error), THEN the wizard SHALL stay on the Install step, show GitHub's reason together with the token permissions the install needs, keep every choice and edit, allow a retry, and the API SHALL NOT record an installation." → S2, S6, S13 · open item O-1
- AC-35: "WHILE an install request is in progress, the Install step SHALL disable "Install" and "Back" and show progress, so that a second activation sends no second request." → S13
- AC-36: "IF no GitHub token is configured in the studio, THEN the Install step SHALL show "Open a PR with these files" disabled with the reason and a link to Settings → API Keys, and "Copy files as a zip" SHALL stay available." → S6, S13
- AC-37: "WHEN the user activates "Install" with "Copy files as a zip", the client SHALL download one zip containing exactly the Preview files at their repository paths, including the edited workflow, the API SHALL make no GitHub write, and the API SHALL record an installation for the target repository with the status "Awaiting manual install"." → S4, S6, S13
- AC-77: "The Install step's help link "Need help? See the GitHub Action setup docs" SHALL open GitHub's documentation on Actions secrets in a new tab [Q-24]." → S13

Agent CI tab
- AC-38: "The agent editor SHALL have a "CI" tab after "Evals", reachable through `?tab=ci`." → S11
- AC-39: "The CI tab SHALL show the heading "CI deployment" with the badge "Active in N repos" (N = the agent's installations with the status "Installed"), the buttons "Update CI config" and "Add to CI", one row per installation and a dashed "Add repository" row." → S11
- AC-40: "Each installation row SHALL show the repository, the target "GitHub Actions", the installation status as text — "PR open", "PR closed" (closed without merge), "Awaiting manual install" (zip, workflow file not yet on the default branch) or "Installed" (the agent's workflow file is on the repository's default branch) — the result of the latest CI run next to it, the installed version as "v<agent version last exported>", and the relative time of the last status change; the status SHALL be re-evaluated at every collection of AC-59." → S7, S11
- AC-69: "WHILE the agent's current version is newer than the agent version an installation was last exported with, its row SHALL show the text badge "Config out of date" and an "Update" action that opens the wizard for that repository." → S11
- AC-41: "WHILE the agent has no installation, the CI tab SHALL show an empty state that explains Export to CI in one sentence and offers "Add to CI", and SHALL NOT show the "Active in N repos" badge or "Update CI config"." → S11
- AC-42: "WHEN the user activates "Update CI config", the CI tab SHALL ask which of the agent's installations to update (skipping the question when there is exactly one) and open the wizard with that repository selected and with the triggers and "Post results as" of that installation's last export preselected." → S11, S12
- AC-43: "The CI tab SHALL show the CI run history of the agent, newest first, with the same columns as the CI Runs page (AC-47), filterable by installation." → S10, S11
- AC-44: "The CI tab SHALL show a "Fail CI on" selector with the values never, critical, warning and any, bound to the same agent field as the Config tab's "Fail CI on"; saving it SHALL create a new agent version exactly as a Config tab save does." → S11
- AC-45: "Next to the "Fail CI on" selector, the CI tab SHALL state that a changed value reaches a repository only after its CI config is updated, because each installed manifest keeps the value it was exported with." → S11

CI Runs page
- AC-46: "The sidebar SHALL contain a "CI Runs" item in a new "GLOBAL" group that opens the CI Runs page [Q-14]." → S10
- AC-47: "The CI Runs page SHALL list every CI run of the workspace, newest first, each with repository, PR number linking to the pull request on GitHub, agent name, verdict, findings count, cost, duration and a link to the Actions job that opens in a new tab." → S7, S10
- AC-48: "The verdict shown for a reviewed CI run SHALL be the verdict the agent-runner computed in that run from the grounded findings and the manifest's Fail CI on value, shown as the text "Approve", "Comment" or "Request changes" and not by colour alone, and SHALL NOT be recomputed from the agent's current Fail CI on value." → S7, S8, S10
- AC-49: "The CI Runs page SHALL show "—" for a value the run did not report and SHALL show durations in seconds or minutes, never as raw milliseconds." → S10
- AC-50: "WHILE the workspace has no CI run, the CI Runs page SHALL show an empty state that explains where CI runs come from and links to the Agents page." → S10
- AC-51: "For each reviewed CI run, the API SHALL return and the CI Runs page SHALL show in the run's details: the manifest version (agent version and SHA-256 of the manifest file as read in CI), the model, the dependencies (runner bundle version, reviewer-core revision, Node.js version, SHA-256 of each skill file read) and the reviewed commit SHA." → S7, S8, S10 · assumes Q-5
- AC-52: "IF a workflow run of an installation concluded as failed and has no result artifact, THEN the API SHALL store it as one `agent_runs` row with `source='ci'` and status "failed", carrying repository, PR number, agent, commit SHA and the Actions job link, and the CI Runs page SHALL show it with the verdict text "Failed" and "—" for findings, cost and trace data." → S7, S10

Ingest
- AC-53: "The API SHALL obtain CI runs only by reading, with the studio's GitHub token, the `pull_request` workflow runs of an installation's workflow file in that installation's repository and downloading their result artifacts, and SHALL NOT expose any endpoint through which a caller outside the studio writes a CI run." → S2, S7
- AC-59: "WHEN the user opens the CI Runs page or the CI tab, or activates their "Refresh" button, the API SHALL collect the workflow runs completed since the last collection for every installation of the workspace [Q-23]." → S7, S9, S10, S11 · assumes Q-4
- AC-54: "WHEN a CI run result is accepted, the API SHALL store it as one `agent_runs` row with `source='ci'`, linked to the installation's agent, with status, findings count, cost, duration, blockers, verdict, repository, PR number, Actions job link and the trace data of AC-51." → S3, S5, S7
- AC-55: "IF a workflow run's repository and workflow file path match no installation of the workspace, or its result names an agent other than the installation's agent, THEN the API SHALL discard it and create no row." → S7 · assumes Q-3
- AC-56: "IF the same CI run (same repository, workflow run and run attempt) is collected more than once, THEN the API SHALL keep exactly one row for it." → S3, S5, S7
- AC-57: "IF the result artifact of a workflow run that did not conclude as failed is missing or expired, or any result artifact is larger than the limit of NFR-2 or fails validation against the shared CI result schema, THEN the API SHALL discard that run, create no row, log the reason, and continue with the other runs." → S4, S7
- AC-58: "IF GitHub is unreachable or rate-limits the API during a collection, THEN the CI Runs page and the CI tab SHALL show the previously stored runs unchanged with a notice that the list could not be refreshed, and the API SHALL create no partial row." → S7, S10, S11

Agent-runner in CI
- AC-60: "IF the checked-in manifest fails validation against the shared agent manifest schema, THEN the agent-runner SHALL exit non-zero before any model call and post nothing." → S8
- AC-61: "The agent-runner SHALL read the manifest of the agent named by its workflow, and IF that manifest file is missing, THEN SHALL exit non-zero with a message naming the expected path, whatever other manifests the repository holds." → S8
- AC-62: "The agent-runner SHALL exit non-zero exactly when the deterministic gate (the manifest's Fail CI on value applied to the grounded findings) requests changes or the run fails, and SHALL exit zero otherwise." → S8
- AC-63: "The agent-runner SHALL write into its result the agent name, the trace data of AC-51, the verdict and the blocker count, and SHALL NOT write any secret value into the result, the log or a posted review or comment." → S1, S8
- AC-64: "The agent-runner SHALL leave out of the reviewed diff every file under `.devdigest/` and every file under `.github/workflows/`." → S8 (already implemented, agent-runner/src/diff.ts:21; test only)

Non-functional
- NFR-1: "(security): The API and the agent-runner SHALL NOT log, return to the client, commit or post the GitHub token or the model key; the workflow SHALL receive secrets only through `${{ secrets.* }}` (AC-19); the API SHALL read repository secret names only, never values (AC-26); CI runs SHALL enter the studio only through AC-53." → S2, S4, S6, S7, S8
- NFR-2: "(security): The API SHALL reject a result artifact larger than 1 MiB before parsing it [Q-17], and SHALL render every string from a result or a workflow run (agent name, model, dependency names) as text, never as HTML or a followed link; Actions job and PR links SHALL point to `https://github.com/` only." → S4, S7, S10
- NFR-3: "(accessibility): The wizard SHALL be a modal dialog with an accessible name, trap focus while open, return focus to the control that opened it on close, expose the current step with `aria-current="step"`, and be completable by keyboard alone; the workflow editor SHALL have an accessible label naming the file; every status badge (installation status, "Config out of date", verdict, secret status, "Coming soon") SHALL carry text, not colour alone." → S10, S11, S12, S13
- NFR-4: "(performance): The Preview step SHALL show its files within 2 s for an agent with 20 linked skills, and the CI Runs page SHALL show its first page of 50 runs within 1 s with 10,000 stored CI runs [Q-17]." → S3, S5, S6, S7
- NFR-5: "(reliability): A PR install SHALL either produce one commit on `devdigest/ci` with all files and a recorded installation, or leave no installation record; a failed install SHALL be safely retryable (AC-31, AC-34)." → S6
- NFR-6: "(observability): Each collection SHALL log, per installation, the number of runs stored as reviewed, stored as failed, discarded as duplicate and discarded as invalid with the reason; each install SHALL log the repository, branch and PR URL, without secrets." → S6, S7

## Traceability
Verify keys: **VS** = `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` · **VI** = `cd server && pnpm exec vitest run .it.test` (Docker) · **VC** = `cd client && pnpm typecheck && pnpm test` · **VR** = `cd agent-runner && pnpm typecheck && pnpm test && pnpm build`. "Hands-on" = studio at :3000/API :3001 via `./scripts/dev.sh`, agent on OpenRouter, a test repo imported, `agent-runner` built (`cd agent-runner && pnpm build`).

| Requirement | Steps | Tests | Verify | Verification hint | State |
|---|---|---|---|---|---|
| AC-1 | S11,S12 | T-30,T-33 | VC | Agent > CI tab > "Add to CI": dialog, subtitle, stepper on Target | planned |
| AC-2 | S12 | T-33 | VC | Advance steps: check icon + text on done steps | planned |
| AC-3 | S12 | T-33 | VC | Edit workflow, Back twice, forward: edits intact | planned |
| AC-4 | S12 | T-33 | VC | Close mid-way: GitHub shows no branch/PR; installations list unchanged | planned |
| AC-72 | S12,S13 | T-33,T-36 | VC | Edit workflow, press Escape: "Discard your workflow edits?"; "Keep editing" returns | planned |
| AC-5 | S12 | T-34 | VC | Target step card text/badge/selected | planned |
| AC-6 | S12 | T-34 | VC | 3 cards disabled, "Coming soon" read as description | planned |
| AC-7 | S9,S12 | T-34 | VC | Picker shows owner/name, active preselected, installed mark | planned |
| AC-66 | S12 | T-34 | VC | Workspace with no repos: empty picker, link, Continue disabled | planned |
| AC-8 | S6,S7,S11 | T-14,T-30 | VS,VC | `POST /agents/<non-openrouter>/ci/preview` returns 422; tab buttons disabled with reason+link | planned |
| AC-9 | S4,S6,S13 | T-14,T-36 | VS,VC | Preview lists manifest, skills in order, 0-byte memory, runner, workflow only | planned |
| AC-10 | S6,S13 | T-14,T-36 | VS,VC | Select runner: size shown, no content; only workflow editable | planned |
| AC-12 | S1,S4,S6 | T-8,T-14 | VS | Manifest shows saved version + fields; unsaved Config edits absent | planned |
| AC-13 | S4,S6 | T-8,T-14 | VS | Service round-trips manifest through `AgentManifest`; failure returns error not files | planned |
| AC-14 | S4,S6 | T-7,T-23 | VS,VI | Rename agent, re-export: same slug and workflow path | assumes Q-2 |
| AC-70 | S6,S13 | T-14,T-36 | VS,VC | Agent with 2 attached docs: "(2)" in note | planned |
| AC-24 | S12 | T-35 | VC | Defaults, `aria-pressed` toggles | planned |
| AC-25 | S12 | T-35 | VC | Deselect all: Continue disabled + reason | planned |
| AC-26 | S2,S6,S12 | T-15,T-35 | VS,VC | Repo with/without secret, token without permission: set/not set/unknown | planned (O-1) |
| AC-27 | S12 | T-35 | VC | Radio group defaults | planned |
| AC-28 | S12 | T-35 | VC | Note visible | planned |
| AC-16 | S12 | T-35 | VC | Change triggers after editing: "Replace your workflow edits?" | planned |
| AC-67 | S13 | T-37 | VC | Keep edits, reach Install: not-applied statement | planned |
| AC-76 | S4,S6 | T-7,T-9,T-16 | VS | Workflow path per slug; second agent keeps first | planned |
| AC-17 | S4 | T-9 | VS | Generated YAML parsed: `on` has only `pull_request.types` | planned |
| AC-18 | S4 | T-9 | VS | `permissions` exactly two keys | planned |
| AC-19 | S4 | T-9 | VS | Only the two secret expressions appear | planned |
| AC-20 | S4,S8 | T-9,T-3 | VS,VR | Step runs `node .devdigest/runner/index.js`; no `review-action` | planned |
| AC-21 | S4,S8 | T-9,T-3 | VS,VR | `DEVDIGEST_POST_AS` env equals choice; runner `none` posts nothing | planned |
| AC-73 | S4 | T-9 | VS | Upload step `if: always()`, named `devdigest-result-<slug>` | planned |
| AC-22 | S4 | T-9 | VS | Job `if` compares head repo to `github.repository` | planned |
| AC-23 | S4,S6,S13 | T-10,T-36 | VS,VC | Type invalid YAML: error with line, Install disabled | assumes Q-1 |
| AC-74 | S4,S6,S13 | T-10,T-36 | VS,VC | Add `pull_request_target`: risk listed, tick enables Install | assumes Q-1 |
| AC-75 | S6,S7 | T-18 | VS | `POST .../ci/install` with risky workflow, no ack: 422 naming constructs | planned |
| AC-68 | S4,S6,S13 | T-11,T-18,T-36 | VS,VC | Key-like value in prompt: file+line masked, PR and zip refused | assumes Q-6 |
| AC-29 | S13 | T-37 | VC | Install cards text, title, file count | planned |
| AC-30 | S2,S6 | T-16 | VS | MockGitHub: one commit on `devdigest/ci`, PR base = reported default branch | planned |
| AC-31 | S2,S6 | T-16 | VS | Second agent while PR open: same PR URL, first agent files kept | planned |
| AC-32 | S2,S6 | T-25,T-16 | VS | Stale branch: commit parented on default head | planned |
| AC-33 | S6,S11,S13 | T-37,T-30 | VC | Success link new tab, live region, row "PR open" | planned |
| AC-71 | S13 | T-37 | VC | 3 ordered next steps, secrets link | planned |
| AC-34 | S2,S6,S13 | T-17,T-37 | VS,VC | Token without workflow permission: stays on Install, reason + permissions, retry works | planned (O-1) |
| AC-35 | S13 | T-37 | VC | Double click sends one request; Back disabled | planned |
| AC-36 | S6,S13 | T-17,T-37 | VS,VC | No token: PR option disabled + Settings link; zip works | planned |
| AC-37 | S4,S6,S13 | T-13,T-19,T-37 | VS,VC | Zip downloads Preview files; row "Awaiting manual install"; no GitHub writes | planned |
| AC-77 | S13 | T-37 | VC | Help link target/new tab | planned |
| AC-38 | S11 | T-30 | VC | `/agents/<id>?tab=ci` after Evals tab | planned |
| AC-39 | S11 | T-30 | VC | Heading, badge N, buttons, rows, dashed row | planned |
| AC-40 | S7,S11 | T-20,T-30 | VS,VC | Merge export PR, Refresh: PR open > Installed | planned |
| AC-69 | S11 | T-30 | VC | Edit agent: badge + Update opens wizard for repo | planned |
| AC-41 | S11 | T-30 | VC | Agent with none: empty state | planned |
| AC-42 | S11,S12 | T-31 | VC | Two installs: picker; one: skipped; triggers prefilled | planned |
| AC-43 | S10,S11 | T-28,T-30 | VC | History table, installation filter | planned |
| AC-44 | S11 | T-32 | VC | Change selector, save: version +1 (also on Config tab) | planned |
| AC-45 | S11 | T-32 | VC | Note text next to selector | planned |
| AC-46 | S10 | T-27 | VC | Sidebar GLOBAL > CI Runs opens `/ci-runs`, highlighted | planned |
| AC-47 | S7,S10 | T-20,T-28 | VS,VC | Columns, PR link, job link new tab | planned |
| AC-48 | S7,S8,S10 | T-2,T-28 | VR,VC | Change agent Fail CI on: old run verdict unchanged | planned |
| AC-49 | S10 | T-28 | VC | Missing cost "—", duration "12 s"/"1 min 5 s" | planned |
| AC-50 | S10 | T-29 | VC | Empty workspace: explanation + Agents link | planned |
| AC-51 | S7,S8,S10 | T-2,T-5,T-29 | VR,VC | Run details show manifest version+hash, model, deps, SHA | assumes Q-5 |
| AC-52 | S7,S10 | T-20,T-28 | VS,VC | Run without key: row "Failed", "—" | planned |
| AC-53 | S2,S7 | T-21 | VS | Route list has no CI write endpoint | planned |
| AC-59 | S7,S9,S10,S11 | T-20,T-26,T-29 | VS,VC | Open page/tab: one `POST /ci/refresh` | assumes Q-4 |
| AC-54 | S3,S5,S7 | T-22,T-23 | VI | Row in `agent_runs` source='ci' with all columns | planned |
| AC-55 | S7 | T-20 | VS | Foreign workflow path / other agent name: no row | assumes Q-3 |
| AC-56 | S3,S5,S7 | T-20,T-22 | VS,VI | Refresh twice: one row; re-run attempt: second row | planned |
| AC-57 | S4,S7 | T-12,T-20 | VS | Oversize/expired/invalid artifact: skipped, logged | planned |
| AC-58 | S7,S10,S11 | T-20,T-29 | VS,VC | GitHub mock throws: stored rows + notice, no new rows | planned |
| AC-60 | S8 | T-1 | VR | Broken manifest: exit 1, LLM stub not called | planned |
| AC-61 | S8 | T-1 | VR | Two manifests present, slug env selects; missing: message with path | planned |
| AC-62 | S8 | T-3 | VR | Exit code matrix | planned |
| AC-63 | S1,S8 | T-2,T-3 | VR | Result JSON fields; no key/token in result or logs | planned |
| AC-64 | S8 | T-4 | VR | Diff with `.devdigest/` and `.github/workflows/` files filtered | planned |
| NFR-1 | S2,S4,S6,S7,S8 | T-3,T-11,T-15,T-17,T-21 | VS,VR | Fake token never in responses/logs/files | planned |
| NFR-2 | S4,S7,S10 | T-12,T-13,T-28 | VS,VC | 1 MiB+1 artifact rejected; hostile strings inert; non-github links dropped | planned |
| NFR-3 | S10,S11,S12,S13 | T-27,T-28,T-30,T-33 | VC | Keyboard-only run of wizard; screen-reader names | planned |
| NFR-4 | S3,S5,S6,S7 | T-24 | VS,VI | 20-skill preview < 2 s; 10k rows first page < 1 s | planned |
| NFR-5 | S6 | T-17 | VS | GitHub failure: no installation row, retry OK | planned |
| NFR-6 | S6,S7 | T-16,T-20 | VS | Log spy: per-installation counts, repo/branch/PR URL, no secrets | planned |

## Non-functional requirements
| NFR | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 | SPEC-09 | Token only via `container.github()`; error mapper forwards GitHub `message`/status only, never request headers (S2, S6); logs carry repo/branch/URL (S6, S7); runner redacts: never logs env, result built from typed fields (S8) | T-3, T-11, T-15, T-17 with fake token `ghp_FAKE…` asserted absent from responses, logs, files |
| NFR-2 | SPEC-09 | `artifact.ts` checks `size_in_bytes` before download and entry `originalSize` via fflate `filter` (zip-bomb safe) before `JSON.parse` (S4, S7); client renders text via React children, `isGithubUrl()` guard server (before store) and client (before `href`) (S7, S10) | T-12 (1 MiB and 1 MiB+1), T-28 hostile strings and `javascript:` link |
| NFR-3 | SPEC-09 | Own dialog shell with `role=dialog`, `aria-modal`, `aria-labelledby`, focus trap, Escape, focus return (vendor `Modal` has none: client/src/vendor/ui/kit/Modal.tsx:26); own Stepper with `aria-current="step"`; text on every badge (S12, S13, S10, S11) | T-33, T-30; hands-on keyboard-only walk |
| NFR-4 | SPEC-09 | Preview stats runner files (no read) and never calls GitHub (S6); partial index `(workspace_id, ran_at desc, id desc) WHERE source='ci'` + keyset pagination (S3, S5, S7) | T-24: 20-skill preview < 2000 ms with fakes; 10,000 seeded rows first page of 50 < 1000 ms (`*.it.test.ts`) |
| NFR-5 | SPEC-09 | Installation upserted only after commit and PR calls resolve (S6) | T-17 |
| NFR-6 | SPEC-09 | Structured `req.log`/pino lines per installation and per install (S6, S7) | T-16, T-20 log spy |

## Requirements review
No blocking findings (`R-n`). Non-blocking readings (planned with the recommended option):
- Q-1 [AC-13, AC-23, AC-74] Server has no `yaml` dependency (server/package.json:17-41; the reference lab also had none) yet the spec needs YAML parse with line numbers and a parse-back of the manifest. Planned with: add `yaml` (already used by agent-runner/package.json:13) to server via `pnpm add yaml`.
- Q-2 [AC-14] Two different agents with the same name in one repository would get the same slug and overwrite each other's files; AC-14 only covers skills. Planned with: on first export, a slug already used by another agent's installation in that repository gets `-2`, `-3`.
- Q-3 [AC-55] "result names an agent other than the installation's agent": artifact carries the manifest name, which differs from the studio name after a rename until the next export. Planned with: compare to the installation's stored `agent_name` (manifest name at last export).
- Q-4 [AC-59] "completed since the last collection" needs a window rule; a run created before the last collection can finish after it. Planned with: per-installation `last_collected_at`, query `created >= last_collected_at - 24 h`, duplicates absorbed by AC-56.
- Q-5 [AC-51] "reviewer-core revision" has no source: reviewer-core/package.json:3 is `0.0.0`. Planned with: git tree hash of `reviewer-core/` stamped at runner build time.
- Q-6 [AC-68] The spec and design review say "the studio's secret-leak detector"; none exists in the code (only the `secret_leak` finding kind, eval-ci.ts:266, and a hook enum). The pattern set is not specified. Planned with: a new pure scanner in the ci module.
- Requirements suggestions for the spec author (not planned as work): (a) define the secret pattern set for AC-68 or point to a real detector; (b) AC-34 asks for "the token permissions the install needs" without listing them; (c) each Refresh costs several GitHub calls per installation: consider a stated rate bound; (d) an old runner bundle in a target repo cannot be flagged as outdated (no requirement) – see I2.

## Scope
In: shared contracts; GitHub port extensions; `ci_installations`/`agent_runs` columns + one generated migration; new server `ci` module (preview, checks, install, zip, installations, pull-based collection, CI runs read); agent-runner changes; client CI tab, Export Wizard, CI Runs page, sidebar entry, hooks, messages.
Out: NG-1 (no change to `reviews`, `pulls` services, multi-run, PR feed), NG-2…NG-14 as in the spec; CircleCI/Jenkins/Generic CLI generators; `ci_runs` table stays unused (CLAUDE.md: empty tables are normal); docs (doc-writer); commits/pushes.

## Context used
- Guidance read: CLAUDE.md, AGENTS.md, server/AGENTS.md, client/AGENTS.md, agent-runner/CLAUDE.md, TESTING.md, specs/export-to-ci/spec.md, design-review.md.
- Lessons applied (logs of touched folders only):
  - server/INSIGHTS "optional body needs `.nullish()`" -> `POST /ci/refresh` has no body and the client sends none (S7, S9).
  - server/INSIGHTS "list query without ORDER BY reshuffles" -> every CI list has total order `ran_at desc, id desc` / `created_at, id` (S5).
  - server/INSIGHTS "`drizzle-kit generate` hangs without a TTY" -> S3 uses the `script -q /dev/null pnpm db:generate` recipe and reads the SQL.
  - server/INSIGHTS "real keys turn unmocked provider into a network call" -> every server test injects `MockGitHubClient` and `MockSecretsProvider` (hermetic setup blanks keys).
  - client/INSIGHTS "value imports from `@devdigest/shared` blank the page" -> client uses `import type` only; trigger/post-as/fail-on lists are repeated locally (S9-S13).
  - client/INSIGHTS "`user-event` not installed" -> tests use `fireEvent`; "`format.relativeTime` needs `now`" -> use `useNow` for AC-40 relative times (S11).
  - INSIGHTS (root) "vendor/shared drift" -> copy the canonical file whole for each touched file; compare touched files only (S1, S2).
  - agent-runner INSIGHTS: ncc bundle must keep zero `@devdigest` runtime imports (check `grep -c "^import\|require(" dist/index.js`); `post_as` open question closed by `DEVDIGEST_POST_AS` set in the workflow (S4, S8); discriminate `RunCiResult` on `artifact === null`; typecheck needs `reviewer-core` deps installed.
- Designs (visual reference; spec wins): `specs/export-to-ci/designs/01-wizard-target.png` -> S12; `02-agent-ci-tab.png` -> S11; `03-wizard-preview.png` -> S13; `04-wizard-configure.png` -> S12; `05-wizard-install.png` -> S13. Design deviations to follow the spec on: no `review-action`/`OPENAI_API_KEY` in the workflow text, workflow path per agent, the file list includes the runner, no "L06" copy, CI Runs page has no design (build from AC-47…AC-52).
- Reference (read-only, verify against this repo): the lab `server/src/modules/ci/{workflow,ingest,manifest,slug,helpers}.ts` is a starting point for generators and pure helpers. Do NOT copy its Container-taking service, its `reviewRepo.createCiAgentRun` writer, its hand-rolled zip reader (use `fflate`, already a server dependency, server/package.json:31) or its hand-rolled YAML emitter.
- Skills: onion-architecture (S2-S7), fastify-best-practices + zod (S1, S7), drizzle-orm-patterns + postgresql-table-design (S3, S5), security (S2, S4, S6, S7, S8, S10-S13), typescript-expert (all), frontend-ui-architecture + react-best-practices + next-best-practices (S9-S13), react-testing-library (client tests), engineering-insights (last step of each package).

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| Routes: schema-first, one service call, no `drizzle`/adapters in routes | server/AGENTS.md, onion-architecture | S7 routes only parse/serialize; `CiService`/`CiCollector` get ports in the constructor |
| Service takes ports, not `Container`; composition root names concrete classes | onion-architecture | S6 wires `container.ciService` like `evalService` (platform/container.ts:281); S5 `CiRepository` takes `Db` |
| New external capability = port in `vendor/shared/adapters.ts`, adapter, mock, container getter | onion-architecture §6 | S2 extends `GitHubClient`; runner bundle port in `adapters/runner-bundle/` (precedent `adapters/context-docs`) with a mock |
| `@devdigest/shared` canonical on server, client copy synced | CLAUDE.md | S1, S2 copy whole files; client keeps type-only imports |
| Do not edit `*/vendor/**` except `client/src/vendor/ui/nav.ts` | CLAUDE.md | S10 adds one GLOBAL group there; Modal/Stepper are built locally, not edited |
| Migration generated by drizzle-kit, never hand-edited | CLAUDE.md | S3 |
| Lockfile only via installer; no workspace fields | CLAUDE.md | S4 `pnpm add yaml` in `server/`. Note server/package.json is `skip-worktree` locally (TESTING.md): run `git ls-files -v server/package.json` first; if flagged, tell the caller before committing |
| Secrets read only via `SecretsProvider`/`container.github()`; runner reads env (documented exception) | server/AGENTS.md, agent-runner/CLAUDE.md | S6 uses `secrets.get('GITHUB_TOKEN')` only for presence; S8 reads `process.env` |
| DB-backed tests end `*.it.test.ts`; hermetic default | CLAUDE.md, TESTING.md | T-22…T-24 are `.it.test.ts` in `server/test/ci/` |
| Reviewer-core invariants unchanged (grounding gate, injection guard, deterministic verdict) | NG-9, agent-runner/CLAUDE.md | S8 touches only IO/artifact; `reviewPullRequest` call unchanged |
| NG-1: no change in reviews/pulls | spec | CI rows have `pr_id` null so PR history (`prId = …`) cannot see them (run.repo.ts:49); T-23 asserts it |
| Client: data via hooks -> `api.ts`; strings in next-intl; feature folders + sibling tests | client/AGENTS.md | S9-S13 |
| No linter, no `lint` script | CLAUDE.md | none added |
| Repo files in English; no Cyrillic | pr-self-review invariants §8 | messages/code/plan in English |
| Never `git commit`/`push` | CLAUDE.md | no commit step |

## Steps
Common contract decisions (S1 defines them; later steps rely on them):
- Constants in shared `eval-ci.ts`: `CI_BRANCH='devdigest/ci'`, `CI_RESULT_FILE_NAME='devdigest-result.json'`, `CI_ARTIFACT_MAX_BYTES=1_048_576`, `CI_RUNNER_ENV={ AGENT_SLUG:'DEVDIGEST_AGENT_SLUG', POST_AS:'DEVDIGEST_POST_AS', RESULT_PATH:'DEVDIGEST_RESULT_PATH' }`, artifact name `devdigest-result-<slug>`, runner dir `.devdigest/runner/`.
- Schemas: `CiPostAs`, `CiTrigger`(`opened|synchronize|reopened`), `CiInstallationStatus`(`pr_open|pr_closed|awaiting_manual|installed`), `AgentManifest` (+ `version: int ≥1`, required), `CiTraceData`(`manifest:{agent_version,sha256}`, `model`, `runner_version`, `reviewer_core_revision`, `node_version`, `skill_hashes:{slug,sha256}[]`, `head_sha`), `CiResultArtifact` (existing fields + `verdict`, `blockers`, `trace`; all new fields `.nullish()` so older bundles parse, EC-36), `CiPreviewInput{repo,triggers[min1],post_as}`, `CiPreviewFile{path,editable,kind:'text'|'bundle',contents:string|null,size_bytes}`, `CiPreview{agent_slug,workflow_path,files,context_docs_count,github_token_configured,leaks[]}`, `CiCheckInput`(preview input + `workflow`), `CiCheckResult{yaml_error:{message,line}|null,risks:{kind:'trigger'|'permission'|'fork_skip',detail,risk}[],leaks:{path,line,masked}[]}`, `CiSecretsStatus{github_token_configured,openrouter_key:'set'|'not_set'|'unknown'}`, `CiInstallInput`(check input + `action:'open_pr'|'zip'`, `acknowledge_risk` default false), `CiInstallResult{installation,pr_url,files_count,zip_base64}`, `CiInstallation{id,agent_id,repo,target_type,agent_slug,workflow_path,status,status_changed_at,exported_agent_version,triggers,post_as,pr_url,latest_run}`, `CiRunItem{id,repo,pr_number,pr_url,agent_id,agent_name,installation_id,verdict:'approve'|'comment'|'request_changes'|'failed',findings_count,cost_usd,duration_ms,job_url,ran_at}`, `CiRunDetail`(item + `model`,`trace`,`head_sha`), `CiRunsPage{items,next_cursor}`, `CiRefreshResult{degraded,message}`. Remove obsolete `CiFile`, `CiExportInput`, `CiExport`, `CiRun`, `CiRunStatus` (no other consumer: grep of server/test, mcp, e2e, evals, client/app is empty).
- HTTP surface (S7): `GET /agents/:id/ci/installations`, `POST /agents/:id/ci/preview`, `POST /agents/:id/ci/check`, `GET /agents/:id/ci/secrets?repo=`, `POST /agents/:id/ci/install`, `POST /ci/refresh` (no body), `GET /ci/runs?agent_id&installation_id&limit&cursor`, `GET /ci/runs/:id`. The install body carries only the workflow text; the server rebuilds every other file (body limit is 1 MiB, server/src/app.ts:49, and the runner bundle must not travel through the client). Zip is returned as `zip_base64` JSON (apiFetch is JSON-only, client/src/lib/api.ts:62).

### S1 Shared contracts + client copy
- Module / layer: ring 2 contracts (server canonical, client copy).
- Files: modify `server/src/vendor/shared/contracts/eval-ci.ts` (CI section lines 129-239 per the list above; keep Conformance/Hooks sections); modify `client/src/vendor/shared/contracts/eval-ci.ts` (copy the canonical file whole); create `server/test/ci/contracts.test.ts`.
- Skills to apply: zod § schemas/defaults; onion-architecture § zod-contracts.
- Depends on: —
- Tests (single-agent): T-6
- Done when: both copies identical for this file; `AgentManifest` requires `version`; `CiResultArtifact` accepts an old-shape fixture; the server typechecks (agent-runner fixtures are fixed in S8).
- Verify: VS

### S2 GitHub port, Octokit adapter, mock
- Module / layer: ring 2 port + ring 4b adapter.
- Files: modify `server/src/vendor/shared/adapters.ts` and copy whole to `client/src/vendor/shared/adapters.ts`; modify `server/src/adapters/github/octokit.ts`; modify `server/src/adapters/mocks.ts`; create `server/test/ci/github-ci-adapter.test.ts`.
- Contracts: add to `GitHubClient`: `getDefaultBranch(repo)`; `listActionsSecretNames(repo)` (names only; typed `GitHubPermissionError` on 403/404 so the service maps to "unknown"); `listWorkflowRuns(repo,{workflowPath,since})` returning `{id,run_attempt,conclusion,head_sha,html_url,path,created_at,pull_request_number|null}[]` filtered `event=pull_request,status=completed`, paginated; `findRunArtifact(repo,runId,name)` -> `{id,size_bytes,expired}|null`; `downloadArtifact(repo,artifactId)` -> bytes; `fileExistsOnBranch(repo,path,branch)`; `getPullRequestState(repo,n)` -> `open|closed|merged`. Change `findOpenPr` and `openPullRequest` to return `{url,number}`. Add `CommitFilesPayload.fromBase?: boolean`: when true and the branch exists, parent the new commit on the head of `base` and force-update the ref (AC-32); otherwise keep current parenting (AC-31, keeps other agents' files). Create blobs with `git.createBlob` and reference by sha in `createTree` (avoids empty-content tree entries for the 0-byte `memory.jsonl`). Octokit errors map to `ExternalServiceError` carrying GitHub's `message` and HTTP status only (never headers). Constructor accepts an injectable `octokit` for tests.
- Skills to apply: onion-architecture § ports-di; security § secrets/logging; typescript-expert.
- Depends on: —
- Tests (single-agent): T-25
- Done when: mock implements every new method with recorders (`committed`, `openedPrs`, scripted runs/artifacts/secret names/default branch); the server typechecks.
- Verify: VS

### S3 DB schema + migration
- Module / layer: ring 4a persistence.
- Files: modify `server/src/db/schema/ci.ts` (`ci_installations` add `agent_slug`, `agent_name`, `workflow_path`, `status`, `status_changed_at`, `exported_agent_version`, `triggers` jsonb, `post_as`, `pr_url`, `pr_number`, `last_collected_at`; unique `(agent_id, repo)`); modify `server/src/db/schema/runs.ts` (`agent_runs` add `ci_installation_id` fk set null, `repo`, `external_pr_number`, `actions_run_id`, `actions_run_attempt`, `actions_job_url`, `head_sha`, `verdict`, `ci_trace` jsonb; partial unique `(workspace_id, repo, actions_run_id, actions_run_attempt) WHERE source='ci'`; partial index `(workspace_id, ran_at desc, id desc) WHERE source='ci'`); create generated `server/src/db/migrations/0016_*.sql` + `meta/_journal.json` + `meta/0016_snapshot.json` (generated, not hand-edited).
- Contracts: do not write to `run_traces` or `ci_runs`; no changes to existing columns. `ci_installations` has no writer today, so new NOT NULL columns are safe; give `status` a default only if drizzle-kit needs it.
- Skills to apply: drizzle-orm-patterns; postgresql-table-design § indexes/partial; engineering-insights (TTY recipe).
- Depends on: —
- Tests (single-agent): — (covered by T-22)
- Done when: `pnpm db:generate` produced one migration; `pnpm db:migrate` applies on a fresh DB; server typechecks.
- Verify: `cd server && pnpm db:generate` (use `script -q /dev/null pnpm db:generate`, accept "create column" defaults, read the SQL) then `cd server && pnpm typecheck`

### S4 Server ci module: pure core
- Module / layer: new module `server/src/modules/ci/` — domain helpers (no IO). This is the step that creates the module (registered in S7).
- Files: `server/package.json` + `server/pnpm-lock.yaml` (via `cd server && pnpm add yaml` only); create `server/src/modules/ci/{constants,slug,manifest,workflow,workflow-check,secret-scan,artifact,zip,helpers}.ts` and tests `server/test/ci/{slug,manifest,workflow,workflow-check,secret-scan,artifact,helpers}.test.ts`.
- Contracts: `slug.ts` (`^[a-z0-9][a-z0-9-]*$`, de-dup `-2`…, caller passes the used set); `manifest.ts` builds from saved agent + ordered skills, serialises with `yaml` `stringify`, parses back and `AgentManifest.parse`, deep-compares (a hostile prompt cannot add keys) and throws on mismatch; `workflow.ts` generates `.github/workflows/devdigest-review-<slug>.yml`: `on.pull_request.types` = selected, `permissions` exactly `contents: read`, `pull-requests: write`, job `if: github.event.pull_request.head.repo.full_name == github.repository`, checkout `ref: ${{ github.event.pull_request.head.sha }}` with `fetch-depth: 0`, setup-node 22, run `node .devdigest/runner/index.js` with env `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER`, `DEVDIGEST_AGENT_SLUG`, `DEVDIGEST_POST_AS`, then `actions/upload-artifact@v4` with `if: always()`, `if-no-files-found: ignore`, name `devdigest-result-<slug>`; `workflow-check.ts` (`yaml` `parseDocument`: error line; all `on` shapes string/array/map; workflow- and job-level `permissions` incl. `write-all`; fork-gate present on every job) returns `{yaml_error,risks}`; `secret-scan.ts` returns `{path,line,masked}` (Q-6); `artifact.ts` extracts the result from the Actions zip with `fflate` `unzipSync` and `filter` on `originalSize`, enforces `CI_ARTIFACT_MAX_BYTES` before `JSON.parse`, validates with `CiResultArtifact`; `zip.ts` builds the install zip (`zipSync`); `helpers.ts` `isGithubUrl`, repo-slug parse, `workflowPathFor(slug)`.
- Skills to apply: onion-architecture; zod; security § input validation/secrets; typescript-expert.
- Depends on: S1
- Tests (single-agent): T-7, T-8, T-9, T-10, T-11, T-12, T-13
- Done when: every generator/check works on plain inputs with no DB, no GitHub, no fs.
- Verify: VS

### S5 Persistence and runner-bundle adapter
- Module / layer: ring 4a repository, ring 4b adapter.
- Files: create `server/src/modules/ci/repository.ts` (`CiRepository(Db)`: installations get/list/upsert/updateStatus/touchCollected, all scoped by workspace via the agent join; `agent_runs` source='ci' insert with `ON CONFLICT DO NOTHING`, existence check by key, keyset page `(ran_at,id)` limit ≤50 default 50, detail by id, latest run per installation; returns shared contract types, not `$inferSelect`); create `server/src/modules/ci/types.ts` (service ports); create `server/src/adapters/runner-bundle/index.ts` (`RunnerBundle` port: `list()` -> `{path,size_bytes}[]` by `stat`, `read()` -> contents; `FsRunnerBundle` reads `agent-runner/dist/` resolved from the file URL, missing `index.js` -> error telling to run `cd agent-runner && pnpm build`); modify `server/src/adapters/mocks.ts` (`MockRunnerBundle`); create `server/test/ci/repository.it.test.ts`.
- Skills to apply: drizzle-orm-patterns; onion-architecture § drizzle/ports-di; postgresql-table-design.
- Depends on: S1, S3
- Tests (single-agent): T-22
- Done when: repository is exercised against real Postgres; PR run-history queries unchanged.
- Verify: VS and VI

### S6 CiService + container wiring
- Module / layer: ring 3 application, ring 6 composition.
- Files: create `server/src/modules/ci/service.ts`; modify `server/src/platform/container.ts` (lazy `ciService` getter building ports from `agentsRepo`, workspace repos, `secrets`, `github()`, `RunnerBundle`); create `server/test/ci/service.test.ts`, `server/test/ci/service-install.test.ts`.
- Contracts: `preview` (422 if `provider !== 'openrouter'` — `ValidationError`; repo must be an imported repo of the workspace; uses `agentsRepo.getById` + `linkedSkills`, agent `version` = saved row; derives or reuses slug (stable per `(agent,repo)` installation, Q-2); builds files in the order manifest, skills, memory.jsonl (0 bytes), runner files (stat only, `contents:null`, `kind:'bundle'`), workflow (only editable); counts `agent.contextDocs`; runs secret scan; no GitHub call); `check` (workflow-check + scan); `secrets` (names only via `listActionsSecretNames`; permission error -> `unknown`; presence of `GITHUB_TOKEN` via `secrets.get`); `install` (re-validates everything server side: secret scan -> 422 naming file/line; yaml error -> 422; risks without `acknowledge_risk` -> 422 naming each; `open_pr`: `getDefaultBranch`, `findOpenPr`, `commitFiles({branch:CI_BRANCH, base, fromBase: !existingPr})`, open PR titled "Add DevDigest CI review" unless one exists, then upsert installation `pr_open` with `exported_agent_version`, `agent_name`, `triggers`, `post_as`, `pr_url`, `pr_number`; GitHub failure -> `ExternalServiceError` with `details.needed_permissions` (constant `CI_REQUIRED_TOKEN_PERMISSIONS`, filled from O-1) and no row; `zip`: no GitHub call, `zipSync` of the same files, upsert `awaiting_manual`); `listInstallations` with `latest_run`. Logs repo/branch/PR URL only.
- Skills to apply: onion-architecture; security; zod; typescript-expert.
- Depends on: S2, S4, S5
- Tests (single-agent): T-14, T-15, T-16, T-17, T-18, T-19, T-24 (preview part)
- Done when: all service paths pass with `MockGitHubClient`, in-memory fake repository and `MockRunnerBundle`.
- Verify: VS

### S7 Collector, routes, registration
- Module / layer: ring 3 collector, ring 5 transport.
- Files: create `server/src/modules/ci/collector.ts` (`CiCollector`); create `server/src/modules/ci/routes.ts`; modify `server/src/modules/index.ts` (import + `ci` entry); modify `server/src/platform/container.ts` (collector getter; same file as S6, later step); create `server/test/ci/collector.test.ts`, `server/test/ci/routes.test.ts`, `server/test/ci/ci.it.test.ts`; modify `server/INSIGHTS.md` only if something new was learned.
- Contracts: collector per installation of the workspace: (1) re-evaluate status (`pr_open`: `getPullRequestState`, merged -> check `fileExistsOnBranch(default branch)`, closed-unmerged -> `pr_closed`; `awaiting_manual`/`pr_closed`: file on default branch -> `installed`); (2) for `installed` only (EC-40) list runs since `last_collected_at - 24 h` (initial: installation creation time); skip conclusions other than success/failure/timed_out/startup_failure (EC-38); require run `path` to match the installation workflow path; (3) per run: skip known `(repo,run,attempt)` before any download; find + size-check + download artifact; valid result whose `agent` equals installation `agent_name` -> reviewed row (`status done`, verdict/blockers from artifact, trace, job URL only if `isGithubUrl`); no artifact + failure conclusion -> failed row (`status failed`, no error text, PR number and SHA from the run); everything else discarded and logged with reason; (4) any listing error -> `degraded`, `last_collected_at` untouched; log counts reviewed/failed/duplicate/invalid per installation. Routes per the HTTP surface; all with Zod schemas; refresh uses no body; runs list `limit` ≤ 100; 422 for non-OpenRouter on preview/check/install; no route writes a CI run from outside (AC-53).
- Skills to apply: onion-architecture; fastify-best-practices; zod; security; typescript-expert; engineering-insights.
- Depends on: S6
- Tests (single-agent): T-20, T-21, T-23, T-24 (runs part)
- Done when: `POST /ci/refresh` then `GET /ci/runs` works end to end against mocks.
- Verify: VS and VI

### S8 agent-runner
- Module / layer: `agent-runner/` (no server dependencies).
- Files: modify `agent-runner/src/manifest.ts` (`manifestPathFor(devdigestDir, slug)`; load by slug; missing file -> message naming `.devdigest/agents/<slug>.yaml`; return raw bytes hash too), `src/skills.ts` (return sha256 per file), `src/context.ts` (add `headSha` from `pull_request.head.sha`), `src/artifact.ts` (write `verdict`, `blockers`, `trace`, `agent`; stay under `CI_ARTIFACT_MAX_BYTES`; bump `RUNNER_VERSION`), `src/run.ts`, `src/index.ts` (read `CI_RUNNER_ENV.AGENT_SLUG`; missing -> error; keep `DEVDIGEST_POST_AS`); create `agent-runner/scripts/write-build-info.mjs` and `agent-runner/src/build-info.ts` (loads git-ignored generated file; wire `prebuild`, `pretypecheck`, `pretest` in `package.json`; add generated file to `.gitignore`); update/add tests `src/{manifest,run,diff}.test.ts`, `src/artifact.test.ts`; fix existing fixtures for the required manifest `version`; modify `agent-runner/insights/INSIGHTS.md` (close the `post_as` open question).
- Contracts: verdict from `toReviewPayload().event` mapped APPROVE/COMMENT/REQUEST_CHANGES -> `approve|comment|request_changes`; `blockers` = `countBlockers`; trace = manifest `version` + sha256 of the manifest file bytes, `model`, runner version, reviewer-core revision (Q-5), `process.version`, skill hashes, head SHA. Hard-fail behaviour unchanged (no artifact, exit 1, nothing posted). `.devdigest/` and `.github/workflows/` filter unchanged (diff.ts:21). Empty-diff run must produce a zero-finding approve (EC-31): if reviewer-core errors on an empty diff, short-circuit before the model call.
- Skills to apply: zod; security § secrets/logging; typescript-expert; engineering-insights.
- Depends on: S1
- Tests (single-agent): T-1, T-2, T-3, T-4, T-5
- Done when: `pnpm build` yields `dist/index.js` with zero `@devdigest` runtime imports and the stamped revision.
- Verify: VR

### S9 Client data layer
- Module / layer: `client/src/lib/hooks`.
- Files: create `client/src/lib/hooks/ci.ts` (`useCiInstallations`, `useCiPreview`, `useCiCheck`, `useCiSecrets`, `useCiInstall`, `useCiRefresh`, `useCiRuns`, `useCiRun`; `useCiRuns` runs `useCiRefresh` once on mount; `import type` only); modify `client/src/lib/hooks/index.ts`; create `client/src/lib/hooks/ci.test.tsx`; create `client/src/lib/ci-links.ts` (`isGithubUrl`, `githubSecretsUrl(repo)`).
- Skills to apply: frontend-ui-architecture § data layer; react-best-practices; typescript-expert.
- Depends on: S1
- Tests (single-agent): T-26
- Done when: hooks typecheck and call the paths in the HTTP surface; invalidate installations/runs after install and refresh.
- Verify: VC

### S10 CI Runs page, shared table, nav, messages
- Module / layer: client feature + shared component.
- Files: create `client/src/components/ci-runs-table/{CiRunsTable.tsx,styles.ts,helpers.ts,index.ts,CiRunsTable.test.tsx}`; create `client/src/app/ci-runs/page.tsx` and `client/src/app/ci-runs/_components/CiRunsView/{CiRunsView.tsx,CiRunDetails.tsx,styles.ts,index.ts,CiRunsView.test.tsx}`; modify `client/src/vendor/ui/nav.ts` (new `GLOBAL` group, item `key:"ci-runs"` -> `/ci-runs`, an existing icon such as `Workflow`; `activeKeyFor` already handles `/ci-runs`, components/app-shell/helpers.ts:38); modify `client/src/components/app-shell/nav.test.ts`; rewrite `client/messages/en/ci.json` (stale strings such as "Publish to CI" must go; keys for runs, tab and wizard).
- Designs: none exists for this page; build from AC-47…AC-52 (not from `02-agent-ci-tab.png`; that mock-up only informs the table look on the CI tab, S11).
- Skills to apply: frontend-ui-architecture § placement (table promoted to `components/` because the CI tab is the second consumer); react-best-practices; next-best-practices § page; ui-ux-pro-max § accessibility/tables; react-testing-library.
- Depends on: S9
- Tests (single-agent): T-27, T-28, T-29
- Done when: sidebar shows GLOBAL > CI Runs; page lists, shows empty state, degraded notice, details drawer; durations as s/min; verdict as text; links only to github.com.
- Verify: VC

### S11 Agent CI tab
- Module / layer: client feature `agents/[id]/_components/AgentEditor/_components/CiTab/`.
- Files: modify `.../AgentEditor/constants.ts` (tab `ci` after `evals`, key `editor.tabs.ci` exists in messages/en/agents.json:53) and `.../AgentEditor/AgentEditor.tsx`; create `.../CiTab/{CiTab.tsx,InstallationRow.tsx,FailCiOnPanel.tsx,UpdateTargetDialog.tsx,helpers.ts,constants.ts,styles.ts,index.ts,CiTab.test.tsx}`; update `AgentEditor.test.tsx`.
- Designs: `specs/export-to-ci/designs/02-agent-ci-tab.png` — heading, badge, buttons, installation rows, dashed row (follow the spec for texts, statuses, "Fail CI on" and history).
- Skills to apply: frontend-ui-architecture; react-best-practices; ui-ux-pro-max § forms/badges; react-testing-library; engineering-insights.
- Depends on: S9, S10 (table)
- Tests (single-agent): T-30, T-31, T-32
- Done when: tab renders every state of AC-39…AC-45/AC-8/EC-34; "Add to CI" mounts the wizard (stub until S12; the real component arrives in S12 via the agreed prop contract `ExportWizard({agent, initial?:{repo,triggers,postAs}, onClose})`).
- Verify: VC

### S12 Export Wizard: frame, state, Target, Configure
- Module / layer: client `CiTab/_components/ExportWizard/`.
- Files: create `ExportWizard.tsx` (own dialog shell: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape, focus returns to opener; inline "Discard your workflow edits?" confirmation panel instead of a stacked modal), `Stepper.tsx` (`aria-current="step"`, check icon + text), `useExportWizard.ts` (reducer: repo, triggers, postAs, workflow text, `generatedFor`, `edited`, step), `steps/TargetStep.tsx`, `steps/ConfigureStep.tsx`, `constants.ts` (local lists of triggers/post-as, defaults `opened`,`synchronize`), `styles.ts`, `index.ts`, `ExportWizard.test.tsx`, `steps/TargetStep.test.tsx`, `steps/ConfigureStep.test.tsx`; modify `CiTab.tsx` to mount it.
- Contracts: leaving Configure with changed triggers/postAs: regenerate (re-call preview) if `!edited`, else ask "Replace your workflow edits?" ("Replace edits"/"Keep my edits"); state survives Back (AC-3); `initial` prop preselects repo/triggers/postAs for AC-42; secrets status loaded on entering Configure.
- Designs: `01-wizard-target.png` — Target cards + stepper; `04-wizard-configure.png` — trigger toggles, secrets list, post-as radios (spec wins: `OPENROUTER_API_KEY` copy, no "L06", note about branch protection).
- Skills to apply: frontend-ui-architecture; react-best-practices § state/effects; ui-ux-pro-max § modal/focus/keyboard; react-testing-library; next-best-practices.
- Depends on: S11
- Tests (single-agent): T-33, T-34, T-35
- Done when: Target -> Configure completes by keyboard; Back keeps state.
- Verify: VC

### S13 Export Wizard: Preview and Install
- Module / layer: client `ExportWizard/steps/`.
- Files: create `steps/PreviewStep.tsx` (file list under "FILES TO CREATE", editor `<textarea>` with `aria-label` naming the file, read-only panes, bundle shows size only, "not carried into CI" note, debounced `useCiCheck` showing YAML error + line, risk list + "I understand the risk" checkbox, masked secret findings), `steps/InstallStep.tsx` (PR vs zip cards, title/file count, not-applied notice AC-67, token-missing state with Settings -> API Keys link, in-progress lock, error with GitHub reason + needed permissions and retry, success with link `target="_blank" rel="noopener noreferrer"`, `aria-live="polite"` announcement, ordered next steps with secrets URL, zip decode + download, help link), `download.ts` (base64 -> Blob), tests `steps/PreviewStep.test.tsx`, `steps/InstallStep.test.tsx`; modify `useExportWizard.ts`/`ExportWizard.tsx` minimally (edited flag, install gate); modify `client/INSIGHTS.md` only if something new was learned.
- Designs: `03-wizard-preview.png` — file list + editor (spec wins: runner entry listed, `OPENROUTER_API_KEY`, no `review-action`); `05-wizard-install.png` — PR/zip cards (spec wins: file count from Preview, repo from Target, no "5 generated files").
- Skills to apply: frontend-ui-architecture; react-best-practices; security § XSS/links; ui-ux-pro-max; react-testing-library.
- Depends on: S12
- Tests (single-agent): T-36, T-37
- Done when: a full run against the API (hands-on) opens a PR in a test repo and shows the installation as "PR open".
- Verify: VC

### I1 agent-runner CI workflow (optional — recommended)
- Cost S. `.github/workflows/agent-runner.yml` running `pnpm typecheck`, `pnpm test`, `pnpm build` with path filter `agent-runner/**, reviewer-core/**, server/src/vendor/shared/**`. The bundle is now shipped into third-party repositories and nothing in CI builds it. Skills: security § workflows. Depends on: S8. Verify: `cd agent-runner && pnpm typecheck && pnpm test && pnpm build`. (CLAUDE.md: CI is typecheck + tests only, so this is consistent.)

### I2 Runner-bundle hash on installations (optional — requirement suggestion, not planned work)
- Would let the CI tab flag an outdated runner. Changes user-visible behaviour, so it is listed for the spec author only.

### I3 Result-size guard in the runner (optional — recommended)
- Cost S; included in S8 (`artifact.ts` refuses to write more than `CI_ARTIFACT_MAX_BYTES`); listed so the user can drop it.

## Execution modes
Single-agent: one implementer runs S1 -> S13 in order, writing T-n inside the steps that list them; I1/I3 optional afterwards; INSIGHTS entries only where something new was learned.

Multi-agent (one instance per package per wave; no shared verification state):
| Wave | Instance | Steps | Owned files / area |
|---|---|---|---|
| 1 | implementer #1 (server + shared copies) | S1, S2, S3 | shared `eval-ci.ts`, `adapters.ts` (both trees), `octokit.ts`, `mocks.ts`, `db/schema/ci.ts`, `runs.ts`, migration 0016 + meta (12 files) |
| 2 | implementer #1 (server) | S4 | `modules/ci/*` pure files, `package.json`, lockfile (creates the module) |
| 2 | implementer #2 (agent-runner) | S8 | `agent-runner/**` |
| 2 | implementer #3 (client) | S9, S10 | hooks, ci-runs-table, `/ci-runs`, `nav.ts`, `ci.json` (~10 non-test files in this mode) |
| 3 | implementer #1 (server) | S5, S6 | `ci/repository.ts`, `types.ts`, `adapters/runner-bundle/`, `mocks.ts`, `service.ts`, `container.ts` |
| 3 | implementer #2 (client) | S11 | `CiTab/*`, `AgentEditor.*` |
| 4 | implementer #1 (server) | S7 | `collector.ts`, `routes.ts`, `modules/index.ts`, `container.ts` |
| 4 | implementer #2 (client) | S12 | `ExportWizard/*` frame, Target, Configure |
| 5 | implementer #1 (client) | S13 | wizard Preview, Install |
| 5 | test-writer A (server) | T-6…T-25 | `server/test/ci/*` |
| 5 | test-writer B (agent-runner) | T-1…T-5 | `agent-runner/src/*.test.ts` |
| 6 | test-writer C (client) | T-26…T-37 | all client `*.test.ts(x)` |
Recommended: multi-agent — the three packages are independent after S1, client work is the longest chain (S9->S13), and the generators/ingest are security-sensitive, so independent tests add value. If the user wants fewer moving parts, single-agent is workable but long. In multi-agent mode implementers do not write the new tests; existing tests broken by a step (runner fixtures for `version`, `nav.test.ts`, `AgentEditor.test.tsx`) are still fixed inside that step.

## Cross-module contracts & sync points
- `eval-ci.ts`, `adapters.ts`: server canonical + client copy, changed together (S1, S2); client imports types only.
- Workflow <-> runner: env names (`DEVDIGEST_AGENT_SLUG`, `DEVDIGEST_POST_AS`, `DEVDIGEST_RESULT_PATH`), result file, artifact name `devdigest-result-<slug>`: constants in shared, used by S4 and S8; T-9 and T-3 assert the same literals.
- `AgentManifest` shared by `ci/manifest.ts` (S4) and `agent-runner/src/manifest.ts` (S8).
- `CiResultArtifact` written by runner (S8), parsed by `ci/artifact.ts` (S4) and the collector (S7).
- Installation `workflow_path` + `agent_name` written by S6, read by S7.
- Wizard `initial` prop (S11) <-> `useExportWizard` (S12).
- Runner bundle: `agent-runner/dist/` must be built before export; missing bundle = export error (documented in S5).

## Test plan
- Existing suites to run: VS, VI, VC, VR (see Traceability keys); `cd reviewer-core && npm test` only if reviewer-core is touched (it is not).
- Server unit (`server/test/ci/*.test.ts`): T-6 contracts/old artifact parses (AC-13, AC-63, EC-36) · T-7 slugs (AC-14, EC-7, EC-32) · T-8 manifest round-trip incl. hostile prompt, zero skills, skill order (AC-12, AC-13, EC-4) · T-9 workflow generator (AC-17…AC-22, AC-73, AC-76, NFR-1) · T-10 workflow-check (AC-23, AC-74, EC-9) · T-11 secret scan (AC-68, EC-35) · T-12 artifact reader 1 MiB / zip bomb / invalid (AC-57, NFR-2, EC-27) · T-13 zip + `isGithubUrl` (AC-37, NFR-2) · T-25 Octokit adapter via injected octokit: blobs, `fromBase`, error mapping w/o headers (AC-30…AC-32, AC-34) · T-14 preview (AC-8, AC-9, AC-10, AC-70, EC-3, EC-5, EC-6) · T-15 secrets status (AC-26, EC-39) · T-16 install PR flows (AC-30…AC-32, EC-15, EC-16, EC-29, EC-41, NFR-6) · T-17 failures, no token, no row (AC-34, AC-36, EC-17, EC-19, NFR-5) · T-18 risk/secret 422 (AC-68, AC-75) · T-19 zip install (AC-37, EC-40) · T-20 collector (AC-40, AC-52, AC-55…AC-58, EC-24…EC-28, EC-38, NFR-6) · T-21 route surface (AC-53) · T-24a 20-skill preview < 2 s (NFR-4).
- Server integration (`*.it.test.ts`): T-22 repository (AC-54, AC-56) · T-23 routes end to end: preview -> zip install -> refresh -> list; rename keeps slug; agent delete keeps runs with null agent (EC-33); PR run history unaffected (NG-1) · T-24b 10,000 CI rows first page < 1 s (NFR-4).
- agent-runner: T-1 manifest by slug/invalid/missing (AC-60, AC-61, EC-24) · T-2 artifact fields (AC-48, AC-63, EC-36) · T-3 exit codes, post-as, no secrets in result/log (AC-21, AC-62, NFR-1) · T-4 diff filter + empty diff approve (AC-64, EC-30, EC-31) · T-5 hashes/head SHA/node version (AC-51).
- Client: T-26 hooks · T-27 nav (AC-46) · T-28 CiRunsTable (AC-47…AC-49, AC-52, NFR-2, EC-23) · T-29 CiRunsView (AC-50, AC-51, AC-58, AC-59) · T-30 CiTab states (AC-1, AC-33, AC-38…AC-41, AC-43, AC-69, AC-8, EC-34, EC-20) · T-31 update flow (AC-42, EC-21) · T-32 Fail CI on (AC-44, AC-45, EC-22) · T-33 wizard frame (AC-2…AC-4, AC-72, NFR-3, EC-12) · T-34 Target (AC-5…AC-7, AC-66, EC-1, EC-2) · T-35 Configure (AC-16, AC-24…AC-28, EC-8, EC-13, EC-14) · T-36 Preview (AC-9, AC-10, AC-23, AC-68, AC-70, AC-74, EC-9, EC-35) · T-37 Install (AC-29, AC-33, AC-34, AC-35, AC-36, AC-37, AC-67, AC-71, AC-77, EC-17…EC-19).
- Single-agent ownership: T-n sit in the step that lists them. Multi-agent: test-writers A/B/C as in the wave table.
- Not tested: real GitHub round trip and real Actions run (needs a live repo and key) — verified by the hands-on path in Traceability; keyboard-only completion (NFR-3) automated only for focus trap/Escape/aria, full keyboard walk is manual.

## Risks & open questions
- [non-blocking] O-1 (external research, not a blocker for coding): which GitHub token permission lists a repository's Actions secret names (fine-grained "Secrets: read" vs classic scope) and which permissions the install needs (contents write, pull requests write, workflow write). The repo cannot answer it (only "PAT with repo scope" in server/README.md:105). It only fills the AC-34 permission text and the AC-26 "unknown" explanation; behaviour is already fully specified. Research question for the caller (external): "For GitHub REST `GET /repos/{owner}/{repo}/actions/secrets` and the Git Data API calls used (create blob/tree/commit/ref, create pull request) writing `.github/workflows/*`, which fine-grained permissions and which classic scopes are required? Answer as a table." S6 keeps the text in one constant `CI_REQUIRED_TOKEN_PERMISSIONS`, to be filled from the report.
- [non-blocking] O-2 (external): do artifacts of a re-run attempt appear under the same run id and name, so a new attempt yields its own artifact (EC-26)? Planned default: treat each `(run, attempt)` from `listWorkflowRuns` as its own row; a missing artifact for an attempt is handled by AC-57/AC-52.
- [non-blocking] Risk: EC-31 empty diff — reviewer-core behaviour on an empty diff is unverified; S8 adds a short-circuit if it errors.
- [non-blocking] Risk: `server/package.json` is `skip-worktree` locally (TESTING.md); the `yaml` dependency change must be visible to git before the PR.
- [non-blocking] Risk: the ncc bundle may contain chunk files besides `index.js`; S5 lists every file under `agent-runner/dist/`, so Preview then shows each of them (AC-9 "the bundled agent-runner").

## Self-check
1 pass · 2 pass · 3 pass · 4 pass · 5 pass (waves: one instance per package, disjoint files, `container.ts` touched only in different waves, ≤3 instances, ≤14 files, one module-creating step S4; lockfile/migration/vendor copies each in exactly one group) · 6 pass · 7 pass (all new behaviour traces to an AC; extra ideas only under suggestions/I-n) · 8 pass (no blocking R-n, no blocking question: status ready) · 9 pass · 10 pass (only this file written; the Q-mode question is in the planner's reply)

## Out of scope for the implementer
Architecture and security review are done by separate agents. Requirements are fixed by the spec or task; a needed change goes back to the user, not into the code.
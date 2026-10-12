# Design review: Export to CI (SPEC-09)
Sources: specs/export-to-ci/designs/01-wizard-target.png, 02-agent-ci-tab.png, 03-wizard-preview.png, 04-wizard-configure.png, 05-wizard-install.png; reference draft inbox/dev-digest-lesson-7-lab-multiagents-finish/specs/2026-07-08-export-to-ci.md (reference only) · Current code read: agent-runner/src/manifest.ts:25-46, agent-runner/src/run.ts:83-173, agent-runner/src/index.ts:25-39, agent-runner/src/diff.ts:21, agent-runner/src/artifact.ts:6-44, server/src/vendor/shared/contracts/eval-ci.ts:133-239, server/src/vendor/shared/contracts/trace.ts:87-95, server/src/db/schema/ci.ts:4-26, server/src/db/schema/runs.ts:8-37, server/src/db/schema/agents.ts:16,26,34,36, server/src/adapters/github/octokit.ts:250-354, server/src/adapters/auth/local.ts:14-37, server/src/modules/index.ts:33-51, client/src/vendor/ui/nav.ts:21-45, client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx:17-37, client/src/app/agents/[id]/_components/AgentEditor/constants.ts:12-15, client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:118-124

## States coverage
| Screen / flow | State | In design? | Spec reference |
|---|---|---|---|
| CI tab | installations listed | yes (02) | AC-39, AC-40 |
| CI tab | installation statuses PR open / PR closed / Awaiting manual install / Installed | no (02 shows "succeeded" only) | AC-40 |
| CI tab | no installation | no | AC-41 |
| CI tab | config out of date | no | AC-69 |
| CI tab | "Update CI config" with several installations | no | AC-42 |
| CI tab | run history, Fail CI on | no | AC-43, AC-44, AC-45 |
| CI tab | provider not OpenRouter | no | AC-8 |
| CI tab / CI Runs | refresh failed (degraded) | no | AC-58 |
| Wizard Target | GHA selected, other targets | yes (01), others look selectable | AC-5, AC-6 |
| Wizard Target | repository choice / no repository | no | AC-7, AC-66 |
| Wizard Preview | file list + editable workflow | yes (03), runner bundle missing | AC-9, AC-10 |
| Wizard Preview | loading / generation error | no | AC-13 |
| Wizard Preview | "not carried into CI" note | no | AC-70 |
| Wizard Configure | triggers, secrets, post-as | yes (04) | AC-24…AC-28 |
| Wizard Configure | secret status set / not set / unknown | partly ("not set") | AC-26 |
| Wizard Configure | zero triggers | no | AC-25 |
| Wizard Configure → edits conflict | — | no | AC-16, AC-67 |
| Wizard checks | invalid YAML / risky constructs / secret found | no | AC-23, AC-74, AC-75, AC-68 |
| Wizard Install | PR vs zip | yes (05) | AC-29 |
| Wizard Install | in progress | no | AC-35 |
| Wizard Install | success + next steps | no | AC-33, AC-71 |
| Wizard Install | GitHub error / no token | no | AC-34, AC-36 |
| Wizard close | with unsaved edits | no | AC-72, AC-4 |
| CI Runs page | whole page | no design | AC-46…AC-52 |
| CI Runs page | empty | no | AC-50 |
| CI Runs page | failed run | no | AC-52 |

## Gaps in the designs
- No repository selection; Install copy names `acme/payments-api` = the active repo → Q-2 → AC-7, AC-66.
- Preview comes before Configure while the workflow is editable → Q-4 → AC-16, AC-67.
- Preview list omits the runner bundle that must be committed; Install says "5 generated files" → AC-9, AC-10 (Q-15).
- Design 03 workflow uses `uses: devdigest/review-action@v1` and `openai-key: ${{ secrets.OPENAI_API_KEY }}`; design 04 lists `OPENROUTER_API_KEY`. Correct: `OPENROUTER_API_KEY` (built-in agents use the `openrouter` provider; the runner builds only an OpenRouter provider, agent-runner/src/index.ts:39) and the bundled runner instead of the placeholder → P-5 → AC-19, AC-20.
- Design 03 workflow path `.github/workflows/devdigest-review.yml` (also in the feature description) cannot hold several agents → Q-5, Q-25 → AC-76, NG-14: `devdigest-review-<agent-slug>.yml`, a deliberate deviation from the description.
- Design 04 copy "Your OpenRouter key — same BYO key from L06" references a course lesson → P-5 → AC-26.
- Design 04 "not set" badge: what is checked was undefined → Q-10 → AC-26 (repository secret names; "unknown" without permission).
- Design 02 status "succeeded" on an installation was ambiguous → Q-13 → AC-40 (lifecycle status + latest run result).
- "Update CI config" with several installations undefined → Q-20 → AC-42.
- "Need help? See the GitHub Action setup docs" target undefined → Q-24 → AC-77.
- No design for the CI Runs page, run history, Fail CI on on the CI tab, trace details, failed runs → AC-43…AC-52.
- Sidebar "GLOBAL" group with Memory, Multi-Agent Review, Agent Performance does not exist (client/src/vendor/ui/nav.ts:21-45) → AC-46 (CI Runs only), NG-8.
- "Stats" tab in the mock-up does not exist (constants.ts:12-15) → NG-8.
- CircleCI/Jenkins/Generic CLI cards look selectable; no generators exist → Q-3 → AC-6, NG-10.

## Edge cases not covered
- Fork PRs → EC-11, EC-38 · second agent in one repo → EC-29 · export PR reviewing itself → EC-31 · workflow-changing PRs not reviewed → EC-30, NG-12 · left-over `devdigest/ci` → EC-16 · PR closed without merge → EC-41 · zip installed by hand → EC-40 · token lacks workflow-write permission → EC-17 · token cannot read secret names → EC-39 · secret in prompt/skill → EC-35 · old runner bundles → EC-36 · shared skill across agents → EC-37 · renamed/deleted/disabled agent → EC-32…EC-34 · non-OpenRouter agent → EC-3 · failed run without artifact → EC-24.

## Module interactions
| From | To | Via (external contract) | New / changed / existing | Consumers affected |
|---|---|---|---|---|
| client (wizard) | server | export preview + install routes (files, checks, secret status, install with acknowledgement, zip installation) | new | client |
| client (CI tab, CI Runs) | server | list installations, list CI runs, refresh routes | new | client |
| client (CI tab) | server | agent update (Fail CI on) | existing | Config tab |
| server | GitHub REST | git data commit, pulls list/create (`commitFiles`, `findOpenPr`, `openPullRequest`) | existing, behaviour changed for AC-32 | — |
| server | GitHub REST | repository default branch, PR state, file presence on default branch, Actions secret names, list workflow runs (conclusion, attempt), list/download run artifacts | new port capability | server tests/mocks |
| studio ↔ runner | repository files | `AgentManifest` (shared Zod) | changed: agent version field | server, client copy, agent-runner |
| runner → studio | Actions artifact | `CiResultArtifact` (shared Zod) | changed: verdict, blockers, agent, trace data (no failure form) | server ingest, agent-runner, client copy |
| server | DB | `agent_runs` (`source='ci'`) + CI metadata; `ci_installations` | changed (columns) | PR run history must keep filtering out CI rows (NG-1) |
| shared | client | `CiInstallation`, `CiRun`, `CiExportInput` | changed | client copy must be synced |

```mermaid
sequenceDiagram
    actor User
    participant Web as Studio web (wizard, CI tab, CI Runs)
    participant API as Studio API (ci module)
    participant GH as GitHub (repo + Actions)
    participant Runner as agent-runner (in target CI)
    User->>Web: Add to CI → Target/Preview/Configure
    Web->>API: generate files (agent, repo, triggers, post-as)
    API->>API: build manifest, validate with AgentManifest, secret scan
    API->>GH: read Actions secret names (status only)
    API-->>Web: files + secret status
    User->>Web: Install (Open a PR | zip)
    Web->>API: install (files incl. edited workflow, risk ack)
    API->>API: re-check workflow + secrets
    API->>GH: commit to devdigest/ci, open or reuse PR into default branch
    GH-->>API: PR URL
    API-->>Web: installation (PR open | Awaiting manual install) + PR URL
    Note over User,GH: human adds OPENROUTER_API_KEY, reviews and merges the PR
    GH->>Runner: pull_request (opened/synchronize[/reopened]), non-fork only
    Runner->>Runner: validate manifest, review (grounding gate), deterministic verdict
    Runner->>GH: post review / comment / nothing; exit code
    Runner->>GH: upload result artifact when written
    User->>Web: open CI Runs / CI tab / Refresh
    Web->>API: refresh
    API->>GH: installation status; workflow runs of installed workflow files; artifacts
    API->>API: match installation, size + schema check, idempotent store (agent_runs, source='ci'); failed run without artifact → failed row
    API-->>Web: CI runs + installations
```

Notes for the implementation planner (internal wiring, not part of the spec):
- `findManifestPath` requires exactly one manifest (agent-runner/src/manifest.ts:40) — must select by the agent slug passed from the workflow (AC-61).
- `post_as` never reaches the runner today (agent-runner/src/index.ts:25-28, INSIGHTS open question) — pass it from the workflow (AC-21).
- On hard failure the runner writes no artifact (agent-runner/src/run.ts:167-172); per Q-11 this stays — failed runs come from the workflow run conclusion (AC-52). No failure artifact work in the runner.
- The runner's `.github/workflows/` diff filter (agent-runner/src/diff.ts:21) stays unchanged (Q-21, NG-12).
- `CiResultArtifact` lacks verdict, blockers, model, manifest hash, dependency info, commit SHA (eval-ci.ts:228-238; artifact.ts:34-44); `RUNNER_VERSION = '1'` (artifact.ts:6) is the natural runner version field.
- `agent_runs` lacks repo, external PR number, job URL, workflow run id/attempt, commit SHA, installation link (runs.ts:8-37); `run_traces.trace` (`RunTrace`, trace.ts:87-95) requires prompt assembly fields the CI result does not have — store CI trace data in its own shape or relax per field.
- `ci_installations` lacks status, exported agent version, agent slug, workflow path, last export triggers/post-as (for AC-42) (ci.ts:4-12); `ci_runs` (ci.ts:14-26) is not the store for CI runs (AC-54) — leave the empty table (CLAUDE.md: empty tables are normal).
- `CiExportInput.triggers` default includes `reopened` and `base` defaults to `main` (eval-ci.ts:180-181) — conflicts with AC-24 and AC-30 (default branch from GitHub).
- `commitFiles` parents a new commit on an existing branch head (octokit.ts:281-290) — a stale `devdigest/ci` drags old commits into a new PR (AC-32).
- Writing `.github/workflows/*` through the API needs a token allowed to write workflows; surface GitHub's rejection (AC-34).
- Research: which GitHub token permission lists a repository's Actions secret names (classic scope vs fine-grained "Secrets: read"); without it AC-26 shows "unknown".
- `LocalNoAuthProvider` (auth/local.ts:14) — there is no caller identity, so an inbound ingest endpoint would be unauthenticated; pull-based ingest (Q-1) avoids it.
- No `ci` module is registered (modules/index.ts:33-51); register statically. Add the "CI Runs" nav entry in `client/src/vendor/ui/nav.ts` (owner-approved exception). Add the "ci" tab after "evals" (constants.ts:12-15).
- Fail CI on already exists in ConfigTab (ConfigTab.tsx:118-124); the CI tab control binds to the same field (AC-44).
- Secret scan (AC-68): reuse the existing secret-leak hook detector (`HookKind 'secret_leak'`, eval-ci.ts:266).
- The runner bundle (`agent-runner/dist/index.js`) must be available to the API at export time; a missing bundle is an export error (AC-13 class).
- Fork skip (AC-22) and artifact upload that also runs after a non-zero exit (AC-73) mirror the reference generator (reference server/src/modules/ci/workflow.ts).

## UX improvements
- P-1 Secret scan of every exported file before Install — files leave for another repository; a key in a prompt leaks into git history — cost S — status: accepted → AC-68
- P-2 "Config out of date" badge and per-row Update — changes (incl. Fail CI on) reach CI only after re-export — cost S — status: accepted → AC-69
- P-3 Preview note on what does not carry into CI — explains local vs CI differences — cost S — status: accepted → AC-70
- P-4 Next-steps checklist after Install — without the repository secret the first run fails — cost S — status: accepted → AC-71
- P-5 Show the real generated workflow and fix copy (OPENROUTER_API_KEY, no "L06") — designs 03/04 contradict — cost S — status: accepted → AC-19, AC-20, AC-26
- P-6 Confirm before discarding workflow edits on close — a hand-edited YAML is lost by one Escape — cost S — status: accepted → AC-72

## Decisions log
- Round 1: Q-1 → pull artifacts from GitHub Actions (AC-53, AC-73, NG-5); Q-2 → picker of imported repositories, active preselected (AC-7, AC-66); Q-3 → other targets disabled "Coming soon" (AC-6, NG-10); Q-4 → regenerate with confirmation (AC-16, AC-67); Q-5 → one workflow and manifest per agent (AC-76, AC-61, AC-31); Q-6 → agent version + manifest hash; runner version, reviewer-core revision, Node version, skill hashes (AC-12, AC-51, AC-63); Q-7 → block export with reason (AC-8, NG-11); Q-8 → block invalid YAML and secrets, acknowledge risky constructs (AC-23, AC-74, AC-75, AC-68).
- Round 1: P-1, P-2, P-3, P-4, P-5, P-6 → accepted; none rejected.
- Round 1 merges: AC-11 → AC-10 (withdrawn); AC-15 → AC-9 (withdrawn).
- Round 2: Q-10 → repository secret names, "unknown" without permission (AC-26, NFR-1, EC-39); Q-11 → failed runs listed from the workflow run conclusion only, no failure artifact (AC-52, AC-57, NG-13, EC-38); Q-12 → zip records an installation "Awaiting manual install" (AC-37, AC-40, EC-40); Q-13 → PR lifecycle status + latest run result, version = agent version last exported (AC-40, AC-39, EC-41); Q-19 → repository default branch from GitHub (AC-30, AC-32); Q-20 → choose installation, then wizard prefilled (AC-42); Q-21 → runner keeps skipping all of `.github/workflows/` (AC-64, NG-12, EC-30); Q-25 → `devdigest-review-<agent-slug>.yml` for every agent, deliberate deviation from the description's single name (AC-76, NG-14).
- Round 2 defaults accepted without objection: Q-9 fork job skipped (AC-22); Q-14 "CI Runs" in a new GLOBAL group (AC-46); Q-15 runner bundle read-only with size (AC-10); Q-16 zero triggers block Continue (AC-25); Q-17 bounds 1 MiB / 2 s / 50 runs in 1 s at 10,000 (NFR-2, NFR-4); Q-18 slug fixed per installation (AC-14); Q-22 disabled agent exportable with notice (EC-34); Q-23 collection on page open and Refresh (AC-59); Q-24 help link to GitHub Actions secrets docs (AC-77); Q-26 shared skill file, most recent export wins (EC-37).

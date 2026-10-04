# Spec: PR Brief on the Overview tab
Spec ID: SPEC-04
Status: approved
Supersedes: —

## Problem and user
A reviewer often opens someone else's pull request "cold": they do not know why the change exists,
what in it is risky, or which file to read first. DevDigest already answers parts of this in
separate places — Intent explains the purpose, Smart Diff orders files by role, Blast radius shows
what else the change can affect — but the reviewer has to assemble the picture alone, and nothing
tells them which concrete risks to check or which lines to start from. The cost is a slow first
pass, attention spent on boilerplate, and risky lines found late or not at all.

## Goals / Non-goals
Goals:
- G-1 One "PR Brief" block on the Overview tab gathers what DevDigest knows about the PR: a short
  summary of what the PR does and why, Intent, Blast radius, Risk areas and Review focus.
- G-2 Risk areas, Review focus and the summary are written by one model request that receives
  already computed facts, never the diff's code.
- G-3 Every file named in Risk areas and Review focus exists in the PR or in its Blast radius map;
  invented paths never reach the user.
- G-4 A brief is generated only on request, kept per PR and tied to the commit it describes, so
  reopening the PR costs nothing and an outdated brief is recognisable.
- G-5 From a Review focus item the reviewer reaches the exact file and line in Files changed in one
  click, and the link survives Back, reload and sharing.
- G-6 The brief's generated text is written in the workspace's chosen language (the same setting as
  the Onboarding Tour).

Non-goals:
- NG-1 Sending diff hunk bodies (added, removed or context lines) or file contents to the model.
- NG-2 Deriving a missing Intent, or rebuilding a missing or degraded Blast radius index, as part of
  brief generation.
- NG-3 Generating a brief automatically on page open, on a new commit, or after a review (Q-5).
- NG-4 Changing how the Intent card, the Blast radius card, Smart Diff or the review agents work on
  their own tabs.
- NG-5 Editing a brief by hand, or posting it to GitHub.
- NG-6 The PR history (prior PRs) as an input or a section of the brief; the Blast radius card keeps
  showing "Prior PRs touching these files" as today.
- NG-7 Workflow steps of the course task (attaching documents in Project Context, cross-model plan
  review, workflow-retro and cost report on the PR); they are process, not product behaviour.
- NG-8 Sorting risks by severity; risks are listed in the order the stored brief holds them (P-5
  rejected; the severity text label stays for accessibility).
- NG-9 A "Derive intent" action inside the PR Brief block; the existing Intent card keeps its own
  controls (P-6 rejected).
- NG-10 A snapshot of Intent or Blast radius stored with the brief; the block shows the live cards
  (Q-7).
- NG-11 A second model request for the same generation: no re-prompt on an invalid answer and no
  transport retry (Q-4).
- NG-12 More than one linked issue as input, or issue comments (Q-10).
- NG-13 Localizing the studio UI: the block's labels, buttons, messages and the severity words stay the
  studio's English UI copy whatever the brief language is (Q-13).
- NG-14 A separate language setting for the brief, or languages other than English, Ukrainian and
  Hebrew (Q-13).
- NG-15 Translating file paths, code identifiers, symbol names, route patterns or quoted finding titles
  in generated text (Q-13).
- NG-16 Detecting or correcting a model answer written in the wrong language.

## User stories
- US-1 As a reviewer opening an unfamiliar PR, I want a one-click brief with what the PR does, why,
  and what is risky, so that I start the review oriented.
- US-2 As a reviewer, I want a short list of file:line places to read first, each with a reason,
  and to jump from an item to that line in the diff, so that I spend attention where it matters.
- US-3 As a reviewer, I want the brief to stay after a reload and to know when it describes an older
  commit, so that I neither pay for it twice nor trust an outdated one.
- US-4 As a workspace user, I want the brief in my team's language, so that reviewers read it
  without translating.

## Acceptance criteria (EARS)
Priority from the task is shown as [P1] / [P2] / [P3]; criteria added by later answers carry the
priority of the task criterion they refine.

### The PR Brief block
- AC-1 (Ubiquitous) [P1]: The Overview tab SHALL show a "PR Brief" block as its first section, above
  the PR description.   [covers US-1]
- AC-2 (State-driven) [P1]: WHILE no brief is stored for the PR and no generation runs for it, the
  PR Brief block SHALL show a "Generate brief" button, and the studio SHALL NOT start a generation
  without the user activating it.   [covers US-1, NG-3]
- AC-3 (Event-driven) [P1]: WHEN the user activates "Generate brief" or the "Regenerate brief"
  control, the PR Brief block SHALL request a new brief through `POST /pulls/:id/brief` and, when the
  request succeeds, SHALL show the returned brief without a page reload.   [covers US-1, US-3]
- AC-4 (State-driven) [P3]: WHILE a generation runs and no brief is stored for the PR, the PR Brief
  block SHALL show a skeleton in place of the summary, Risk areas and Review focus.   [covers EC-9]
- AC-5 (State-driven) [P1]: WHILE a generation runs for the PR, the PR Brief block SHALL keep
  "Generate brief" and "Regenerate brief" disabled and mark them busy.   [covers EC-10]
- AC-35 (State-driven) [P1]: WHILE a regeneration runs and an earlier brief is stored, the PR Brief
  block SHALL keep showing the earlier brief together with the text "Regenerating…" instead of a
  skeleton.   [P-4]
- AC-6 (State-driven) [P1]: WHILE a brief is stored for the PR, the PR Brief block SHALL show, under
  the "PR Brief" heading, the brief's summary of what the PR does and why as its own paragraph, a
  "Risk areas" section, a "Review focus" section, and a "Regenerate brief" control that belongs to
  the brief block (not to the verdict banner) and is shown whether or not a review exists.
  [covers US-1; Q-6]
- AC-7 (State-driven) [P1]: WHILE a brief is stored for the PR, the PR Brief block SHALL show the
  existing Intent card and Blast radius card with their current live data next to Risk areas, each
  with its existing empty or unavailable state when the PR has no such data.   [covers G-1; Q-7, NG-10]
- AC-8 (Ubiquitous) [P3]: Every fixed label of the PR Brief block (block and section titles, empty
  states, buttons, messages, severity words) SHALL come from the studio's `brief` message namespace,
  not from text written in a component, and SHALL stay in the studio's English UI copy whatever the
  brief language is.   [Q-13, NG-13]
- AC-36 (State-driven) [P1]: WHILE a brief is stored for the PR, the PR Brief block SHALL show the
  line "Generated <relative time> · commit <first 7 characters of the commit SHA> · <model>", using
  the generation time, commit SHA and model stored with the brief.   [covers US-3; P-3]
- AC-41 (State-driven) [P1]: WHILE no API key is stored for the provider of the "Risk Brief" feature
  model, the PR Brief block SHALL disable "Generate brief" and "Regenerate brief" and show a notice
  that names that provider with a link to Settings → API keys, keeping a stored brief visible; a
  generation request in this state SHALL be rejected by the API with that reason and without a model
  request.   [covers EC-5; Q-14]
- AC-42 (Unwanted behaviour) [P1]: IF a generation is requested for a PR while another generation runs
  for the same PR, THEN the API SHALL answer 409 without a model request, and the PR Brief block
  SHALL show "Generation already running" and keep showing what it showed before.   [covers EC-10; Q-11]

### Missing inputs
- AC-9 (Unwanted behaviour) [P1]: IF a generation starts while the PR has no stored Intent, its Blast
  radius is degraded or unavailable, no specification document is injected (AC-23), or a linked issue
  is referenced but cannot be read (AC-23), THEN the API SHALL still generate the brief, SHALL record
  each missing input with its reason in the brief (for Blast radius, the degradation reason the Blast
  radius API reports), and the PR Brief block SHALL state in text which inputs were missing.
  [covers EC-1, EC-2, EC-3, EC-23, NG-2]
- AC-10 (Unwanted behaviour) [P1]: IF a generation starts while the PR has no stored Intent, THEN the
  API SHALL NOT derive an Intent or make any model request other than the brief's own.   [covers NG-2]

### Risk areas
- AC-11 (Ubiquitous) [P1]: Each risk in Risk areas SHALL show its title, its severity as the text
  "high", "medium" or "low", and one or more file references, each a repo-relative path without a line
  number.   [covers US-1; Q-8]
- AC-12 (State-driven) [P1]: WHILE the stored brief has no risk, Risk areas SHALL show "No notable
  risks flagged."   [covers EC-6]
- AC-13 (Event-driven) [P3]: WHEN the user activates a risk's expand control, the PR Brief block SHALL
  show or hide that risk's explanation and expose the expanded state on the control.
- AC-14 (Event-driven) [P3]: WHEN the user activates a file reference of a risk, the PR page SHALL
  navigate to that file as specified in AC-17 and AC-19, without a line target.

### Review focus
- AC-15 (Ubiquitous) [P1]: Review focus SHALL list its items in the order the brief stores them, each
  showing `<path>:<line>` in monospace followed by its reason, under a heading that shows the number
  of items.   [covers US-2]
- AC-16 (State-driven) [P1]: WHILE the stored brief has no Review focus item, the Review focus section
  SHALL show a message that no starting point was suggested.   [covers EC-6]
- AC-37 (Ubiquitous) [P1]: Each Review focus item and each risk file reference SHALL be a link to the PR
  page URL with `tab=diff`, `file=<URL-encoded path>` and, for Review focus items, `line=<line>`, so
  that it can be opened in a new browser tab, and browser Back from Files changed SHALL return to the
  Overview tab.   [covers G-5; P-1]
- AC-17 (Event-driven) [P1]: WHEN the PR page is opened or navigated with `tab=diff` and a `file` that
  is among the PR's changed files, it SHALL show the Files changed tab, expand that file and, in Smart
  order, its role group if collapsed, and scroll the file into view below the page's sticky header, in
  whichever of Smart order or Original order is active.   [covers US-2, G-5, EC-11, EC-21; P-1]
- AC-18 (Event-driven) [P2]: WHEN the PR page navigates under AC-17 with a `line` that is a row on the
  new side of the file's diff, it SHALL scroll to that row and visibly mark it for at least 2 seconds.
  [covers G-5; P-2]
- AC-43 (Unwanted behaviour) [P2]: IF the PR page navigates under AC-17 with a `line` that is not a row
  on the new side of the file's diff, or the file has no patch, THEN it SHALL show the file without
  marking any row and show the note "Line <line> is outside the changed lines" at the file, announced
  through a polite live region.   [covers EC-12, EC-21; Q-9]
- AC-38 (Event-driven) [P1]: WHEN the PR page navigates under AC-17, it SHALL move keyboard focus to the
  header of the target file.   [covers NFR-3; P-2]
- AC-19 (Unwanted behaviour) [P3]: IF the PR page is opened or navigated with `tab=diff` and a `file`
  that is not among the PR's changed files (for example a Blast radius caller file, a file removed by
  a later commit, or a hand-edited value), THEN it SHALL show the Overview tab with the short message
  "File not in this PR's diff", announced through a polite live region.   [covers EC-13, EC-21; Q-9]

### Grounding of model output
- AC-20 (Unwanted behaviour) [P1]: IF a file reference of a risk names a path that is neither among the
  PR's changed files nor in the PR's Blast radius map (changed-symbol files and caller files) at
  generation time, THEN the API SHALL remove that reference, SHALL keep the risk while at least one
  of its references remains, and SHALL drop the risk when none remains.   [covers G-3, EC-7; Q-8]
- AC-21 (Unwanted behaviour) [P1]: IF a Review focus item names a file that is neither among the PR's
  changed files nor in the PR's Blast radius map at generation time, or a line number below 1, THEN
  the API SHALL drop that item before the brief is stored.   [covers G-3, EC-7]
- AC-44 (Ubiquitous) [P1]: After AC-20 and AC-21, the API SHALL keep at most the first 5 risks and the
  first 5 Review focus items in the model's order and drop the rest before the brief is stored.
  [covers EC-24; Q-12]
- AC-22 (Ubiquitous) [P2]: The shared brief contract `PrBrief`, identical in both copies of the shared
  contract, SHALL consist of `summary`, `risks` (each `kind`, `title`, `explanation`, `severity`
  high | medium | low, `file_refs` as repo-relative paths), `review_focus` (each `file`, `line`,
  `reason`), the commit SHA, generation time, brief language, provider and model, input tokens, output
  tokens, cost, measured input size, missing inputs with reasons, and shortened or skipped inputs; it
  SHALL NOT contain `intent`, `blast` or `history`.   [covers EC-8; Q-7, Q-13]
- AC-39 (Unwanted behaviour) [P2]: IF the model's answer does not validate against the answer schema
  `{ summary, risks[], review_focus[] }`, THEN the API SHALL NOT store it, SHALL NOT send another model
  request, and SHALL fail the generation under AC-31.   [covers EC-8; Q-4, NG-11]

### Generation
- AC-23 (Ubiquitous) [P2]: Each generation SHALL give the model only these facts: the PR title and
  description; the stored Intent (summary, in scope, out of scope) when present; the Blast radius
  summary and its callers (symbol, file, line) when available; diff totals (file count, additions,
  deletions); per changed file its path, additions, deletions, Smart Diff role, and the hunk ranges and
  hunk header lines (`@@ -a,b +c,d @@` and the text after it) without any body line; the findings of
  the latest completed review of each agent (file, line, title, severity) when any exist; the title and
  body of the first issue referenced in the PR description under the issue-reference rules the Intent
  layer uses, read from GitHub at generation time and cut to at most 20,000 bytes; and the
  specification documents attached to every enabled agent and to the linked, globally enabled skills
  of those agents, de-duplicated by path, read as the effective document (local copy over repository)
  for the PR's repository, each wrapped as untrusted data.   [covers G-2, NG-1, NG-12; Q-1, Q-2, Q-10]
- AC-24 (Ubiquitous) [P2]: No diff hunk body line (added, removed or context) and no source file content
  SHALL be part of the model input.   [covers NG-1]
- AC-25 (Ubiquitous) [P2]: The model input of one generation, counted as the system message plus the
  user message by the server's tokenizer, SHALL NOT exceed 8,000 tokens; to fit, the API SHALL shorten
  or leave out inputs in this order — specification documents (sorted by repo-relative path ascending,
  each dropped whole starting from the end of that order), linked issue, Blast radius callers, PR
  description, per-file list (including its hunk headers and the review findings) — and SHALL NEVER
  shorten the Intent or the diff totals; the API SHALL record in the brief and in the server log the
  measured input tokens and which inputs were shortened or left out.   [covers EC-14; Q-3, Q-15]
- AC-40 (Unwanted behaviour) [P2]: IF the inputs that are never shortened (system message, Intent, diff
  totals) alone exceed 8,000 tokens, THEN the API SHALL reject the generation with that reason and
  without a model request, and keep any earlier brief unchanged.   [covers EC-14; Q-3]
- AC-26 (Ubiquitous) [P2]: Each generation SHALL make exactly one HTTP request to the model provider,
  with no re-prompt and no transport retry, and the server log SHALL record one line per generation
  naming the provider, the model, input and output tokens, and cost.   [covers G-2; Q-4, NG-11]
- AC-27 (Ubiquitous) [P2]: Each generation SHALL use the provider and model set in Settings → Feature
  Models → "Risk Brief" at the moment the generation starts.
- AC-45 (Ubiquitous) [P2]: Each generation SHALL write the summary, risk titles, explanations and Review
  focus reasons in the workspace "Tour language" value (English, Ukrainian or Hebrew) read when the
  generation starts; the model request SHALL name that language explicitly; file paths, code
  identifiers, symbol names and route patterns SHALL stay verbatim; and the API SHALL store that
  language with the brief.   [covers US-4, G-6, EC-25; Q-13, NG-15]
- AC-46 (State-driven) [P2]: WHILE the stored brief's language is Hebrew, the PR Brief block SHALL render
  the summary, risk titles, explanations and Review focus reasons right-to-left and right-aligned,
  while the block layout, headings, labels, buttons, severity words and keyboard focus order stay
  left-to-right.   [covers EC-26; Q-16]
- AC-47 (Ubiquitous) [P2]: File paths, `<path>:<line>` references, line numbers and code identifiers in
  the PR Brief block SHALL be rendered left-to-right and isolated from the surrounding text direction,
  so that their characters appear in source order inside right-to-left text and are copied unchanged.
  [covers EC-26; Q-16]
- AC-48 (State-driven) [P2]: WHILE the stored brief's language differs from the current "Tour language"
  setting, the PR Brief block SHALL show the text "Language changed since this brief was generated"
  next to "Regenerate brief", as text and not by colour alone, and SHALL NOT start a generation
  without the user activating "Regenerate brief".   [covers EC-27; Q-17, NG-3]

### Cache and freshness
- AC-28 (Event-driven) [P1]: WHEN a generation succeeds, the API SHALL store the brief for the PR,
  replacing any earlier one, together with the PR head commit SHA read when the generation started and
  the generation time.   [covers G-4, US-3]
- AC-29 (Ubiquitous) [P1]: `GET /pulls/:id/brief` SHALL return the stored brief of the PR with a `stale`
  flag, or an empty result when none is stored, without any model request; the PR page SHALL show a
  stored brief on open and after a reload without starting a generation.   [covers US-3, G-4]
- AC-30 (State-driven) [P2]: WHILE the stored brief's commit SHA differs from the PR's current head SHA,
  the API SHALL return the brief with `stale: true`, and the PR Brief block SHALL keep showing the
  brief with the text "Outdated — generated for <first 7 characters of the stored SHA>" next to
  "Regenerate brief", as text and not by colour alone, without starting a generation.
  [covers US-3, EC-4; Q-5, NG-3]
- AC-31 (Unwanted behaviour) [P1]: IF a generation fails — provider error or timeout, no API key for the
  "Risk Brief" provider (AC-41), an answer that fails validation (AC-39), or the budget rejection
  (AC-40) — THEN the API SHALL keep any earlier stored brief unchanged and return an error stating the
  reason, and the PR Brief block SHALL keep showing the earlier brief (if any) with that reason and a
  "Try again" action.   [covers EC-5, EC-8, EC-22]
- AC-32 (Unwanted behaviour) [P1]: IF `GET` or `POST /pulls/:id/brief` names a PR that does not exist in
  the caller's workspace, THEN the API SHALL answer 404 without a model request.

### Verdict banner
- AC-33 (State-driven) [P3]: WHILE the PR has at least one completed review, the PR Brief block SHALL
  show, above the brief's summary, the verdict banner already used on the Agent runs tab with the
  verdict, the findings and blockers count, the PR score and the review summary of the most recent
  completed review.   [covers G-1; Q-6]
- AC-34 (State-driven) [P3]: WHILE the PR has no completed review, the PR Brief block SHALL NOT show the
  verdict banner and SHALL show the rest of the block unchanged.   [covers EC-15]

## Edge cases
- EC-1 The PR has no stored Intent (Intent never derived) → AC-9, AC-10
- EC-2 Blast radius is degraded (`flag_off`, `index_failed`, `index_partial`, `repo_too_large`,
  `no_data`) → AC-9; grounding then uses the PR's changed files only → AC-20, AC-21
- EC-3 No enabled agent or skill has documents attached, or every attached document is unreadable →
  AC-9, AC-23
- EC-4 A new commit is pushed after the brief was generated → AC-30
- EC-5 No API key for the "Risk Brief" provider → AC-41; provider error, rate limit or timeout → AC-31
- EC-6 The model returns zero risks or zero Review focus items, or all are dropped by grounding →
  AC-12, AC-16
- EC-7 The model names a path not in the PR and not in the Blast radius map, a path with a different
  case or a leading `./`, or a zero/negative line → AC-20, AC-21 (exact repo-relative match after the
  normalisation stated in "Untrusted inputs")
- EC-8 The model answer does not match the schema → AC-39, AC-31
- EC-9 First generation is slow → AC-4, AC-5
- EC-10 Double click on "Generate brief", or two tabs generate at once → AC-5, AC-42
- EC-11 The target file sits in a collapsed role group (for example Boilerplate) or is collapsed
  because it is large → AC-17
- EC-12 The target file has no patch (binary, too large for GitHub), or the line is outside the changed
  lines → AC-17, AC-43
- EC-13 A Review focus item or risk names a Blast radius caller file that the PR does not change →
  AC-19
- EC-14 Very large PR (hundreds of files), long description, many callers, large specs → AC-25, AC-40
- EC-15 No review has run on the PR yet → AC-34
- EC-16 The user leaves the Overview tab or the page while a generation runs → the generation
  continues on the server and the stored result is shown on return → AC-28, AC-29
- EC-17 PR description, issue, specs, hunk header text or finding titles contain text that tries to
  instruct the model → Untrusted inputs
- EC-18 Very long summary, risk title or reason, or very long paths → text wraps, nothing is cut off →
  NFR-3
- EC-19 The PR is closed or merged → generation and reading behave the same as for an open PR
- EC-20 The PR is removed with its repository → its stored brief is removed with it
- EC-21 A deep link with `file`/`line` is opened after a new commit removed that file or moved its
  lines, or with a hand-edited `file` value → AC-17, AC-43, AC-19
- EC-22 A regeneration fails while an earlier brief is shown → AC-35, AC-31
- EC-23 The description references an issue but no GitHub token is configured, the issue is not
  reachable, or the description references several issues → AC-9, AC-23 (only the first is read)
- EC-24 The model returns more than 5 risks or Review focus items → AC-44
- EC-25 The "Tour language" setting changes while a generation runs → the running generation keeps the
  language read at its start → AC-45
- EC-26 The brief language is Hebrew: right-to-left generated text that contains paths, identifiers
  and numbers → AC-46, AC-47
- EC-27 The "Tour language" setting changes after a brief was generated → AC-48

## Non-functional requirements
- NFR-1 (reliability): The number of model requests per generation SHALL be counted at the provider
  boundary and SHALL be exactly 1 on success and on every failure path after the request is sent, and
  0 for a rejected generation (AC-32, AC-40, AC-41, AC-42) and for reading a stored brief.
- NFR-2 (security): Generating and showing a brief SHALL NOT fetch any URL found in the PR description,
  issue, specs or model output — the only external read is the GitHub API request for the referenced
  issue (AC-23) — SHALL NOT read any file whose path comes from model output, and the PR Brief block
  SHALL render model-written text as plain text with no raw HTML and no links other than the in-app
  links built from grounded paths (AC-37).
- NFR-3 (accessibility): "Generate brief", "Regenerate brief", risk expand controls, risk file
  references and Review focus items SHALL be operable by keyboard with visible focus; each Review focus
  link SHALL have an accessible name containing its path and line, and each risk file reference its
  path; severity, the "Outdated" state and the language-changed state SHALL be stated as text, not by
  colour alone; keyboard focus order SHALL not change with the brief language; long text and
  paths SHALL wrap; generation start, success and failure and the navigation messages (AC-19, AC-43)
  SHALL be announced through a polite live region.
- NFR-4 (observability): Each generation SHALL log, in one structured line, the PR id, the input tokens
  per input source, the inputs shortened or left out, the number of risks, risk references and Review
  focus items returned, dropped by grounding and dropped by the cap, the brief language, the provider,
  model, tokens, cost and duration.

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| PR title, description, head commit SHA | Pull request record (GitHub import / polling) | PR author | Untrusted text; SHA trusted |
| Changed files: path, additions, deletions; diff totals | Pull request files (same data `GET /pulls/:id` returns as `files[]`) | DevDigest (from GitHub) | Paths untrusted strings |
| Hunk ranges and hunk header lines | Patch of each changed file; header lines only, never body lines | PR author (header text is code context) | Untrusted |
| Smart Diff role per file | Smart Diff grouping (path-based classification, no LLM) | DevDigest | Trusted (derived) |
| Review findings: file, line, title, severity | Latest completed review of each agent on the PR | DevDigest review agents | Untrusted text (model output) |
| Intent: summary, in scope, out of scope | Stored PR intent (Intent layer) | Model output stored earlier | Untrusted text |
| Blast radius summary, callers (symbol, file, line), degradation reason | Blast radius of the PR (same data as `GET /pulls/:id/blast`) | DevDigest repo-intel index | Trusted (derived); paths originate in the repository |
| Linked issue: title and body (≤ 20,000 bytes) | GitHub API, first issue referenced in the PR description, read at generation time | Issue author | Untrusted |
| Specification documents | Documents attached to enabled agents and their linked, globally enabled skills; effective document of the PR's repository (local copy over working copy) | Repository authors / workspace user | Untrusted |
| Verdict, findings count, blockers, PR score, review summary (banner) | Most recent completed review of the PR | DevDigest review agents | Trusted container of model output |
| Provider and model | Settings → Feature Models → "Risk Brief" | Workspace user | Trusted |
| Brief language | Settings → Workspace → "Tour language" (English, Ukrainian, Hebrew) | Workspace user | Validated against the three allowed values by the existing setting |
| API key presence | Local secrets store | Workspace user | Secret; only its presence is read for AC-41, never shown or stored |
| Generated summary, risks, Review focus | One model answer | Model | Untrusted; validated and grounded (AC-20, AC-21, AC-39, AC-44) |
| Stored brief with commit SHA, generation time, language, model, tokens, cost, missing and shortened inputs | DevDigest database, one per PR | DevDigest | Trusted container of untrusted text |
| Navigation target `file`, `line` | PR page URL | Whoever built the link (may be hand-edited) | Untrusted; matched against the PR's changed files |

## Untrusted inputs
- PR title, description, hunk header text, finding titles, linked issue, Intent text and specification
  documents — sent to the model only as data inside untrusted delimiters, never followed as
  instructions; bounded by the 8,000-token budget (AC-25) and, for the issue, 20,000 bytes; links
  inside them are never fetched (NFR-2).
- Model answer — validated against the answer schema (AC-39); every path compared against the PR's
  changed files and the Blast radius map after trimming whitespace and a leading `./`, with no case
  folding and no `..` accepted (AC-20, AC-21); line numbers accepted only as integers ≥ 1; capped
  (AC-44); rendered as plain text (NFR-2).
- Brief language — taken only from the stored workspace setting and inserted into the request as one of
  the three fixed values, never from a request body.
- URL `file` and `line` — `file` used only to look up a changed file of the PR, never to read anything
  on the server; `line` accepted only as an integer ≥ 1, otherwise ignored; both URL-encoded when the
  studio builds a link.

## Open questions
None.

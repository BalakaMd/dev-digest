# Spec: Onboarding Tour of a repository
Spec ID: SPEC-03
Status: approved
Supersedes: —

## Problem and user
A developer who joins a project, or a reviewer who opens an unfamiliar repository in DevDigest,
has no quick way to learn how the codebase is put together. Today they read the README, guess
which files matter and in which order, and work out by trial how to run the project. DevDigest
already indexes every imported repository (symbols, import graph, file rank), but none of that
reaches the user as a guided introduction. The cost is hours of orientation per person per
repository, and a first contribution that touches the wrong files.

## Goals / Non-goals
Goals:
- G-1 For any imported repository, the user gets a five-part tour: Architecture overview,
  Critical paths, How to run locally, Guided reading path, First tasks.
- G-2 The tour is grounded in the repository's own index and files: every file it names exists in
  the index, every run command comes from the repository, and the reading path follows the
  index's file rank, not the model's opinion.
- G-3 A tour costs exactly one narrative LLM call per generation, runs only when the user asks
  for it, and is kept, so opening it again costs nothing.
- G-4 The tour is written in the language the workspace chose.

Non-goals:
- NG-1 More than one LLM call per generation (no follow-up, repair or per-section call).
- NG-2 Re-indexing the repository from the tour page; the tour reads the existing index only.
- NG-3 Running, validating or executing any "How to run locally" command.
- NG-4 Editing the tour text by hand in the studio.
- NG-5 Tours for anything other than an imported repository's default branch as last synced.
- NG-6 Marking reading-path files as read or tracking reading progress (P-4 rejected).
- NG-7 A public, hosted or shareable-with-others link; "Share link" copies a local studio URL
  that works only where the studio runs (Q-5).
- NG-8 An in-app file viewer; "Open" goes to GitHub (Q-8).
- NG-9 GitHub issues (for example "good first issue") as a source of first tasks (Q-3).
- NG-10 Generating a tour automatically after indexing or on page open (Q-4).
- NG-11 A reduced or prose-only tour when the index is missing, partial or degraded (Q-7).
- NG-12 A diagram derived from the import graph or a fallback diagram (Q-6).
- NG-13 Run commands the model infers without a source in the repository (Q-13).
- NG-14 Keeping the collapsed state of sections across visits or reloads (Q-14).
- NG-15 Translating file paths, code identifiers, package names, scripts, commands, environment
  variable names or route patterns (Q-12).
- NG-16 Localizing the studio UI: the tour page's headings, labels and buttons stay English; only
  generated text follows "Tour language" (Q-18).
- NG-17 Tour languages other than English, Ukrainian and Hebrew (Q-17).
- NG-18 Detecting or correcting a model answer in the wrong language (EC-29).

## User stories
- US-1 As a developer new to a repository, I want one page that explains its architecture and
  its most important files, so that I know where to start.
- US-2 As a developer new to a repository, I want a numbered reading path ordered by how central
  each file is, so that I read the foundations first.
- US-3 As a developer new to a repository, I want copyable run commands and a few first tasks,
  so that I can run the project and make a first change on day one.
- US-4 As a workspace user, I want to know when the tour is outdated and regenerate it, so that
  it does not describe old code.
- US-5 As a workspace user, I want the tour in my team's language, so that newcomers read it
  without translating.

## Acceptance criteria (EARS)

### Page and navigation
- AC-1 (Ubiquitous): The sidebar SHALL show an "Onboarding Tour" entry in the WORKSPACE group that
  opens the Onboarding Tour page of the active repository.   [covers US-1, EC-18]
- AC-2 (Ubiquitous): The sidebar SHALL highlight "Onboarding Tour" while the Onboarding Tour page
  is open, and SHALL NOT highlight it on the add-repository page.
- AC-3 (State-driven): WHILE a stored tour exists for the repository, the Onboarding Tour page
  SHALL show the heading "Onboarding for <repository name>", a "Regenerate" button, a "Share link"
  button, the provenance line "Generated from index of <N> files · last refreshed <relative
  time>" where N is the indexed file count at generation time and the time is when the stored
  tour was generated, an "On this page" list, and the five sections in this order: Architecture
  overview, Critical paths, How to run locally, Guided reading path, First tasks; these headings
  and every fixed label and button of the page SHALL stay in the studio's English UI copy
  whatever the tour language is.   [covers US-1; Q-9, Q-18]
- AC-4 (Event-driven): WHEN the user activates an entry of "On this page", the Onboarding Tour page
  SHALL scroll to that section, move keyboard focus to the section heading, and mark that entry as
  the current one.
- AC-5 (Event-driven): WHEN the user activates a section's collapse control, the Onboarding Tour
  page SHALL hide or show that section's body and expose the expanded state on the control; every
  section SHALL be expanded each time the page is opened or reloaded.   [Q-14, NG-14]
- AC-26 (Event-driven): WHEN the user activates "Share link", the Onboarding Tour page SHALL copy to
  the clipboard the studio URL of this repository's tour page including the anchor of the section
  currently marked in "On this page", and announce "Link copied" through a polite live region.
  [Q-5]
- AC-27 (Ubiquitous): The "Share link" button SHALL carry a tooltip and accessible description
  stating that the link opens the tour only where this DevDigest studio runs.   [Q-5, NG-7]
- AC-28 (Event-driven): WHEN the Onboarding Tour page opens with a section anchor in its URL, the
  page SHALL scroll to that section and mark its "On this page" entry as current.   [Q-5]

### Sections
- AC-6 (Ubiquitous): The Architecture overview section SHALL show a prose description of the
  repository's structure, with file and folder names in code style, and the diagram written by the
  same single LLM request; the prose SHALL be shown whether or not the diagram is shown.
  [covers US-1; Q-6]
- AC-7 (Ubiquitous): The Critical paths section SHALL list at most 5 distinct files taken from the
  dependency chains that the repository index derives from its top-ranked files, in descending
  file-rank order with equal ranks ordered by repo-relative path ascending, each with its path, a
  one-line reason written by the LLM, and an "Open" button.   [covers US-1, EC-13; Q-2, Q-16, Q-20]
- AC-29 (Ubiquitous): A number stated in a critical-path reason (for example how many files import
  it) SHALL be the value the repository index supplied to the model for that file; the API SHALL
  supply such counts with the file list.   [Q-2]
- AC-30 (Event-driven): WHEN the user activates "Open" on a file in Critical paths, Guided reading
  path or First tasks, the Onboarding Tour page SHALL open that file on the repository's default
  branch on GitHub in a new browser tab.   [Q-8, P-7]
- AC-8 (Ubiquitous): The How to run locally section SHALL list numbered commands, each shown as
  monospace text with a copy button whose accessible name includes the command number.
  [covers US-3]
- AC-36 (Ubiquitous): Every command in How to run locally SHALL come from the repository's own
  run sources in the working copy — a script defined in a package manifest, a command written in
  the README or another setup document, or a service defined in a container compose file — and
  the API SHALL give the model only those sources for this section.   [covers G-2, EC-16; Q-13, NG-13]
- AC-37 (State-driven): WHILE the stored tour has no run command, the How to run locally section
  SHALL show "No run instructions found in the repository" and SHALL NOT show "Copy all".
  [covers EC-16; Q-13]
- AC-9 (Event-driven): WHEN the user activates a command's copy button, the Onboarding Tour page
  SHALL put the exact command text on the clipboard and announce "Copied" through a polite live
  region.   [covers US-3]
- AC-31 (Event-driven): WHEN the user activates "Copy all" in the How to run locally section, the
  Onboarding Tour page SHALL put every command on the clipboard in the listed order, one per line,
  and announce "Copied" through a polite live region.   [covers US-3; P-5]
- AC-10 (Unwanted behaviour): IF writing to the clipboard fails for a copy button, "Copy all" or
  "Share link", THEN the Onboarding Tour page SHALL announce that copying failed and leave the text
  selectable on the page.   [covers EC-14]
- AC-11 (Ubiquitous): The Guided reading path section SHALL list the top 7 files by
  repository-index file rank, excluding tests, configuration, declaration and migration files,
  numbered from 1 in descending rank order with equal ranks ordered by repo-relative path
  ascending, each with its path, a one-line reason written by the LLM, and an "Open" button; WHEN
  fewer than 7 eligible files exist, the section SHALL list all of them.   [covers US-2, EC-13; Q-1, Q-10, P-7]
- AC-12 (Ubiquitous): The choice and order of the Guided reading path files SHALL be computed from
  the repository index without the LLM, so that the same index always yields the same list in the
  same order; the LLM SHALL only write the reasons.   [covers US-2, G-2; Q-1]
- AC-13 (Ubiquitous): The First tasks section SHALL list 3 to 5 suggested first tasks written by
  the LLM, each with a one-line description and at least one repo-relative path of a file in the
  repository index that the task touches, each path with an "Open" button.   [covers US-3; Q-3, P-7]
- AC-14 (Unwanted behaviour): IF the model's output names a file path that is not in the
  repository index at generation time, THEN the API SHALL drop that path, SHALL drop a first task
  left with no indexed path, and SHALL NOT render that path as a link anywhere in the tour.
  [covers EC-9, G-2]

### Language
- AC-38 (Ubiquitous): Settings → Workspace SHALL offer a workspace-wide "Tour language" select with
  exactly three values — English, Ukrainian, Hebrew — and English as the value of a workspace
  that never set it; the options SHALL be labelled "English", "Українська" and "עברית".
  [covers US-5; Q-12, Q-17, Q-21]
- AC-42 (Unwanted behaviour): IF a request sets "Tour language" to any value other than English,
  Ukrainian or Hebrew, THEN the API SHALL reject it with 422 and keep the stored value.
  [covers Untrusted inputs; Q-17]
- AC-39 (Ubiquitous): Each generation SHALL write the prose, the reasons and the first-task
  descriptions in the "Tour language" value read when the generation starts, the single LLM
  request SHALL name that language explicitly, file paths, code identifiers, package names,
  scripts, commands, environment variable names and route patterns SHALL stay verbatim, and the
  API SHALL store that language with the tour.   [covers US-5, G-4, EC-25; Q-12, NG-15]
- AC-40 (State-driven): WHILE the stored tour's language differs from the current "Tour language"
  setting, the Onboarding Tour page SHALL show "Tour language changed since this tour was
  generated" next to "Regenerate", as text and not by colour alone, and SHALL NOT start a
  generation without the user activating "Regenerate".   [covers EC-24; Q-19, NG-10]

### Right-to-left tours
- AC-43 (State-driven): WHILE the stored tour's language is Hebrew, the Onboarding Tour page SHALL
  render the generated prose, critical-path and reading-path reasons and first-task descriptions
  right-to-left and right-aligned, while the page layout, headings, buttons, "On this page" list
  and numbering stay left-to-right.   [covers EC-26; Q-17]
- AC-44 (Ubiquitous): File paths, inline code, run commands and the architecture diagram SHALL be
  rendered left-to-right and isolated from surrounding text direction, so that their characters
  appear in source order inside right-to-left text and are copied unchanged.   [covers EC-26, EC-27; Q-17]
- AC-45 (Ubiquitous): Within a right-to-left reason or task line, the item's file path and its
  "Open" button SHALL keep the same position and order as in a left-to-right tour, so that
  keyboard focus order does not change with the tour language.   [covers EC-28; NFR-3]

### Generation
- AC-15 (Ubiquitous): Each tour generation SHALL make exactly one LLM request, which writes the
  narrative of all five sections and the architecture diagram; file selection and reading-path
  order SHALL come from the repository index.   [covers G-3, NG-1]
- AC-16 (Ubiquitous): Each generation SHALL use the provider and model set in Settings → Feature
  Models → "Onboarding Tour" at the moment the generation starts.
- AC-17 (State-driven): WHILE no tour is stored for the repository and no generation runs, the
  Onboarding Tour page SHALL show the "Generate onboarding tour" empty state with a "Generate
  onboarding tour" button, and SHALL NOT start a generation without the user activating it.
  [Q-4, NG-10]
- AC-18 (State-driven): WHILE a generation runs for the repository, the Onboarding Tour page SHALL
  show a progress state, keep "Generate" and "Regenerate" disabled, and announce the start through
  a polite live region.   [covers EC-10]
- AC-32 (State-driven): WHILE a regeneration runs and an earlier tour is stored, the Onboarding Tour
  page SHALL keep showing the earlier tour with a banner stating that a new tour is being
  generated.   [covers EC-20; P-3]
- AC-33 (Ubiquitous): A generation SHALL continue when the user leaves or reloads the Onboarding
  Tour page; WHEN the user opens the page again, the page SHALL show the running generation's
  progress state, or its result once it has finished.   [covers EC-11; P-6]
- AC-19 (Event-driven): WHEN a generation succeeds, the API SHALL store the tour for the
  repository, replacing any earlier one, and the Onboarding Tour page SHALL show it and announce
  completion through a polite live region.   [covers US-4]
- AC-20 (Unwanted behaviour): IF the LLM request fails or times out, or its output cannot be read
  as a tour at all, THEN the API SHALL NOT send a second LLM request for that generation, SHALL
  keep any earlier stored tour unchanged, and the Onboarding Tour page SHALL show the earlier tour
  (if any) with an error banner that states the reason and offers "Try again".
  [covers EC-6, EC-7, EC-20, NG-1; P-3, Q-15]
- AC-21 (Unwanted behaviour): IF the model's output can be read as a tour but a section is missing
  or invalid, or a section is left with no content after AC-14, THEN the API SHALL store the tour
  with the valid sections, and the Onboarding Tour page SHALL show each such section with "Not
  enough data for this section" and a "Regenerate" action, without a second LLM request.
  [covers EC-7, EC-22; Q-15]
- AC-41 (Unwanted behaviour): IF the model's output has no reason for a Critical paths or Guided
  reading path file, THEN the Onboarding Tour page SHALL list that file without a reason line,
  keeping its index-based position.   [covers EC-7; Q-15]
- AC-22 (Ubiquitous): Opening the Onboarding Tour page for a repository with a stored tour SHALL
  show that tour without any LLM request and without re-indexing.   [covers G-3]
- AC-23 (Unwanted behaviour): IF a generation is requested while another one runs for the same
  repository, THEN the API SHALL NOT start a second LLM request and SHALL attach the request to
  the running generation, so that every open tour page of that repository shows its progress and
  then its result.   [covers EC-10; Q-11]
- AC-24 (State-driven): WHILE the repository has no completed index, has a partial or degraded
  index, has no working copy, or has zero indexed source files, the Onboarding Tour page SHALL
  disable "Generate" and "Regenerate", show the reason and the index state, and keep showing a
  stored tour if one exists; a generation request in this state SHALL be rejected by the API with
  that reason and without an LLM request.   [covers EC-1, EC-2, EC-3, EC-4, EC-23; Q-7, NG-11]
- AC-34 (State-driven): WHILE no API key is stored for the provider of the "Onboarding Tour"
  feature model, the Onboarding Tour page SHALL show a notice that names that provider with a link
  to Settings → API keys and disable "Generate" and "Regenerate"; a generation request in this
  state SHALL be rejected by the API with that reason and without an LLM request.
  [covers EC-5; P-1]
- AC-35 (State-driven): WHILE the repository index was last updated after the stored tour was
  generated, the Onboarding Tour page SHALL show "Index changed since this tour was generated"
  next to "Regenerate", as text and not by colour alone.   [covers US-4, EC-12; P-2]

### Rendering of generated content
- AC-25 (Ubiquitous): The Onboarding Tour page SHALL render generated prose as Markdown without raw
  HTML, render the diagram only after it parses as valid Mermaid syntax with scripts and links
  disabled, and show nothing in the diagram's place when it is missing or does not parse.
  [covers EC-8; Q-6]

## Edge cases
- EC-1 The repository was imported but never indexed → AC-24
- EC-2 The index is partial or degraded (no import graph, so no file rank) → AC-24
- EC-3 The repository has no source files the indexer understands (empty or docs-only) → AC-24
- EC-4 The repository has no working copy (not cloned, clone failed) → AC-24
- EC-5 No API key is stored for the provider the Onboarding Tour model uses → AC-34
- EC-6 The LLM request fails, is rate-limited or times out → AC-20
- EC-7 The model returns unreadable output → AC-20; a missing section or reason → AC-21, AC-41
- EC-8 The model returns a diagram that does not parse, or none → AC-25, AC-6
- EC-9 The model names a file that is not in the index (hallucinated path) → AC-14
- EC-10 The user clicks Regenerate twice, or two tabs start a generation at once → AC-18, AC-23
- EC-11 The user leaves or reloads the page while a generation runs and comes back → AC-33
- EC-12 The index is refreshed after the tour was generated → AC-35
- EC-13 Fewer than 7 eligible ranked files, or several files share one rank → AC-11, AC-7
- EC-14 The clipboard is not available (permission denied, insecure context) → AC-10
- EC-15 Very long file paths or reasons → the full text stays readable by wrapping → NFR-3
- EC-16 No run commands can be found in the repository (no scripts, no README instructions) →
  AC-36, AC-37
- EC-17 Repository files contain text that tries to instruct the model → Untrusted inputs
- EC-18 The user switches the active repository while on the tour page → the page shows the tour
  of the newly selected repository → AC-1
- EC-19 The repository is removed from the workspace → its stored tour is removed with it
- EC-20 Regenerate fails while an earlier tour is shown → AC-20, AC-32
- EC-21 A shared link is opened in a studio where that repository is not imported → the existing
  "repository not found" state of the studio → AC-28
- EC-22 Every first task is dropped by AC-14, or the dependency chains yield no files → AC-21
- EC-23 The index becomes degraded after a tour was stored → the tour stays visible, Regenerate is
  disabled with the reason → AC-24
- EC-24 The "Tour language" setting changes after tours were generated → AC-40
- EC-25 The "Tour language" setting changes while a generation runs → the running generation keeps
  the language read at its start → AC-39; the result is then subject to AC-40
- EC-26 Hebrew prose that contains file paths, identifiers, numbers or English technology names
  (mixed direction) → AC-43, AC-44
- EC-27 A path or command at the start or end of a Hebrew sentence, or next to punctuation, would
  be reordered by the bidirectional algorithm without isolation → AC-44
- EC-28 Keyboard and screen-reader order in a Hebrew tour → AC-45, NFR-3
- EC-29 The model answers in a language other than the requested one → not detected; the user can
  Regenerate → AC-39 (explicit language in the request)

## Non-functional requirements
- NFR-1 (reliability): Every generation SHALL make exactly one LLM request, counted at the
  provider boundary, including on failure paths; rejected requests (AC-24, AC-34) and requests
  attached to a running generation (AC-23) SHALL make none.
- NFR-2 (security): Generating and reading a tour SHALL NOT execute any command, write into the
  working copy, or fetch any URL found in repository content or model output; "Open" links SHALL
  be built from the repository's GitHub identity, its default branch and an indexed path, never
  from model-supplied URLs.
- NFR-3 (accessibility): The "On this page" list, the collapse controls, every copy button, "Copy
  all", "Open", "Regenerate", "Share link" and "Generate onboarding tour" SHALL be operable by
  keyboard alone with visible focus; icon-only controls SHALL have accessible names; "Open" SHALL
  state in its accessible name the file path and that it opens a new tab; long paths and reasons
  SHALL wrap instead of being cut off; generation start, success and failure SHALL be announced
  through a polite live region.
- NFR-4 (performance): Opening a stored tour SHALL make no LLM request and no index computation
  (AC-22).

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| File rank, dependency chains, importer counts, indexed file list and count, index state and time | repo-intel index of the repository | DevDigest | Trusted (derived), but file paths originate in the repository |
| File contents, README and setup documents, package manifests' scripts, compose files used as model context | Working copy, default branch as last synced | Repository authors | Untrusted |
| Generated prose, diagram, reasons, commands, first tasks | One LLM response | Model | Untrusted |
| Model and provider | Settings → Feature Models → Onboarding Tour | Workspace user | Trusted |
| Tour language | Settings → Workspace, workspace-wide "Tour language" (new; English, Ukrainian, Hebrew) | Workspace user | Validated against the three allowed values (AC-42) |
| API key presence | Local secrets store | Workspace user | Secret; only its presence is read for AC-34, never shown or stored with the tour |
| Repository GitHub identity and default branch for "Open" | Imported repository record | DevDigest | Trusted |
| Stored tour, its generation time, indexed file count and language | DevDigest database, one per repository | DevDigest | Trusted container of untrusted text |

## Untrusted inputs
- Repository content sent to the model — wrapped as data in untrusted delimiters, never followed
  as instructions; only text from the working copy, size-bounded by the model context budget.
- Model output — validated against the tour contract before it is stored; file paths checked
  against the index (AC-14); prose rendered as Markdown without raw HTML; diagram rendered only
  after parsing, with scripts and links disabled (AC-25).
- Run commands — shown as plain text and copied verbatim; never executed or interpreted by
  DevDigest (NFR-2).
- File paths — treated as repo-relative strings; never used to read outside the working copy;
  URL-encoded when placed into a GitHub link.
- Tour language value — accepted only as one of English, Ukrainian, Hebrew (AC-42) and inserted
  into the prompt as that fixed value, never as free text from a request body.

## Open questions
None.

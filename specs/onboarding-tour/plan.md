# Development Plan: Onboarding Tour of a repository

Created: 2026-10-04 · Branch: lab-005 · HEAD: 6c9b1cd · Status: ready
Spec: specs/onboarding-tour/spec.md · SPEC-03 · approved
Recommended mode: multi-agent (chosen by the user) — ~60 files in 3 packages; the server and client chains run in parallel, tests are written by independent test-writers. One run, no slicing.
Coverage profile (user): depth:standard, skip:integration,ui, security:keep. Skipped tests are marked ⊘ below; kept: T-1…T-7 (server/reviewer-core unit), T-9 (nav regression), T-10 (Open URL encoding — NFR-2), T-13 (TourMarkdown no raw HTML/links — AC-14/AC-25/NFR-2).

## Decisions (checkpoint A)
Q-1: a minimal edit of the vendored `client/src/vendor/ui/nav.ts` is ALLOWED as an explicit exception (only the "Onboarding Tour" NAV item and the "Workspace" entry in `SETTINGS_SECTIONS`). Q-2: `singleAttempt` flag in the 3 adapters. Q-3: no migration (language/indexed count live in `onboarding.json`; the setting is a key/value row). Q-4: lenient schema with nullable fields; a section is invalid when null/blank/empty after cleaning; a run section without commands is shown per AC-37. Q-5: in-memory generation registry in the service (state lost on API restart; single API instance). Q-mode: multi-agent. I1 accepted; I2, I3 dropped.

## Requirements
Verbatim from the spec (bracketed `[covers …]` tags omitted).
- AC-1: "The sidebar SHALL show an "Onboarding Tour" entry in the WORKSPACE group that opens the Onboarding Tour page of the active repository." → S6
- AC-2: "The sidebar SHALL highlight "Onboarding Tour" while the Onboarding Tour page is open, and SHALL NOT highlight it on the add-repository page." → S6
- AC-3: "WHILE a stored tour exists for the repository, the Onboarding Tour page SHALL show the heading "Onboarding for <repository name>", a "Regenerate" button, a "Share link" button, the provenance line "Generated from index of <N> files · last refreshed <relative time>" where N is the indexed file count at generation time and the time is when the stored tour was generated, an "On this page" list, and the five sections in this order: Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks; these headings and every fixed label and button of the page SHALL stay in the studio's English UI copy whatever the tour language is." → S4, S7, S8, S9
- AC-4: "WHEN the user activates an entry of "On this page", the Onboarding Tour page SHALL scroll to that section, move keyboard focus to the section heading, and mark that entry as the current one." → S7, S9
- AC-5: "WHEN the user activates a section's collapse control, the Onboarding Tour page SHALL hide or show that section's body and expose the expanded state on the control; every section SHALL be expanded each time the page is opened or reloaded." → S7
- AC-26: "WHEN the user activates "Share link", the Onboarding Tour page SHALL copy to the clipboard the studio URL of this repository's tour page including the anchor of the section currently marked in "On this page", and announce "Link copied" through a polite live region." → S9
- AC-27: "The "Share link" button SHALL carry a tooltip and accessible description stating that the link opens the tour only where this DevDigest studio runs." → S9
- AC-28: "WHEN the Onboarding Tour page opens with a section anchor in its URL, the page SHALL scroll to that section and mark its "On this page" entry as current." → S9
- AC-6: "The Architecture overview section SHALL show a prose description of the repository's structure, with file and folder names in code style, and the diagram written by the same single LLM request; the prose SHALL be shown whether or not the diagram is shown." → S4, S5, S7
- AC-7: "The Critical paths section SHALL list at most 5 distinct files taken from the dependency chains that the repository index derives from its top-ranked files, in descending file-rank order with equal ranks ordered by repo-relative path ascending, each with its path, a one-line reason written by the LLM, and an "Open" button." → S2, S4, S5, S8
- AC-29: "A number stated in a critical-path reason (for example how many files import it) SHALL be the value the repository index supplied to the model for that file; the API SHALL supply such counts with the file list." → S2, S4, S5
- AC-30: "WHEN the user activates "Open" on a file in Critical paths, Guided reading path or First tasks, the Onboarding Tour page SHALL open that file on the repository's default branch on GitHub in a new browser tab." → S6, S8
- AC-8: "The How to run locally section SHALL list numbered commands, each shown as monospace text with a copy button whose accessible name includes the command number." → S8
- AC-36: "Every command in How to run locally SHALL come from the repository's own run sources in the working copy — a script defined in a package manifest, a command written in the README or another setup document, or a service defined in a container compose file — and the API SHALL give the model only those sources for this section." → S4
- AC-37: "WHILE the stored tour has no run command, the How to run locally section SHALL show "No run instructions found in the repository" and SHALL NOT show "Copy all"." → S4, S8
- AC-9: "WHEN the user activates a command's copy button, the Onboarding Tour page SHALL put the exact command text on the clipboard and announce "Copied" through a polite live region." → S8
- AC-31: "WHEN the user activates "Copy all" in the How to run locally section, the Onboarding Tour page SHALL put every command on the clipboard in the listed order, one per line, and announce "Copied" through a polite live region." → S8
- AC-10: "IF writing to the clipboard fails for a copy button, "Copy all" or "Share link", THEN the Onboarding Tour page SHALL announce that copying failed and leave the text selectable on the page." → S7, S8, S9
- AC-11: "The Guided reading path section SHALL list the top 7 files by repository-index file rank, excluding tests, configuration, declaration and migration files, numbered from 1 in descending rank order with equal ranks ordered by repo-relative path ascending, each with its path, a one-line reason written by the LLM, and an "Open" button; WHEN fewer than 7 eligible files exist, the section SHALL list all of them." → S2, S4, S8
- AC-12: "The choice and order of the Guided reading path files SHALL be computed from the repository index without the LLM, so that the same index always yields the same list in the same order; the LLM SHALL only write the reasons." → S2, S4
- AC-13: "The First tasks section SHALL list 3 to 5 suggested first tasks written by the LLM, each with a one-line description and at least one repo-relative path of a file in the repository index that the task touches, each path with an "Open" button." → S4, S8
- AC-14: "IF the model's output names a file path that is not in the repository index at generation time, THEN the API SHALL drop that path, SHALL drop a first task left with no indexed path, and SHALL NOT render that path as a link anywhere in the tour." → S4, S7
- AC-38: "Settings → Workspace SHALL offer a workspace-wide "Tour language" select with exactly three values — English, Ukrainian, Hebrew — and English as the value of a workspace that never set it; the options SHALL be labelled "English", "Українська" and "עברית"." → S1, S6
- AC-42: "IF a request sets "Tour language" to any value other than English, Ukrainian or Hebrew, THEN the API SHALL reject it with 422 and keep the stored value." → S1
- AC-39: "Each generation SHALL write the prose, the reasons and the first-task descriptions in the "Tour language" value read when the generation starts, the single LLM request SHALL name that language explicitly, file paths, code identifiers, package names, scripts, commands, environment variable names and route patterns SHALL stay verbatim, and the API SHALL store that language with the tour." → S4, S5
- AC-40: "WHILE the stored tour's language differs from the current "Tour language" setting, the Onboarding Tour page SHALL show "Tour language changed since this tour was generated" next to "Regenerate", as text and not by colour alone, and SHALL NOT start a generation without the user activating "Regenerate"." → S5, S9
- AC-43: "WHILE the stored tour's language is Hebrew, the Onboarding Tour page SHALL render the generated prose, critical-path and reading-path reasons and first-task descriptions right-to-left and right-aligned, while the page layout, headings, buttons, "On this page" list and numbering stay left-to-right." → S7, S8
- AC-44: "File paths, inline code, run commands and the architecture diagram SHALL be rendered left-to-right and isolated from surrounding text direction, so that their characters appear in source order inside right-to-left text and are copied unchanged." → S7, S8
- AC-45: "Within a right-to-left reason or task line, the item's file path and its "Open" button SHALL keep the same position and order as in a left-to-right tour, so that keyboard focus order does not change with the tour language." → S8
- AC-15: "Each tour generation SHALL make exactly one LLM request, which writes the narrative of all five sections and the architecture diagram; file selection and reading-path order SHALL come from the repository index." → S3, S4, S5
- AC-16: "Each generation SHALL use the provider and model set in Settings → Feature Models → "Onboarding Tour" at the moment the generation starts." → S5
- AC-17: "WHILE no tour is stored for the repository and no generation runs, the Onboarding Tour page SHALL show the "Generate onboarding tour" empty state with a "Generate onboarding tour" button, and SHALL NOT start a generation without the user activating it." → S5, S9
- AC-18: "WHILE a generation runs for the repository, the Onboarding Tour page SHALL show a progress state, keep "Generate" and "Regenerate" disabled, and announce the start through a polite live region." → S9
- AC-32: "WHILE a regeneration runs and an earlier tour is stored, the Onboarding Tour page SHALL keep showing the earlier tour with a banner stating that a new tour is being generated." → S9
- AC-33: "A generation SHALL continue when the user leaves or reloads the Onboarding Tour page; WHEN the user opens the page again, the page SHALL show the running generation's progress state, or its result once it has finished." → S5, S6, S9
- AC-19: "WHEN a generation succeeds, the API SHALL store the tour for the repository, replacing any earlier one, and the Onboarding Tour page SHALL show it and announce completion through a polite live region." → S5, S9
- AC-20: "IF the LLM request fails or times out, or its output cannot be read as a tour at all, THEN the API SHALL NOT send a second LLM request for that generation, SHALL keep any earlier stored tour unchanged, and the Onboarding Tour page SHALL show the earlier tour (if any) with an error banner that states the reason and offers "Try again"." → S3, S5, S9
- AC-21: "IF the model's output can be read as a tour but a section is missing or invalid, or a section is left with no content after AC-14, THEN the API SHALL store the tour with the valid sections, and the Onboarding Tour page SHALL show each such section with "Not enough data for this section" and a "Regenerate" action, without a second LLM request." → S4, S8
- AC-41: "IF the model's output has no reason for a Critical paths or Guided reading path file, THEN the Onboarding Tour page SHALL list that file without a reason line, keeping its index-based position." → S4, S8
- AC-22: "Opening the Onboarding Tour page for a repository with a stored tour SHALL show that tour without any LLM request and without re-indexing." → S5
- AC-23: "IF a generation is requested while another one runs for the same repository, THEN the API SHALL NOT start a second LLM request and SHALL attach the request to the running generation, so that every open tour page of that repository shows its progress and then its result." → S5
- AC-24: "WHILE the repository has no completed index, has a partial or degraded index, has no working copy, or has zero indexed source files, the Onboarding Tour page SHALL disable "Generate" and "Regenerate", show the reason and the index state, and keep showing a stored tour if one exists; a generation request in this state SHALL be rejected by the API with that reason and without an LLM request." → S4, S5, S9
- AC-34: "WHILE no API key is stored for the provider of the "Onboarding Tour" feature model, the Onboarding Tour page SHALL show a notice that names that provider with a link to Settings → API keys and disable "Generate" and "Regenerate"; a generation request in this state SHALL be rejected by the API with that reason and without an LLM request." → S5, S9
- AC-35: "WHILE the repository index was last updated after the stored tour was generated, the Onboarding Tour page SHALL show "Index changed since this tour was generated" next to "Regenerate", as text and not by colour alone." → S5, S9
- AC-25: "The Onboarding Tour page SHALL render generated prose as Markdown without raw HTML, render the diagram only after it parses as valid Mermaid syntax with scripts and links disabled, and show nothing in the diagram's place when it is missing or does not parse." → S7
- NFR-1: "(reliability): Every generation SHALL make exactly one LLM request, counted at the provider boundary, including on failure paths; rejected requests (AC-24, AC-34) and requests attached to a running generation (AC-23) SHALL make none." → S3, S5
- NFR-2: "(security): Generating and reading a tour SHALL NOT execute any command, write into the working copy, or fetch any URL found in repository content or model output; "Open" links SHALL be built from the repository's GitHub identity, its default branch and an indexed path, never from model-supplied URLs." → S4, S5, S6, S7, S8
- NFR-3: "(accessibility): The "On this page" list, the collapse controls, every copy button, "Copy all", "Open", "Regenerate", "Share link" and "Generate onboarding tour" SHALL be operable by keyboard alone with visible focus; icon-only controls SHALL have accessible names; "Open" SHALL state in its accessible name the file path and that it opens a new tab; long paths and reasons SHALL wrap instead of being cut off; generation start, success and failure SHALL be announced through a polite live region." → S7, S8, S9
- NFR-4: "(performance): Opening a stored tour SHALL make no LLM request and no index computation (AC-22)." → S5

## Traceability
`B` = `client/src/app/repos/[repoId]/onboarding-tour/_components/OnboardingTourView`. ⊘ = skipped by the coverage profile (skip: integration, ui); a row with only ⊘ is `not tested — profile`, its manual hint stays. Verify: `server` = `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `client` = `cd client && pnpm typecheck && pnpm test`; `both` = both.

| Req | Steps | Tests | Verify | Verification hint | State |
|-----|-------|-------|--------|-------------------|-------|
| AC-1 | S6 | T-9 | client | sidebar WORKSPACE "Onboarding Tour" → `/repos/<id>/onboarding-tour` | planned |
| AC-2 | S6 | T-9 | client | highlighted on the tour page, not on `/onboarding` | planned |
| AC-3 | S4,S7,S8,S9 | ⊘T-14,⊘T-15 | client | stored tour: heading, provenance, ToC, 5 sections, English labels (also for Hebrew) | planned |
| AC-4 | S7,S9 | ⊘T-13,⊘T-15 | client | click a ToC entry: scroll, focus on the heading, `aria-current` | planned |
| AC-5 | S7 | ⊘T-13 | client | `aria-expanded` toggles; after reload all expanded | planned |
| AC-26 | S9 | ⊘T-15 | client | clipboard = `<origin>/repos/<id>/onboarding-tour#<anchor>`, "Link copied" | planned |
| AC-27 | S9 | ⊘T-15 | client | tooltip + `aria-describedby` "…only where this DevDigest studio runs" | planned |
| AC-28 | S9 | ⊘T-15 | client | open `…#reading-path`: scrolled, ToC entry current | planned |
| AC-6 | S4,S5,S7 | T-5 | both | prose with `code`; invalid diagram hidden, prose stays | planned |
| AC-7 | S2,S4,S5,S8 | T-2,T-5 | both | ≤5 files, rank desc, ties by path, reasons | planned |
| AC-29 | S2,S4,S5 | T-2,T-5 | server | stored `imported_by` = index in-degree = number in the prompt | planned |
| AC-30 | S6,S8 | T-10 | client | Open: `_blank`, `noopener noreferrer`, `github.com/<full_name>/blob/<branch>/<path>` | planned |
| AC-8 | S8 | ⊘T-14 | client | numbered monospace commands, button "Copy command 2" | planned |
| AC-36 | S4 | T-6 | server | model input holds only manifest scripts/README/compose | planned |
| AC-37 | S4,S8 | T-5 | client | no commands: text, no "Copy all" | planned |
| AC-9 | S8 | ⊘T-14 | client | exact command on the clipboard, "Copied" | planned |
| AC-31 | S8 | ⊘T-14 | client | Copy all: lines in order | planned |
| AC-10 | S7,S8,S9 | ⊘T-13,⊘T-14,⊘T-15 | client | `writeText` rejects → "Copy failed" announced | planned |
| AC-11 | S2,S4,S8 | T-2 | both | 7 files, junk excluded, numbered 1..7; <7 eligible → all | planned |
| AC-12 | S2,S4 | T-2 | server | shuffled facts → same list | planned |
| AC-13 | S4,S8 | T-5 | both | 3–5 tasks, each path has Open | planned |
| AC-14 | S4,S7 | T-5,T-13 | server | hallucinated path absent from stored JSON; a link in prose rendered as text | planned |
| AC-38 | S1,S6 | T-1,⊘T-11,⊘T-8 | both | Settings → Workspace: 3 options; new workspace = English | planned |
| AC-42 | S1 | T-1,⊘T-8 | server | `PUT /settings {"tour_language":"French"}` → 422, value unchanged | planned |
| AC-39 | S4,S5 | T-5,T-7 | server | messages contain "Hebrew"; tour `language:"Hebrew"` | planned |
| AC-40 | S5,S9 | T-5,⊘T-8,⊘T-15 | both | change language in Settings → text on the page, no generation | planned |
| AC-43 | S7,S8 | ⊘T-13,⊘T-14 | client | Hebrew tour: prose/reasons `dir=rtl`; headings, ToC, numbers LTR | planned |
| AC-44 | S7,S8 | ⊘T-13,⊘T-14 | client | paths/code/commands/diagram `dir=ltr`, `unicode-bidi:isolate` | planned |
| AC-45 | S8 | ⊘T-14 | client | DOM order path → Open → reason identical for en/he | planned |
| AC-15 | S3,S4,S5 | T-4,T-7 | both | `MockLLMProvider.calls.length === 1` | planned |
| AC-16 | S5 | T-7 | server | model changed in Settings → next call uses it | planned |
| AC-17 | S5,S9 | T-7,⊘T-15 | both | no tour: empty state; state read makes 0 LLM calls | planned |
| AC-18 | S9 | ⊘T-15 | client | running: progress, buttons disabled, live region | planned |
| AC-32 | S9 | ⊘T-15 | client | regeneration: old tour + banner | planned |
| AC-33 | S5,S6,S9 | T-7,⊘T-12,⊘T-15 | both | start, reload: progress/result; poll 2 s while `running` | planned |
| AC-19 | S5,S9 | T-7,⊘T-15 | both | success replaces tour, `generated_at` updated | planned |
| AC-20 | S3,S5,S9 | T-4,T-7,⊘T-15 | both | LLM throws → 1 call, old tour kept, "Try again" banner | planned |
| AC-21 | S4,S8 | T-5 | both | empty section → "Not enough data for this section" + Regenerate | planned |
| AC-41 | S4,S8 | T-5 | both | file without reason listed without reason line | planned |
| AC-22 | S5 | T-7,⊘T-8 | server | stored tour read: 0 LLM calls, no facts call | planned |
| AC-23 | S5 | T-7 | server | two POSTs → 1 LLM call, both `running` | planned |
| AC-24 | S4,S5,S9 | T-5,T-7,⊘T-15 | both | no index/partial/degraded/no clone/0 files → 422 `reason`, 0 calls; UI disabled | planned |
| AC-34 | S5,S9 | T-7,⊘T-15 | both | no provider key → 422 `missing_key`, 0 calls; notice + link to `/settings/api-keys` | planned |
| AC-35 | S5,S9 | T-5,⊘T-8,⊘T-15 | both | index `updated_at` bumped → "Index changed since…" | planned |
| AC-25 | S7 | T-13 | client | `<script>`/raw HTML in markdown not rendered; invalid diagram renders nothing (manual) | planned |
| NFR-1 | S3,S5 | T-4,T-7 | both | provider-mock call counter for success/failure/unreadable; one HTTP attempt in adapters | planned |
| NFR-2 | S4,S5,S6,S7,S8 | T-6,T-7,T-10,T-13 | both | nothing executed/written; Open href from `state.repo` + indexed path, encoded | planned |
| NFR-3 | S7,S8,S9 | ⊘T-13,⊘T-14,⊘T-15 | client | manual Tab pass, icon-button names, wrapping, polite live region | planned |
| NFR-4 | S5 | T-7,⊘T-8 | server | state read: no facts, no LLM | planned |

## Non-functional requirements
| NFR / quality | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 | spec | one `completeStructured` with `singleAttempt:true`, `maxRetries:0`; adapters skip `withRetry`/SDK retries for it (S3); no JobRunner (retries 2×, `jobs.ts:42`); reject/attach before the call (S5) | T-4, T-7 |
| NFR-2 | spec | no exec/write; model gets only text from `git.readFile` of fixed names; Open built from `state.repo` + indexed path, URL-encoded (S6); `a` in prose rendered as text (S7) | T-6, T-10, T-13 |
| NFR-3 | spec + client guidance | native buttons, `aria-expanded`/`aria-current`, `aria-label` with path, `overflow-wrap:anywhere`, one polite live region (S7–S9) | manual Tab pass (UI tests ⊘) |
| NFR-4 | spec | state read = stored JSON + index-state row only; facts only in generate (S5) | T-7 |
| Untrusted input | spec + CLAUDE.md | `wrapUntrusted` for repo text; `tour_language` only an enum; paths checked against `indexedPaths`; Markdown without raw HTML (S4, S5, S7) | T-5–T-7, T-13 |
| Language pin | server INSIGHTS 2026-09-25 | explicit language in system prompt and user message (S4) | T-7 |

## Requirements review
No blocking findings; the Q-1…Q-5 decisions are recorded above. Requirements suggestions for the spec author (no step changes behaviour):
1. AC-24 "partial": any parse error gives `status='partial'` (`full.ts:252`), so a repo with one unparsable file cannot get a tour.
2. AC-35 compares the index `updated_at`; a no-op refresh bumps it (`incremental.ts:98`) → false "Index changed". Planned literally.
3. AC-36 limits only the model input; output commands are not checked against the sources.
4. AC-7 does not exclude tests/configs from critical paths while AC-11 does (roots at `service.ts:735` are unfiltered).
5. Not specified: cap on number/length of commands; retention of a failure after an API restart.
6. Legacy `Onboarding` contract (`knowledge.ts:28-47`) and the "syncOn" string (`settings.json:46`) become misleading.

## Scope
In: shared contract + `tour_language`; repo-intel `getOnboardingFacts`; `singleAttempt` flag; module `server/src/modules/onboarding` (GET state, POST generate); prompt rewrite; tour page, sidebar entry, Settings → Workspace panel (Tour language only); RTL.
Out: NG-1…NG-18; docs steps (doc-writer); migrations; the legacy `Onboarding` contract stays untouched.

## Context used
- Guidance read: CLAUDE.md, server/AGENTS.md, client/AGENTS.md, TESTING.md, onion-architecture SKILL + zod-contracts rule, pr-self-review routing; INSIGHTS: root, server, client.
- Lessons applied: server 2026-09-25 language pin → S4 prompt; 2026-09-24 list ORDER BY → S2 tie-break; 2026-09-26 hermetic keys → T-7 injects `MockSecretsProvider`/`llm.openrouter`. client: `relativeTime` needs `useNow` (S9); no `user-event` → `fireEvent` (T-13); markdown bold splits text nodes (T-13); no new sticky header. Root 2026-09-24: vendor/shared already drifts — apply the same edit to the client copies of `platform.ts`/`adapters.ts`/`index.ts`, copy `onboarding-tour.ts` verbatim.
- Skills: onion-architecture S1–S5; zod S1, S4, S5; fastify-best-practices S5; drizzle-orm-patterns S2, S5; typescript-expert all; security S4–S8 (constraints); frontend-ui-architecture, react-best-practices, next-best-practices S6–S9; react-testing-library T-13.

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| Contract = new file, barrel extended | zod-contracts.md | `contracts/onboarding-tour.ts` + 1 export line; old `Onboarding` untouched |
| Both vendor/shared copies in one commit | CLAUDE.md | S1 |
| Service takes ports, not Container | onion SKILL | `OnboardingService` explicit deps; container getter assembles it (`container.ts:202` precedent) |
| Drizzle only in repository | onion | `OnboardingRepository` |
| Route = 1 service call, Zod schemas | server/AGENTS.md | `params: IdParams`, `response` schema |
| Static module registration | CLAUDE.md | 1 import + 1 entry in `modules/index.ts` |
| No migration | CLAUDE.md, Q-3 | none |
| Strings via next-intl, thin pages, no fetch in components | client/AGENTS.md | `onboarding.json`, `onboardingSections.json`; hooks → `api` |
| vendor edits | CLAUDE.md + user exception | S1 (shared), S6 (`nav.ts`, only the two entries) |
| Hermetic tests | TESTING.md | mocks from `adapters/mocks.ts` |

## Steps
### S1 Shared contracts, tour_language setting, single-attempt flag
- Module / layer: `@devdigest/shared` (ring 2), both copies
- Files: create `server/src/vendor/shared/contracts/onboarding-tour.ts` (+ identical `client/src/vendor/shared/contracts/onboarding-tour.ts`): `TourLanguage = z.enum(['English','Ukrainian','Hebrew'])`; `OnboardingTour` {generated_at, language, indexed_files:int, provider, model, architecture:{markdown,diagram:string|null}|null, critical_paths:{path,reason:string|null,imported_by:int,imports:int}[]|null, run:{commands:string[]}, reading_path:{rank:int,path,reason:string|null}[]|null, first_tasks:{description,paths:string[]}[]|null}; `OnboardingBlocked` {reason: 'not_indexed'|'partial'|'degraded'|'no_clone'|'no_source_files', message, index_status: 'none'|'full'|'partial'|'degraded'|'failed', files_indexed}; `OnboardingTourState` {tour|null, generation:{status:'idle'|'running'|'failed',started_at|null,error|null}, blocked|null, missing_key:{provider}|null, tour_language, language_changed, index_changed, repo:{full_name,default_branch}}. Modify in both copies: `index.ts` (+ export line), `contracts/platform.ts` (`SettingsKnown.tour_language: TourLanguage.default('English')`), `adapters.ts` (`StructuredRequest.singleAttempt?: boolean`).
- Skills to apply: zod; onion-architecture § zod-contracts; typescript-expert
- Depends on: —
- Tests (single-agent): T-1
- Done when: both packages compile; `SettingsUpdate.parse({tour_language:'French'})` throws.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && cd ../client && pnpm typecheck`

### S2 repo-intel facade: ranked facts
- Module / layer: `server/src/modules/repo-intel`
- Files: modify `types.ts` (`RankedFileRow{path,rank,importedBy,imports}`, `OnboardingFacts{indexedPaths,readingPath,criticalPaths}`, `RepoIntel.getOnboardingFacts(repoId, opts:{readingPath:number; criticalPaths:number})`); `repository.ts` (`asc(path)` tie-break in `getRankedPaths` :457, `ORDER BY from,to` in `getEdges` :432 — needed for AC-7/AC-12 determinism); `service.ts` (empty when `repoIntelEnabled` off; full ranked list, not the 10× window of `getTopFilesByRank` :703; reading path = ranked minus `isJunkPath`, top N; critical files = distinct files of `getCriticalPaths()` chains sorted rank desc/path asc, first N; counts from `getEdges`); create `onboarding-facts.ts` (pure functions; takes the `isJunk` predicate).
- Skills to apply: onion-architecture; drizzle-orm-patterns; typescript-expert
- Depends on: —
- Tests (single-agent): T-2, T-3
- Done when: shuffled input gives identical lists; flag off → empty.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`

### S3 One-attempt structured completion in the adapters
- Module / layer: `server/src/adapters/llm`, `reviewer-core/src/llm`
- Files: modify `server/src/adapters/llm/openai.ts` (with `req.singleAttempt`: no `withRetry`, one loop iteration, per-request SDK `{maxRetries:0}`), `server/src/adapters/llm/anthropic.ts` (same), `reviewer-core/src/llm/openrouter.ts` (one iteration, per-request `{maxRetries:0}`). Default behaviour unchanged. Confirm the per-request `maxRetries` option exists in the installed SDK versions.
- Skills to apply: onion-architecture; typescript-expert
- Depends on: S1
- Tests (single-agent): T-4
- Done when: with the flag a 500/429/unparseable answer = exactly 1 HTTP call and an error.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && cd ../reviewer-core && npm test && npm run typecheck`

### S4 Onboarding module — pure core
- Module / layer: `server/src/modules/onboarding` (application, no IO of its own) + prompt
- Files: create `constants.ts` (reading path 7, critical 5, tasks max 5, schema name `OnboardingNarrative`, temperature, prompt budget, anchors, run-source file names), `types.ts`, `helpers.ts` (`OnboardingNarrative` lenient strict-compatible schema, no optional fields: `{architecture:{markdown,diagram:string|null}|null, critical_paths:[{path,reason}], run_commands:string[], reading_path:[{path,reason}], first_tasks:[{description,paths:string[]}]}`; `assembleTour` — reasons matched to facts by exact path, missing → null; order only from facts; paths checked against `indexedPaths`; a task without a path dropped; ≤5 tasks; empty sections → null; `run.commands` always an array; `evaluateReadiness` from index state/`clonePath`/`filesIndexed`; `staleFlags`; `userMessage` using `wrapUntrusted` and an explicit language), `run-sources.ts` (via `git.readFile` ONLY fixed names: root and top-level folders (from indexed paths) `package.json` scripts, `README*`, `CONTRIBUTING.md`, `docs/{setup,getting-started,development}.md`, `docker-compose.yml|yaml`, `compose.yml|yaml`; missing skipped; size-bounded); rewrite `server/src/prompts/onboarding.system.md` (5 spec sections, `{{language}}` fixed enum value, untrusted-data block, grounding, commands only from RUN SOURCES, counts only from FACTS, mermaid rules, no raw HTML, identifiers verbatim).
- Skills to apply: onion-architecture; zod; security § untrusted input; typescript-expert
- Depends on: S1, S2
- Tests (single-agent): T-5, T-6
- Done when: T-5/T-6 green; no drizzle/adapter imports in the module.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`

### S5 Onboarding module — persistence, generation, routes, wiring
- Module / layer: repository + service + routes + container
- Files: create `onboarding/repository.ts` (workspace-scoped: repo basics incl. `defaultBranch`/`clonePath`; get/upsert tour JSON in table `onboarding` with `onConflictDoUpdate` and explicit `generatedAt = now()`; read the `tour_language` settings row), `onboarding/service.ts` (deps: repository, repoIntel, git, `llm(id)`, `resolveModel(ws)`, `hasSecret(provider)`, `now`, logger; `getState` — repo + tour + index-state + setting, no facts, no LLM; `generate` order: 404 → readiness 422 `{reason}` → missing key 422 `{reason:'missing_key',provider}` → attach if running → start: read language + model now, facts, run sources, ONE `completeStructured({singleAttempt:true,maxRetries:0})`, `assembleTour`, save; in-memory registry `Map<ws:repo,{startedAt,promise}>` + last failure (sanitised, bounded message); returns `running` state), `onboarding/routes.ts` (`GET /repos/:id/onboarding`, `POST /repos/:id/onboarding/generate` → 202; `IdParams`, `response: OnboardingTourState`); modify `platform/container.ts` (lazy getter `onboarding`, key presence via `SECRET_KEY_BY_PROVIDER`), `modules/index.ts` (1 import + 1 entry).
- Skills to apply: onion-architecture; fastify-best-practices; zod; drizzle-orm-patterns; security
- Depends on: S1, S2, S3, S4
- Tests (single-agent): T-7
- Done when: routes work under `inject`; one LLM call per generation in every scenario.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`

### S6 Client: data hooks, Open URL, sidebar, Settings → Workspace
- Module / layer: `client/src/lib`, `app-shell`, settings, vendored nav
- Files: create `client/src/lib/hooks/onboarding-tour.ts` (`useOnboardingTour(repoId)` with `refetchInterval` 2000 while `generation.status==='running'`, else false; `useGenerateOnboardingTour(repoId)` writes state into the cache); modify `client/src/lib/github-urls.ts` (+`githubFileUrl(fullName, branch, path)`, encodes branch and path segments); modify `client/src/vendor/ui/nav.ts` (exception granted: only NAV item `{key:'onboarding-tour', label:'Onboarding Tour', href:'/repos/:repoId/onboarding-tour'}` between pulls and context, no `gKey`, existing `IconName`; and `SETTINGS_SECTIONS` += `{key:'workspace', label:'Workspace'}`); `client/src/components/app-shell/helpers.ts` (`/onboarding-tour` → `onboarding-tour`; bare `/onboarding` → `""`); `SettingsView.tsx` + `constants.ts` (`SECTION_WORKSPACE`); create `SettingsView/_components/SettingsWorkspace/{SettingsWorkspace.tsx,index.ts,styles.ts}` (only the "Tour language" select via `useSettings`/`useUpdateSettings`, default English); modify `client/messages/en/settings.json` (`workspace.tourLanguage*`, endonym labels).
- Skills to apply: frontend-ui-architecture; react-best-practices; next-best-practices; typescript-expert
- Depends on: S1
- Tests (single-agent): T-9, T-10
- Done when: sidebar item and Settings → Workspace work; PUT sends `{tour_language}`.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S7 Client: tour building blocks (leaf components)
- Module / layer: `B/_components/*`, `client/src/components/mermaid-diagram`
- Files: create under `B/_components/`: `TourMarkdown/` (local `react-markdown` + `remark-gfm`, `skipHtml`, `a` → plain text, `code` `dir=ltr`; the vendored `Markdown` is not used because its `a` renders model links — AC-14/NFR-2), `TourText/` (`dir` for generated text by language; path/code/command wrapper `dir=ltr`, `unicode-bidi:isolate`), `SectionCard/` (heading `tabIndex=-1` with anchor id, collapse button `aria-expanded`, local state initially open), `TourToc/` ("On this page", `aria-current`), `ArchitectureSection/` (markdown + `MermaidDiagram`), `clipboard.ts` (`copyText(text): Promise<boolean>`), `useAnnouncer.ts` + `LiveRegion` (`aria-live="polite"`); modify `client/src/components/mermaid-diagram/MermaidDiagram.tsx` (wrapper `dir="ltr"`, `unicode-bidi:isolate`); create `client/messages/en/onboardingSections.json`.
- Skills to apply: frontend-ui-architecture; react-best-practices; security
- Depends on: S1
- Tests (single-agent): T-13
- Done when: components render standalone; a diagram that fails to parse renders nothing.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S8 Client: list sections
- Module / layer: `B/_components/*`
- Files: create `OpenButton/` (`<a target=_blank rel="noopener noreferrer">`, `aria-label` = path + opens in a new tab, href from `githubFileUrl`), `CopyButton/` (aria-label with number), `PathReasonRow/` (DOM order path → Open → reason, `dir` only on the reason, wrapping), `CriticalPathsSection/`, `ReadingPathSection/` (numbers LTR), `FirstTasksSection/`, `RunSection/` (numbered monospace commands, "Copy all", AC-37 text), shared "Not enough data for this section" + Regenerate component; modify `onboardingSections.json`.
- Skills to apply: frontend-ui-architecture; react-best-practices; typescript-expert
- Depends on: S6, S7
- Tests (single-agent): — (UI tests ⊘)
- Done when: sections render from an `OnboardingTour` fixture incl. nulls and the Hebrew variant.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S9 Client: page, header, notices, navigation
- Module / layer: `client/src/app/repos/[repoId]/onboarding-tour`
- Files: create `page.tsx` (thin), `B/{OnboardingTourView.tsx,index.ts,styles.ts,constants.ts,helpers.ts}` (view state: loading/error/RepoNotFound/empty/blocked/missing key/generating/failed/stale), `_components/TourHeader/` (heading, provenance via `useNow` + `format.relativeTime`, Regenerate, Share link with tooltip + `aria-describedby`), `_components/TourNotices/` (blocked reason + index state, key notice with link, language/index changed text, regeneration banner, error banner + Try again), `useTourNavigation.ts` (active section, scroll + focus, initial `location.hash`), page-level `LiveRegion` (start/success/failure); rewrite `client/messages/en/onboarding.json` (stale 5-section copy; add keys).
- Skills to apply: frontend-ui-architecture; react-best-practices; next-best-practices
- Depends on: S6, S7, S8
- Tests (single-agent): — (UI tests ⊘)
- Done when: the page works against a fixture and the real API.
- Verify: `cd client && pnpm typecheck && pnpm test`

### I1 Log generation (recommended, S)
- Files: `onboarding/service.ts` — log start/finish/failure (repo id, provider/model, tokens, cost, dropped-path count) via the app logger; no secrets.
- Depends on: S5 · Verify: `cd server && pnpm typecheck`

## Execution modes
Single-agent: one implementer runs S1 → S9 in order (I1 after S5), writing the kept T-n inside their steps.
Multi-agent (chosen; ≤ ~12 files per instance, one instance per package per wave):
| Wave | Instance | Steps | Owned files / area |
|------|----------|-------|--------------------|
| 1 | implementer #1 | S1 | `*/vendor/shared/**` (both copies) |
| 2 | implementer #1 (server) | S2, S3 | `repo-intel/*`, `adapters/llm/*`, `reviewer-core/src/llm` |
| 2 | implementer #2 (client) | S6 | hooks, github-urls, nav, app-shell helpers, settings |
| 3 | implementer #1 (server) | S4, S5, I1 | `modules/onboarding/**`, prompt, `container.ts`, `modules/index.ts` |
| 3 | implementer #2 (client) | S7 | `B/_components` kit, mermaid, `onboardingSections.json` |
| 4 | implementer #2 (client) | S8 | list sections |
| 4 | test-writer #1 (server) | T-1…T-7 | `server/test/**`, `reviewer-core/test/**` |
| 5 | implementer #2 (client) | S9 | page, header, notices, `onboarding.json` |
| 6 | test-writer #2 (client) | T-9, T-10, T-13 | `client/src/**/*.test.ts(x)` (non-UI + security guards only) |
Recommended: multi-agent — server and client chains in parallel, independent test-writers; the client chain is serial.

## Cross-module contracts & sync points
- `onboarding-tour.ts`, `platform.ts`, `adapters.ts`, `index.ts` — `server/src/vendor/shared` (canonical) and `client/src/vendor/shared`, one commit (S1).
- `RepoIntel.getOnboardingFacts` — `repo-intel/types.ts`, `service.ts`; cast mock `RepoIntel` objects in tests (`conventions.it.test.ts:110`) need the method where called.
- `GET /repos/:id/onboarding`, `POST …/generate` — `routes.ts` ↔ `lib/hooks/onboarding-tour.ts`.
- `tour_language` — `SettingsKnown` ↔ `SettingsWorkspace` ↔ `OnboardingRepository` ↔ prompt.
- NAV key `onboarding-tour` ↔ `shell.json:20` ↔ `activeKeyFor` ↔ `nav.test.ts`.
- Stale statements for doc-writer: `client/messages/en/settings.json:45-47` ("Sync generated docs… onboarding tours… written to the repo folder" — no code, contradicts NFR-2); `client/specs/pages.md`, `client/docs/ui-architecture.md`, `client/README.md` (route/hook maps); `server/README.md` API map; `server/src/modules/index.ts:26-29` comment; `repo-intel/README.md`, `types.ts:170` wording; `TESTING.md`.

## Test plan
- Existing suites: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` (tie-break and adapters may break existing tests — update in the step); `cd client && pnpm test`; `cd reviewer-core && npm test`.
- Kept:
  - T-1 contract/enum + 422 shape — `server/test/contracts.test.ts` — S1 / test-writer #1
  - T-2 pure facts: reading path (junk, ties, <7, shuffle determinism), critical files (≤5, order, counts, no chains) — `server/test/repo-intel-onboarding-facts.test.ts` — S2
  - T-3 flag off → empty — `server/test/repo-intel-facade-degraded.test.ts` — S2
  - T-4 `singleAttempt`: one HTTP call on 500/429/unparseable — `server/test/llm-single-attempt.test.ts`, `reviewer-core/test/openrouter-single-attempt.test.ts` — S3
  - T-5 helpers (AC-6/13/14/21/24/35/37/39/40/41) — `server/test/onboarding-helpers.test.ts` — S4
  - T-6 run sources: allowed files only, scripts only, missing files, injection text stays inside `<untrusted>` — `server/test/onboarding-run-sources.test.ts` — S4
  - T-7 service with in-memory repository + mock LLM: one call on success/failure/unreadable; rejects without a call; attach; language/model read at start; old tour kept; replace; state read makes no LLM/facts call — `server/test/onboarding-service.test.ts` — S5
  - T-9 nav item + `activeKeyFor` regression (`/onboarding` not highlighted) — `client/src/components/app-shell/nav.test.ts` — S6 / test-writer #2
  - T-10 `githubFileUrl` encoding (NFR-2) — `client/src/lib/github-urls.test.ts` — S6 / test-writer #2
  - T-13 (reduced) `TourMarkdown`: raw HTML not rendered, link rendered as text (AC-14/AC-25/NFR-2) — S7 / test-writer #2
- Skipped by profile: T-8 (integration `onboarding.it.test.ts`), T-11 (SettingsWorkspace), T-12 (hook polling), T-14 (list sections), T-15 (view), the rest of T-13 (ToC, SectionCard, RTL, Mermaid). Covered by manual hints.
- Not tested: real Mermaid render and clipboard (jsdom); real LLM language compliance (EC-29); API restart during a generation (Q-5).

## Risks & open questions
- None blocking. Risk: `getCriticalPaths` yields no chains for repos without edges (EC-22) → section "Not enough data". Risk: a second Markdown renderer (S7) because the vendored one is not editable — accepted for AC-14.

## Self-check
1 pass · 2 pass (skipped tests carry an explicit profile reason) · 3 pass · 4 pass · 5 pass · 6 pass · 7 pass · 8 pass (no blocking item) · 9 pass · 10 pass (the Q-mode answer is recorded in Decisions)

## Out of scope for the implementer
Architecture and security review are done by separate agents. Requirements are fixed by the spec or task; a needed change goes back to the user, not into the code.

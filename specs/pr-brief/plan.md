# Development Plan: PR Brief on the Overview tab

Created: 2026-10-04 · Branch: hw-05 · HEAD: fe59fa2 · Status: ready
Spec: specs/pr-brief/spec.md · SPEC-04 · approved
Recommended mode: multi-agent — three independent areas (server module, diff deep link, client block) in 3 impl waves + one parallel test wave (server / client); a second pair of eyes on NFR-1 counting and grounding tests.

## Requirements
- AC-1: "The Overview tab SHALL show a "PR Brief" block as its first section, above the PR description." → S8
- AC-2: "WHILE no brief is stored for the PR and no generation runs for it, the PR Brief block SHALL show a "Generate brief" button, and the studio SHALL NOT start a generation without the user activating it." → S6, S8
- AC-3: "WHEN the user activates "Generate brief" or the "Regenerate brief" control, the PR Brief block SHALL request a new brief through `POST /pulls/:id/brief` and, when the request succeeds, SHALL show the returned brief without a page reload." → S3, S6, S8
- AC-4: "WHILE a generation runs and no brief is stored for the PR, the PR Brief block SHALL show a skeleton in place of the summary, Risk areas and Review focus." → S8
- AC-5: "WHILE a generation runs for the PR, the PR Brief block SHALL keep "Generate brief" and "Regenerate brief" disabled and mark them busy." → S6, S8
- AC-35: "WHILE a regeneration runs and an earlier brief is stored, the PR Brief block SHALL keep showing the earlier brief together with the text "Regenerating…" instead of a skeleton." → S8
- AC-6: "WHILE a brief is stored for the PR, the PR Brief block SHALL show, under the "PR Brief" heading, the brief's summary of what the PR does and why as its own paragraph, a "Risk areas" section, a "Review focus" section, and a "Regenerate brief" control that belongs to the brief block (not to the verdict banner) and is shown whether or not a review exists." → S7, S8
- AC-7: "WHILE a brief is stored for the PR, the PR Brief block SHALL show the existing Intent card and Blast radius card with their current live data next to Risk areas, each with its existing empty or unavailable state when the PR has no such data." → S8 · assumes Q-3
- AC-8: "Every fixed label of the PR Brief block (block and section titles, empty states, buttons, messages, severity words) SHALL come from the studio's `brief` message namespace, not from text written in a component, and SHALL stay in the studio's English UI copy whatever the brief language is." → S4, S7, S8
- AC-36: "WHILE a brief is stored for the PR, the PR Brief block SHALL show the line "Generated <relative time> · commit <first 7 characters of the commit SHA> · <model>", using the generation time, commit SHA and model stored with the brief." → S8
- AC-41: "WHILE no API key is stored for the provider of the "Risk Brief" feature model, the PR Brief block SHALL disable "Generate brief" and "Regenerate brief" and show a notice that names that provider with a link to Settings → API keys, keeping a stored brief visible; a generation request in this state SHALL be rejected by the API with that reason and without a model request." → S3, S6, S8
- AC-42: "IF a generation is requested for a PR while another generation runs for the same PR, THEN the API SHALL answer 409 without a model request, and the PR Brief block SHALL show "Generation already running" and keep showing what it showed before." → S3, S8
- AC-9: "IF a generation starts while the PR has no stored Intent, its Blast radius is degraded or unavailable, no specification document is injected (AC-23), or a linked issue is referenced but cannot be read (AC-23), THEN the API SHALL still generate the brief, SHALL record each missing input with its reason in the brief (for Blast radius, the degradation reason the Blast radius API reports), and the PR Brief block SHALL state in text which inputs were missing." → S2, S3, S8
- AC-10: "IF a generation starts while the PR has no stored Intent, THEN the API SHALL NOT derive an Intent or make any model request other than the brief's own." → S3
- AC-11: "Each risk in Risk areas SHALL show its title, its severity as the text "high", "medium" or "low", and one or more file references, each a repo-relative path without a line number." → S7
- AC-12: "WHILE the stored brief has no risk, Risk areas SHALL show "No notable risks flagged."" → S7
- AC-13: "WHEN the user activates a risk's expand control, the PR Brief block SHALL show or hide that risk's explanation and expose the expanded state on the control." → S7
- AC-14: "WHEN the user activates a file reference of a risk, the PR page SHALL navigate to that file as specified in AC-17 and AC-19, without a line target." → S7, S8
- AC-15: "Review focus SHALL list its items in the order the brief stores them, each showing `<path>:<line>` in monospace followed by its reason, under a heading that shows the number of items." → S7
- AC-16: "WHILE the stored brief has no Review focus item, the Review focus section SHALL show a message that no starting point was suggested." → S7
- AC-37: "Each Review focus item and each risk file reference SHALL be a link to the PR page URL with `tab=diff`, `file=<URL-encoded path>` and, for Review focus items, `line=<line>`, so that it can be opened in a new browser tab, and browser Back from Files changed SHALL return to the Overview tab." → S7, S8
- AC-17: "WHEN the PR page is opened or navigated with `tab=diff` and a `file` that is among the PR's changed files, it SHALL show the Files changed tab, expand that file and, in Smart order, its role group if collapsed, and scroll the file into view below the page's sticky header, in whichever of Smart order or Original order is active." → S5, S8
- AC-18: "WHEN the PR page navigates under AC-17 with a `line` that is a row on the new side of the file's diff, it SHALL scroll to that row and visibly mark it for at least 2 seconds." → S5
- AC-43: "IF the PR page navigates under AC-17 with a `line` that is not a row on the new side of the file's diff, or the file has no patch, THEN it SHALL show the file without marking any row and show the note "Line <line> is outside the changed lines" at the file, announced through a polite live region." → S4, S5
- AC-38: "WHEN the PR page navigates under AC-17, it SHALL move keyboard focus to the header of the target file." → S5
- AC-19: "IF the PR page is opened or navigated with `tab=diff` and a `file` that is not among the PR's changed files (for example a Blast radius caller file, a file removed by a later commit, or a hand-edited value), THEN it SHALL show the Overview tab with the short message "File not in this PR's diff", announced through a polite live region." → S5, S8
- AC-20: "IF a file reference of a risk names a path that is neither among the PR's changed files nor in the PR's Blast radius map (changed-symbol files and caller files) at generation time, THEN the API SHALL remove that reference, SHALL keep the risk while at least one of its references remains, and SHALL drop the risk when none remains." → S2, S3
- AC-21: "IF a Review focus item names a file that is neither among the PR's changed files nor in the PR's Blast radius map at generation time, or a line number below 1, THEN the API SHALL drop that item before the brief is stored." → S2, S3
- AC-44: "After AC-20 and AC-21, the API SHALL keep at most the first 5 risks and the first 5 Review focus items in the model's order and drop the rest before the brief is stored." → S2
- AC-22: "The shared brief contract `PrBrief`, identical in both copies of the shared contract, SHALL consist of `summary`, `risks` (each `kind`, `title`, `explanation`, `severity` high | medium | low, `file_refs` as repo-relative paths), `review_focus` (each `file`, `line`, `reason`), the commit SHA, generation time, brief language, provider and model, input tokens, output tokens, cost, measured input size, missing inputs with reasons, and shortened or skipped inputs; it SHALL NOT contain `intent`, `blast` or `history`." → S1
- AC-39: "IF the model's answer does not validate against the answer schema `{ summary, risks[], review_focus[] }`, THEN the API SHALL NOT store it, SHALL NOT send another model request, and SHALL fail the generation under AC-31." → S2, S3
- AC-23: "Each generation SHALL give the model only these facts: the PR title and description; the stored Intent (summary, in scope, out of scope) when present; the Blast radius summary and its callers (symbol, file, line) when available; diff totals (file count, additions, deletions); per changed file its path, additions, deletions, Smart Diff role, and the hunk ranges and hunk header lines (`@@ -a,b +c,d @@` and the text after it) without any body line; the findings of the latest completed review of each agent (file, line, title, severity) when any exist; the title and body of the first issue referenced in the PR description under the issue-reference rules the Intent layer uses, read from GitHub at generation time and cut to at most 20,000 bytes; and the specification documents attached to every enabled agent and to the linked, globally enabled skills of those agents, de-duplicated by path, read as the effective document (local copy over repository) for the PR's repository, each wrapped as untrusted data." → S2, S3
- AC-24: "No diff hunk body line (added, removed or context) and no source file content SHALL be part of the model input." → S2
- AC-25: "The model input of one generation, counted as the system message plus the user message by the server's tokenizer, SHALL NOT exceed 8,000 tokens; to fit, the API SHALL shorten or leave out inputs in this order — specification documents (sorted by repo-relative path ascending, each dropped whole starting from the end of that order), linked issue, Blast radius callers, PR description, per-file list (including its hunk headers and the review findings) — and SHALL NEVER shorten the Intent or the diff totals; the API SHALL record in the brief and in the server log the measured input tokens and which inputs were shortened or left out." → S2, S3 · assumes Q-1, Q-4
- AC-40: "IF the inputs that are never shortened (system message, Intent, diff totals) alone exceed 8,000 tokens, THEN the API SHALL reject the generation with that reason and without a model request, and keep any earlier brief unchanged." → S2, S3 · assumes Q-4
- AC-26: "Each generation SHALL make exactly one HTTP request to the model provider, with no re-prompt and no transport retry, and the server log SHALL record one line per generation naming the provider, the model, input and output tokens, and cost." → S3
- AC-27: "Each generation SHALL use the provider and model set in Settings → Feature Models → "Risk Brief" at the moment the generation starts." → S3
- AC-45: "Each generation SHALL write the summary, risk titles, explanations and Review focus reasons in the workspace "Tour language" value (English, Ukrainian or Hebrew) read when the generation starts; the model request SHALL name that language explicitly; file paths, code identifiers, symbol names and route patterns SHALL stay verbatim; and the API SHALL store that language with the brief." → S2, S3
- AC-46: "WHILE the stored brief's language is Hebrew, the PR Brief block SHALL render the summary, risk titles, explanations and Review focus reasons right-to-left and right-aligned, while the block layout, headings, labels, buttons, severity words and keyboard focus order stay left-to-right." → S7, S8
- AC-47: "File paths, `<path>:<line>` references, line numbers and code identifiers in the PR Brief block SHALL be rendered left-to-right and isolated from the surrounding text direction, so that their characters appear in source order inside right-to-left text and are copied unchanged." → S7
- AC-48: "WHILE the stored brief's language differs from the current "Tour language" setting, the PR Brief block SHALL show the text "Language changed since this brief was generated" next to "Regenerate brief", as text and not by colour alone, and SHALL NOT start a generation without the user activating "Regenerate brief"." → S6, S8
- AC-28: "WHEN a generation succeeds, the API SHALL store the brief for the PR, replacing any earlier one, together with the PR head commit SHA read when the generation started and the generation time." → S3 · assumes Q-2
- AC-29: "`GET /pulls/:id/brief` SHALL return the stored brief of the PR with a `stale` flag, or an empty result when none is stored, without any model request; the PR page SHALL show a stored brief on open and after a reload without starting a generation." → S3, S6, S8
- AC-30: "WHILE the stored brief's commit SHA differs from the PR's current head SHA, the API SHALL return the brief with `stale: true`, and the PR Brief block SHALL keep showing the brief with the text "Outdated — generated for <first 7 characters of the stored SHA>" next to "Regenerate brief", as text and not by colour alone, without starting a generation." → S3, S8 · assumes Q-2
- AC-31: "IF a generation fails — provider error or timeout, no API key for the "Risk Brief" provider (AC-41), an answer that fails validation (AC-39), or the budget rejection (AC-40) — THEN the API SHALL keep any earlier stored brief unchanged and return an error stating the reason, and the PR Brief block SHALL keep showing the earlier brief (if any) with that reason and a "Try again" action." → S3, S8
- AC-32: "IF `GET` or `POST /pulls/:id/brief` names a PR that does not exist in the caller's workspace, THEN the API SHALL answer 404 without a model request." → S3
- AC-33: "WHILE the PR has at least one completed review, the PR Brief block SHALL show, above the brief's summary, the verdict banner already used on the Agent runs tab with the verdict, the findings and blockers count, the PR score and the review summary of the most recent completed review." → S8
- AC-34: "WHILE the PR has no completed review, the PR Brief block SHALL NOT show the verdict banner and SHALL show the rest of the block unchanged." → S8
- NFR-1: "(reliability): The number of model requests per generation SHALL be counted at the provider boundary and SHALL be exactly 1 on success and on every failure path after the request is sent, and 0 for a rejected generation (AC-32, AC-40, AC-41, AC-42) and for reading a stored brief." → S3
- NFR-2: "(security): Generating and showing a brief SHALL NOT fetch any URL found in the PR description, issue, specs or model output — the only external read is the GitHub API request for the referenced issue (AC-23) — SHALL NOT read any file whose path comes from model output, and the PR Brief block SHALL render model-written text as plain text with no raw HTML and no links other than the in-app links built from grounded paths (AC-37)." → S2, S3, S7
- NFR-3: "(accessibility): "Generate brief", "Regenerate brief", risk expand controls, risk file references and Review focus items SHALL be operable by keyboard with visible focus; each Review focus link SHALL have an accessible name containing its path and line, and each risk file reference its path; severity, the "Outdated" state and the language-changed state SHALL be stated as text, not by colour alone; keyboard focus order SHALL not change with the brief language; long text and paths SHALL wrap; generation start, success and failure and the navigation messages (AC-19, AC-43) SHALL be announced through a polite live region." → S5, S7, S8
- NFR-4: "(observability): Each generation SHALL log, in one structured line, the PR id, the input tokens per input source, the inputs shortened or left out, the number of risks, risk references and Review focus items returned, dropped by grounding and dropped by the cap, the brief language, the provider, model, tokens, cost and duration." → S3

## Traceability
| Requirement | Steps | Tests | Verify (command) | Verification hint | State |
|---|---|---|---|---|---|
| AC-1 | S8 | T-13 | `cd client && pnpm test` | PR page → Overview: "PR Brief" is the first section, above Description | planned |
| AC-2 | S6,S8 | T-13 | `cd client && pnpm test` | Open a PR with no brief: only the button; Network tab shows no POST /brief | planned |
| AC-3 | S3,S6,S8 | T-10,T-13 | `cd server && pnpm exec vitest run .it.test` | Click Generate: brief appears, no reload | planned |
| AC-4 | S8 | T-13 | `cd client && pnpm test` | Slow generation: skeleton in place of summary/risks/focus | planned |
| AC-5 | S6,S8 | T-13 | `cd client && pnpm test` | During the run both buttons disabled, `aria-busy`; double click sends one POST | planned |
| AC-35 | S8 | T-13 | `cd client && pnpm test` | Regenerate: old brief + "Regenerating…", no skeleton | planned |
| AC-6 | S7,S8 | T-13,T-14,T-15 | `cd client && pnpm test` | Stored brief: heading, summary paragraph, Risk areas, Review focus, Regenerate (also with no review) | planned |
| AC-7 | S8 | T-13 | `cd client && pnpm test` | Intent and Blast cards beside Risk areas, with their own empty states | assumes Q-3 |
| AC-8 | S4,S7,S8 | T-13 | `cd client && pnpm typecheck` | No literal strings in the new components (grep) | planned |
| AC-36 | S8 | T-13 | `cd client && pnpm test` | Line "Generated 2 minutes ago · commit abc1234 · <model>" | planned |
| AC-41 | S3,S6,S8 | T-5,T-13 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | Clear the provider key: buttons disabled + notice with link to /settings/api-keys; `curl -X POST /pulls/<id>/brief` → 422 `details.reason=missing_key` | planned |
| AC-42 | S3,S8 | T-5,T-13 | same | Two tabs click at once: second gets 409 "Generation already running" | planned |
| AC-9 | S2,S3,S8 | T-6,T-13 | same | PR without Intent / index off: brief generated, block lists missing inputs with reasons | planned |
| AC-10 | S3 | T-5 | same | Intent facade `derive` never called (test spy); one LLM call | planned |
| AC-11 | S7 | T-14 | `cd client && pnpm test` | Risk rows show title, text severity, path links | planned |
| AC-12 | S7 | T-14 | same | Brief with zero risks → "No notable risks flagged." | planned |
| AC-13 | S7 | T-14 | same | Chevron toggles explanation; `aria-expanded` flips | planned |
| AC-14 | S7,S8 | T-14,T-18 | same | Click a risk file → Files changed at that file, no line mark | planned |
| AC-15 | S7 | T-15 | same | `path:line` monospace + reason in stored order; heading shows count | planned |
| AC-16 | S7 | T-15 | same | Zero focus items → "no starting point" message | planned |
| AC-37 | S7,S8 | T-12,T-14,T-15 | same | Hover link shows `?tab=diff&file=…&line=…`; open in new tab works; Back returns to Overview | planned |
| AC-17 | S5,S8 | T-17,T-18 | same | Click focus item (Smart and Original order, target in collapsed Boilerplate group and in a collapsed large file): file expanded, scrolled below sticky header (real browser) | planned |
| AC-18 | S5 | T-17 | same | Target row marked ≥2 s and scrolled to | planned |
| AC-43 | S4,S5 | T-17 | same | `line=9999`, or file without patch: note, no marked row | planned |
| AC-38 | S5 | T-17 | same | After navigation `document.activeElement` is the file header | planned |
| AC-19 | S5,S8 | T-18 | same | Hand-edit `file=` to a non-PR path: Overview + message | planned |
| AC-20 | S2,S3 | T-2 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | Unit: refs/risks dropped per rule | planned |
| AC-21 | S2,S3 | T-2 | same | Unit: items with unknown file or line < 1 dropped | planned |
| AC-44 | S2 | T-2 | same | Unit: 7 in → 5 out, order kept | planned |
| AC-22 | S1 | T-11 | same | `diff` of both contract copies is empty; no intent/blast/history keys | planned |
| AC-39 | S2,S3 | T-5 | same | Invalid answer: error, earlier brief kept, one request | planned |
| AC-23 | S2,S3 | T-1,T-4,T-9 | same | Inspect captured `MockLLMProvider.calls[0].req.messages` | planned |
| AC-24 | S2 | T-1,T-4 | same | No `+`/`-`/space body line in captured messages | planned |
| AC-25 | S2,S3 | T-3 | same | Large PR: input ≤ 8,000 tokens, shortening order, recorded in brief + log | assumes Q-1, Q-4 |
| AC-40 | S2,S3 | T-3,T-5 | same | Oversized Intent: 422 `over_budget`, 0 requests | assumes Q-4 |
| AC-26 | S3 | T-5,T-8 | same | Mock call count = 1; one log line | planned |
| AC-27 | S3 | T-5 | same | Change Feature Models between runs: next request uses new model | planned |
| AC-45 | S2,S3 | T-4,T-5 | same | Language named in request; stored `language`; run one real call per language (server/INSIGHTS 2026-09-25) | planned |
| AC-46 | S7,S8 | T-16 | `cd client && pnpm test` | Hebrew brief: text `dir=rtl`, labels LTR | planned |
| AC-47 | S7 | T-16 | same | Paths `dir=ltr`, `unicode-bidi: isolate`, copy unchanged | planned |
| AC-48 | S6,S8 | T-13 | same | Change Tour language in Settings: text next to Regenerate, no POST | planned |
| AC-28 | S3 | T-5,T-10 | `cd server && pnpm exec vitest run .it.test` | Second POST replaces first; `pr_brief.json.head_sha` = PR head | assumes Q-2 |
| AC-29 | S3,S6,S8 | T-7,T-10,T-13 | same | Reload keeps brief, no POST | planned |
| AC-30 | S3,S8 | T-7,T-10,T-13 | same | Change `pull_requests.head_sha`: GET `stale:true`; text "Outdated — generated for abc1234" | assumes Q-2 |
| AC-31 | S3,S8 | T-5,T-13 | same | Mock provider throws: earlier brief + reason + "Try again" | planned |
| AC-32 | S3 | T-7,T-10 | same | GET/POST unknown uuid → 404, 0 requests | planned |
| AC-33 | S8 | T-13 | `cd client && pnpm test` | PR with a review: banner above summary | planned |
| AC-34 | S8 | T-13 | same | PR without review: no banner | planned |
| NFR-1 | S3 | T-5 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | Counter in the mock LLM: 1 / 1 / 0 | planned |
| NFR-2 | S2,S3,S7 | T-4,T-14 | both packages' tests | `<script>` / URL in model text appears as text; only anchors are in-app hrefs; GitHub mock sees only `getIssue` | planned |
| NFR-3 | S5,S7,S8 | T-14,T-15,T-17 | `cd client && pnpm test` | Keyboard-only pass through the block; screen reader hears live-region messages | planned |
| NFR-4 | S3 | T-8 | server unit | Captured log object has every listed field | planned |

## Non-functional requirements
| NFR | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 | spec | `singleAttempt:true, maxRetries:0` (S3), job runner not used; rejections happen before `llm()` is resolved; in-memory per-PR registry (S3) | T-5: `GatedLLM`/`MockLLMProvider.calls` counts 1/1/0 |
| NFR-2 | spec | Only `github.getIssue` leaves the process; model-output paths only compared against Sets (S2); client renders plain text nodes (no react-markdown) and anchors only from `briefDiffHref` (S7) | T-4, T-14 |
| NFR-3 | spec | S5 (focus, live regions), S7 (`aria-expanded`, link names, text severity, wrapping), S8 (live region for start/success/failure) | T-14, T-15, T-17; manual keyboard pass |
| NFR-4 | spec | One `log.info`/`log.error` object per generation (S3) | T-8 |
| Untrusted input handling | server/AGENTS.md conventions, onboarding precedent | `wrapUntrusted` for every untrusted source, closed `TourLanguage` enum in the prompt (S2) | T-4 |

## Requirements review
- Q-1 [non-blocking] AC-25 — the order of stages is fixed but how far a stage is shortened is not stated — planned with: reduce a stage only as far as needed (lists drop from the end; text keeps the largest prefix that fits).
- Q-2 [non-blocking] AC-28/AC-30 — "PR head SHA" can come from `pull_requests.head_sha` (updated only by polling, `modules/polling/routes.ts:42-53`) or from GitHub as `GET /pulls/:id` returns it without persisting (`modules/pulls/routes.ts:285-297`) — planned with: the row value, like Intent (`intent/service.ts:67-73`).
- Q-3 [non-blocking] AC-7 — what Overview shows for Intent/Blast while no brief is stored is not stated — planned with: PR Brief block (empty state) first, then the existing cards in today's place; once a brief is stored the cards move into the block.
- Q-4 [non-blocking] AC-25/AC-40 — the PR title is neither in the "never shortened" nor in the shortened list — planned with: title is fixed, counted with the never-shortened inputs.
- Requirements suggestions for the spec author: (a) `GET` could say that a generation is running, so a reload or second tab shows the busy state (AC-5 covers only the tab that started it; other tabs get 409 via AC-42); (b) AC-9 does not say whether a single unreadable spec document (while others are read) is a missing input — planned as not recorded.

## Scope
In: server module `brief` (GET/POST `/pulls/:id/brief`), shared contract `PrBrief` in both copies, `brief` message namespace, PR Brief block on Overview, deep link `?tab=diff&file=&line=` into Files changed.
Out (spec Non-goals): NG-1 sending diff hunk bodies or file contents; NG-2 deriving Intent / rebuilding Blast radius during generation; NG-3 automatic generation; NG-4 changing Intent/Blast cards, Smart Diff or review agents; NG-5 hand editing / posting to GitHub; NG-6 PR history; NG-7 course-process steps; NG-8 severity sorting; NG-9 "Derive intent" inside the block; NG-10 Intent/Blast snapshot; NG-11 second model request; NG-12 more than one issue / issue comments; NG-13 localizing the studio UI; NG-14 separate brief language or other languages; NG-15 translating paths/identifiers; NG-16 wrong-language detection. No migration (`pr_brief(pr_id,json)` exists, `server/src/db/schema/reviews.ts:82-87`).

## Context used
- Guidance read: CLAUDE.md, server/AGENTS.md, client/CLAUDE.md, TESTING.md, docs/onboarding-tour.md, spec.md, design-review.md.
- Lessons applied: server/INSIGHTS 2026-09-25 (pin output language) → `{{language}}` in system prompt + named in user message (S2); server/INSIGHTS 2026-09-26 (unmocked provider path) → tests inject `llm.openai` and `MockSecretsProvider`, never rely on host keys (T-5, T-10); client/INSIGHTS 2026-10-04 (value imports from `@devdigest/shared` blank the page) → type-only imports, local literals (S6–S8); client/INSIGHTS 2026-09-26 (sticky header) → scroll offset via `--pr-header-h` and a real-browser check (S5); client/INSIGHTS 2026-09-26 (`user-event` absent) → `fireEvent` in client tests; client/INSIGHTS 2026-09-25 (`relativeTime` needs `now`) → `useNow` (S8).
- Skills: onion-architecture — S2, S3 · zod — S1, S2 · fastify-best-practices — S3 · drizzle-orm-patterns — S3 · security — S2, S3, S7 · frontend-ui-architecture — S4–S8 · react-best-practices — S5–S8 · next-best-practices — S8 · react-testing-library — T-12…T-18 (test-writer / implementer).
- Analogue: Onboarding Tour (`server/src/modules/onboarding/*`, `container.ts:205-217`, client `TourText`, `useAnnouncer`).

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| Route = tenancy + schema + one service call; no `container.db` | onion `rules/fastify.md` | S3 routes call `container.brief.*` only |
| Only the repository touches Drizzle; returns contract types; workspace-scoped; transaction in repository | onion `rules/drizzle.md` | S3 `repository.ts` (pattern `intent/repository.ts:43-153`) |
| Service takes explicit deps, never `Container`; modules do not import each other | onion `rules/ports-di.md`; `intent/types.ts:57-60` | S3 deps are ports; the container wires facades (`container.intent`, `container.blast`) and cross-module helpers (`classifyFile`, `collectPaths`, `parseIntentLinks`, `selectLatestReviews`) |
| Use `intent.get`, never `getForReview` (it derives) | `intent/service.ts:75-95`, AC-10 | S3 |
| Contract change in both copies | CLAUDE.md, server/AGENTS.md | S1 owns both; T-11 compares them |
| No `.min/.max` in model schema (strict structured output) | `intent/service.ts:35-39` | S2 `BriefAnswer` |
| Static module registration | server/AGENTS.md | S3 `modules/index.ts` |
| DB-backed test ends `.it.test.ts` | server/AGENTS.md | T-10 |
| UI text via next-intl; pages thin; features do not import each other; client imports only types from shared | client/CLAUDE.md, frontend-ui-architecture, client/INSIGHTS 2026-10-04 | S4–S8; brief-local copies of the RTL helper and live region (I2 optional promotion) |
| Do not edit `*/vendor/**` except the canonical shared contract | CLAUDE.md | only `contracts/brief.ts` (both copies) |
| No new dependency, no migration | CLAUDE.md, client/INSIGHTS | none added |

## Steps
### S1 Contract `PrBrief` (both copies)
- Module / layer: shared contracts (ring 2)
- Files: modify `server/src/vendor/shared/contracts/brief.ts` — replace the composed `PrBrief` (lines 153-160) with: `summary`, `risks: Risk[]`, `review_focus: {file, line:int, reason}[]`, `head_sha`, `generated_at`, `language: TourLanguage` (import from `./onboarding-tour.js`), `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd: number|null`, `input_tokens` (measured, tokenizer), `missing_inputs: {input:'intent'|'blast'|'specs'|'issue', reason:string}[]`, `shortened_inputs: {input:'specs'|'issue'|'callers'|'description'|'files', action:'shortened'|'left_out'}[]`; add `PrBriefResponse = { brief: PrBrief | null, stale: boolean }` (stale false when null). Keep `Risk`, `Risks`, `PrHistory`, others exported. Update the file header comment. Then copy byte-identical to `client/src/vendor/shared/contracts/brief.ts`.
- Skills to apply: zod § schema/type inference; onion `rules/zod-contracts.md`
- Depends on: —
- Tests (single-agent): T-11
- Done when: both files identical; `PrBrief` has no `intent`/`blast`/`history`.
- Verify: `cd server && pnpm typecheck` and `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` (no client command in multi-agent wave 1)

### S2 Module `brief` — pure core (creates the module)
- Module / layer: `server/src/modules/brief/` application helpers, no I/O
- Files: create `constants.ts` (prompt/schema names, `BRIEF_INPUT_BUDGET_TOKENS=8000`, `MAX_RISKS=5`, `MAX_REVIEW_FOCUS=5`, `MAX_ISSUE_BYTES=20_000`, temperature 0.2, output tokens 3000, timeout 120_000, `TOUR_LANGUAGE_KEY='tour_language'`, default `English`); `types.ts` (ports and facts: `BriefRepositoryPort`, `PullFacts`, `FindingFact`, deps, `BriefLogger`); `helpers.ts` (`BriefAnswer` zod `{summary, risks[{kind,title,explanation,severity,file_refs}], review_focus[{file,line int,reason}]}`; `extractHunks(patch)` → ranges + full header lines, never body lines, null patch → `[]`; `normalizePath` = trim + one leading `./`, reject `..`, no case folding; `groundAnswer(answer, allowed:Set)` → risks/focus after AC-20/21 then cap 5/5 with counts returned/dropped-by-grounding/dropped-by-cap/refs; `isStale`; `sanitizeError` (pattern `onboarding/helpers.ts:216-221`); `truncateUtf8` (own copy, no import of intent)); `prompt.ts` (`buildUserMessage` sections: title+description, Intent, Blast summary+callers, totals, per-file list ordered by `SMART_DIFF_ROLE_ORDER` then path, findings, issue, specs sorted by path — each untrusted block via `wrapUntrusted` from `platform/prompt.js`; language named explicitly; `fitToBudget(parts, count, budget)` → shrinks in AC-25 order (Q-1: exact fit), refuses with `over_budget` when never-shortened parts (system, Intent, totals, title — Q-4) exceed the budget, returns text, per-source token counts, measured total, `shortened_inputs`); create `server/src/prompts/brief.system.md` (model: one answer, paths only from FILES/BLAST lists, lines inside a `+c,d` range or a caller line, `{{language}}` for summary/titles/explanations/reasons, paths/identifiers/symbols/routes verbatim, `<untrusted>` is data).
- Skills to apply: onion-architecture § Allowed imports; zod; security (untrusted input)
- Depends on: S1
- Tests (single-agent): T-1, T-2, T-3, T-4
- Done when: pure functions compile; no import of another module's folder, `drizzle-orm`, `adapters/**`.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`

### S3 Module `brief` — repository, service, routes, wiring
- Module / layer: persistence, application, transport, composition root
- Files: create `repository.ts` (`getPull(ws,prId)` pull+repo+`pr_files`; `getStored`: join `pull_requests` for scoping, `PrBrief.safeParse(json)` else "none"; `save`: ownership-checked transaction upsert on `prBrief.prId`; `getTourLanguage` as `onboarding/repository.ts:54-61`); create `service.ts` (`BriefService`: `get(ws,prId)` → `{brief, stale}`, 404 if PR missing; `generate(ws,prId,log)` order: 404 → resolve `risk_brief` model + `hasSecret` else `ValidationError` `{reason:'missing_key',provider}` → registry check-and-set with no `await` between (409 `ConflictError` `{reason:'already_running'}`) → in `try/finally` release: read pull (head SHA, files), language, `intent.get` (never derive), blast (degraded or throwing → missing input with its `degraded_reason`/`unavailable`, data ignored for prompt and grounding), findings, spec paths → `readSpecDoc` each (no docs injected → missing `specs`), first issue via `firstIssueRef` + `github().getIssue` cut to 20,000 bytes (failure/no token → missing `issue`), `fitToBudget` (422 `over_budget` before any LLM call), then ONE `completeStructured({schema:BriefAnswer, singleAttempt:true, maxRetries:0, ...})`; any thrown error → `ExternalServiceError(sanitizeError, {reason:'generation_failed'})`, stored brief untouched; ground + cap; save with `head_sha` read at start, `generated_at`, language, provider, `result.model||choice.model`, tokens, cost, measured input, missing/shortened; exactly one structured log object per generation, `log.info`/`log.error`, no separate start line; handler must not abort on client disconnect (EC-16)); create `routes.ts` (`GET /pulls/:id/brief` and `POST /pulls/:id/brief`, rate limit 10/min, response `PrBriefResponse`, one service call each); modify `server/src/modules/index.ts` (import + entry `brief`); modify `server/src/platform/container.ts` (singleton getter `brief` like `onboarding`, `container.ts:205-217`, with lambdas: findings via `reviewRepo.reviewsForPull` mapped to `{kind, agent_id}` + `selectLatestReviews` (`reviews/smart-diff/build.ts:11`), spec paths via `agentsRepo.listEnabled` + `enabledSkillsForPrompt` + `collectPaths` (`reviews/context-docs.ts:43`), `readSpecDoc` via `contextDocs.readEffective`, `firstIssueRef` via `parseIntentLinks(...).issues[0]`, `classify`=`classifyFile`, `countTokens`=`tokenizer.count`; `intent`, `blast`, `github`, `llm`, `resolveModel(…,'risk_brief')`, `hasSecret` as onboarding).
- Skills to apply: onion-architecture § Adding a module; fastify-best-practices; drizzle-orm-patterns; security; zod
- Depends on: S2
- Tests (single-agent): T-5, T-6, T-7, T-8, T-9, T-10
- Done when: GET/POST behave per AC-28…AC-32 against a seeded PR with mocks; typecheck passes.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test`

### S4 Message namespace `brief`
- Module / layer: client i18n
- Files: modify `client/messages/en/brief.json` — rename `block.risks` to "Risk areas"; remove `unavailable`/`unavailableHint` (contradict NG-3; no component uses the namespace); add keys: block title "PR Brief", `block.focus`, Generate/Regenerate/"Regenerating…"/Try again, `noRisks` (keep), `noFocus`, `running` ("Generation already running"), `outdated` ("Outdated — generated for {sha}"), `languageChanged`, `provenance`, `missingKey` + settings link label, `missingInputs` title and per-input labels, `severity.{high,medium,low}`, expand/collapse labels, `focusLinkLabel` ("{path} line {line}"), live-region texts (started/succeeded/failed), `nav.fileNotInDiff` ("File not in this PR's diff"), `nav.lineOutside` ("Line {line} is outside the changed lines").
- Skills to apply: frontend-ui-architecture § constants-and-config
- Depends on: —
- Tests (single-agent): — (exercised by T-13…T-17)
- Done when: JSON valid, keys above exist.
- Verify: `cd client && pnpm typecheck`

### S5 Deep link target in Files changed
- Module / layer: client shared diff-viewer + DiffTab
- Files: create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/diff-target.ts` (`parseDiffTarget(file, line, files)` → none | `{file,line|null}` | missing; `line` only integer ≥ 1 else null; `file` exact match); modify `components/diff-viewer/FileCard/FileCard.tsx` (optional `target` prop `{file,line,note,scrollMarginTop}`: when it matches the file, expand during render as the `openCommand` pattern at `FileCard.tsx:84-88`; effect: scroll root into view with `scroll-margin-top`, focus header with `tabIndex={-1}` and `focus({preventScroll:true})`; line row = parsed line with `newNo===line` and kind add/ctx → mark persistently (≥2 s) and scroll; otherwise render `note` in `role="status" aria-live="polite"` when a line was given — note text passed in, FileCard stays namespace-agnostic); modify `CodeLine/CodeLine.tsx` (`marked` prop, visible outline + `data-target-line`); modify `diff-viewer/styles.ts`, `DiffViewer/DiffViewer.tsx` and `diff-viewer/index.ts` (pass/export `DiffTarget`); modify `DiffTab/DiffTab.tsx` (prop `target`, builds note via `useTranslations("brief")`, passes to `FileCard` in both orders, tells the containing group to open), `SmartDiffGroup/SmartDiffGroup.tsx` (prop `targetInGroup`: open on change, derive-in-render), `DiffTab/constants.ts` (group header height constant; scroll offset = `--pr-header-h` + group header in Smart order).
- Skills to apply: frontend-ui-architecture § component-splitting; react-best-practices (no effect for derivable state); client/INSIGHTS sticky-header entry
- Depends on: S4 (keys)
- Tests (single-agent): T-17, T-18
- Done when: a target expands file and group, scrolls, focuses header, marks or notes the line, in both orders.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S6 Client data layer
- Module / layer: client hooks
- Files: create `client/src/lib/hooks/brief.ts` (`useBrief(prId)` key `["pr-brief", prId]`; `useGenerateBrief(prId)` with `mutationKey ["pr-brief-generate", prId]`, success writes `PrBriefResponse` into the cache; `useBriefGenerating(prId)` = `useIsMutating` so the busy state survives switching tabs (AC-5); `useBriefSettings()` = `useSettings` + `useSecretsStatus` + mirror `lib/feature-models.ts` → `{provider, missingKey, tourLanguage}`, treated as not missing while loading); modify `client/src/lib/hooks/index.ts` (export). Type-only imports from `@devdigest/shared`.
- Skills to apply: frontend-ui-architecture § business-logic-and-state; react-best-practices
- Depends on: S1
- Tests (single-agent): covered by T-13
- Done when: hooks typecheck; no `fetch` outside `api.ts`.
- Verify: `cd client && pnpm typecheck`

### S7 PrBriefBlock — helpers and sections (creates the feature folder)
- Module / layer: client feature `pulls/[number]/_components/PrBriefBlock/`
- Files: create `helpers.ts` (`briefDiffHref(repoId, number, file, line?)` with `encodeURIComponent`; `isRtl(language)`; `shortSha`), `constants.ts`, `styles.ts`, `_components/BriefText/{BriefText.tsx,direction.ts,index.ts}` (generated text `dir` by stored language; paths/`path:line` `dir="ltr"` + `unicode-bidi: isolate`; copy of the Tour pattern, not an import), `_components/RiskAreas/{RiskAreas.tsx,index.ts}` (rows in stored order; title, severity as text, path links, expand button `aria-expanded`/`aria-controls`, plain-text explanation, empty message), `_components/ReviewFocus/{ReviewFocus.tsx,index.ts}` (heading with count, monospace `path:line` links with accessible name from `focusLinkLabel`, reason, empty message). Links via `next/link`; all text as plain nodes (no markdown, no HTML).
- Skills to apply: frontend-ui-architecture; react-best-practices; security § XSS; ui-ux accessibility (visible focus, wrapping `overflow-wrap:anywhere`)
- Depends on: S1, S4
- Tests (single-agent): T-12, T-14, T-15, T-16
- Done when: sections render from a `PrBrief` fixture.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S8 PrBriefBlock assembly and page wiring
- Module / layer: client feature + page
- Files: create `PrBriefBlock/PrBriefBlock.tsx`, `index.ts`, `_components/BriefNotices/*` (missing key with link to `/settings/api-keys`, Outdated, language changed, missing inputs list with reasons, failure reason + "Try again", 409 text), `_components/BriefProvenance/*` (uses `useNow` and `format.relativeTime(date, now)`), `_components/LiveRegion/*` + `useAnnouncer.ts` (local copies of the Tour pieces); the block holds the state machine (empty / generating skeleton / stored / regenerating with "Regenerating…" / failed), the verdict banner from the newest `kind==='review'` row of `usePrReviews` with `verdict` (blockers as `ReviewRunAccordion.tsx:58`), Intent/Blast slots, announcements. Modify `OverviewTab/OverviewTab.tsx` (+ `styles.ts`): new `brief` slot first, optional `navNotice` live region, cards position per Q-3. Modify `pulls/[number]/page.tsx`: `parseDiffTarget` after load; effective tab = overview when `file` is missing from `pr.files` (AC-19, message from `brief` namespace); pass `target` to `DiffTab`; `setTab` also deletes `file`/`line`; build the block with `repoId`, `number`, intent and blast nodes.
- Skills to apply: frontend-ui-architecture; react-best-practices; next-best-practices § client boundary, search params
- Depends on: S5, S6, S7
- Tests (single-agent): T-13, T-16
- Done when: Overview shows the block in every state of the design review table; focus-order identical for English and Hebrew.
- Verify: `cd client && pnpm typecheck && pnpm test`; load `/repos/<id>/pulls/<n>` once in a browser (client/INSIGHTS 2026-10-04)

### I1 Documentation `docs/pr-brief.md` (recommended, executed by doc-writer)
- Module / layer: docs
- Files: create `docs/pr-brief.md` modeled on `docs/onboarding-tour.md` (flow, contract, budget, states, deep link, tests, known gaps); doc-writer may propose a "Read When" row for CLAUDE.md for the user to approve.
- Skills to apply: —
- Depends on: S8
- Tests (single-agent): —
- Done when: file exists and matches the implemented behavior.
- Verify: none (read-through)

### I2 Promote the shared RTL/live-region helpers (optional, M)
- Move `TourText`/`direction` and `LiveRegion`/`useAnnouncer` to `client/src/components/` for both features (second real consumer now exists). Skipped by default to keep NG-4 diffs small.

## Execution modes
Single-agent: one implementer runs S1 → S8 in order, writing each T-n inside the step it names; then I1 by doc-writer.
Multi-agent:
| Wave | Instance | Steps | Owned files / area |
|---|---|---|---|
| 1 | implementer #1 | S1, S2 | both `contracts/brief.ts` copies; `server/src/modules/brief/{constants,types,helpers,prompt}.ts`; `server/src/prompts/brief.system.md` (server checks only) |
| 1 | implementer #2 | S4, S5 | `client/messages/en/brief.json`; `components/diff-viewer/**`; `DiffTab/**` (client checks only) |
| 2 | implementer #3 | S3 | `modules/brief/{repository,service,routes}.ts`, `modules/index.ts`, `platform/container.ts` |
| 2 | implementer #4 | S6, S7 | `lib/hooks/brief.ts`, `hooks/index.ts`, `PrBriefBlock/{helpers,constants,styles}` + `BriefText`, `RiskAreas`, `ReviewFocus` |
| 3 | implementer #5 | S8 | rest of `PrBriefBlock/**`, `OverviewTab/**`, `page.tsx` |
| 4 | test-writer (server) | T-1…T-11 | `server/test/brief-*.test.ts`, `brief.it.test.ts` |
| 4 | test-writer (client) | T-12…T-18 | colocated `*.test.ts(x)` under `PrBriefBlock/`, `DiffTab/`, `diff-viewer/` |
| 5 | doc-writer | I1 | `docs/pr-brief.md` |
Wave conditions: no file in two groups; contract copies only in #1; waves 1–2 pair one server with one client instance (separate package checks); wave 3 and 4 follow dependencies. Test writers in wave 4 touch different packages.
Recommended: multi-agent — ~45 files over two packages with a clean server/client split; single-agent is acceptable if a simpler flow is preferred (longer, no parallelism).

## Cross-module contracts & sync points
- `PrBrief` / `PrBriefResponse` — `server/src/vendor/shared/contracts/brief.ts` ↔ `client/src/vendor/shared/contracts/brief.ts` (identical); `client/src/lib/types.ts:35` re-exports `PrBrief` (no change).
- `GET/POST /pulls/:id/brief` — `modules/brief/routes.ts` ↔ `client/src/lib/hooks/brief.ts`.
- `risk_brief` feature model — `contracts/platform.ts:60` ↔ `client/src/lib/feature-models.ts:29` (default provider `openai`; both unchanged).
- Tour language setting key `tour_language` — `onboarding/constants.ts:18` ↔ `brief/constants.ts` (duplicated literal on purpose).
- URL `?tab=diff&file=&line=` — `PrBriefBlock/helpers.ts` (builder) ↔ `DiffTab/diff-target.ts` (parser) ↔ `page.tsx`.

## Test plan
- Existing suites to run: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm exec vitest run .it.test`; `cd client && pnpm test && pnpm typecheck`. Existing `DiffTab.test.tsx`, `FileCard.test.tsx`, `SmartDiffGroup.test.tsx` must stay green (all new props optional).
- T-1 hunk extraction: headers only, ranges, null patch (AC-23, AC-24, EC-17) — unit — `server/test/brief-helpers.test.ts` — single: S2 · multi: test-writer
- T-2 grounding: ref/risk/focus drops, `./`, whitespace, case, `..`, line < 1, cap 5/5, counts (AC-20, AC-21, AC-44, EC-6, EC-7, EC-24) — unit — `brief-helpers.test.ts` — S2
- T-3 budget: order, exact fit ≤ 8,000, Intent/totals never cut, `over_budget`, records (AC-25, AC-40, EC-14) — unit — `brief-prompt.test.ts` — S2
- T-4 prompt: language named, untrusted wrapping, injection text stays inside blocks, no body lines (AC-23, AC-24, AC-45, EC-17, EC-25) — unit — `brief-prompt.test.ts` — S2
- T-5 service: calls 1 on success and on provider error / invalid answer (earlier brief kept); 0 for 404, missing key, 409, over budget; `intent.derive` never called; model and language read at start (AC-10, AC-26, AC-27, AC-31, AC-39, AC-41, AC-42, NFR-1, EC-5, EC-8, EC-10, EC-22, EC-25) — unit, in-memory repo, `GatedLLM` like `onboarding-service.test.ts` — `brief-service.test.ts` — S3
- T-6 missing inputs: no Intent, degraded blast per reason, no specs, issue unreadable / no token (AC-9, EC-1, EC-2, EC-3, EC-23) — `brief-service.test.ts` — S3
- T-7 `get`: stale flag, empty result, 404 (AC-29, AC-30, AC-32, EC-4) — `brief-service.test.ts` — S3
- T-8 log object has every NFR-4 field, one per generation (AC-26, NFR-4) — `brief-service.test.ts` — S3
- T-9 specs: de-dup, path order, effective doc, wrapped; GitHub mock sees only `getIssue` (AC-23, NFR-2) — `brief-service.test.ts` — S3
- T-10 integration: GET empty → POST → GET; replace; stale after head change; 404 (other workspace); row removed with PR (AC-28, AC-29, AC-30, AC-32, EC-20) — `server/test/brief.it.test.ts` — S3
- T-11 contract: no `intent`/`blast`/`history`; copies identical (AC-22) — `server/test/brief-contract.test.ts` — S1
- T-12 `briefDiffHref` encoding, `isRtl` (AC-37) — `PrBriefBlock/helpers.test.ts` — S7
- T-13 block states: empty, no auto-start, skeleton, busy, regenerating, stored layout, provenance, missing key, 409, failure + Try again, Outdated, language changed, missing inputs, banner on/off, cards slots (AC-1…AC-9, AC-29…AC-31, AC-33…AC-36, AC-41, AC-42, AC-48, EC-9, EC-10, EC-15, EC-22) — `PrBriefBlock.test.tsx` — S8
- T-14 RiskAreas (AC-11…AC-14, AC-37, NFR-2, NFR-3, EC-18) — `RiskAreas.test.tsx` — S7
- T-15 ReviewFocus (AC-15, AC-16, AC-37, NFR-3) — `ReviewFocus.test.tsx` — S7
- T-16 Hebrew: `dir=rtl` text, `dir=ltr` paths, same DOM order (AC-46, AC-47, EC-26) — `BriefText.test.tsx` — S7
- T-17 deep link: expand file and group, both orders, scroll (stub `scrollIntoView`), focus, mark ≥2 s (fake timers), outside-line note with `role=status`, no patch (AC-17, AC-18, AC-38, AC-43, EC-11, EC-12, EC-21) — `DiffTab.test.tsx`, `FileCard.test.tsx`, `SmartDiffGroup.test.tsx` — S5
- T-18 `parseDiffTarget` (AC-14, AC-17, AC-19, EC-13) — `DiffTab/diff-target.test.ts` — S5
- Not tested: real scroll and sticky offset, Back/Forward, new-tab open, real model language and quality — need a real browser / key; covered by verification hints. Page-level wiring in `page.tsx` has no test file (as today).

## Risks & open questions
- [non-blocking] Q-1…Q-4 above — defaults planned.
- [non-blocking] Staleness lag: `GET /pulls/:id` refreshes files/body from GitHub but not `head_sha` (`pulls/routes.ts:285-297`), so a brief can describe new files under the old SHA until polling runs — see Q-2.
- [non-blocking] Registry is in-process (single API instance, restart drops a running generation) — same accepted limit as the Tour; POST is synchronous like Intent.
- [non-blocking] Output cap (3,000 tokens) and temperature are implementation constants, not requirements; Hebrew/Ukrainian answers use more tokens.
- [non-blocking] jsdom lacks `scrollIntoView` and layout; stub it in tests.

## Self-check
1 pass · 2 pass · 3 pass · 4 pass · 5 pass (wave 1 server/client split, contract copies only in #1) · 6 pass · 7 pass (Q-1…Q-4 are choices, no new behavior) · 8 pass (no blocking item, Status ready) · 9 pass (paths cited were read this run) · 10 pass (only this file written; Q-mode asked in the reply)

## Out of scope for the implementer
Architecture and security review are done by separate agents. Requirements are fixed by the spec or task; a needed change goes back to the user, not into the code.

# Development Plan: Line-range suggestion when turning a finding into an eval case

Created: 2026-10-09 · Branch: hw-06 · HEAD: 688b2be · Status: ready
Spec: specs/eval-case-line-suggestion/spec.md · SPEC-07 · approved (partially supersedes SPEC-06)
Recommended mode: single-agent — ~25 files tied together by one shared contract (client depends on it), no qualifying parallel split; the user did not select a test-writer, so the implementer writes every T-n inside its step.

## Requirements
(AC-47 and AC-48 are withdrawn in the spec; AC-29 and AC-50 are unused. Ids are SPEC-07-local.)
- AC-1: "WHEN the suggestion for a finding differs from its cited range, the finding card SHALL open the range dialog and SHALL create no case until the user confirms." → S9, S10
- AC-2: "WHEN the user cancels the range dialog (Cancel, Close or Escape), the finding card SHALL close it, create no case, and return focus to the "Turn into eval case" button." → S9, S10 · assumes Q-1
- AC-3: "WHEN the user activates "Turn into eval case" on an accepted or dismissed finding that has no eval case, the finding card SHALL request the suggestion from the API route `GET /findings/:id/eval-case/suggestion`." → S5, S7, S10
- AC-36: "The suggestion route SHALL respond with the finding's file, the expectation type, the cited range, the suggested range, the reason of the suggestion (matched terms with their counts, the structure the range was expanded to, whether structure was available, whether the 80-line cap applied), the new-side lines of the finding's patch with their line numbers and hunk bounds, and a fingerprint of that patch." → S1, S4, S5 · assumes Q-2
- AC-37: "The suggestion route SHALL compute the suggestion from the finding's title, rationale, file, cited range and decision, and the whole patch of the finding's file defined in SPEC-06 AC-13, and SHALL store nothing." → S3, S4, S5
- AC-38: "IF the finding does not exist, is neither accepted nor dismissed, its agent was deleted, or its file's patch is not available, THEN the suggestion route SHALL reject the request with the same status and message as `POST /findings/:id/eval-case` in SPEC-06." → S5
- AC-4: "The API SHALL compute the suggestion without invoking any LLM provider and without any network call." → S4, S5
- AC-5: "The suggested range SHALL lie within the new-side lines present in the stored patch and SHALL intersect at least one hunk of the finding's file (the SPEC-06 AC-75 rule), except for the full-file kinds of AC-44, whose suggestion is the cited range as is." → S4
- AC-24: "WHEN the suggestion equals the cited range (same start and end after normalising a reversed range), the finding card SHALL create the case with the cited range on the same activation, without opening the range dialog, as SPEC-06 AC-3. [covers US-3]" → S10
- AC-26: "WHILE the suggestion request or the create request of the single-activation path is in progress, the finding card SHALL show the button as busy and keep it disabled." → S10
- AC-27: "IF the suggestion request fails, THEN the finding card SHALL show the error message returned by the API, create no case, and keep the button available, as SPEC-06 AC-6." → S10
- AC-35: "IF a case already exists for the finding when the suggestion is requested, THEN the suggestion route SHALL answer with the existing case's id and name, and the finding card SHALL state that the finding is already an eval case, naming that case, as SPEC-06 AC-9." → S1, S5, S10
- AC-6: "The API SHALL extract as search terms from the finding's title and rationale only: text inside backticks; identifiers written in camelCase or snake_case, or containing a dot or `()` (for example `findUserByEmail`, `err.stack`); string literals in single or double quotes; and, for an HTTP method followed by a path (for example `GET /users`), the path as a quoted literal (`'/users'` or `"/users"`). Terms shorter than 3 characters SHALL be dropped." → S4 · assumes Q-2, Q-3
- AC-49: "The API SHALL match search terms against the new-side lines of the patch as case-sensitive literal text." → S4
- AC-7: "WHEN the expectation type is `must_find`, no line of the cited range contains a search term, and another line of the patch contains at least one, the API SHALL use as the starting range the single line that contains the most distinct search terms." → S4
- AC-8: "WHEN the cited range contains at least one search term, the API SHALL use the cited range as the starting range and SHALL NOT re-target it." → S4
- AC-51: "WHEN no search term occurs anywhere in the patch's new-side lines, the API SHALL use the cited range as the starting range. [covers EC-14]" → S4
- AC-9: "IF two or more lines outside the cited range have the same highest number of distinct matching terms, THEN the API SHALL choose the line nearest to the cited range, and among equally near lines the one with the lower line number." → S4
- AC-11: "WHEN the expectation type is `must_not_flag`, the API SHALL use the cited range as the starting range and SHALL NOT re-target it. [NG-8]" → S4
- AC-10: "WHEN the starting range lies inside a function (function declaration, method, function expression or arrow function) of a supported language, the API SHALL expand the suggestion to the innermost such function whose lines contain the whole starting range, for both expectation types. [covers EC-3, EC-18]" → S2, S4
- AC-42: "IF the innermost function starts or ends outside the hunk that contains the starting range, THEN the API SHALL truncate the expanded range to the new-side lines of the hunk or hunks that contain the starting range. [covers EC-9]" → S4
- AC-12: "IF the expanded range (after AC-42) spans more than 80 lines, THEN the API SHALL expand the suggestion to the largest statement or block inside the function that contains the whole starting range and spans at most 80 lines within that hunk, and SHALL keep the starting range when no such statement or block exists. [covers EC-5]" → S2, S4
- AC-45: "IF the starting range does not lie inside any function, THEN the API SHALL apply no expansion and SHALL suggest the starting range. [covers EC-19, EC-20]" → S4
- AC-44: "WHEN the finding's kind is `secret_leak`, `lethal_trifecta`, `phantom` or `hook`, the API SHALL suggest the cited range without re-targeting or expansion, so the case is created on a single activation (AC-24) as SPEC-06 AC-66. [covers EC-10]" → S3, S4
- AC-30: "IF the starting range itself spans more than 80 lines, THEN the API SHALL neither expand nor shorten it." → S4
- AC-13: "IF the finding's file is not in a language the structural parser supports, or the patch text cannot be parsed, THEN the API SHALL apply no expansion, SHALL still apply re-targeting (AC-7), SHALL mark the response as "structure not available", and SHALL NOT answer with an error. [covers EC-8]" → S2, S4
- AC-14: "WHEN the user confirms the range dialog, the finding card SHALL send the selected start and end line with `POST /findings/:id/eval-case`, and the API SHALL create the case as in SPEC-06 AC-1 / AC-2 with the expectation's start and end line equal to those values." → S1, S5, S7, S10
- AC-39: "The API SHALL accept `start_line`, `end_line` and `patch_fingerprint` on `POST /findings/:id/eval-case` as an optional group (all three or none), and SHALL use the finding's cited range, without the SPEC-06 AC-75 check, when the group is absent." → S1, S5
- AC-43: "IF the `patch_fingerprint` sent with a range differs from the fingerprint of the finding's current patch, THEN the API SHALL reject the request with status 409 and the message "The diff changed", create no case, and the range dialog SHALL reload the suggestion while keeping the start and end line the user entered. [covers EC-11]" → S5, S10
- AC-15: "IF the sent range does not intersect any hunk of the finding's file in the stored patch, THEN the API SHALL reject the request with the SPEC-06 AC-75 reason and create no case, and the range dialog SHALL show that reason and stay open with the entered range." → S5, S10
- AC-16: "WHEN the API has created the case, the finding card SHALL close the range dialog, show the SPEC-06 AC-5 confirmation naming the case, and announce it to assistive technology." → S10
- AC-17: "IF case creation fails, THEN the range dialog SHALL show the error message returned by the API, keep the entered range, and keep Confirm available for another attempt." → S9, S10
- AC-18: "IF a case already exists for the finding when the user confirms (for example created from the other view of the same finding), THEN the API SHALL return the existing case unchanged as in SPEC-06 AC-9, and the finding card SHALL close the range dialog and state that the finding is already an eval case, naming that case. [covers EC-6]" → S5, S10
- AC-19: "WHILE a confirm request is in progress, the range dialog SHALL keep Confirm disabled. [covers EC-7]" → S9
- AC-34: "WHEN the user presses Enter in the start or end line field while the entered range is valid, the range dialog SHALL confirm it. [accepted P-6]" → S9
- AC-20: "The range dialog SHALL show a switch with the options "Suggested" and "Cited", each labelled with its `start–end`, and start and end line fields; "Suggested" SHALL be selected when the dialog opens." → S8, S9
- AC-33: "WHEN the user selects "Suggested" or "Cited", the range dialog SHALL set the start and end line fields to that range. [accepted P-6]" → S9
- AC-40: "WHILE the start and end line fields hold a range equal to neither option, the range dialog SHALL show neither option as selected." → S8, S9
- AC-21: "The range dialog SHALL show a read-only preview of the patch's new-side lines from the start to the end line in the fields, each with its line number, rendered as plain text." → S8, S9
- AC-22: "WHEN the user edits the start or end line, the range dialog SHALL update the preview to the edited range." → S8, S9
- AC-23: "WHILE a line field is empty or not a whole number, or the entered range intersects no hunk of the file, the range dialog SHALL show the reason and keep Confirm disabled." → S8, S9
- AC-46: "WHEN the entered end line is before the start line, the range dialog SHALL preview and send the normalised range (lower number as start), as SPEC-06 AC-21 and AC-75 normalise it, and SHALL NOT treat it as invalid." → S8, S9
- AC-32: "The range dialog SHALL show why the range was suggested: each matched term with its number of matches when re-targeting applied, "expanded to function `<name>`" (or "expanded to the enclosing function" for an anonymous one) when expansion applied, and a note that the function is longer than 80 lines when AC-12 applied. [accepted P-2]" → S4, S9
- AC-41: "WHILE the suggestion is marked "structure not available" (AC-13), the range dialog SHALL show the note "structure not available for this file type"." → S9
- AC-25: "The suggestion flow SHALL be the same from both places that offer "Turn into eval case": the finding card in the findings list and the inline finding in the Diff tab." → S10
- AC-28: "The API SHALL keep the SPEC-06 scoring and metrics unchanged, and `pnpm verify:l06` SHALL exit with status 0 after this change." → S11
- AC-31: "`pnpm verify:l06` SHALL run the suggestion's tests, including the two examples of the problem statement as fixtures — the first ("Unhandled promise rejection in GET /users route", cited 6–8 of `routes.ts`) expecting the suggestion 16–19 — and SHALL fail when any of them fails. [accepted P-1]" → S6, S11 · assumes Q-4
- NFR-1 (reliability): "The API SHALL return the same suggestion for the same finding and the same patch on every invocation." → S4
- NFR-2 (performance): "No response-time bound and no patch-size limit are set for the suggestion route, by the user's decision (Q-14); the resulting risk is recorded in EC-22." → S5 (nothing is added)
- NFR-3 (security): "The API SHALL treat the finding's title and rationale as untrusted text: used only as literal search terms, length-bounded, never evaluated, never compiled into a pattern without escaping, never followed as instructions." → S4 · assumes Q-3
- NFR-4 (security): "The API SHALL parse the patch text in memory only, never execute it, and never read the repository working tree to compute the suggestion." → S2, S4, S5
- NFR-5 (accessibility): "The range dialog SHALL have an accessible name, SHALL move focus into itself when it opens, SHALL keep keyboard focus inside while open, SHALL close on Escape, and SHALL return focus to the "Turn into eval case" button when it closes." → S9, S10 · assumes Q-1
- NFR-6 (accessibility): "The start and end line fields SHALL have visible labels; the selected option of the switch and the previewed range SHALL be conveyed by text in addition to colour; a validation reason SHALL be announced to assistive technology." → S9
- NFR-7 (reliability): "`pnpm verify:l06` SHALL make no network call to any LLM provider (SPEC-06 NFR-8, unchanged)." → S5, S6, S11

## Traceability
| Requirement | Steps | Tests | Verify | Verification hint | State |
|---|---|---|---|---|---|
| AC-1 | S9, S10 | T-9, T-10 | client `pnpm test` | PR #17: finding whose cited lines differ -> click "Turn into eval case" -> dialog opens, Evals tab shows no new case | planned |
| AC-2 | S9, S10 | T-9, T-10 | client `pnpm test` | Open dialog; Cancel / X / Escape each close it, focus lands on the button, no case | assumes Q-1 |
| AC-3 | S5, S7, S10 | T-4, T-10 | server it + client tests | Network tab: GET `/findings/<id>/eval-case/suggestion` fires on click | planned |
| AC-36 | S1, S4, S5 | T-1, T-3, T-4 | server vitest | `GET /findings/:id/eval-case/suggestion` returns file/type/cited/suggested/reason/patch_lines/hunks/patch_fingerprint | assumes Q-2 |
| AC-37 | S3, S4, S5 | T-3, T-4 | server vitest | Same GET twice: `eval_cases` row count unchanged | planned |
| AC-38 | S5 | T-4 | server it | GET for unknown id 404, undecided 422, deleted agent 409, missing file 422 (same bodies as POST) | planned |
| AC-4 | S4, S5 | T-4 | `verify:l06` fetch trap | Fetch trap `calls == []` after GET | planned |
| AC-5 | S4 | T-3 | server vitest | Suggested range always intersects a hunk (property over fixtures) | planned |
| AC-24 | S10 | T-10 | client `pnpm test` | PR #17: finding whose citation is already the whole handler -> one click creates the case, no dialog | planned |
| AC-26 | S10 | T-10 | client `pnpm test` | Throttle network: button spinner + disabled between click and result | planned |
| AC-27 | S10 | T-10 | client `pnpm test` | Stop the API / use an undecided id: red alert with API message, button re-enabled | planned |
| AC-35 | S1, S5, S10 | T-4, T-10 | server it + client tests | Create case in the Diff tab, then click on the stale card in the list: "Already an eval case: <name>" | planned |
| AC-6 | S4 | T-3 | server vitest | Unit table of titles/rationales -> extracted terms | assumes Q-2, Q-3 |
| AC-49 | S4 | T-3 | server vitest | Case-sensitive match; term only on a `-` line does not match | planned |
| AC-7 | S4 | T-3, T-5 | server vitest | Example 1 retargets from 6-8 to line 16 | planned |
| AC-8 | S4 | T-3 | server vitest | Cited range holding a term is not moved | planned |
| AC-51 | S4 | T-3 | server vitest | No term in patch -> suggestion = cited | planned |
| AC-9 | S4 | T-3 | server vitest | Two equal lines: nearest wins, then lower number | planned |
| AC-11 | S4 | T-3 | server vitest | `must_not_flag` never retargets | planned |
| AC-10 | S2, S4 | T-2, T-3, T-5 | server vitest | Example 1 -> 16-19 | planned |
| AC-42 | S4 | T-3 | server vitest | Stub structure crossing hunk bounds -> truncated | planned |
| AC-12 | S2, S4 | T-2, T-3 | server vitest | Function > 80 lines -> largest nested block <= 80, else starting range | planned |
| AC-45 | S4 | T-3 | server vitest | Top-level constant -> no expansion | planned |
| AC-44 | S3, S4 | T-3, T-4 | server vitest + it | `secret_leak` finding: suggested == cited; one click in UI | planned |
| AC-30 | S4 | T-3 | server vitest | 100-line starting range unchanged | planned |
| AC-13 | S2, S4 | T-2, T-3 | server vitest | `.md`/`.py` patch: still retargets, `structure_available:false`, 200 | planned |
| AC-14 | S1, S5, S7, S10 | T-4, T-10 | server it + client | Confirm 17-19 in dialog -> case Expected output shows 17-19 | planned |
| AC-39 | S1, S5 | T-1, T-4 | server it | POST with partial group -> 422; no body -> cited stored, no AC-75 check | planned |
| AC-43 | S5, S10 | T-4, T-10 | server it + client | POST with stale fingerprint -> 409 "The diff changed"; dialog reloads, typed numbers kept | planned |
| AC-15 | S5, S10 | T-4, T-10 | server it + client | Enter 900-901 -> reason shown, dialog stays open (server rejects direct POST with 422) | planned |
| AC-16 | S10 | T-10 | client `pnpm test` | Confirm -> dialog closes, "Eval case created: <name>" in live region | planned |
| AC-17 | S9, S10 | T-9, T-10 | client `pnpm test` | Make POST fail (delete the agent first): message in dialog, fields kept, Confirm enabled | planned |
| AC-18 | S5, S10 | T-4, T-10 | server it + client | Two tabs of one finding: confirm in second -> dialog closes, "Already an eval case" | planned |
| AC-19 | S9 | T-9 | client `pnpm test` | Double-click Confirm -> one POST | planned |
| AC-34 | S9 | T-9 | client `pnpm test` | Enter in a field confirms when valid, does nothing when invalid | planned |
| AC-20 | S8, S9 | T-8, T-9 | client `pnpm test` | Dialog opens with "Suggested 16-19" selected, "Cited 6-8" labelled | planned |
| AC-33 | S9 | T-9 | client `pnpm test` | Click "Cited" -> fields show cited range | planned |
| AC-40 | S8, S9 | T-8, T-9 | client `pnpm test` | Type 17 into start -> neither option selected | planned |
| AC-21 | S8, S9 | T-8, T-9 | client `pnpm test` | Preview rows `line number + text`; a `<img onerror>` line renders as text | planned |
| AC-22 | S8, S9 | T-8, T-9 | client `pnpm test` | Edit end line -> preview grows/shrinks | planned |
| AC-23 | S8, S9 | T-8, T-9 | client `pnpm test` | Clear a field / type `abc` / 900: reason announced, Confirm disabled | planned |
| AC-46 | S8, S9 | T-8, T-9 | client `pnpm test` | Start 19 end 16 -> preview 16-19, valid, POST sends 16/19 | planned |
| AC-32 | S4, S9 | T-3, T-9 | client `pnpm test` | Example 1: "matched `'/users'` x1" and "expanded to the enclosing function" shown | planned |
| AC-41 | S9 | T-9 | client `pnpm test` | Markdown/YAML finding that differs: note "structure not available for this file type" | planned |
| AC-25 | S10 | not tested separately - both places render the same `EvalCaseButton` (FindingCard.tsx:134, InlineFinding.tsx:89) | - | Repeat the AC-1/AC-24 hands-on in the findings list and in the Diff tab | planned |
| AC-28 | S11 | T-existing | `cd server && pnpm verify:l06` | exit 0; `git diff --stat` shows no change in `scoring.ts`, `compare.ts` | planned |
| AC-31 | S6, S11 | T-5 | `pnpm verify:l06` | Break the expected 16-19 on purpose -> script fails | assumes Q-4 |
| NFR-1 | S4 | T-3, T-4 | server vitest | Two identical GETs give byte-equal JSON | planned |
| NFR-2 | S5 | not tested - by decision (Q-14), EC-22 | - | Nothing implemented | planned |
| NFR-3 | S4 | T-3 | server vitest | Terms with `(`, `*`, `$(`, 1 MB rationale: no throw, bounded | assumes Q-3 |
| NFR-4 | S2, S4, S5 | T-2; grep check | `rg "node:fs\|readFile" server/src/modules/eval/suggestion*.ts` empty | Code review of the grep result | planned |
| NFR-5 | S9, S10 | T-9, T-10 | client `pnpm test` + browser | Tab cycles inside the dialog; screen reader announces its name | assumes Q-1 |
| NFR-6 | S9 | T-9 | client `pnpm test` | Visible labels; "Selected" text next to the option; alert on invalid | planned |
| NFR-7 | S5, S6, S11 | T-4, T-5 | `pnpm verify:l06` | Fetch trap shows no calls; new unit tests make none | planned |

## Non-functional requirements
| NFR | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 | SPEC-07 | Pure function, no clock/random, explicit tie-breaks and stable ordering of terms (S4) | T-3 runs it twice; T-4 compares two GET bodies |
| NFR-2 | SPEC-07 | None by decision; no cap/timeout added (S5) | Not verified; I-1 adds timing log only |
| NFR-3 | SPEC-07 | `String.includes` only, no RegExp built from input; input truncated to constants (S4) | T-3 hostile inputs |
| NFR-4 | SPEC-07 | Parse strings in memory (S2); no fs import in suggestion code (S4); only the existing `prDiff` port reads the diff (S5) | rg check + review |
| NFR-5/6 | SPEC-07 | Own accessible dialog in the feature folder (S9) | T-9 + manual keyboard/screen-reader pass |
| NFR-7 | SPEC-07 | Suggestion path has no `llm` dependency; tests keep the fetch trap | `pnpm verify:l06` |
| Untrusted text rendered as text | guidance (SPEC-06 NFR-3, client) | Patch lines, terms, function names, case names as React text nodes only (S9, S10) | T-9 `<img onerror>` fixture |

## Requirements review
No blocking findings.
- Q-1 [non-blocking] AC-2 / NFR-5 — the vendored `Modal` (`client/src/vendor/ui/kit/Modal.tsx:19-66`) has `role="dialog"`/`aria-modal` but no accessible name, focus move/trap, Escape or focus return, and `vendor/**` is do-not-touch (CLAUDE.md). Planned with: an own dialog in the feature folder (see question below).
- Q-2 [non-blocking] AC-6 / AC-32 — wording leaves readings open: PascalCase not listed; "containing `()`"; whether quotes are part of a string-literal term; how length 3 is measured; what "number of matches" counts; whether `'/users'` and `"/users"` are two terms. Planned with the strict bundle (question below).
- Q-3 [non-blocking] NFR-3 — "length-bounded" gives no number. Planned with named constants (question below).
- Q-4 [non-blocking] AC-31 — the spec gives the expected suggestion only for example 1 (16-19). Example 2 ("Missing input validation on route parameters", cited line 6, handler 22-24) has no code-like term in its title, so by the AC rules it cannot move (design-review.md:104-107). Planned with: asserting what the rules produce (question below).
- Observation (not a finding): the task text mentions "Use suggested / Use cited" buttons, the spec has none: AC-20/AC-33 make the "Suggested / Cited" switch the reset control (design-review.md:217-218). The plan follows the spec.
- Requirements suggestions for the spec author: (a) on a modified file the patch holds hunks only, so expansion works only when the function header is inside a hunk (design-review.md:34-36); consider stating that limit in the user-facing note; (b) `diff-parser.ts:62-74` counts a `\ No newline at end of file` line as a context line; harmless here, but a range on that phantom line number would pass AC-15; (c) AC-46 text is glued to AC-32 in the spec file (formatting only).

Questions (planned with the first option; steps marked `assumes`):
- Q-1 · tag: Dialog a11y — "How does the dialog meet NFR-5 without editing the vendored Modal?" 1. Own dialog in feature folder (Recommended) — `RangeDialog` renders its own overlay/dialog markup with `aria-labelledby`, focus trap, Escape, focus return; duplicates ~30 lines of Modal chrome. 2. Wrap vendor Modal — add focus handling outside it and patch `aria-labelledby` on its DOM node from an effect; fragile. 3. Ask the owner to approve a vendor exception — edit `Modal.tsx` (also benefits `CompareModal`, `CaseEditorModal`); needs separate approval, blocks S9.
- Q-2 · tag: Term rules — "How strict is the reading of AC-6 and the match count of AC-32?" 1. Strict (Recommended) — camelCase = lowercase start + inner capital; snake_case = lowercase/digits with `_`; dot/`()` terms kept exactly as written; string-literal and path terms keep their quotes; min length 3 counts the text inside the delimiters; `'/users'` and `"/users"` are two terms; "matches" = new-side patch lines containing the term; terms sorted by count desc, then text. 2. Lenient — also PascalCase, strip `()` before matching; more hits, more noise (EC-25).
- Q-3 · tag: Bounds — "Which length bounds does NFR-3 use?" 1. Constants in `constants.ts` (Recommended) — title 500 chars, rationale 8000, 100 terms, 200 chars per term, longer input truncated before extraction. 2. Smaller (title 200, rationale 2000, 30 terms) — cheaper, drops more terms from long rationales.
- Q-4 · tag: Fixture 2 — "What does fixture 2 of AC-31 assert?" 1. Rule output (Recommended) — title only, no term, cited line 6 outside any function: suggested = cited 6-6, test documents that this example still needs a manual edit. 2. Add a rationale naming a parameter so it retargets to 22-24 — invents rationale text, to be confirmed by the spec author first.

## Scope
In: suggestion route and pure computation; optional range on the create route; `rationale`/`kind` in the findings port; function-structure helper on the ast-grep adapter; client suggestion hook, range dialog, button flow, messages; tests; contract sync.
Out: NG-1 (LLM), NG-2 (grounding gate), NG-3 (scorer), NG-4 (existing cases / P-5), NG-5 (stored input), NG-6 (context lines / P-3), NG-7 (provenance on expectation / P-4), NG-8 (retargeting `must_not_flag`). No DB schema change, no migration. No `docs/` change (doc-writer owns `docs/eval-pipeline.md`). No edit of `vendor/ui`. No time or size limits (Q-14, EC-22).

## Context used
- Guidance read: CLAUDE.md, AGENTS.md, server/AGENTS.md, client/AGENTS.md, TESTING.md, docs/eval-pipeline.md, spec.md, design-review.md.
- Lessons applied: server/INSIGHTS "A dev machine with a real OPENROUTER_API_KEY..." (2026-09-26) -> the suggestion path takes no `llm`/`github` dependency; new it-tests keep `installFetchTrap` and the hermetic setup. client/INSIGHTS "Value imports from `@devdigest/shared` blank the page" (2026-10-04) -> client files use `import type` only, enum values repeated locally. client/INSIGHTS "`user-event` is not installed" (2026-09-26) -> tests use `fireEvent`. client/INSIGHTS "`borderColor` is a shorthand" (2026-09-19) -> dialog styles set all four sides when any differs.
- Designs: none (text description only; design-review.md has no design files).
- Code read (cited below): eval/service.ts, helpers.ts, types.ts, routes.ts, constants.ts, container.ts:290-357, adapters/astgrep/index.ts, adapters/git/diff-parser.ts, shared eval-pipeline.ts, test/eval/harness.ts, cases-from-finding.it.test.ts, client EvalCaseButton (+test, styles), hooks/eval.ts, Modal.tsx, Button.tsx, DiffTab.test.tsx:33-39, messages/en/prReview.json (only `en` exists).
- Skills: onion-architecture — module-local port (precedent `EvalPrDiffPort`, types.ts:154-157), no adapter import in service, pure core — S2-S5. zod / onion `zod-contracts.md` — contract in `vendor/shared/contracts`, schema-first route, both copies — S1, S5. fastify-best-practices — route + optional body — S5. security — untrusted text, in-memory parse — S4, S9. frontend-ui-architecture — colocate dialog + model in the feature folder, data only via `lib/hooks`, strings in `messages` — S7-S10. react-best-practices — derive, don't store; no effect for derived state; <= 200 lines/component — S9, S10. react-testing-library — behaviour tests, `fireEvent` — S8-S10. typescript-expert — types — all.

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| Services take ports, never `Container`; no adapter import in a service | onion-architecture, types.ts:3-5 | New `EvalStructurePort` + extended facts in `types.ts`; wired only in `container.ts` (S3) |
| Pure logic in `helpers`-style files, no IO | eval module (helpers.ts:5) | `suggestion.ts` pure; structure comes in as an argument (S4) |
| ast-grep only in `adapters/astgrep` | server/AGENTS.md, adapter header | New `parseFunctionStructure` there (S2) |
| Validation schema-first, no `.parse` in handlers | server/AGENTS.md | GET params, POST optional body, GET response schemas (S1, S5) |
| Contract changes synced to client copy | CLAUDE.md, server/AGENTS.md | S1 edits canonical then copies; S11 `diff` check |
| Client imports only types from `@devdigest/shared` | client/INSIGHTS 2026-10-04 | `import type` everywhere in S7-S10 |
| Data access only via `lib/hooks` -> `api.ts` | client/AGENTS.md | S7 hooks; no `fetch` in components |
| All strings via next-intl | client/AGENTS.md | S7 messages, `useTranslations("prReview")` |
| `vendor/**` untouched | CLAUDE.md | Own dialog (Q-1); only the shared-contract canonical + copy are edited |
| DB-backed tests end `*.it.test.ts`; eval tests under `server/test/eval/` | server/AGENTS.md, TESTING.md | Unit tests have no DB; it-tests suffix `.it.test.ts`; all in `test/eval/` so `verify:l06` runs them |
| No new dependency, no lockfile edit | CLAUDE.md | Uses existing `@ast-grep/napi`, `node:crypto` |
| Never commit/push | CLAUDE.md | Leave changes in the tree |
| Do not touch DB / snapshots | caller | It-tests use testcontainers (own throwaway Postgres); never point them at `devdigest-postgres` or run `db:migrate`/seed/restore |

## Steps
### S1 Contracts: suggestion response and optional range body
- Module / layer: shared contract (ring 2), server canonical + client copy
- Files: modify `server/src/vendor/shared/contracts/eval-pipeline.ts` (after `EvalCaseFromFindingResponse`, line 98) — add `EvalLineRange` {start_line, end_line int}; `EvalCaseFromFindingInput` = object {start_line int, end_line int, patch_fingerprint string min 1} for the POST body (all three required inside the object; the route makes the body optional). Q: partial group -> 422 comes from required fields. `EvalSuggestionReason` {terms: [{term, count int}], expanded_to_function: {name: string|null}|null, function_too_long: boolean, structure_available: boolean}; `EvalSuggestionPatchLine` {line int, text string}; `EvalCaseSuggestionDetail` {file, type: EvalExpectationType, cited: EvalLineRange, suggested: EvalLineRange, reason, patch_lines[], hunks: EvalLineRange[], patch_fingerprint}; `EvalCaseSuggestion` = {existing_case: {id, name}|null, suggestion: EvalCaseSuggestionDetail|null} (null `suggestion` iff `existing_case`, AC-35). `cited` is returned normalised (min..max). Export inferred types. Then copy the same content to `client/src/vendor/shared/contracts/eval-pipeline.ts`.
- Skills to apply: zod § object schemas / type-export-schemas-and-types; onion-architecture rules/zod-contracts.md
- Depends on: —
- Tests (single-agent): T-1 — extend `server/test/eval/contracts.test.ts`: input needs all three fields; response shape parses a sample with/without `existing_case`.
- Done when: both copies are byte-identical and `pnpm typecheck` passes in server and client.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/eval/contracts.test.ts`; `cd client && pnpm typecheck`; `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` (empty)

### S2 Function-structure helper on the ast-grep adapter
- Module / layer: adapter (`server/src/adapters/astgrep`)
- Files: modify `server/src/adapters/astgrep/index.ts` — add and export `parseFunctionStructure(file, source): { functions: Array<{name: string|null; start: number; end: number}>; blocks: Array<{start: number; end: number}> } | null`. Returns `null` when `langForFile(file)` is null (index.ts:57-76) or the parse throws (catch as at 626-635); lines are 1-based relative to `source`. Functions: `function_declaration`, `generator_function_declaration`, `function_expression`/`function`, `generator_function`, `arrow_function`, `method_definition`; name from the `name` field, or the enclosing `variable_declarator`/`pair` name for arrow/expression, else `null`. Blocks: every `statement_block` and every `*_statement`/`lexical_declaration`/`variable_declaration` node (candidates for AC-12). Verify node kind names against the installed grammar in the test (the existing code uses `function_expression`/`generator_function`, index.ts:348).
- Skills to apply: onion-architecture § adapters (own SDK only); typescript-expert
- Depends on: —
- Tests (single-agent): T-2 — new `server/test/eval/structure.test.ts` (unit, no DB): declaration, class method, arrow in a call argument (name null), `const f = () =>` (name `f`), nested functions, blocks listed, truncated fragment (missing `}`) does not throw, `.md` / `.py` -> null, no `node:fs` use.
- Done when: the function returns deterministic ranges for those cases and `null` for unsupported files.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/eval/structure.test.ts`

### S3 Ports and wiring: rationale, kind, structure
- Module / layer: eval module types (ring 3 ports) + composition root
- Files: modify `server/src/modules/eval/types.ts` — add `rationale: string` and `kind: string` to `EvalFindingFacts` (lines 135-148); add `EvalStructure` type and `EvalStructurePort { analyze(file: string, source: string): EvalStructure | null }`; add `structure: EvalStructurePort` to `EvalServiceDeps` (line 160). Modify `server/src/platform/container.ts` — in `findings.facts` (lines 321-333) add `rationale: ctx.finding.rationale, kind: ctx.finding.kind` (columns exist, `db/schema/reviews.ts:39,42`); add `structure: { analyze: (file, source) => parseFunctionStructure(file, source) }` to the `EvalService` deps (line 293 onwards), importing from the adapter.
- Skills to apply: onion-architecture § ports-di (composition root is the only place naming a concrete adapter)
- Depends on: S2
- Tests (single-agent): — (typecheck; exercised by T-4)
- Done when: the server compiles and existing eval tests are unaffected.
- Verify: `cd server && pnpm typecheck`

### S4 Pure suggestion computation
- Module / layer: eval module, pure (ring 3, no IO)
- Files: create `server/src/modules/eval/suggestion.ts`; modify `server/src/modules/eval/constants.ts` (add `EVAL_SUGGEST_MAX_LINES = 80`, `EVAL_TERM_MIN_LENGTH = 3`, and the Q-3 bounds); modify `server/src/modules/eval/helpers.ts` (add `patchFingerprint(patch)` = sha256 hex via `node:crypto`, and `newSideLines(patch)` returning `{ lines: {line, text}[]; hunks: {start_line,end_line}[] }` by walking the patch like `diff-parser.ts:46-74` but skipping `\` lines; only `+` and context lines count, removed lines never).
  `suggestion.ts` exports `extractSearchTerms(title, rationale)` (AC-6, Q-2/Q-3 reading; matching with `String.includes`, never a RegExp built from input) and `suggestRange(input)`; `input` = {type, kind, file, cited, title, rationale, lines, hunks, analyze: (source) => EvalStructure | null}. Algorithm, in order: normalise cited (min..max); kind in {secret_leak, lethal_trifecta, phantom, hook} -> suggested = cited, reason empty, `structure_available: true` (AC-44); starting range: `must_not_flag` -> cited (AC-11); `must_find` -> no term anywhere in patch lines -> cited (AC-51), cited holds a term -> cited (AC-8), else the patch line outside the cited range with most distinct terms, tie: nearest to cited, then lower number (AC-7, AC-9), reason lists the terms matched by that line with patch-wide line counts. If starting range spans > 80 lines -> suggestion = starting range (AC-30). Structure: per hunk, build source from that hunk's new-side lines, call `analyze(file, source)`, offset to real line numbers; any `null` -> `structure_available:false`, suggested = starting range (AC-13). Else innermost function (smallest span, then greater start) containing the whole starting range; none -> starting range (AC-45); else truncate to the union of hunks intersecting the starting range (AC-42); length <= 80 -> suggested = that, `expanded_to_function:{name}`; > 80 -> `function_too_long:true`, choose the largest block (clamped to the hunk union) that contains the starting range and spans <= 80, tie: lower start; none -> starting range (AC-12). Final guard (AC-5): if suggested intersects no hunk, return cited. Return the `EvalCaseSuggestionDetail` fields except `patch_fingerprint`/`file`/`type` (service adds them). No clock, no random, no fs (NFR-1, NFR-4).
- Skills to apply: onion-architecture § where does code go; security § injection (untrusted text); typescript-expert
- Depends on: S1, S3
- Tests (single-agent): T-3 — new `server/test/eval/suggestion.test.ts` (unit): term extraction table incl. `GET /users` -> both quoted spellings, min length, backticks, camel/snake/dot/`()`; matching case-sensitive, removed-line-only term not matched (EC-15); AC-7/8/51/9 (EC-4)/11; reversed cited (EC-16); AC-44 kinds; AC-30; AC-42/EC-24 with stub `analyze` returning ranges crossing hunk bounds and two hunks; AC-12 (block fits / none fits); AC-45; AC-13 (`analyze` -> null, retargeting still applies); AC-5 guard; NFR-1 (call twice, `toEqual`); NFR-3 (`(`, `[`, `$(`, `.*` terms, 1 MB rationale, no throw, bounded term count); `fingerprint` stable and changes on any byte change.
- Done when: all T-3 cases pass without Docker.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/eval/suggestion.test.ts test/eval/helpers.test.ts`; `rg "node:fs|readFile" server/src/modules/eval/suggestion.ts` (no match)

### S5 Service and routes
- Module / layer: eval service (ring 3) + routes (ring 5)
- Files: modify `server/src/modules/eval/service.ts` — add `suggestForFinding(workspaceId, findingId): Promise<EvalCaseSuggestion>` mirroring `createFromFinding` preconditions in the same order (service.ts:50-74): 404; existing case -> `{existing_case:{id,name}, suggestion:null}`; 422 undecided; 409 `agent_deleted`; 422 `diff_unavailable`; then `suggestRange(...)` with `deps.structure.analyze` and `patchFingerprint(patch)`, nothing stored (AC-37). Extract the shared precondition block into a private method used by both. Change `createFromFinding(workspaceId, findingId, range?: EvalCaseFromFindingInput)`: after the patch is loaded, if `range`: fingerprint differs -> `AppError('diff_changed','The diff changed',409)`; then `validateExpectationsAgainstDiff(parseDiff(patch), [{file, start_line, end_line}])` -> `ValidationError(reasons.join('; '), {reasons})` (AC-15); store min..max; without `range` keep cited verbatim and skip the check (AC-39, existing behaviour at 84-92). Existing case still returns first (AC-18). Modify `routes.ts`: `GET /findings/:id/eval-case/suggestion` (params `IdParams`, response 200 `EvalCaseSuggestion`); `POST /findings/:id/eval-case` gets `body: EvalCaseFromFindingInput.optional()`; update the route comment list. If the type provider rejects an absent body, fall back to the documented tolerant exception (zod-contracts.md) and say so in the step notes. Modify `server/test/eval/harness.ts`: `seedFinding` gets optional `rationale` (default stays `'because'`).
- Skills to apply: onion-architecture § routes/services; fastify-best-practices § routes, schema; zod; security (no error echo of untrusted text beyond existing messages)
- Depends on: S1, S3, S4
- Tests (single-agent): T-4 — new `server/test/eval/suggestion-route.it.test.ts` (Docker, `describeDb`, fetch trap, uses a new-file patch fixture): GET happy shape + `patch_lines`/`hunks`/fingerprint (AC-36), twice-equal (NFR-1), `eval_cases` count unchanged (AC-37), 404/422/409/422 errors equal POST's (AC-38), existing case (AC-35), `secret_leak` suggested == cited (AC-44), `.md` file 200 with `structure_available:false` (AC-13), trap `calls == []` (AC-4, NFR-7); POST with range stores it (AC-14), reversed range stored min..max, partial group 422, range off-hunk 422 with reason and no case (AC-15), stale fingerprint 409 "The diff changed" and no case (AC-43), existing case + range -> 200 `created:false` unchanged (AC-18), no body -> cited stored even outside hunks (AC-39).
- Done when: the new it-suite and the existing `cases-from-finding.it.test.ts` pass.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/eval/suggestion-route.it.test.ts test/eval/cases-from-finding.it.test.ts` (needs Docker; testcontainers starts its own Postgres, never the dev DB)

### S6 Examples fixtures in the verification gate (P-1)
- Module / layer: server tests
- Files: create `server/test/eval/suggestion-fixtures.test.ts` (unit, real `parseFunctionStructure`, no DB) with a `routes.ts` new-file patch built to the problem statement (`playground/eval-demo/` does not exist in this checkout): `interface Req` on lines 6-8, `registerRoutes` on line 15, `app.get('/users', async (...) => {...})` on 16-19 (the handler contains the quoted `'/users'` on line 16), another handler on 22-24 that uses `req.params`. Example 1: title "Unhandled promise rejection in GET /users route", cited 6-8, a `must_find` -> suggested 16-19. Example 2 per Q-4: title "Missing input validation on route parameters", cited 6-6 -> asserts the rule output (6-6, equal to cited).
- Skills to apply: react-testing-library n/a; onion-architecture § testing (test without Postgres)
- Depends on: S2, S4
- Tests (single-agent): T-5 (this file)
- Done when: the file is collected by `vitest run test/eval/` and failing the 16-19 expectation makes `verify:l06` fail.
- Verify: `cd server && pnpm exec vitest run test/eval/suggestion-fixtures.test.ts`

### S7 Client data layer and messages
- Module / layer: client `lib/hooks` + i18n
- Files: modify `client/src/lib/hooks/eval.ts` — add `useEvalCaseSuggestion(findingId)` as a `useMutation` calling `api.get<EvalCaseSuggestion>(.../eval-case/suggestion)` (fresh on every call, never cached); change `useCaseFromFinding(findingId)` so `mutationFn` takes an optional `EvalCaseFromFindingInput` (`api.post(url, range)`; no body when undefined); `import type` only. Modify `client/messages/en/prReview.json` under `finding.evalCase` — add a `range` group: title, suggested, cited, startLabel, endLabel, selectedMarker, previewHeading, confirm, cancel, close, termMatched ("matched {term} ×{count}"), expandedFunction, expandedAnonymous, functionTooLong, noStructure ("structure not available for this file type"), invalidEmpty, invalidNumber, noHunk. Modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx:33-39` — the hook mock must also return `useEvalCaseSuggestion`.
- Skills to apply: frontend-ui-architecture § data layer, constants (user-facing string); react-best-practices
- Depends on: S1
- Tests (single-agent): — (covered by T-10)
- Done when: client typechecks and `DiffTab.test.tsx` still passes.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S8 Range model (pure client logic)
- Module / layer: client feature folder `EvalCaseButton`
- Files: create `client/src/app/repos/[repoId]/pulls/[number]/_components/EvalCaseButton/range-model.ts` — `normaliseRange`, `sameRange`, `parseLineField` (trimmed whole number or null), `rangeIntersectsHunks`, `validateFields(startText, endText, hunks)` -> `null | {kind:'empty'|'notNumber'|'noHunk'}` (reversed range is valid, AC-46), `selectedOption(fields, suggested, cited)` -> `'suggested'|'cited'|null` (AC-40), `previewLines(patchLines, range)`. No React, `import type` only.
- Skills to apply: frontend-ui-architecture § business logic (plain module); react-best-practices
- Depends on: S1
- Tests (single-agent): T-8 — `range-model.test.ts` beside it (AC-20/40/21/22/23/46 logic, reversed range, empty, `abc`, off-hunk, gap lines absent from preview).
- Done when: T-8 passes.
- Verify: `cd client && pnpm typecheck && pnpm test -- range-model`

### S9 RangeDialog (own accessible dialog)
- Module / layer: client feature folder, nested `_components/RangeDialog/`
- Files: create `.../EvalCaseButton/_components/RangeDialog/{RangeDialog.tsx,styles.ts,index.ts,RangeDialog.test.tsx}` (+ `use-dialog-focus.ts` for focus move/trap/Escape if RangeDialog would exceed 200 lines). Props: `suggestion: EvalCaseSuggestionDetail`, `pending: boolean`, `error: string|null`, `onConfirm(range)`, `onCancel()`. Rendered through `createPortal(document.body)` with its own overlay and `role="dialog" aria-modal="true" aria-labelledby=<title id>` (Q-1 option 1; do not use or edit vendor `Modal`); on mount focus the first control, Tab/Shift+Tab wrap inside, Escape and Cancel/Close call `onCancel`. Content: radio group "Suggested start–end" / "Cited start–end" (controlled by `selectedOption`; the selected one also shows the text "Selected"), two labelled text inputs (start, end; local state initialised from `suggested`, kept when the `suggestion` prop is replaced after a 409 reload), preview `<ol>` of `line number + text` for the normalised range with a text heading "Lines a–b", reason block (AC-32/AC-41: terms, expanded-to-function or anonymous wording, too-long note, no-structure note), validation reason in `role="alert"`, API `error` in `role="alert"`, Confirm (disabled when invalid or `pending`, sends the normalised range) and Cancel; Enter in either field confirms through the same guard (AC-34, AC-19). All patch text, terms and names are React text nodes. Styles: co-located `s` object, longhand borders.
- Skills to apply: frontend-ui-architecture § component splitting; react-best-practices § derive, don't store (preview, validity, selected option computed in render); react-testing-library; security § XSS; ui-ux-pro-max § accessibility
- Depends on: S7, S8
- Tests (single-agent): T-9 — `RangeDialog.test.tsx` with `fireEvent`: accessible name, focus moved in, Tab wraps, Escape/Cancel/Close call `onCancel` (NFR-5); labels visible, "Selected" text, alert on invalid (NFR-6); switch sets fields (AC-33), neither selected after editing (AC-40), preview updates (AC-22), reversed range sends min/max (AC-46), empty/`abc`/off-hunk disable Confirm (AC-23), Enter confirms only when valid (AC-34), pending disables Confirm and Enter (AC-19), error shown and fields kept (AC-17), reason texts (AC-32, AC-41), `<img onerror>` in a patch line renders as text.
- Done when: T-9 passes; dialog has no dependency on the button's data hooks.
- Verify: `cd client && pnpm typecheck && pnpm test -- RangeDialog`

### S10 EvalCaseButton flow
- Module / layer: client feature component
- Files: modify `.../EvalCaseButton/EvalCaseButton.tsx` (lines 16-85): click -> `create.reset()`, remember the trigger element, `suggest.mutate()`; on success: `existing_case` -> keep it as the "already exists" name (AC-35); `cited == suggested` (`sameRange`) -> `create.mutate(undefined, {onSuccess: toast as today})` (AC-24); else store the suggestion and open `RangeDialog` (AC-1). Dialog confirm -> `create.mutate(range, ...)`: success closes it (a `created:false` result shows the already-exists status, AC-18; created shows "Eval case created", AC-16, via the existing `role="status"`); error `code === 'diff_changed'` -> show message in the dialog and re-run `suggest.mutate()` replacing the suggestion while the typed numbers stay (AC-43); other errors stay in the dialog (AC-15, AC-17). Cancel -> close, `create.reset()`, focus the stored trigger (AC-2, NFR-5). Button `loading` = suggest pending, or create pending while the dialog is closed (AC-26); suggestion error shown in the existing alert (AC-27); hide the button-level create error while the dialog is open. Extract the state into a small hook file `use-eval-case-flow.ts` if the component grows past ~150 lines. Update `EvalCaseButton.test.tsx`: existing click tests now need `GET /findings/f1/eval-case/suggestion` routed to an equal-range suggestion (a helper `suggestionResponse(...)`), keep their assertions.
- Skills to apply: frontend-ui-architecture § where business logic lives; react-best-practices § hooks/useEffect (handlers, not effects); react-testing-library
- Depends on: S7, S9
- Tests (single-agent): T-10 — in `EvalCaseButton.test.tsx`: GET before any POST (AC-3); equal -> one POST with no body, no dialog (AC-24); differs -> dialog and no POST (AC-1); Cancel/Escape -> closed, no POST, focus on the button (AC-2); busy while the GET is pending (AC-26); GET error alert, button enabled (AC-27); `existing_case` -> status names it, no dialog (AC-35); confirm sends `{start_line,end_line,patch_fingerprint}` (AC-14), closes and announces (AC-16); 422 stays open with reason (AC-15/17); 409 `diff_changed` -> second GET, typed numbers kept (AC-43); `created:false` on confirm closes and states already exists (AC-18).
- Done when: both render sites (FindingCard.tsx:134, InlineFinding.tsx:89) get the flow with no change to them.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S11 Final verification and sync check
- Module / layer: cross-package
- Files: none (verification only)
- Skills to apply: —
- Depends on: S1-S10
- Tests: all of the above plus existing suites
- Done when: all commands below pass; `git diff --stat` shows no change in `server/src/modules/eval/scoring.ts` or `compare.ts` (AC-28).
- Verify (in order): `cd server && pnpm typecheck`; `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `cd client && pnpm typecheck && pnpm test`; `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts`; `cd server && pnpm verify:l06` (needs Docker running; its integration suites start their own testcontainers Postgres. Do not run `pnpm db:migrate`/`db:seed`, `restore.sh` or anything against `devdigest-postgres`).

### I1 Log suggestion timing (optional, recommended, cost S)
- Rationale: no time or size limit exists (EC-22); a log line makes a slow patch visible without changing behaviour.
- Files: modify `server/src/modules/eval/routes.ts` — `req.log.info({findingId, ms, patchLines}, 'eval suggestion')` around the service call.
- Depends on: S5 · Verify: `cd server && pnpm typecheck`

### I2 Yield between hunk parses (optional, cost S)
- Rationale: the napi parse is synchronous; awaiting `setImmediate` between hunks keeps the API responsive for huge patches. Requires `analyze` loop in `suggestRange` to become async.
- Depends on: S4, S5 · Verify: `cd server && pnpm exec vitest run test/eval/suggestion.test.ts`

## Execution modes
Single-agent: one implementer runs S1 -> S11 in order and writes T-1 ... T-10 inside the steps (no separate test-writer in this run).
Multi-agent: no qualifying parallel split (the client group depends on the S1 contract; shared tests harness).
| Wave | Instance | Steps | Owned files / area |
|---|---|---|---|
| 1 | implementer #1 | S1-S6 | server + both contract copies + server tests |
| 2 | implementer #2 | S7-S10 | client files and tests |
| 3 | implementer #1 or #2 | S11 | verification |
Recommended: single-agent — two sequential waves bring no parallelism, and the contract/behaviour knowledge is shared.

## Cross-module contracts & sync points
- `contracts/eval-pipeline.ts` — server canonical and `client/src/vendor/shared/contracts/eval-pipeline.ts` change together (S1, checked in S11).
- Findings port `EvalFindingFacts` — `types.ts`, `container.ts` facts mapper, test doubles (none construct it today) (S3).
- `useCaseFromFinding` signature — `hooks/eval.ts`, `EvalCaseButton.tsx`, `DiffTab.test.tsx` mock (S7, S10).
- Error code `diff_changed` (409) — `service.ts` and the client's 409 branch (S5, S10).
- Route name `GET /findings/:id/eval-case/suggestion` — `routes.ts`, `hooks/eval.ts`, test routes.
- `mcp/` has no reference to `eval-case` (design-review.md:122); `e2e/` not checked, no change expected.

## Test plan
- Existing suites to run: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`, `cd server && pnpm verify:l06`, `cd client && pnpm test` — regression of scoring, cases-from-finding, DiffTab, FindingCard.
- T-1 contracts (AC-36, AC-39) — unit — `server/test/eval/contracts.test.ts` — S1
- T-2 structure adapter (AC-10, AC-12, AC-13, NFR-4) — unit — `server/test/eval/structure.test.ts` — S2
- T-3 suggestion core (AC-5..AC-13, AC-30, AC-42, AC-44, AC-45, AC-49, AC-51, EC-4, EC-9, EC-14..16, EC-19..21, EC-24, NFR-1, NFR-3) — unit — `server/test/eval/suggestion.test.ts` — S4
- T-4 routes (AC-3, AC-4, AC-14, AC-15, AC-18, AC-35..39, AC-43, AC-44, NFR-1, NFR-7; EC-6, EC-11, EC-12, EC-13, EC-17) — integration — `server/test/eval/suggestion-route.it.test.ts` — S5 (EC-12/EC-13 are the 422/409 paths of AC-38)
- T-5 the two examples (AC-31, AC-7, AC-10) — unit — `server/test/eval/suggestion-fixtures.test.ts` — S6
- T-8 range model (AC-20, AC-21, AC-22, AC-23, AC-40, AC-46) — unit — `.../EvalCaseButton/range-model.test.ts` — S8
- T-9 dialog (AC-17, AC-19, AC-20, AC-21..23, AC-32, AC-33, AC-34, AC-40, AC-41, AC-46, NFR-5, NFR-6; EC-7, EC-8, EC-25) — component — `.../RangeDialog/RangeDialog.test.tsx` — S9
- T-10 button flow (AC-1, AC-2, AC-3, AC-14..18, AC-24, AC-26, AC-27, AC-35, AC-43, NFR-5; EC-1, EC-2, EC-3, EC-6, EC-10, EC-17, EC-20) — component — `.../EvalCaseButton/EvalCaseButton.test.tsx` — S10
- Edge cases mapped: EC-1/EC-3 -> AC-10, AC-24 (T-3, T-10); EC-2 -> AC-7 (T-5); EC-5 -> AC-12; EC-9/EC-24 -> AC-42; EC-10 -> AC-44; EC-15 -> AC-49; EC-16 -> AC-46 (T-3 server cited side, T-8 entered side); EC-18, EC-22 accepted risks.
- Not tested: NFR-2 (by decision); AC-25 (same component in both places); focus return after a successful confirm (the button is then disabled, spec requires focus return only on close/cancel).

## Risks & open questions
- [non-blocking] Q-1..Q-4 above — planned with the first (recommended) option.
- [non-blocking] Expansion on a modified file sees only hunks; a function whose header is outside every hunk gets no expansion (AC-45 path). Hands-on check on PR #17 may show fewer expansions than expected; this is spec behaviour (EC-9), not a defect.
- [non-blocking] EC-25/English prose: apostrophes can form accidental `'...'` string-literal terms; the user sees the matched terms (AC-32) and can pick "Cited".
- [non-blocking] Hands-on for the whole feature: `./scripts/dev.sh`, open PR #17 of BalakaMd/dev-digest, accept a finding with a wrong citation, click "Turn into eval case" in the findings list and again in the Diff tab; check dialog, keyboard-only use (Tab, Enter, Escape) and the Evals tab afterwards. Do not run `restore.sh` or touch snapshots; the user restores DB state himself.
- [non-blocking] `server/package.json` may be `skip-worktree` locally (TESTING.md); no change to it is needed because `verify:l06` already runs `test/eval/`.

## Self-check
1 pass · 2 pass · 3 pass (S11 is a verification step mapped to AC-28/AC-31) · 4 pass · 5 pass (multi-agent waves are sequential, no shared files) · 6 pass · 7 pass · 8 pass (no blocking item; Status ready) · 9 pass · 10 pass (only this plan file written; Q-mode question is in the reply)

## Out of scope for the implementer
Architecture and security review are done by separate agents. Requirements are fixed by the spec or task; a needed change goes back to the user, not into the code. Documentation (`docs/eval-pipeline.md`) is written by doc-writer afterwards. Never run `git commit` or `git push`.

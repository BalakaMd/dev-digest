# Spec: Line-range suggestion when turning a finding into an eval case
Spec ID: SPEC-07
Status: implemented
Supersedes: SPEC-06 (specs/eval-pipeline/spec.md) — in part, see "Scope of supersession"

## Problem and user
An agent author turns decided findings into eval cases (SPEC-06). The case copies the line range the
model cited, as is. That citation is sometimes wrong (the finding "Unhandled promise rejection in
GET /users route" cites `interface Req` on lines 6–8 of `routes.ts`, while the problem is the
`GET /users` handler a few lines below) or too narrow (the finding "Missing input validation on route
parameters" cites only line 6, while the problem is in the handler on lines 22–24). Scoring matches
by line overlap (SPEC-06 AC-21), so such a `must_find` case can never pass, the baseline recall is
understated, and a `must_not_flag` case pinned to the wrong lines gives false results. Today the only
fix is to open each case in the case editor and retype the JSON by hand.

## Scope of supersession
This spec replaces or amends only the SPEC-06 criteria listed below; every other SPEC-06 goal,
non-goal, user story, AC, EC, NFR and VA stays in force unchanged, with its SPEC-06 id. Ids in this
spec (`AC-n`, `EC-n`, …) are local to SPEC-07; a SPEC-06 id is always written as "SPEC-06 AC-n".
- Amended:
  - SPEC-06 AC-3 — the case is still created on a single activation without a dialog WHEN the
    suggestion equals the cited range (AC-24); otherwise the range dialog opens first (AC-1).
  - SPEC-06 AC-1, AC-2 — the expectation's start and end line are the range the user confirmed
    (AC-14), or the cited range on the single-activation path (AC-24). Type, file, owner and input are
    unchanged.
  - SPEC-06 AC-5, AC-6 — the confirmation and the error are also shown from the range dialog (AC-16,
    AC-17), and an error of the suggestion request is shown as in SPEC-06 AC-6 (AC-27).
  - SPEC-06 AC-9 — also applies to the suggestion request and while the range dialog is open (AC-18,
    AC-35).
  - SPEC-06 AC-75 — its validation rule (file in the diff, range intersecting a hunk) also applies to
    a range confirmed in the range dialog for a case created from a finding (AC-15).
  - SPEC-06 G-1, US-1, US-2 — "in one click" now reads "in one click when the cited lines are
    confirmed by the suggestion, otherwise after reviewing the suggested lines".
- Unchanged and relied on: SPEC-06 AC-4, AC-7, AC-8, AC-13, AC-21 to AC-26, AC-38, AC-63 to AC-66,
  AC-69, AC-71, AC-72, NFR-1 to NFR-4, NFR-8, EC-1 to EC-5.

## Goals / Non-goals
Goals:
- G-1 Before a case is saved from a finding, propose a line range that points at the code the
  finding talks about, computed deterministically in code.
- G-2 Never change the range without the user seeing it: whenever the proposed range differs from the
  cited one, the user sees its code and can accept, adjust or reject it before the case exists.
- G-3 Keep the one-click path of SPEC-06 when the suggestion confirms the cited lines.
- G-4 Leave scoring and every other SPEC-06 behaviour unchanged; `pnpm verify:l06` stays green and
  covers the suggestion.
Non-goals:
- NG-1 Re-anchoring lines with an LLM (any model call during suggestion).
- NG-2 Changing the grounding gate in `reviewer-core`.
- NG-3 Changing the scorer (match rule, metrics, pass rule).
- NG-4 Changing the line ranges of eval cases that already exist, including a "Suggest lines" action
  for them (rejected P-5).
- NG-5 Changing the stored input of a case (SPEC-06 AC-13, AC-72 stay as they are).
- NG-6 Context lines around the selected range in the preview (rejected P-3).
- NG-7 Recording on an expectation where its lines came from (cited / suggested / edited)
  (rejected P-4); the expectation contract stays as in SPEC-06 AC-71.
- NG-8 Re-targeting a `must_not_flag` expectation to another place by code text (Q-4).

## User stories
- US-1 As an agent author, I want DevDigest to propose the lines a finding really refers to when I
  turn it into an eval case, so that a `must_find` case can actually be passed.
- US-2 As an agent author, I want to see the code of the proposed lines and correct the range before
  saving, so that no case is saved with lines I did not see.
- US-3 As an agent author, I want a correct citation to still become a case in one click, so that the
  common case stays fast.

## Acceptance criteria (EARS)

### Flow
- AC-1 (Event-driven): WHEN the suggestion for a finding differs from its cited range, the finding card
  SHALL open the range dialog and SHALL create no case until the user confirms. [covers US-2]
- AC-2 (Event-driven): WHEN the user cancels the range dialog (Cancel, Close or Escape), the finding
  card SHALL close it, create no case, and return focus to the "Turn into eval case" button.
- AC-3 (Event-driven): WHEN the user activates "Turn into eval case" on an accepted or dismissed
  finding that has no eval case, the finding card SHALL request the suggestion from the API route
  `GET /findings/:id/eval-case/suggestion`.
- AC-36 (Ubiquitous): The suggestion route SHALL respond with the finding's file, the expectation type,
  the cited range, the suggested range, the reason of the suggestion (matched terms with their counts,
  the structure the range was expanded to, whether structure was available, whether the 80-line cap
  applied), the new-side lines of the finding's
  patch with their line numbers and hunk bounds, and a fingerprint of that patch.
- AC-37 (Ubiquitous): The suggestion route SHALL compute the suggestion from the finding's title,
  rationale, file, cited range and decision, and the whole patch of the finding's file defined in
  SPEC-06 AC-13, and SHALL store nothing.
- AC-38 (Unwanted behaviour): IF the finding does not exist, is neither accepted nor dismissed, its
  agent was deleted, or its file's patch is not available, THEN the suggestion route SHALL reject the
  request with the same status and message as `POST /findings/:id/eval-case` in SPEC-06.
- AC-4 (Ubiquitous): The API SHALL compute the suggestion without invoking any LLM provider and
  without any network call.
- AC-5 (Ubiquitous): The suggested range SHALL lie within the new-side lines present in the stored
  patch and SHALL intersect at least one hunk of the finding's file (the SPEC-06 AC-75 rule), except
  for the full-file kinds of AC-44, whose suggestion is the cited range as is.
- AC-24 (Event-driven): WHEN the suggestion equals the cited range (same start and end after
  normalising a reversed range), the finding card SHALL create the case with the cited range on the
  same activation, without opening the range dialog, as SPEC-06 AC-3. [covers US-3]
- AC-26 (State-driven): WHILE the suggestion request or the create request of the single-activation
  path is in progress, the finding card SHALL show the button as busy and keep it disabled.
- AC-27 (Unwanted behaviour): IF the suggestion request fails, THEN the finding card SHALL show the
  error message returned by the API, create no case, and keep the button available, as SPEC-06 AC-6.
- AC-35 (Unwanted behaviour): IF a case already exists for the finding when the suggestion is
  requested, THEN the suggestion route SHALL answer with the existing case's id and name, and the
  finding card SHALL state that the finding is already an eval case, naming that case, as SPEC-06 AC-9.

### Re-targeting by code text (`must_find` only)
- AC-6 (Ubiquitous): The API SHALL extract as search terms from the finding's title and rationale
  only: text inside backticks; identifiers written in camelCase or snake_case, or containing a dot or
  `()` (for example `findUserByEmail`, `err.stack`); string literals in single or double quotes; and,
  for an HTTP method followed by a path (for example `GET /users`), the path as a quoted literal
  (`'/users'` or `"/users"`). Terms shorter than 3 characters SHALL be dropped.
- AC-49 (Ubiquitous): The API SHALL match search terms against the new-side lines of the patch as
  case-sensitive literal text.
- AC-7 (Event-driven): WHEN the expectation type is `must_find`, no line of the cited range contains a
  search term, and another line of the patch contains at least one, the API SHALL use as the starting
  range the single line that contains the most distinct search terms.
- AC-8 (Event-driven): WHEN the cited range contains at least one search term, the API SHALL use the
  cited range as the starting range and SHALL NOT re-target it.
- AC-51 (Event-driven): WHEN no search term occurs anywhere in the patch's new-side lines, the API SHALL
  use the cited range as the starting range. [covers EC-14]
- AC-9 (Unwanted behaviour): IF two or more lines outside the cited range have the same highest
  number of distinct matching terms, THEN the API SHALL choose the line nearest to the cited range,
  and among equally near lines the one with the lower line number.
- AC-11 (Event-driven): WHEN the expectation type is `must_not_flag`, the API SHALL use the cited
  range as the starting range and SHALL NOT re-target it. [NG-8]

### Expansion to the enclosing function
- AC-10 (Event-driven): WHEN the starting range lies inside a function (function declaration, method,
  function expression or arrow function) of a supported language, the API SHALL expand the suggestion
  to the innermost such function whose lines contain the whole starting range, for both expectation
  types. [covers EC-3, EC-18]
- AC-42 (Unwanted behaviour): IF the innermost function starts or ends outside the hunk that contains
  the starting range, THEN the API SHALL truncate the expanded range to the new-side lines of the hunk
  or hunks that contain the starting range.
  [covers EC-9]
- AC-12 (Unwanted behaviour): IF the expanded range (after AC-42) spans more than 80 lines, THEN the API
  SHALL expand the suggestion to the largest statement or block inside the function that contains the
  whole starting range and spans at most 80 lines within that hunk, and SHALL keep the starting range
  when no such statement or block exists. [covers EC-5]
- AC-45 (Unwanted behaviour): IF the starting range does not lie inside any function, THEN the API
  SHALL apply no expansion and SHALL suggest the starting range. [covers EC-19, EC-20]
- AC-44 (Event-driven): WHEN the finding's kind is `secret_leak`, `lethal_trifecta`, `phantom` or
  `hook`, the API SHALL suggest the cited range without re-targeting or expansion, so the case is
  created on a single activation (AC-24) as SPEC-06 AC-66. [covers EC-10]
- AC-30 (Unwanted behaviour): IF the starting range itself spans more than 80 lines, THEN the API
  SHALL neither expand nor shorten it.
- AC-13 (Unwanted behaviour): IF the finding's file is not in a language the structural parser
  supports, or the patch text cannot be parsed, THEN the API SHALL apply no expansion, SHALL still
  apply re-targeting (AC-7), SHALL mark the response as "structure not available", and SHALL NOT
  answer with an error. [covers EC-8]

### Confirming the range
- AC-14 (Event-driven): WHEN the user confirms the range dialog, the finding card SHALL send the
  selected start and end line with `POST /findings/:id/eval-case`, and the API SHALL create the case as
  in SPEC-06 AC-1 / AC-2 with the expectation's start and end line equal to those values.
- AC-39 (Ubiquitous): The API SHALL accept `start_line`, `end_line` and `patch_fingerprint` on
  `POST /findings/:id/eval-case` as an optional group (all three or none), and SHALL use the finding's
  cited range, without the SPEC-06 AC-75 check, when the group is absent.
- AC-43 (Unwanted behaviour): IF the `patch_fingerprint` sent with a range differs from the
  fingerprint of the finding's current patch, THEN the API SHALL reject the request with status 409 and
  the message "The diff changed", create no case, and the range dialog SHALL reload the suggestion
  while keeping the start and end line the user entered. [covers EC-11]
- AC-15 (Unwanted behaviour): IF the sent range does not intersect any hunk of the finding's file in
  the stored patch, THEN the API SHALL reject the request with the SPEC-06 AC-75 reason and create no
  case, and the range dialog SHALL show that reason and stay open with the entered range.
- AC-16 (Event-driven): WHEN the API has created the case, the finding card SHALL close the range
  dialog, show the SPEC-06 AC-5 confirmation naming the case, and announce it to assistive technology.
- AC-17 (Unwanted behaviour): IF case creation fails, THEN the range dialog SHALL show the error
  message returned by the API, keep the entered range, and keep Confirm available for another attempt.
- AC-18 (Unwanted behaviour): IF a case already exists for the finding when the user confirms (for
  example created from the other view of the same finding), THEN the API SHALL return the existing
  case unchanged as in SPEC-06 AC-9, and the finding card SHALL close the range dialog and state that
  the finding is already an eval case, naming that case. [covers EC-6]
- AC-19 (State-driven): WHILE a confirm request is in progress, the range dialog SHALL keep Confirm
  disabled. [covers EC-7]
- AC-34 (Event-driven): WHEN the user presses Enter in the start or end line field while the entered
  range is valid, the range dialog SHALL confirm it. [accepted P-6]

### The range dialog
- AC-20 (Ubiquitous): The range dialog SHALL show a switch with the options "Suggested" and "Cited",
  each labelled with its `start–end`, and start and end line fields; "Suggested" SHALL be selected when
  the dialog opens.
- AC-33 (Event-driven): WHEN the user selects "Suggested" or "Cited", the range dialog SHALL set the
  start and end line fields to that range. [accepted P-6]
- AC-40 (State-driven): WHILE the start and end line fields hold a range equal to neither option, the
  range dialog SHALL show neither option as selected.
- AC-21 (Ubiquitous): The range dialog SHALL show a read-only preview of the patch's new-side lines
  from the start to the end line in the fields, each with its line number, rendered as plain text.
- AC-22 (Event-driven): WHEN the user edits the start or end line, the range dialog SHALL update the
  preview to the edited range.
- AC-23 (State-driven): WHILE a line field is empty or not a whole number, or the entered range
  intersects no hunk of the file, the range dialog SHALL show the reason and keep Confirm disabled.
- AC-46 (Event-driven): WHEN the entered end line is before the start line, the range dialog SHALL
  preview and send the normalised range (lower number as start), as SPEC-06 AC-21 and AC-75 normalise
  it, and SHALL NOT treat it as invalid.- AC-32 (Ubiquitous): The range dialog SHALL show why the range was suggested: each matched term with
  its number of matches when re-targeting applied, "expanded to function `<name>`" (or "expanded to the
  enclosing function" for an anonymous one) when expansion applied, and a note that the function is
  longer than 80 lines when AC-12 applied. [accepted P-2]
- AC-41 (State-driven): WHILE the suggestion is marked "structure not available" (AC-13), the range
  dialog SHALL show the note "structure not available for this file type".
- AC-25 (Ubiquitous): The suggestion flow SHALL be the same from both places that offer "Turn into
  eval case": the finding card in the findings list and the inline finding in the Diff tab.

### Verification and unchanged behaviour
- AC-28 (Ubiquitous): The API SHALL keep the SPEC-06 scoring and metrics unchanged, and
  `pnpm verify:l06` SHALL exit with status 0 after this change.
- AC-31 (Ubiquitous): `pnpm verify:l06` SHALL run the suggestion's tests, including the two examples of
  the problem statement as fixtures — the first ("Unhandled promise rejection in GET /users route",
  cited 6–8 of `routes.ts`) expecting the suggestion 16–19 — and SHALL fail when any of them fails.
  [accepted P-1]

### Bounds
- AC-47 (withdrawn) — no patch-size cap on the suggestion (Q-14; accepted risk EC-22).
- AC-48 (withdrawn) — no timeout on the suggestion (Q-14; accepted risk EC-22).

## Edge cases
- EC-1 The cited range is right and already a whole function → AC-8, AC-10, AC-24 (one click)
- EC-2 The cited range points at unrelated code (`interface Req`) → AC-7, AC-1
- EC-3 The cited range is too narrow (one line of a handler) → AC-10, AC-1
- EC-4 Search terms match in several places equally → AC-9
- EC-5 The enclosing function is longer than 80 lines → AC-12
- EC-6 A case is created from the other view of the same finding while the range dialog is open → AC-18
- EC-7 Double activation of Confirm → AC-19, SPEC-06 AC-9
- EC-8 The file is not TS/JS (Markdown, YAML, Python, SQL), or parsing fails → AC-13, AC-41
- EC-9 The patch holds only fragments of a modified file, so the enclosing function starts or ends
  outside the patch → AC-42, AC-5
- EC-10 Full-file finding kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`), whose cited
  lines are exempt from the grounding line test and may not intersect a hunk → AC-44, AC-24
- EC-11 The PR diff changes (new commits) between the suggestion and the confirm → AC-43
- EC-12 The finding's decision is cleared while the range dialog is open → the API rejects as in
  SPEC-06 (422, "must be accepted or dismissed first"), AC-17
- EC-13 The finding's agent is deleted while the range dialog is open → SPEC-06 AC-7, AC-17
- EC-14 The title and rationale contain no code-like term, or none occurs in the patch → AC-51, then
  AC-10 or AC-45
- EC-15 A search term matches only removed (`-`) lines → not a match (AC-6 matches new-side lines)
- EC-16 The cited range is reversed (end before start) → normalised first, as in SPEC-06 AC-21
- EC-17 The finding already has a case ("Already an eval case") → the button stays disabled as today
  (SPEC-06 AC-9); a stale card that still requests a suggestion → AC-35
- EC-18 Accepted risk: a `must_not_flag` expectation expanded to its whole enclosing function also
  covers real issues elsewhere in that function, so a later correct finding there counts as a hit and
  lowers precision. Decided by the user (Q-5); mitigated by the 80-line cap (AC-12), by the dialog
  that always opens when the expansion changes the cited range (AC-1), and by the "Cited" option
  (AC-20, AC-33).
- EC-19 The starting range is not inside any function (a top-level statement, such as a constant on
  line 8 of `user-service.ts`) → AC-45
- EC-20 A citation not inside a function and not re-targeted → suggestion equals the cited range →
  AC-45, AC-24 (one click)
- EC-21 The starting range spans more than 80 lines → AC-30
- EC-22 Accepted risk: the finding's patch is very large (lockfile, generated file), or the structural
  parse is slow → no cap and no timeout (Q-14, decided by the user); the suggestion route may respond
  slowly, while the button stays busy (AC-26).
- EC-23 (merged into EC-22)
- EC-24 An expanded function crosses a gap between two hunks, or a cited starting range already touches
  two hunks → truncated to the hunk or hunks that contain the starting range (AC-42)
- EC-25 A term occurs in a comment or string of unrelated code → counted like any other line; the
  user sees the matched terms (AC-32) and can pick "Cited"

## Non-functional requirements
- NFR-1 (reliability): The API SHALL return the same suggestion for the same finding and the same
  patch on every invocation.
- NFR-2 (performance): No response-time bound and no patch-size limit are set for the suggestion
  route, by the user's decision (Q-14); the resulting risk is recorded in EC-22.
- NFR-3 (security): The API SHALL treat the finding's title and rationale as untrusted text: used only
  as literal search terms, length-bounded, never evaluated, never compiled into a pattern without
  escaping, never followed as instructions.
- NFR-4 (security): The API SHALL parse the patch text in memory only, never execute it, and never
  read the repository working tree to compute the suggestion.
- NFR-5 (accessibility): The range dialog SHALL have an accessible name, SHALL move focus into itself
  when it opens, SHALL keep keyboard focus inside while open, SHALL close on Escape, and SHALL return
  focus to the "Turn into eval case" button when it closes.
- NFR-6 (accessibility): The start and end line fields SHALL have visible labels; the selected option
  of the switch and the previewed range SHALL be conveyed by text in addition to colour; a validation
  reason SHALL be announced to assistive technology.
- NFR-7 (reliability): `pnpm verify:l06` SHALL make no network call to any LLM provider (SPEC-06
  NFR-8, unchanged).

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| Finding title, rationale | `findings` row | model output | untrusted |
| Finding file, cited start/end line | `findings` row | model output (passed grounding, or exempt) | untrusted |
| Finding decision (accepted / dismissed) | `findings` row | workspace user | trusted |
| Patch of the finding's file | PR diff, sliced as in SPEC-06 AC-13 | PR author | untrusted |
| Suggested range and its reason | suggestion route, computed in code | DevDigest | trusted (derived, deterministic) |
| Confirmed range | range dialog → `POST /findings/:id/eval-case` | workspace user | validated against the patch (AC-15) |
| Patch fingerprint | suggestion route → client → create request | DevDigest | compared, never trusted (AC-43) |

## Untrusted inputs
- Finding title and rationale — data only; reduced to literal search terms; length-bounded; never
  evaluated or followed as instructions (NFR-3). Matched terms shown in the dialog (AC-32) are
  rendered as plain text.
- Patch text — parsed in memory for structure only, never executed (NFR-4); the preview renders it as
  plain text, never as HTML (SPEC-06 NFR-3). The patch lines returned by the suggestion route are not
  size-bounded, as the stored case input is not (SPEC-06 EC-14).
- Confirmed range — integers validated by the API against the stored patch (AC-15); the API never
  trusts a range sent by the client without that check.

## Open questions
None. Q-1..Q-16 and Q-18 are answered (see the Decisions log in design-review.md); Q-14 was decided as
"no bounds" (AC-47, AC-48 withdrawn, EC-22).

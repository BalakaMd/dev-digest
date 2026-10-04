# Spec: Local override of a repository context document ("Edit a copy")
Spec ID: SPEC-02
Status: approved
Supersedes: SPEC-01 (specs/project-context-folder/spec.md) — in part, see "Scope of supersession"

## Problem and user
A workspace owner tunes the project documents that review agents read (SPEC-01). Documents that
come from the repository (`specs/`, `docs/`, `insights/` in the clone) are read-only on the Project
Context page: the Edit toggle is disabled with "Repository documents are changed in the repository,
not here." To adjust a rule for DevDigest only (stricter wording, a local exception, a fix the
repository has not merged yet) the owner today has to change the repository, commit, push and sync,
or write a local document under a different path and re-attach it on every agent and skill. A local
document that happens to share a repository path is ignored ("Shadowed"), so the obvious workaround
silently does nothing.

## Scope of supersession
This spec replaces only the SPEC-01 criteria listed as "replaced" or "amended"; every other SPEC-01
criterion, edge case and NFR stays in force unchanged and applies to override copies as to any local
document.
- Replaced: SPEC-01 AC-65 (repository wins on a path clash) → AC-1, AC-2, AC-19; SPEC-01 AC-67
  (repository documents read-only) → AC-4 to AC-8, AC-26; SPEC-01 EC-20 → EC-1, EC-11, EC-12.
- Amended:
  - SPEC-01 AC-9 — its reference to "the precedence of AC-65" means AC-1 of this spec.
  - SPEC-01 AC-11 — a Context-tab row of an overridden path also carries "Overrides repo" (AC-16).
  - SPEC-01 AC-38 and AC-40 — the trace and the trace drawer also mark an injected override (AC-17).
  - SPEC-01 AC-52 — the "Shadowed" badge is replaced by the badges of AC-11 and AC-21.
  - SPEC-01 AC-53, AC-71, AC-72 — the overridden repository row shows "Not used — overridden by a
    local copy" instead of "Used by N agents" and the Coverage ring (AC-12).
  - SPEC-01 AC-73 — selection when two documents share a path (AC-13).
  - SPEC-01 AC-86 — an override copy is removed through "Revert to repository version" (AC-14,
    AC-20); an orphaned copy keeps the SPEC-01 AC-86 Delete (AC-24).
  - SPEC-01 NG-8, second clause ("repository documents are read-only in the studio") now reads
    "repository documents are never written; the studio edits a local copy instead".
- Unchanged and relied on: SPEC-01 AC-1, AC-3 to AC-6, AC-8, AC-16, AC-17, AC-27 to AC-37, AC-39,
  AC-43, AC-45, AC-47, AC-55, AC-56, AC-60 to AC-62, AC-64, AC-66, AC-68 to AC-70, AC-74, AC-79,
  AC-84 (New file, New folder and upload onto a repository path stay rejected with 422), AC-85,
  AC-87, NFR-1 to NFR-4.

## Goals / Non-goals
Goals:
- G-1 The owner can change the text of a repository document for DevDigest without touching the
  repository, by editing a local copy that has the same repo-relative path.
- G-2 Once saved, the copy is what every agent, skill and review run uses for that path, without
  re-attaching anything.
- G-3 The owner can always see that a path is overridden, notice when the repository version moved
  on, and return to the repository version.

Non-goals:
- NG-1 Writing into the clone (working copy) in any form.
- NG-2 Any git operation for overrides: no commit, push, branch, stash or pull request. Carrying a
  change into the repository is done by hand outside DevDigest.
- NG-3 Editing a repository document in place in the studio.
- NG-4 Automatic selection of documents from a PR's content (unchanged from SPEC-01 NG-1).
- NG-5 Merging an override with later repository changes (no three-way merge, no rebase of the
  copy onto the new repository text).
- NG-6 Overrides shared across repositories (unchanged from SPEC-01 NG-10).
- NG-7 Creating an override through "New file", "New folder" or upload: they keep the 422 of
  SPEC-01 AC-84 on a repository path (Q-6).
- NG-8 A comparison or diff view between the copy and the repository version (P-2 rejected).
- NG-9 A "Copy markdown" button on the copy (P-3 rejected).
- NG-10 Showing, from a citation chip or the trace, the exact document version a run read: the chip
  keeps opening the current effective document, which can differ from the text the run used after
  the copy was edited or reverted — a known limitation (P-4 rejected, EC-16).
- NG-11 A run-log line or trace entry for a copy whose repository version changed; that state is
  shown on the Project Context page only (Q-5).
- NG-12 A one-time notice listing the documents whose precedence changed when this feature ships
  (Q-1).

## User stories
- US-1 As a workspace owner, I want to edit a copy of a repository document in the studio, so that
  reviewers use my wording without a commit to the repository.
- US-2 As a workspace owner, I want to see which documents are overridden, notice when the
  repository changed them, and return to the repository version, so that a local tweak never hides
  the repository's rules by accident.
- US-3 As a workspace owner reading a run trace, I want to see that a document came from my local
  override, so that I know which text a review was judged against.

## Acceptance criteria (EARS)

### Precedence
- AC-1 (Unwanted behaviour): IF a local document and a repository document have the same
  repo-relative path, THEN the context-document reader SHALL return the local document as the
  effective document for that path, so that the Context tabs, the skills' inherited rows and the run
  executor use only the local document's text for that path.   [covers US-1, EC-1; replaces SPEC-01 AC-65]
- AC-2 (Ubiquitous): The document list returned by the API SHALL mark a local document that has the
  same path as a repository document as overriding it, and SHALL mark that repository document as
  overridden; both marks SHALL be derived on every list request from the two sources.   [covers US-2]
- AC-3 (Ubiquitous): Attachments of agents and skills SHALL stay repo-relative paths: creating,
  editing or reverting an override SHALL NOT change any agent's or skill's attachment list or bump
  any version, and an attached path SHALL resolve to the override from the next run on.
   [covers US-1, EC-3]
- AC-19 (Unwanted behaviour): IF a local document already shares its path with a repository document
  when this feature ships, or a sync adds a repository document at the path of an existing local
  document, THEN that local document SHALL become an override under AC-1 and AC-2 without any user
  action and without a separate notice.   [covers EC-11, EC-12; Q-1]

### Creating and editing the copy
- AC-4 (State-driven): WHILE a repository document that is not overridden is selected on the Project
  Context page, the page SHALL offer an "Edit a copy" action in place of the disabled Edit toggle,
  with the explanation that the copy is stored in DevDigest only and the repository is not changed.
   [covers US-1; replaces SPEC-01 AC-67]
- AC-5 (Event-driven): WHEN the user activates "Edit a copy", the Project Context page SHALL open the
  editor at once, without a confirmation dialog, prefilled with the repository document's current
  text from the working copy; the copy SHALL exist only after its first Save, and Cancel before the
  first Save SHALL leave no local document behind.   [covers US-1; Q-2]
- AC-25 (State-driven): WHILE a copy is open in the editor before its first Save, the Project Context
  page SHALL show a notice that names the agents and skills attaching the path and states that they
  use the copy from their next run on, or states that no agent or skill attaches it.   [covers EC-3; P-1]
- AC-6 (Event-driven): WHEN the user saves the copy for the first time, the API SHALL store it as a
  local document at the same repo-relative path as the repository document, subject to SPEC-01 AC-56
  and AC-62, and SHALL NOT write, create or delete any file in the working copy.   [covers US-1, NFR-1]
- AC-7 (Ubiquitous): The API SHALL create a local document at a path held by a repository document
  only when the create request explicitly states the intent to override that repository document; a
  create request without that intent, including every "New file", "New folder" and upload request,
  SHALL keep the 422 of SPEC-01 AC-84 naming the path.   [covers EC-6; Q-6]
- AC-8 (Unwanted behaviour): IF the selected repository document is over 65,536 bytes or is not valid
  UTF-8, THEN the Project Context page SHALL show "Edit a copy" disabled with the reason ("Too large"
  or "Not valid UTF-8") as its accessible description.   [covers EC-4, EC-5]
- AC-9 (Ubiquitous): Saving an existing override copy SHALL follow SPEC-01 AC-66 and AC-85 (Save,
  Cancel, 409 on a stale save), and leaving the copy's editor with unsaved edits SHALL follow SPEC-01
  AC-74.   [covers EC-7, EC-8]
- AC-10 (Event-driven): WHEN a sync of the working copy changes or removes a repository document that
  has an override, the API SHALL leave the override copy unchanged and the copy SHALL stay the
  effective document for its path.   [covers EC-2, EC-9]

### Repository version changed
- AC-23 (Event-driven): WHEN a copy is first saved, the API SHALL record as the copy's origin the
  version of the repository text that was loaded into the editor (AC-5), outside the working copy.
   [covers EC-18]
- AC-21 (State-driven): WHILE the current repository document's text differs from the copy's
  recorded origin, the Project Context page SHALL show a "Repository changed" badge on the copy's
  row and in its viewer, and the copy SHALL stay the effective document.   [covers US-2, EC-2; Q-5]
- AC-28 (Event-driven): WHEN the API finds an override that has no recorded origin (AC-19: a local
  document that shipped as "Shadowed", a later upstream collision, or an orphan whose path the
  repository re-adds), the API SHALL record as its origin the version of the repository text at that
  moment, so that such a copy shows no "Repository changed" badge until the repository text changes
  again.   [covers EC-9, EC-11, EC-12; Q-11]
- AC-22 (Event-driven): WHEN the user activates "Keep my copy" on a copy marked "Repository changed",
  the API SHALL record the current repository text's version as the copy's origin, leave the copy's
  text unchanged, and the badge SHALL disappear.   [covers EC-2; Q-5]
- AC-29 (Ubiquitous): Saving the copy SHALL leave its recorded origin unchanged, so that only "Keep my
  copy" (AC-22) or a revert (AC-14) clears "Repository changed".   [covers EC-19; Q-12]

### Project Context page
- AC-11 (Ubiquitous): The Project Context page SHALL list an overridden path as two rows: the copy
  with the badges "Local" and "Overrides repo", and the repository document with the badge
  "Overridden"; each badge SHALL carry text (not colour alone) and a tooltip that explains it.
   [covers US-2; Q-3; amends SPEC-01 AC-52]
- AC-12 (Ubiquitous): The copy's row SHALL show "Used by N agents" and the Coverage ring computed by
  path as in SPEC-01 AC-71 and AC-72, and the overridden repository row SHALL show "Not used —
  overridden by a local copy" in place of both.   [Q-3]
- AC-26 (State-driven): WHILE an overridden repository document is selected, the Project Context page
  SHALL show it as read-only preview from the working copy, without "Edit a copy", with the Edit
  toggle disabled and the explanation that a local copy overrides this document.   [Q-3]
- AC-27 (Event-driven): WHEN the user activates the "Open local copy" link shown next to the disabled
  Edit toggle of a selected overridden repository row, the Project Context page SHALL select the
  override copy of that path, with the same unsaved-edits rule as SPEC-01 AC-74.   [P-5]
- AC-13 (Event-driven): WHEN the page opens with `?doc=<path>` and no source for a path that is
  overridden, the Project Context page SHALL select the override copy; WHEN the user selects the
  overridden repository row, the page SHALL put an explicit repository source in the URL next to
  `?doc=`, and opening that URL SHALL select the repository row.   [amends SPEC-01 AC-73]
- AC-20 (State-driven): WHILE an override copy is selected, the Project Context page SHALL offer
  "Revert to repository version" in place of the Delete action of SPEC-01 AC-86.   [covers US-2; Q-4]
- AC-14 (Event-driven): WHEN the user activates "Revert to repository version", the Project Context
  page SHALL ask for confirmation in a dialog that states the copy's edits are discarded and names the
  agents and skills attaching the path that will use the repository document again; WHEN the user
  confirms, the API SHALL delete the copy, the repository document SHALL become the effective
  document for that path, and attachments to that path SHALL stay unchanged; WHEN the user cancels,
  nothing SHALL change.   [covers US-2; Q-4; amends SPEC-01 AC-86]
- AC-24 (State-driven): WHILE a local document has no repository document at its path any more (the
  repository document was deleted or renamed upstream), the Project Context page SHALL list it as a
  plain local document with the "Local" badge only, without "Overrides repo" or "Repository
  changed", and SHALL offer the Delete of SPEC-01 AC-86 instead of the revert action; it SHALL stay
  the effective document for its path.   [covers EC-9; Q-8]
- AC-15 (Ubiquitous): The results of creating a copy, of "Keep my copy" and of returning to the
  repository version SHALL be announced through the page's polite live region, and "Edit a copy",
  "Keep my copy" and "Revert to repository version" SHALL be keyboard-operable buttons whose
  accessible names include the document path.   [NFR-2]

### Context tabs and runs
- AC-16 (Ubiquitous): The agent and skill Context tabs SHALL list an overridden path as one row that
  shows the override copy's token count and size state ("Too large") with the badges "Local" and
  "Overrides repo", so that the budget bar (SPEC-01 AC-17, AC-47) counts the copy's tokens.
   [covers EC-3; Q-7; amends SPEC-01 AC-11]
- AC-17 (Event-driven): WHEN a run injects a local document while a repository document with the
  same path exists in the working copy, the persisted trace SHALL record that document with source
  `local` and an override indicator, and the run trace drawer SHALL label it "Local · overrides
  repository" in "Specs read" and in the Project context summary; traces written before this feature
  SHALL render as before.   [covers US-3, EC-14; Q-7; amends SPEC-01 AC-38, AC-40]
- AC-18 (Unwanted behaviour): IF an override copy cannot be read at run time (not valid UTF-8, over
  65,536 bytes, failing SPEC-01 AC-3), THEN the run executor SHALL skip that path with its reason
  as in SPEC-01 AC-33 and SHALL NOT inject the repository document for that path instead.
   [covers EC-10; Q-9]
- AC-30 (Event-driven): WHEN the user saves a copy whose text is identical to the repository
  document, the API SHALL store it like any other copy, and it SHALL stay an override under AC-1
  with its origin recorded under AC-23.   [covers EC-13; Q-10]

## Edge cases
- EC-1 Local and repository document share a path → AC-1, AC-2
- EC-2 The repository document changes upstream after the copy was made → AC-10, AC-21, AC-22
- EC-3 Agents and skills already attach the path when the copy is first saved; their next run
  switches to the copy without any change to their configuration → AC-3, AC-16, AC-25
- EC-4 Repository document over 65,536 bytes → AC-8
- EC-5 Repository document not valid UTF-8 → AC-8
- EC-6 "New file", "New folder" or upload targets a path held by a repository document → AC-7
- EC-7 The copy is first saved from two browser tabs at once: the second create meets a local
  document at that path and is rejected per SPEC-01 AC-84 → AC-7, AC-9
- EC-8 Unsaved edits in the copy's editor when the user leaves Edit mode, selects another document
  or leaves the page → AC-9
- EC-9 The repository document is deleted or renamed upstream while the override exists (orphan) →
  AC-10, AC-24; if the repository later re-adds the path, the copy becomes an override again → AC-19,
  AC-28
- EC-10 The override copy becomes unreadable at run time (edited outside DevDigest on disk) → AC-18
- EC-11 Local documents that are "Shadowed" today become overrides when the precedence flips → AC-19,
  AC-28
- EC-12 A sync adds a repository document at the path of a local document the user wrote earlier →
  AC-19, AC-28
- EC-13 The copy is saved with text identical to the repository document → AC-30
- EC-14 The repository has no working copy: the page shows its "not cloned" state (SPEC-01 AC-58),
  no "Edit a copy" is offered, existing copies stay effective in runs (SPEC-01 AC-33, AC-64), and the
  trace records them without the override indicator because no repository document was found → AC-1,
  AC-17
- EC-15 The repository is removed from the workspace: its override copies are deleted with its other
  local documents and counted in the removal confirmation (SPEC-01 AC-87) → AC-6
- EC-16 A finding cites an overridden path; the citation chip opens the current effective document,
  which can differ from the text the run read if the copy was edited or reverted later → NG-10
  (known limitation)
- EC-17 Copy content contains `</untrusted>` or instructions → SPEC-01 AC-28, AC-29, AC-30 (unchanged)
- EC-18 The working copy is synced between opening "Edit a copy" and the first Save: the origin is
  the version loaded into the editor, so the copy shows "Repository changed" right after the Save →
  AC-23, AC-21
- EC-19 The user edits and saves a copy marked "Repository changed" without acknowledging it: the
  badge stays → AC-29
- EC-20 The user lands on an overridden repository row (tree or `source=repo` URL) and wants the copy
  → AC-27

## Non-functional requirements
- NFR-1 (security): Creating, editing, acknowledging and reverting an override SHALL write only
  inside the repository's local-document folder and SHALL run no git command and make no network
  request (SPEC-01 NFR-1 unchanged).
- NFR-2 (accessibility): "Edit a copy", "Keep my copy", "Revert to repository version" and the revert
  dialog SHALL be operable by keyboard alone, and every override badge ("Overrides repo",
  "Overridden", "Repository changed") SHALL be distinguishable without colour (SPEC-01 NFR-3
  unchanged).
- NFR-3 (performance): Deriving the marks of AC-2 and AC-21 SHALL keep the document list within the
  1 s bound of SPEC-01 NFR-2 for 1,000 matching documents.

## Inputs and provenance
| Input | Source | Owner | Trust |
|-------|--------|-------|-------|
| Repository document text used to prefill the copy | Working copy, default branch as last synced (SPEC-01 AC-43) | Repository authors | Untrusted; shown only as editor text |
| Override copy content | The repository's local documents in DevDigest's data directory, written via the studio | Workspace user (starting from repository text) | Untrusted when injected; validated on write (SPEC-01 AC-56) |
| Override intent and origin version on a create request | Studio user via the API | Workspace user | Validated (AC-7); the origin version is only compared, never used as content |
| Copy origin record | DevDigest's data directory, outside the working copy (AC-23) | DevDigest | Trusted |
| Override / overridden / "Repository changed" marks | Server, derived per list request | DevDigest | Trusted |
| Trace override indicator | Run executor at run time | DevDigest | Trusted |

## Untrusted inputs
- Override copy content — the same rules as every local document: 65,536-byte limit, valid UTF-8,
  per-document untrusted delimiter with closing-tag escaping, the shared injection guard and the
  trusted rule (SPEC-01 AC-28 to AC-30), markdown preview without raw HTML (SPEC-01 AC-16, AC-53);
  never executed, links never fetched (SPEC-01 AC-8).
- Override path — always the selected repository document's own repo-relative path, re-validated by
  the API against SPEC-01 AC-4 and AC-56 on every write; a client-supplied path is not trusted
  because it equals a repository path.
- Origin version in a create or "Keep my copy" request — accepted only as a fixed-format version
  string, compared with the repository document's version; a mismatch only shows "Repository
  changed" (AC-21) and never grants a write.
- Repository text placed into the editor — shown as plain text in a text area, never rendered as HTML.

## Open questions
None.

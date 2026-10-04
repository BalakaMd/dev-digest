# Development Plan: Local override of a repository context document ("Edit a copy")

Created: 2026-10-04 · Branch: lab-005 · HEAD: 94c4cef · Status: ready
Spec: specs/context-doc-local-override/spec.md · SPEC-02 · approved (supersedes SPEC-01 in part)
Recommended mode: multi-agent — two independent packages (server ∥ client) once the shared contract is fixed, ~40 files, and the DB-backed tests cannot run in this sandbox, so an independent test-writer is worth having.

## Requirements
(Verbatim from the spec; the `[covers …]` tags are omitted. "Q-n" below are the planner's own questions, not spec ids.)
- AC-1: "(Unwanted behaviour): IF a local document and a repository document have the same repo-relative path, THEN the context-document reader SHALL return the local document as the effective document for that path, so that the Context tabs, the skills' inherited rows and the run executor use only the local document's text for that path." → S3, S6, S8
- AC-2: "(Ubiquitous): The document list returned by the API SHALL mark a local document that has the same path as a repository document as overriding it, and SHALL mark that repository document as overridden; both marks SHALL be derived on every list request from the two sources." → S1, S3, S4
- AC-3: "(Ubiquitous): Attachments of agents and skills SHALL stay repo-relative paths: creating, editing or reverting an override SHALL NOT change any agent's or skill's attachment list or bump any version, and an attached path SHALL resolve to the override from the next run on." → S3, S5, S6 (no code touches attachments)
- AC-19: "(Unwanted behaviour): IF a local document already shares its path with a repository document when this feature ships, or a sync adds a repository document at the path of an existing local document, THEN that local document SHALL become an override under AC-1 and AC-2 without any user action and without a separate notice." → S3
- AC-4: "(State-driven): WHILE a repository document that is not overridden is selected on the Project Context page, the page SHALL offer an "Edit a copy" action in place of the disabled Edit toggle, with the explanation that the copy is stored in DevDigest only and the repository is not changed." → S10, S12
- AC-5: "(Event-driven): WHEN the user activates "Edit a copy", the Project Context page SHALL open the editor at once, without a confirmation dialog, prefilled with the repository document's current text from the working copy; the copy SHALL exist only after its first Save, and Cancel before the first Save SHALL leave no local document behind." → S7, S11, S12
- AC-25: "(State-driven): WHILE a copy is open in the editor before its first Save, the Project Context page SHALL show a notice that names the agents and skills attaching the path and states that they use the copy from their next run on, or states that no agent or skill attaches it." → S11, S12
- AC-6: "(Event-driven): WHEN the user saves the copy for the first time, the API SHALL store it as a local document at the same repo-relative path as the repository document, subject to SPEC-01 AC-56 and AC-62, and SHALL NOT write, create or delete any file in the working copy." → S1, S3, S5
- AC-7: "(Ubiquitous): The API SHALL create a local document at a path held by a repository document only when the create request explicitly states the intent to override that repository document; a create request without that intent, including every "New file", "New folder" and upload request, SHALL keep the 422 of SPEC-01 AC-84 naming the path." → S1, S3, S5 · assumes Q-2
- AC-8: "(Unwanted behaviour): IF the selected repository document is over 65,536 bytes or is not valid UTF-8, THEN the Project Context page SHALL show "Edit a copy" disabled with the reason ("Too large" or "Not valid UTF-8") as its accessible description." → S12
- AC-9: "(Ubiquitous): Saving an existing override copy SHALL follow SPEC-01 AC-66 and AC-85 (Save, Cancel, 409 on a stale save), and leaving the copy's editor with unsaved edits SHALL follow SPEC-01 AC-74." → S3 (unchanged update path), S12 (existing DocEditor/guard reused)
- AC-10: "(Event-driven): WHEN a sync of the working copy changes or removes a repository document that has an override, the API SHALL leave the override copy unchanged and the copy SHALL stay the effective document for its path." → S3
- AC-23: "(Event-driven): WHEN a copy is first saved, the API SHALL record as the copy's origin the version of the repository text that was loaded into the editor (AC-5), outside the working copy." → S1, S2, S3, S11
- AC-21: "(State-driven): WHILE the current repository document's text differs from the copy's recorded origin, the Project Context page SHALL show a "Repository changed" badge on the copy's row and in its viewer, and the copy SHALL stay the effective document." → S3, S10, S12
- AC-28: "(Event-driven): WHEN the API finds an override that has no recorded origin (AC-19: a local document that shipped as "Shadowed", a later upstream collision, or an orphan whose path the repository re-adds), the API SHALL record as its origin the version of the repository text at that moment, so that such a copy shows no "Repository changed" badge until the repository text changes again." → S2, S3
- AC-22: "(Event-driven): WHEN the user activates "Keep my copy" on a copy marked "Repository changed", the API SHALL record the current repository text's version as the copy's origin, leave the copy's text unchanged, and the badge SHALL disappear." → S1, S3, S5, S7, S12 · assumes Q-1
- AC-29: "(Ubiquitous): Saving the copy SHALL leave its recorded origin unchanged, so that only "Keep my copy" (AC-22) or a revert (AC-14) clears "Repository changed"." → S3
- AC-11: "(Ubiquitous): The Project Context page SHALL list an overridden path as two rows: the copy with the badges "Local" and "Overrides repo", and the repository document with the badge "Overridden"; each badge SHALL carry text (not colour alone) and a tooltip that explains it." → S10
- AC-12: "(Ubiquitous): The copy's row SHALL show "Used by N agents" and the Coverage ring computed by path as in SPEC-01 AC-71 and AC-72, and the overridden repository row SHALL show "Not used — overridden by a local copy" in place of both." → S10, S12
- AC-26: "(State-driven): WHILE an overridden repository document is selected, the Project Context page SHALL show it as read-only preview from the working copy, without "Edit a copy", with the Edit toggle disabled and the explanation that a local copy overrides this document." → S12
- AC-27: "(Event-driven): WHEN the user activates the "Open local copy" link shown next to the disabled Edit toggle of a selected overridden repository row, the Project Context page SHALL select the override copy of that path, with the same unsaved-edits rule as SPEC-01 AC-74." → S12
- AC-13: "(Event-driven): WHEN the page opens with `?doc=<path>` and no source for a path that is overridden, the Project Context page SHALL select the override copy; WHEN the user selects the overridden repository row, the page SHALL put an explicit repository source in the URL next to `?doc=`, and opening that URL SHALL select the repository row." → S10, S12
- AC-20: "(State-driven): WHILE an override copy is selected, the Project Context page SHALL offer "Revert to repository version" in place of the Delete action of SPEC-01 AC-86." → S12
- AC-14: "(Event-driven): WHEN the user activates "Revert to repository version", the Project Context page SHALL ask for confirmation in a dialog that states the copy's edits are discarded and names the agents and skills attaching the path that will use the repository document again; WHEN the user confirms, the API SHALL delete the copy, the repository document SHALL become the effective document for that path, and attachments to that path SHALL stay unchanged; WHEN the user cancels, nothing SHALL change." → S3 (delete + origin cleanup), S11, S12
- AC-24: "(State-driven): WHILE a local document has no repository document at its path any more (the repository document was deleted or renamed upstream), the Project Context page SHALL list it as a plain local document with the "Local" badge only, without "Overrides repo" or "Repository changed", and SHALL offer the Delete of SPEC-01 AC-86 instead of the revert action; it SHALL stay the effective document for its path." → S3, S10, S12
- AC-15: "(Ubiquitous): The results of creating a copy, of "Keep my copy" and of returning to the repository version SHALL be announced through the page's polite live region, and "Edit a copy", "Keep my copy" and "Revert to repository version" SHALL be keyboard-operable buttons whose accessible names include the document path." → S10 (strings), S12
- AC-16: "(Ubiquitous): The agent and skill Context tabs SHALL list an overridden path as one row that shows the override copy's token count and size state ("Too large") with the badges "Local" and "Overrides repo", so that the budget bar (SPEC-01 AC-17, AC-47) counts the copy's tokens." → S8
- AC-17: "(Event-driven): WHEN a run injects a local document while a repository document with the same path exists in the working copy, the persisted trace SHALL record that document with source `local` and an override indicator, and the run trace drawer SHALL label it "Local · overrides repository" in "Specs read" and in the Project context summary; traces written before this feature SHALL render as before." → S1, S3, S6, S9
- AC-18: "(Unwanted behaviour): IF an override copy cannot be read at run time (not valid UTF-8, over 65,536 bytes, failing SPEC-01 AC-3), THEN the run executor SHALL skip that path with its reason as in SPEC-01 AC-33 and SHALL NOT inject the repository document for that path instead." → S3, S6
- AC-30: "(Event-driven): WHEN the user saves a copy whose text is identical to the repository document, the API SHALL store it like any other copy, and it SHALL stay an override under AC-1 with its origin recorded under AC-23." → S3 (no content comparison anywhere)
- NFR-1: "(security): Creating, editing, acknowledging and reverting an override SHALL write only inside the repository's local-document folder and SHALL run no git command and make no network request (SPEC-01 NFR-1 unchanged)." → S2, S3
- NFR-2: "(accessibility): "Edit a copy", "Keep my copy", "Revert to repository version" and the revert dialog SHALL be operable by keyboard alone, and every override badge ("Overrides repo", "Overridden", "Repository changed") SHALL be distinguishable without colour (SPEC-01 NFR-3 unchanged)." → S8, S10, S11, S12
- NFR-3: "(performance): Deriving the marks of AC-2 and AC-21 SHALL keep the document list within the 1 s bound of SPEC-01 NFR-2 for 1,000 matching documents." → S3

## Traceability
| Requirement | Steps | Tests | Verify | Verification hint | State |
|---|---|---|---|---|---|
| AC-1 | S3,S6,S8 | T-1,T-10,T-11 | server unit; `*.it` | Put same path in clone and overlay; `GET …/content?path=` (no source) returns local text, `source:"local"`; run trace prompt contains copy text | planned |
| AC-2 | S1,S3,S4 | T-1,T-7,T-10 | server unit; `*.it` | `GET /repos/:id/context-docs` → local entry `overrides_repo:true`, repo entry `overridden:true`; flip by deleting the copy → both false | planned |
| AC-3 | S3,S5,S6 | T-10,T-11 | `*.it` | Agent attached to path: create/save/revert copy; `GET /agents/:id` version and `context_docs` unchanged; next run uses copy | planned |
| AC-19 | S3 | T-1,T-3 | server unit | Pre-place local file at a repo path, list: override, no write needed from user; add repo file later (sync): same | planned |
| AC-4 | S10,S12 | T-15 | client test | Open page, select an ordinary repo doc: "Edit a copy" button + hint, no disabled Edit toggle | planned |
| AC-5 | S7,S11,S12 | T-15 | client test | Click "Edit a copy": textarea appears at once with repo text, no dialog; Cancel → no `PUT` sent, list unchanged | planned |
| AC-25 | S11,S12 | T-15,T-17 | client test | In the copy draft the notice lists agent/skill names or "no agent or skill attaches it" | planned |
| AC-6 | S1,S3,S5 | T-2,T-10 | server unit; `*.it` | `PUT …/local` `{folder,name,content,override_repo:true,origin_version}` → 200; clone tree byte-identical before/after | planned |
| AC-7 | S1,S3,S5 | T-2,T-8,T-10 | server unit; `*.it` | Same `PUT` without intent, upload and new-folder onto repo path → 422 naming path; with intent but copy already exists → 422 | assumes Q-2 |
| AC-8 | S12 | T-15 | client test | Select repo doc >64 KiB: button disabled, description "Too large"; non-UTF-8 doc (content 422 `not_utf8`): "Not valid UTF-8" | planned |
| AC-9 | S3,S12 | T-2,T-15 | server unit; client test | Save existing copy with stale `base_version` → 409 + current content; leaving editor dirty asks (existing guard) | planned |
| AC-10 | S3 | T-3 | server unit | Change/delete the repo file in the clone; list + read: copy text/version unchanged, still effective | planned |
| AC-23 | S1,S2,S3,S11 | T-2,T-15,T-17 | server unit; client test | After first Save, overlay has `.origins.json` entry = sha256 of the repo text sent as `origin_version`; clone untouched | planned |
| AC-21 | S3,S10,S12 | T-3,T-15,T-16 | server unit; client test | Edit repo file after copy creation → list `repo_changed:true`; page shows "Repository changed" on tree row and viewer | planned |
| AC-28 | S2,S3 | T-3 | server unit | Local file placed at repo path (no origin) → first list/read records origin, `repo_changed:false`; edit repo file → `true`; orphan then re-added → fresh origin, `false` | planned |
| AC-22 | S1,S3,S5,S7,S12 | T-3,T-10,T-15 | server unit; `*.it`; client | Click "Keep my copy" → `POST …/local/keep-copy`; list shows `repo_changed:false`; copy text unchanged; live region "kept" | assumes Q-1 |
| AC-29 | S3 | T-2,T-3 | server unit | Save a copy marked changed: still `repo_changed:true`; only keep or revert clears it | planned |
| AC-11 | S10 | T-16 | client test | Tree shows two rows for the path: copy "Local"+"Overrides repo", repo "Overridden"; each badge has text and `title` | planned |
| AC-12 | S10,S12 | T-15 | client test | Copy selected: "Used by N agents" + Coverage ring; overridden repo row selected: "Not used — overridden by a local copy", no ring | planned |
| AC-26 | S12 | T-15 | client test | Overridden repo row: markdown preview, Edit toggle disabled (described by "a local copy overrides this document"), no "Edit a copy" | planned |
| AC-27 | S12 | T-15 | client test | Click "Open local copy": URL drops `source`, copy selected; with unsaved edits the unsaved-changes dialog appears first | planned |
| AC-13 | S10,S12 | T-14,T-15 | client test | `?doc=p` → copy selected; click repo row → URL `?doc=p&source=repo`; reload that URL → repo row selected | planned |
| AC-20 | S12 | T-15 | client test | Copy selected: "Revert to repository version", no "Delete" | planned |
| AC-14 | S3,S11,S12 | T-5,T-10,T-15,T-17 | server unit; `*.it`; client | Revert → dialog (edits discarded + attaching agents/skills) → confirm `DELETE …/local?path`; copy and origin gone, repo doc effective, attachments unchanged; Cancel sends nothing | planned |
| AC-24 | S3,S10,S12 | T-3,T-15 | server unit; client | Delete repo file, list: local entry has all three flags false, "Local" badge only, "Delete" offered; re-add repo file → override again | planned |
| AC-15 | S10,S12 | T-15 | client test | Live region (`role=status`) text after create/keep/revert; the three buttons are `<button>` with names containing the path, reachable and activated by keyboard | planned |
| AC-16 | S8 | T-12,T-13 | client test | Context tab: one row for the path, copy's tokens, "Local"+"Overrides repo"; budget bar counts copy tokens | planned |
| AC-17 | S1,S3,S6,S9 | T-9,T-11,T-18 | server unit; `*.it`; client | Run with agent attached to overridden path: `GET /runs/:id/trace` → `context.docs[0]` `{source:"local",overrides_repo:true}`; drawer shows "Local · overrides repository" in Specs read and summary; old trace unchanged | planned |
| AC-18 | S3,S6 | T-4,T-11 | server unit; `*.it` | Make copy invalid UTF-8 / >64 KiB / symlink: run trace `context.skipped` has the path with reason; prompt has no repo text of that path | planned |
| AC-30 | S3 | T-2 | server unit | Save copy with text identical to repo doc → 200, still `overrides_repo:true`, origin recorded | planned |
| NFR-1 | S2,S3 | T-2,T-5 | server unit | Snapshot clone tree before/after create/edit/keep/revert (unchanged); only overlay files change; git/network mocks never called | planned |
| NFR-2 | S8,S10,S11,S12 | T-13,T-15,T-16 | client test | Tab to each button, Enter/Space activates; badges contain text; revert dialog is the existing `ConfirmDialog` (focus-managed) | planned |
| NFR-3 | S3 | T-6 | server unit | Perf test: 1,000 overridden pairs (+ origins recorded) cold list < 1000 ms | planned |

## Non-functional requirements
| NFR / quality | Source | Mechanism (step) | Verification |
|---|---|---|---|
| NFR-1 security | SPEC-02 | Origin record is a hash in the overlay (`<contextDir>/<repoId>/.origins.json`), written with `resolveInside` + tmp/rename + mode 0600 (S2); no clone write, no git, no network anywhere in the new paths (S3) | T-2, T-5: clone tree identical; mock git not called |
| NFR-2 accessibility | SPEC-02 | Native `<button>`s with path-bearing `aria-label`s, `aria-describedby` hints, text badges + `title`, existing `ConfirmDialog` (S10–S12) | T-15, T-16 (role/name queries, keyboard-style `fireEvent` on buttons) |
| NFR-3 performance | SPEC-02 | One streamed sha256 per override pair, concurrency-limited like the existing token reads; one batched origin write per list (S3); fallback I2 if the margin is thin | T-6: < 1000 ms cold list, 1,000 pairs |
| Untrusted input (path, origin version, content) | SPEC-02 "Untrusted inputs"; server/AGENTS.md (schema-first) | Zod in contract: origin version `^[0-9a-f]{64}$`, intent only without `base_version` (S1); path re-validated by `assertSafeRelative` + glob match in the store (S3); origin only compared, never used as content | T-8, T-2 |
| No absolute paths in responses | SPEC-01 AC-5 (docs/project-context.md:249) | New store errors reuse `ContextDocError` fixed messages | T-10 asserts error bodies |

## Requirements review
- R-n blocking: none. Every criterion is verifiable, consistent and feasible on the current code.
- Q-1 [non-blocking] AC-22 vs "Untrusted inputs" — AC-22 says the API records "the current repository text's version", while the Untrusted-inputs list says a "Keep my copy" request may carry an origin version string. Readings: (1) the request carries only the path and the server hashes the current repo text (recommended: matches AC-22 verbatim, no client-trusted value); (2) the client echoes the version it showed. Planned with (1) → steps S1, S3, S5, S7, S12 `assumes Q-1`.
- Q-2 [non-blocking] AC-7/AC-6 — what the API does when a create carries the override intent but the repository document is gone (or the repo has no clone) at that moment. Planned with: store a plain local document, record no origin (AC-28 records one if the repo later gains the path). → S3 `assumes Q-2`.
- Notes (no spec change): (a) AC-12's "row" is read as the selected document's header on the right panel, where SPEC-01 AC-71/72 put "Used by N agents" and the ring. (b) AC-8's "not valid UTF-8" is detected on the client from the 422 `details.reason: "not_utf8"` of `GET …/content?source=repo` (the list has no UTF-8 flag; adding one would be a contract/behaviour decision) and "Too large" from `ContextDocEntry.too_large`.
- Requirements suggestions for the spec author: none.

## Scope
In: server store/port/service/routes/run-executor/trace contract, client Project Context page, Context-tab picker rows, run trace drawer labels, both vendor copies of `@devdigest/shared`.
Out: NG-1…NG-12 of the spec — no write into the clone, no git operation, no in-place edit of repository documents, no PR-content auto-selection, no merge/rebase of copy onto new repo text, no cross-repo overrides, no override via New file/New folder/upload (422 stays), no diff view (P-2), no "Copy markdown" (P-3), no exact-version citation chips (P-4; EC-16 known limitation), no run-log/trace entry for "Repository changed", no one-time rollout notice. Also out: DB schema/migrations (see decision D-1), docs (doc-writer), reviewer-core (no change: it receives only `{path, content}`), mcp, e2e flows (not extended; TESTING.md limits e2e to main journeys).

## Context used
- Guidance read: CLAUDE.md, server/AGENTS.md (= CLAUDE.md), client/CLAUDE.md, TESTING.md, docs/project-context.md, spec + design-review of SPEC-02.
- Lessons applied: server/INSIGHTS.md "A run reaches `done` before its trace exists" → T-11 polls the trace endpoint (`traceFor`), not just run status; server/INSIGHTS.md "hermetic by default" → all new store tests use temp `contextDir`/clone dirs, never `~/.devdigest`; client/INSIGHTS.md "`user-event` is not installed" → T-12…T-18 use `fireEvent`; client/INSIGHTS.md "react-markdown splits `**bold**`" → assert bold fragments separately in preview tests.
- Skills: onion-architecture — S2–S6 (port in `adapters/context-docs/types.ts` as today; service/routes thin; no adapter import in modules; run-executor reaches the store only via `container.contextDocs`); frontend-ui-architecture — S8–S12 (colocate under `ProjectContextView/_components/`, pure model in sibling modules, data via `src/lib/hooks`, strings in `messages/en`); zod — S1; react-best-practices / react-testing-library — S11, S12, T-12…T-18; fastify-best-practices — S5 (schema-first route); security — S1–S3 (untrusted input, file writes).
- Decisions by the planner (not requirements): **D-1 origin storage** — read how local documents live: plain files under `<contextDir>/<repoId>/` (fs-store.ts:91-94, :255-305), removed with the repo by `removeRepoLocal` (fs-store.ts:392-401) and counted by `walk` (fs-store.ts:388-390). The origin is only a sha256 and must disappear with the copy and the repository (AC-23, EC-15), so it lives in one JSON sidecar `.origins.json` in the repo's overlay folder (`{ "version":1, "origins": { "<path>": "<sha256>" } }`). A DB table would need a drizzle-kit migration, a repo-delete cascade and a second consistency domain for no gain; SPEC-01 AC-24 keeps document data out of the DB anyway. The sidecar can never collide with a document (valid paths end in `.md`; glob validation requires `.md`) and `walk` still skips it explicitly. **D-2** the repo "version" is `sha256(bytes)` — identical to `ContextDocContent.version` of `source=repo`, so the client's `origin_version` is directly comparable. **D-3** origin of an override with none is recorded by `list()` and by the effective read (a run may come before any list); both best-effort, never failing the request/run. **D-4** an orphan's origin is dropped by `list()` only when the clone exists and the repo file is really absent (`repoHas`), never on `not_cloned`. **D-5** trace indicator lives on a port method `readEffective` (returns `ContextDocContent & { overrides_repo: boolean }`), not on the public `ContextDocContent` contract. **D-6** to keep every step compiling, S1 adds the new entry fields as `.optional()` and keeps `shadowed` optional; S13 makes the new fields required and deletes `shadowed` once all consumers are migrated.

## Architecture constraints
| Rule | Source | How the plan complies |
|---|---|---|
| Routes: one service call, schema-first Zod, no hand `parse` | server/AGENTS.md, onion § checklist 1,8 | New `POST …/local/keep-copy` has `body: KeepCopyBody`, one `service.keepCopy` call (S5) |
| No adapter import in modules; ports via container | onion § allowed imports | run-executor keeps `this.container.contextDocs` (S6); service gets the store through its constructor as today |
| Mocks mirror ports | server/AGENTS.md (container + mocks) | `MockContextDocStore` gets `readEffective`, `keepOrigin`, override semantics (S4) |
| Contract change = canonical + client copy, identical | CLAUDE.md, onion checklist 7 | S1 edits both copies in one step; S13 tightens them in both |
| Never hand-edit lockfiles/migrations | CLAUDE.md | No dependency, no migration (D-1) |
| Test naming: DB-backed `*.it.test.ts` | server/AGENTS.md | T-10, T-11 are `.it`; everything else hermetic |
| Client: no `fetch` in components, strings via next-intl, colocated `_components/<Pascal>/` + test | client/CLAUDE.md, skill | Hooks in `lib/hooks/context-docs.ts` (S7); keys in `messages/en` (S8–S10); new folders colocated (S11, S12) |
| `*/vendor/**` read-only except canonical shared | CLAUDE.md | Only `server/src/vendor/shared/contracts/{context-docs,trace}.ts` edited, then copied |
| Known deviation: port declared in `adapters/context-docs/types.ts`, not `vendor/shared/adapters.ts` | onion § known deviations | Match existing pattern, do not move |

## Steps
Shared contract (fixed by S1; every later step relies on it):
- `ContextDocEntry` + `overrides_repo` (local entry with a repo doc at the same path), `overridden` (repo entry with a local doc at the same path), `repo_changed` (local entry, origin recorded and ≠ current repo version) — all `z.boolean().optional()` in S1 (consumers treat `undefined` as `false`; S3/S4 always emit them), required from S13. `shadowed` stays `optional` (deprecated, no longer emitted from S3 on; removed in S13).
- `LocalDocWriteBody` + `override_repo?: true`, `origin_version?: /^[0-9a-f]{64}$/`; `superRefine`: both or neither; neither together with `base_version`.
- `KeepCopyBody = { path: ContextDocPath }`; route `POST /repos/:id/context-docs/local/keep-copy` → `{ ok: true }`. Revert reuses `DELETE …/local?path`.
- `RunTrace.context.docs[]` + `overrides_repo?: boolean` (omitted when false; old traces parse unchanged).
- Port (`adapters/context-docs/types.ts`): `LocalDocWrite.override?: { originVersion: string }`; `readEffective(scope, path): Promise<ContextDocContent & { overrides_repo: boolean }>`; `keepOrigin(scope, path): Promise<void>`; `read(scope, path, undefined)` = effective, **local first**, repo only on local `not_found`.

### S1 Shared contract (both copies)
- Module / layer: ring 2 contracts
- Files: modify `server/src/vendor/shared/contracts/context-docs.ts` (entry fields :47-59, `LocalDocWriteBody` :109-116, add `KeepCopyBody`), `server/src/vendor/shared/contracts/trace.ts` (:103-115); modify the same two files under `client/src/vendor/shared/contracts/` (byte-identical copies; `diff` first to confirm they were identical)
- Skills to apply: zod, onion-architecture § zod-contracts
- Depends on: —
- Tests (single-agent): T-8
- Done when: both copies identical; server and client typecheck pass (all new fields optional, D-6)
- Verify: `cd server && pnpm typecheck` · `cd client && pnpm typecheck`

### S2 Port types and origin store
- Module / layer: adapters/context-docs (ring 4b)
- Files: modify `server/src/adapters/context-docs/types.ts` (port per "Shared contract"; update the :107 comment to "local first"); create `server/src/adapters/context-docs/origin-store.ts` (`ORIGINS_FILE='.origins.json'`; class with `get(repoId)` → map, malformed/missing → `{}`, values validated against the hex regexp; `update(repoId, mutate)` serialised per repo by a promise chain, writes only if `mutate` reports a change, via `resolveInside(root, ORIGINS_FILE)` + tmp file + `rename`, mode 0600, `mkdir` root first); modify `server/src/adapters/context-docs/index.ts` (export)
- Skills to apply: onion-architecture § ports-di, security (file writes)
- Depends on: S1
- Tests (single-agent): T-3, T-5 (origin file behaviour)
- Done when: store compiles in isolation; write failures surface as `ContextDocError('io_error')` for callers that need it
- Verify: `cd server && pnpm typecheck` (S3/S4 implement the new port methods; in single-agent mode the typecheck is expected to pass after S4 — S2 may add the methods as required and S3/S4 follow immediately)

### S3 FsContextDocStore: precedence, marks, override write, keep, cleanup
- Module / layer: adapters/context-docs
- Files: modify `server/src/adapters/context-docs/fs-store.ts`; update existing `server/test/context-docs-local.test.ts` (:101, precedence block :206-241) and `server/test/context-docs-reader.test.ts` (:82) for the new entry fields and flipped precedence
- Skills to apply: onion-architecture, security
- Depends on: S2
- Tests (single-agent): T-1…T-6
- Details (user decisions in brackets):
  1. **Effective read** (:222-251): local first via `readFrom(localRoot)`; fall back to the repository **only** on `ContextDocError.code==='not_found'` from the local side (a missing overlay root also yields `not_found`, path-guard.ts:49-53). `too_large`, `not_utf8`, `unsafe`, `io_error` propagate, never fall back [AC-18]. If the repo is not cloned and local is `not_found` → `not_cloned` as today. Implement as `readEffective` (adds `overrides_repo = local served && repoRoot && repoHas(path)`); `read(..., undefined)` delegates. When it serves a local doc that overrides a repo doc and has no origin → record origin = current repo version (best-effort, D-3). Explicit `source` branches unchanged.
  2. **List** (:161-203): drop the `shadowed` derivation (:167-171); compute `overrides_repo` / `overridden` from the two path sets of the **full** (pre-truncation) walks, only when `repoRoot` exists [AC-2, EC-14]. For each override pair compute the repo version with a streamed sha256 (`createReadStream`, any size, concurrency `READ_CONCURRENCY`); missing origin → record it in one batched `update` (no badge) [AC-28]; `repo_changed = origin !== version`. Orphans (local entry, clone exists, `repoHas` false) → delete their origin in the same batch [D-4, AC-24]. All origin I/O best-effort inside `list` (a failure leaves `repo_changed:false`). Do not emit `shadowed`.
  3. **Create with intent** (:279-283): when `baseVersion===undefined` and `input.override` is set, keep the local-collision check (`conflict`, EC-7), skip the repo-collision check; if the repo has the path, record `origin = input.override.originVersion` **before** the rename and roll the entry back if the write fails; if it does not (clone missing/doc gone) create a plain local doc, no origin [Q-2]. Without intent the existing 422 `conflict` stays for every caller (PUT, upload, `createLocalFolder` :338-359) [AC-7]. Update path (`baseVersion` given) never touches origins [AC-29]; no content comparison with the repo anywhere [AC-30]. Never write into `repoRoot` [AC-6, NFR-1].
  4. **`keepOrigin(scope, path)`**: validate path (`assertSafeRelative`, glob); no local doc → `not_found`; no clone → `not_cloned`; no repo doc → `not_found`; else origin := current repo version (server-computed, Q-1); copy text untouched [AC-22]. Write failure → `io_error`.
  5. **`deleteLocal`** (:361-371): after `unlink`, delete the origin entry (best-effort) [AC-14]. `walk` skips `ORIGINS_FILE` at the local root explicitly; `countLocal` (:388) therefore ignores it; `removeRepoLocal` (:392) already removes the whole folder including it [EC-15].
  6. Sync (AC-10) needs no code: the store never writes the repo side.
- Done when: unit suites below green; nothing outside `<contextDir>/<repoId>/` is written
- Verify: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' test/context-docs-local.test.ts test/context-docs-reader.test.ts test/context-docs-perf.test.ts`

### S4 MockContextDocStore parity
- Module / layer: adapters/mocks
- Files: modify `server/src/adapters/mocks.ts` (:384-529): local-first read, `readEffective`, marks in `list` (`overrides_repo`, `overridden`, `repo_changed` from an in-memory origin map), create-with-intent, `keepOrigin`, origin dropped on delete; stop emitting `shadowed`
- Skills to apply: onion-architecture § ports-di
- Depends on: S2
- Tests (single-agent): T-7
- Done when: `ForbiddenStore extends MockContextDocStore` (context-docs-glob.test.ts:316) still compiles
- Verify: `cd server && pnpm typecheck`

### S5 Service and route
- Module / layer: modules/context-docs (ring 3 + 5)
- Files: modify `server/src/modules/context-docs/service.ts` (`writeLocal` :116-130 passes `override: body.override_repo ? { originVersion: body.origin_version! } : undefined`; add `keepCopy(workspaceId, repoId, path)` → `mapStoreErrors(store.keepOrigin)`; `upload` :133-151 unchanged → still 422 per file); modify `server/src/modules/context-docs/routes.ts` (new `POST ${base}/local/keep-copy`, header comment :25-34); update existing `server/test/context-docs.it.test.ts` (:184, :296, :351-364 shadowed→override, :366 delete)
- Skills to apply: onion-architecture, fastify-best-practices
- Depends on: S1, S2 (S3, S4 for the tests)
- Tests (single-agent): T-7, T-10
- Done when: route validated by schema only; errors map through existing `toAppError` (`not_found` 404, `not_cloned` 409, `conflict` 422)
- Verify: `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' test/context-docs-service.test.ts test/routes-smoke.test.ts` · DB-backed (Docker): `cd server && pnpm exec vitest run context-docs.it.test`

### S6 Run executor and trace indicator
- Module / layer: modules/reviews (application)
- Files: modify `server/src/modules/reviews/context-docs.ts` (`ReadContextDoc`/`InjectedContextDoc` + `overridesRepo?: boolean`, propagate in `resolveContextDocs` :84, `toTraceContext` :115-122 emits `overrides_repo: true` only when set); modify `server/src/modules/reviews/run-executor.ts` (:476-482 call `contextDocs.readEffective(scope, path)`, pass `overridesRepo: doc.overrides_repo`); update existing `server/test/reviews-context-docs.it.test.ts` (:458 "repository document wins (AC-65)" → local wins) and `server/test/reviews-context-docs.test.ts` if it pins the trace shape
- Skills to apply: onion-architecture
- Depends on: S2, S3 (S4 for mocks)
- Tests (single-agent): T-9, T-11
- Done when: an unreadable copy yields `skipped` with the existing reason words and no repo text; trace `context.docs` of a plain doc has no `overrides_repo` key
- Verify: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' test/reviews-context-docs.test.ts` · DB-backed: `cd server && pnpm exec vitest run reviews-context-docs.it.test`

### S7 Client data layer and fixtures
- Module / layer: client data (`src/lib/hooks`), test fixtures
- Files: modify `client/src/lib/hooks/context-docs.ts` (add `useKeepLocalCopy(repoId)` → `POST …/local/keep-copy {path}` + `invalidateDocs`; add `fetchContextDocContent(qc, repoId, path, source)` using `qc.fetchQuery` with `staleTime: 0`, same query key as `useContextDocContent`, for a fresh prefill); modify `client/src/test/context-docs-fixtures.ts` (entry defaults `overrides_repo/overridden/repo_changed: false`; keep `shadowed` out)
- Skills to apply: frontend-ui-architecture § data layer, react-best-practices
- Depends on: S1
- Tests (single-agent): — (covered by T-15)
- Done when: client typecheck passes
- Verify: `cd client && pnpm typecheck`

### S8 Context-tab picker rows
- Module / layer: `client/src/components/context-doc-picker`
- Files: modify `context-doc-rows.ts` (:42-71 `known` filters `!d.overridden` instead of `!d.shadowed`; `DocRow.overridesRepo`; fix the :43 comment), `ContextDocRow.tsx` (:120 add text badge "Overrides repo" with `title`, next to "Local"), `client/messages/en/contextDocs.json` (`picker.overridesRepo`, `picker.overridesRepoTitle`); update existing `context-doc-rows.test.ts` (:84) and `ContextDocPicker.test.tsx` (:146). `ContextDocPicker.tsx:312` needs no change (preview source `local` for the copy). Budget code is path/tokens based and counts the copy automatically [AC-16].
- Skills to apply: frontend-ui-architecture, react-best-practices
- Depends on: S1, S7
- Tests (single-agent): T-12, T-13
- Done when: one row per overridden path with the copy's tokens, "Too large" and both badges
- Verify: `cd client && pnpm test -- context-doc-picker` · `cd client && pnpm typecheck`

### S9 Run trace drawer labels
- Module / layer: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer`
- Files: modify `_components/TraceBody/TraceBody.tsx` (:51), `_components/ContextDocsSummary/ContextDocsSummary.tsx` (:23): when `d.source==='local' && d.overrides_repo` show `t("trace.config.localOverride")` ("Local · overrides repository") instead of "Local"; modify `client/messages/en/runs.json` (:34-42 add `localOverride`)
- Skills to apply: frontend-ui-architecture
- Depends on: S1
- Tests (single-agent): T-18
- Done when: old traces (no field) render exactly as before
- Verify: `cd client && pnpm test -- RunTraceDrawer` · `cd client && pnpm typecheck`

### S10 Page model, tree badges, messages
- Module / layer: `ProjectContextView` (pure model + presentational)
- Files (under `client/src/app/repos/[repoId]/context/_components/ProjectContextView/`): modify `doc-groups.ts` (`resolveSelection` :33-47: with `source` `repo`|`local` → exact match on path+source, else fall back to the effective doc; without source → the entry with that path that is **not** `overridden` (the copy), else any [AC-13]); `constants.ts` (SOURCE_PARAM comment: set to `repo` only for an overridden repo row); `_components/DocTree/DocTree.tsx` (:101-112 replace the "Shadowed" badge with text badges: "Overrides repo" on `overrides_repo`, "Repository changed" on `repo_changed`, "Overridden" on `overridden`, each wrapped with a `title`; keep "Local"/"Too large" [AC-11, AC-21, AC-24: a plain local has "Local" only]); `client/messages/en/projectContext.json` — owner of **all** new keys for S10–S12: `tree.overridesRepo|overridden|repoChanged` (+ `…Title`), `viewer.editCopy|editCopyHint|editCopyTooLarge|editCopyNotUtf8|overriddenHint|openLocalCopy|notUsedOverridden|keepCopy|revert|repoChanged`, `copyNotice.*`, `revert.*` (title, body "edits discarded", attached-intro "will use the repository document again", none-attached, confirm, failed), `live.copyCreated|keptCopy|reverted`, `editor.copyDraftLabel`; remove `tree.shadowed*` (:29-30) and `viewer.editUnavailable` (:38) once S12 no longer uses it (S12 owns that removal if S10 runs first). Keys containing a path take `{path}` so accessible names include it [AC-15].
- Skills to apply: frontend-ui-architecture § constants-and-config, react-best-practices
- Depends on: S1, S7
- Tests (single-agent): T-14, T-16
- Done when: model and tree compile; `ProjectContextView.tsx` still references `shadowed` in `urlFor` only until S12 (contract keeps it optional)
- Verify: `cd client && pnpm test -- doc-groups` · `cd client && pnpm typecheck`

### S11 Copy-flow components and editor
- Module / layer: `ProjectContextView/_components` (new folders, colocated tests)
- Files: create `_components/AttachedBy/{AttachedBy.tsx,index.ts}` (presentational: agents/skills name lists from `ContextDocUsage`, text only; used by the notice and the revert dialog — promoting it out of `DeleteDocDialog` is I1, optional); create `_components/CopyDraftNotice/{CopyDraftNotice.tsx,index.ts}` (uses `useContextDocUsage`; names attaching agents/skills and says they use the copy from their next run, or says none attaches [AC-25]); create `_components/RevertCopyDialog/{RevertCopyDialog.tsx,index.ts}` (wraps `@/components/confirm-dialog` `ConfirmDialog`, `useContextDocUsage` + `useDeleteLocalDoc`; body: copy's edits are discarded + attached-by list "will use the repository document again" [AC-14]; calls `onReverted`/`onClose`); modify `_components/DocEditor/DocEditor.tsx` (new optional props `initialText?: string`, `override?: { originVersion: string }`, `notice?: React.ReactNode`; when `override` is set the create body carries `override_repo: true, origin_version`; dirty = text ≠ `initialText`; aria-label uses `editor.copyDraftLabel`; update `DocEditor.test.tsx` only where props change)
- Skills to apply: frontend-ui-architecture § component-splitting, react-best-practices, react-testing-library
- Depends on: S7, S10
- Tests (single-agent): T-17 (+ T-15 parts)
- Done when: components render in isolation; create request body is exactly `{folder,name,content,override_repo:true,origin_version}` for a copy draft
- Verify: `cd client && pnpm test -- DocEditor RevertCopyDialog CopyDraftNotice` · `cd client && pnpm typecheck`

### S12 DocViewer and page wiring
- Module / layer: `ProjectContextView`
- Files: modify `_components/DocViewer/DocViewer.tsx` (:40-129); create `_components/DocViewer/doc-kind.ts` (pure: `docKind(doc)` → `repo | overridden | copy | local` from the entry flags); create `_components/DocViewer/_components/EditCopyButton.tsx` (button "Edit a copy" with `aria-label` containing the path, `aria-describedby` hint "stored in DevDigest only; the repository is not changed"; on click `fetchContextDocContent(qc, repoId, path, 'repo')` then `onEditCopy({ initialText, originVersion: version })` — no dialog [AC-4, AC-5, EC-18]; disabled with described reason "Too large" when `doc.too_large`, "Not valid UTF-8" when a repo content query fails with `details.reason==='not_utf8'` [AC-8]); create `_components/DocViewer/_components/CopyStatus.tsx` ("Repository changed" text badge + "Keep my copy" button, name includes path, `useKeepLocalCopy` [AC-21, AC-22]); modify `ProjectContextView.tsx` (`urlFor` :64-73 → `source=repo` only for an `overridden` row, else delete param [AC-13]; draft state :50 widened to carry `copy?: { initialText; originVersion }` and render `DocEditor` with `override`, `initialText`, `notice={<CopyDraftNotice/>}` for it [AC-5, AC-25]; `draftSaved` :93-100 announces `live.copyCreated` for a copy and selects the copy by path without source; add `reverting` state + `RevertCopyDialog` + `live.reverted`; `onKeepCopy` → `live.keptCopy`; `onOpenCopy` → `select(copyEntry)` through `guard` [AC-27]); remove the now-unused `viewer.editUnavailable` and `tree.shadowed*` keys if S10 left them; update existing `ProjectContextView.test.tsx` (:58, :120-137, :424-441 now stale)
- Behaviour per kind: **repo** (not overridden): Preview + "Edit a copy" in place of the Edit toggle, usage + Coverage; **overridden**: Preview, Edit toggle disabled and described by "a local copy overrides this document", "Open local copy" link-button (name includes path), header text "Not used — overridden by a local copy" instead of usage/ring, no Delete/Revert [AC-12, AC-26]; **copy** (`overrides_repo`): Edit works as for local docs, "Revert to repository version" replaces Delete [AC-20], `CopyStatus` when `repo_changed`, usage + ring; **local** (incl. orphan): as today with Delete [AC-24].
- Skills to apply: frontend-ui-architecture, react-best-practices, next-best-practices (client boundary unchanged), react-testing-library
- Depends on: S7, S10, S11
- Tests (single-agent): T-15
- Done when: all UI behaviours above hold with the fixtures; no literal user-facing strings
- Verify: `cd client && pnpm test` · `cd client && pnpm typecheck`

### S13 Tighten the contract: required marks, remove `shadowed`
- Module / layer: contracts + consumers
- Files: modify both copies of `contracts/context-docs.ts` (make `overrides_repo`, `overridden`, `repo_changed` required; delete `shadowed`), `server/src/adapters/context-docs/fs-store.ts` and `server/src/adapters/mocks.ts` (remove leftovers), any remaining literal found by `rg -n "shadowed" server client --glob '!**/clones/**' --glob '!**/node_modules/**'`
- Skills to apply: onion-architecture § checklist 7
- Depends on: S3–S12 (all consumers migrated)
- Tests (single-agent): —
- Done when: `rg` finds no `shadowed` in code; both vendor copies identical (`diff -r server/src/vendor/shared client/src/vendor/shared`)
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `cd client && pnpm typecheck && pnpm test` · `cd reviewer-core && npm test` · `cd mcp && npm run typecheck`

### I1 Reuse `AttachedBy` in `DeleteDocDialog` (optional, S)
- Replaces the duplicated agents/skills list (DeleteDocDialog.tsx:47-81) with `AttachedBy` — a third consumer justifies the promotion; keep its tests green. Files: `_components/DeleteDocDialog/DeleteDocDialog.tsx`. Depends on S11. Verify: `cd client && pnpm test -- DeleteDocDialog`.

### I2 Reuse the hash computed for tokens in `list` (optional, S, only if T-6 margin is thin)
- `tokensFor` (fs-store.ts:144-159) already hashes the bytes of every readable repo file; return `{tokens, version}` and use it for override pairs instead of a second read (large files still stream). Files: `fs-store.ts`. Depends on S3. Verify: T-6.

## Execution modes
Single-agent: one implementer runs S1 → S13 in order (I1/I2 on request), writing T-n inside the steps that list them; per-step verification as listed.

Multi-agent (≤3 instances per wave, files disjoint, contract copies only in S1/S13):
| Wave | Instance | Steps | Owned files / area |
|---|---|---|---|
| 1 | implementer #1 | S1, S7 | both vendor contract copies (4 files), `client/src/lib/hooks/context-docs.ts`, `client/src/test/context-docs-fixtures.ts` |
| 2 | implementer #2 (server adapter) | S2, S3, S4 | `server/src/adapters/context-docs/*`, `adapters/mocks.ts`, existing `context-docs-local.test.ts`, `context-docs-reader.test.ts` (≈9 files, one new module) |
| 2 | implementer #3 (client page A) | S10, S11 | `ProjectContextView` model/tree, `projectContext.json`, new `AttachedBy`, `CopyDraftNotice`, `RevertCopyDialog`, `DocEditor` (≈12 files) |
| 2 | implementer #4 (client picker + trace) | S8, S9 | `components/context-doc-picker/*`, `contextDocs.json`, `RunTraceDrawer` two files + `runs.json`, their existing tests (≈9 files) |
| 3 | implementer #5 (server app) | S5, S6 | `modules/context-docs/{service,routes}.ts`, `modules/reviews/{context-docs,run-executor}.ts`, existing `context-docs.it.test.ts`, `reviews-context-docs*.test.ts` |
| 3 | implementer #6 (client page B) | S12 | `DocViewer` + new `doc-kind.ts`, `EditCopyButton`, `CopyStatus`, `ProjectContextView.tsx`, `projectContext.json` (key removal only), `ProjectContextView.test.tsx` |
| 4 | implementer #1 | S13 | contract copies, `fs-store.ts`, `mocks.ts`, fixtures, leftovers |
| 5 | test-writer ×3 (server-unit, server-integration, client) | T-1…T-18 | `server/test/*.test.ts`; `server/test/*.it.test.ts`; `client/**/*.test.ts(x)` |
Waves 2 and 3 each run server ∥ client (different packages, no shared verification state). Wave 2 has the server port methods land before wave 3; S2 adds the new port methods as required members, so the server typecheck is green again once S4 (same instance) finishes. `projectContext.json` is owned by wave 2 (#3) and, for key removal only, by wave 3 (#6) — different waves, never concurrent. Wave 5 writers are disjoint by directory/suffix.
Recommended: multi-agent — server and client are independent once S1 fixes the contract, and the test-writers give a second look at the DB-backed tests that cannot be run here. Single-agent is viable (≈40 files) but sequential.

## Cross-module contracts & sync points
- `ContextDocEntry` marks, `LocalDocWriteBody` intent, `KeepCopyBody`, trace `overrides_repo` — canonical `server/src/vendor/shared/contracts/{context-docs,trace}.ts`, copy `client/src/vendor/shared/contracts/…` (S1, S13). `mcp` aliases shared but uses none of these.
- Precedence rule exists in several places that must flip together: store read (fs-store.ts:235-250), store list (:167-171), `MockContextDocStore` (mocks.ts:433-453), client `buildRows` filter (context-doc-rows.ts:52) and `resolveSelection` (doc-groups.ts:39-45); plus the port comment (types.ts:107).
- Origin version = `sha256(bytes)` = `ContextDocContent.version` (client sends it as `origin_version`).
- `computeUsage` (helpers.ts:80-96) is path-based and unchanged; the revert dialog and copy notice reuse `GET …/usage`.

## Test plan
Existing suites to run: server `pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit); server `pnpm exec vitest run .it.test` (needs Docker — unavailable in this sandbox); client `pnpm test`; `reviewer-core` `npm test` and `mcp` `npm test` as regression (shared contract aliasing).
Existing tests updated in the step that breaks them: `context-docs-local.test.ts` (:101, :206-241), `context-docs-reader.test.ts` (:82), `context-docs.it.test.ts` (:184, :296, :351-364), `reviews-context-docs.it.test.ts` (:458), `context-doc-rows.test.ts` (:84), `ContextDocPicker.test.tsx` (:146), `ProjectContextView.test.tsx` (:58, :120-137, :424-441).

| T | Level · DB? | Behaviour (requirement / edge) | File | Owner single · multi |
|---|---|---|---|---|
| T-1 | unit (Fs store, temp dirs) · no | local wins on read; marks derived each list; pre-existing "Shadowed" local becomes override; sync-added repo file (AC-1, 2, 19; EC-1, 11, 12) | `server/test/context-docs-local.test.ts` | S3 · test-writer |
| T-2 | unit · no | create with intent writes only overlay, clone tree identical, origin = sent version; no intent / second create → `conflict`; identical text OK; update keeps origin (AC-6, 7, 23, 29, 30, 9; NFR-1; EC-7, 13) | `server/test/context-docs-local.test.ts` | S3 · test-writer |
| T-3 | unit · no | `repo_changed` after repo edit; origin recorded at first observation (list and read); `keepOrigin`; copy unchanged after repo change/delete; orphan plain + origin dropped + re-add records fresh (AC-10, 21, 22, 24, 28; EC-2, 9, 18, 19) | `server/test/context-docs-override.test.ts` (new) | S3 · test-writer |
| T-4 | unit · no | effective read: local `not_utf8` / `too_large` / symlink does not fall back; local `not_found` falls back; no clone keeps local effective (AC-18; EC-10, 14) | `server/test/context-docs-override.test.ts` | S3 · test-writer |
| T-5 | unit · no | `deleteLocal` removes origin; `.origins.json` hidden from list/`countLocal`; `removeRepoLocal` removes it; folder/upload collisions still 422 (AC-14; EC-6, 15; NFR-1) | `server/test/context-docs-override.test.ts` | S3 · test-writer |
| T-6 | unit/perf · no | 1,000 override pairs cold list < 1 s (NFR-3) | `server/test/context-docs-perf.test.ts` | S3 · test-writer |
| T-7 | unit (service + Mock store) · no | service maps intent/origin and `keepCopy`; Mock store parity (AC-2, 7, 22) | `server/test/context-docs-service.test.ts` | S5 · test-writer |
| T-8 | unit (contract) · no | `LocalDocWriteBody` refine: intent needs origin, bad hex rejected, intent + `base_version` rejected; `RunTrace` parses old trace (AC-7, 17) | `server/test/context-docs-override-contract.test.ts` (new) | S1 · test-writer |
| T-9 | unit · no | `toTraceContext` emits `overrides_repo` only when set; `resolveContextDocs` propagates it (AC-17) | `server/test/reviews-context-docs.test.ts` | S6 · test-writer |
| T-10 | integration `*.it` · **DB** | API: PUT with/without intent (200/422 naming path), upload/folder onto repo path 422, list marks, `keep-copy`, DELETE revert, attachments + agent version unchanged, no abs paths in errors (AC-2, 3, 6, 7, 14, 22; EC-6, 7) | `server/test/context-docs.it.test.ts`, `server/test/context-docs-attachments.it.test.ts` | S5 · test-writer |
| T-11 | integration `*.it` · **DB** | run: copy injected, trace `overrides_repo:true` persisted (poll trace endpoint), next run after edit/revert switches, unreadable copy skipped without repo fallback, no-clone local has no indicator (AC-1, 3, 17, 18; EC-3, 10, 14) | `server/test/reviews-context-docs.it.test.ts` | S6 · test-writer |
| T-12 | unit (client model) · no | `buildRows`: overridden repo row dropped, copy row has tokens/`overridesRepo` (AC-16) | `client/src/components/context-doc-picker/context-doc-rows.test.ts` | S8 · test-writer |
| T-13 | UI · no | picker row badges "Local" + "Overrides repo", budget counts copy, preview reads `source=local` (AC-16; NFR-2) | `client/src/components/context-doc-picker/ContextDocPicker.test.tsx` | S8 · test-writer |
| T-14 | unit (client model) · no | `resolveSelection` with/without `source` for overridden path (AC-13) | `…/ProjectContextView/doc-groups.test.ts` (new) | S10 · test-writer |
| T-15 | UI · no | page flows: Edit a copy (AC-4, 5, 8), notice (AC-25), first-save body + live region (AC-6/23 client side, 15), overridden row (AC-12, 26, 27), URL (AC-13), copy states: Keep (AC-21, 22), Revert (AC-20, 14), orphan (AC-24), keyboard/names (NFR-2); EC-18, 20 | `…/ProjectContextView/ProjectContextView.test.tsx`, `…/DocViewer/DocViewer.test.tsx` (new) | S12 · test-writer |
| T-16 | UI · no | tree rows and badges incl. tooltips, plain local shows "Local" only (AC-11, 21, 24; NFR-2) | `…/ProjectContextView/ProjectContextView.test.tsx` | S10 · test-writer |
| T-17 | UI · no | `RevertCopyDialog` (confirm → DELETE, cancel → nothing, names attachers), `CopyDraftNotice` both texts, `DocEditor` copy draft body (AC-14, 23, 25, 5) | `…/RevertCopyDialog/RevertCopyDialog.test.tsx`, `…/CopyDraftNotice/CopyDraftNotice.test.tsx`, `…/DocEditor/DocEditor.test.tsx` | S11 · test-writer |
| T-18 | UI · no | trace drawer label "Local · overrides repository" in Specs read and summary; old trace unchanged (AC-17) | `…/RunTraceDrawer/_components/TraceBody/TraceBody.test.tsx`, `…/RunTraceDrawer.test.tsx` | S9 · test-writer |

DB-backed (need Docker; cannot run here, writer must still author them): **T-10, T-11** only. Edge-case map: EC-1→T-1; EC-2→T-3; EC-3→T-11; EC-4/5→T-15; EC-6→T-5,T-10; EC-7→T-2,T-10; EC-8→T-15 (existing guard); EC-9→T-3; EC-10→T-4,T-11; EC-11/12→T-1; EC-13→T-2; EC-14→T-4,T-11; EC-15→T-5; EC-17→SPEC-01 tests unchanged; EC-18→T-3,T-15; EC-19→T-3; EC-20→T-15.
Not tested: EC-16 (known limitation, no behaviour); end-to-end browser flow — e2e suite covers only main journeys (TESTING.md), use the hands-on hints in Traceability.

## Docs that become false (hand to doc-writer; `docs/project-context.md`)
- :9 requirements link (add SPEC-02) and :20 "(`repo` or `local`)" — trace also carries the override indicator.
- :108-111 overlay diagram — add the origin sidecar `.origins.json`; :125-128 **"The repository wins on a path clash… Shadowed… Creating or uploading onto a path already taken by either source is rejected"** — now: local copy wins; 422 only without the explicit override intent.
- :132-134 deleting a local document — attachments "Missing unless a repository document has the same path" now also describes revert.
- :186-189 **"Source… the repository copy first, otherwise the local one"** — reversed. :244 trace `context.docs` shape gains `overrides_repo`.
- :259-269 API table: list marks (`overrides_repo`, `overridden`, `repo_changed`), `PUT …/local` override intent + `origin_version`, new `POST …/local/keep-copy`.
- :298-299 **"Shadowed local documents are not shown"** — now an override copy is the single row. :330-331 left-panel badges (replace "Shadowed"). :336-337 **"shadowed local document is addressed with `source=local`"** — now the overridden repo row uses `source=repo`. :338-342 **"Editing is possible for local documents only… Edit toggle disabled for repository documents"** — "Edit a copy". :350-351 Delete vs "Revert to repository version". :358-360 trace drawer label "Local · overrides repository".

## Risks & open questions
- [non-blocking] Q-1 — Keep-my-copy request body (see Review). Suggested default: server computes, request carries only `path`.
- [non-blocking] Q-2 — override intent when the repository document is gone. Suggested default: create a plain local document, no origin.
- [non-blocking] Perf: a second read per override pair could be tight under NFR-3 — mitigation I2; T-6 decides.
- [non-blocking] Origin sidecar is a per-repo read-modify-write file; serialised in-process (single API instance assumption, server/AGENTS.md "Gotchas"); a corrupt file is treated as empty and self-heals through AC-28.
- [non-blocking] `list()` now writes (origins) on a GET — bounded to the overlay (NFR-1), best-effort, documented in the route header.

## Self-check
1 pass · 2 pass · 3 fixed: S1 verify no longer depends on later steps (new marks optional until S13, D-6) · 4 pass · 5 pass · 6 pass · 7 pass · 8 pass (no blocking R-n or blocking question; Status ready) · 9 pass · 10 pass (only `specs/context-doc-local-override/plan.md` written; the caller asks Q-1, Q-2 and Q-mode)

## Out of scope for the implementer
Architecture and security review are done by separate agents; documentation is written by doc-writer (list above). Requirements are fixed by the spec; a needed change goes back to the user, not into the code.

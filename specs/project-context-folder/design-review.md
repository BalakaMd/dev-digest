# Design review: Project Context Folder (SPEC-01)
Sources: designs/project-context-page.png, designs/agent-context-tab.png,
designs/skill-context-section.png, designs/run-trace.png · Current code read:
server/src/modules/reviews/run-executor.ts:192-229, :273-306, :433-455, :462-486 ·
reviewer-core/src/prompt.ts:16-34, :91-92, :147-150, :172, :191 ·
reviewer-core/src/review/run.ts:26, :61, :147 · server/src/platform/trace-builder.ts:33, :52, :61 ·
server/src/vendor/shared/contracts/trace.ts:39-62, :101 ·
server/src/vendor/shared/contracts/knowledge.ts:122-133, :311-359 ·
server/src/vendor/shared/contracts/findings.ts:52-70 · server/src/db/schema/agents.ts:8-68 ·
server/src/db/schema/skills.ts:16-47 · server/src/db/schema/repos.ts:5-25 ·
server/src/db/schema/context.ts:31-47 · server/src/adapters/git/simple-git.ts:37-39, :72-88, :129-131 ·
server/src/platform/config.ts:15-42 · server/src/modules/repo-intel/service.ts:818-819 ·
server/src/modules/agents/routes.ts:19-31, :59-68 · server/src/modules/skills/routes.ts:11-26 ·
server/specs/review-flow.md:40-48, :50-87 · client/specs/pages.md:105-164 ·
client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx:14-27 ·
client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.tsx:44-51 ·
client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:40-52, :86-88 ·
client/src/lib/repo-context.tsx:14-58 · mcp/src/format/agents.ts:1-54

## What exists today
- The engine already has the slot: `PromptParts.specs` (reviewer-core/src/prompt.ts:91-92) is wrapped
  per item as `<untrusted source="spec-<i>">` (:147-150) and rendered as `## Project context` (:172);
  `PromptAssembly.specs` carries it to the trace (:191). The server never passes `specs`
  (run-executor.ts:201-229), so the section is always omitted.
- The trace contract already has `specs_read: string[]` (trace.ts:101) and the drawer already renders
  "Specs read" (TraceBody.tsx:40-52) and a Project-context prompt block (:86-88). The executor writes
  `specs_read: []` on success (run-executor.ts:302) and on failure (:483).
- Agents and skills are **workspace-scoped**, not repository-scoped (agents.ts:10-12, skills.ts:20-22);
  a workspace has many repositories (repos.ts:9-12). The sidebar keeps an "active repo"
  (repo-context.tsx:14, :49), but `/agents/[id]` and `/skills/[id]` are not under `/repos/[repoId]`.
- The working copy is a read-only mirror of the **default branch**, reset `--hard` on sync
  (simple-git.ts:77-88); a PR head is fetched only as a ref `pr-<n>` (:72-75), never checked out.
  Anything written into the working copy is lost on the next sync.
- Search roots: no existing configuration. Server configuration is env-based (config.ts:15-42).
- Agent versions snapshot the ordered skill ids (knowledge.ts:350-359); skill versions snapshot only
  the body (pages.md:115-119).
- The wrapper label is interpolated unescaped: `<untrusted source="${label}">` (prompt.ts:33). Today
  labels are constants; with a path as label a `"` or `>` in a file name could break the delimiter
  (→ AC-28).
- The existing reads from the clone use `join(clonePath, file)` with no containment check
  (repo-intel/service.ts:818-819, simple-git.ts:129-131) — not reusable as-is for user-supplied paths
  (→ AC-3, AC-4).
- The Finding contract has no reference field (findings.ts:52-70) → AC-48.
- `code_chunks.source` already allows `'docs' | 'spec'` (context.ts:44) and the table is empty — a
  possible home for a document index if Q-14 asks for one.

## States coverage
| Screen / flow | State | In design? | Spec reference |
|---|---|---|---|
| Agent Context tab | populated, some attached | yes | AC-11, AC-12 |
| Agent Context tab | loading | no | AC-18 |
| Agent Context tab | error loading | no | AC-18 |
| Agent Context tab | no documents found | no | AC-19 |
| Agent Context tab | repository not cloned | no | AC-20 |
| Agent Context tab | workspace has no repository | no | AC-44 |
| Agent Context tab | filter active, no match | no | AC-15 |
| Agent Context tab | attached doc missing from active repo | no | AC-45 |
| Agent Context tab | inherited from skills | no | AC-46 |
| Agent Context tab | save failed | no | AC-21 |
| Agent Context tab | over token budget | no | AC-17, AC-47 |
| Agent Context tab | document over 64 KB | no | AC-6, Q-19 |
| Agent Context tab | more than 1,000 documents | no | AC-42 |
| Agent Context tab | preview open | button only, no preview surface | AC-16 |
| Skill Context tab | populated, 1 attached | yes | AC-23 |
| Skill Context tab | other states | no | AC-23 |
| Skill Context tab | "SERIALIZES AS" box | yes, heading conflicts | Q-11 |
| Run trace | specs read listed | yes (paths only) | AC-37, AC-40 |
| Run trace | per-document tokens | no (description asks for it) | AC-38, Q-10 |
| Run trace | some docs skipped | no | AC-33, AC-34, AC-39 |
| Run trace | failed / cancelled run | no | EC-17, Q-10 |
| Finding card | cited document chip | no | AC-50 |
| Project Context page | document selected, Preview | yes | AC-52, AC-53 |
| Project Context page | Edit mode, local document | toggle only | AC-66 |
| Project Context page | Edit mode, repository document | toggle only | AC-67 (disabled) |
| Project Context page | new file / folder / upload | icons only | AC-68, AC-69, AC-70, AC-56 |
| Project Context page | upload with some files rejected | no | AC-70 |
| Project Context page | local vs repository document | no | AC-52, AC-61 |
| Project Context page | path collision local / repository | no | AC-65, AC-84 |
| Project Context page | delete a local document | no | AC-86 |
| Project Context page | stale save from another tab | no | AC-85 |
| Project Context page | Sync with GitHub (running / failed) | no | AC-82, AC-83 |
| Project Context page | coverage ring | yes | AC-71 |
| Project Context page | coverage with no enabled agent | no | AC-71 |
| Project Context page | "Used by N agents" | yes | AC-72 |
| Project Context page | footer | yes ("chunks" dropped) | AC-54, NG-7 |
| Project Context page | refresh | icon only | AC-57 |
| Project Context page | no document selected / deep link | no | AC-73 |
| Project Context page | loading / error / empty / not cloned | no | AC-58 |
| Project Context page | unsaved edits on navigation | no | AC-74 |

## Gaps in the designs
- Repository scope of attachments (agents/skills workspace-wide, docs per repo) → resolved Q-1 →
  AC-9, AC-44, AC-45
- Revision read by a run → resolved Q-2 → AC-43, NG-6
- Unreadable document at run time → resolved Q-3 → AC-33
- Agent vs skill order and de-duplication → resolved Q-4 → AC-27; inherited rows → AC-46 (P-4)
- Size / token limits → resolved Q-5 → AC-6, AC-26, AC-34, AC-42, AC-47
- Search root configuration → resolved Q-6 → AC-2; invalid value → Q-20
- Glob depth and `.devdigest/specs/` → resolved Q-8 → AC-1; nested type → Q-21
- Standalone page in scope → resolved Q-7 → AC-51 to AC-59; undefined elements → Q-13 to Q-17
- "Coverage 78" ring has no definition; it sits next to "Used by 3 agents" on a single document, so
  it is per document → resolved Q-13 → AC-71
- "Indexed: 12 files · 1,240 chunks": no index exists for documents → resolved Q-14 → AC-54, NG-7
- Edit / New file / New folder / Upload: the only local copy is a default-branch mirror reset on sync
  → resolved Q-15 (local overlay) → AC-55, AC-60 to AC-70
- "Used by N agents" → resolved Q-16 → AC-72
- Overlay scope (per repository vs per workspace) — Q-1 makes attachments repo-agnostic, so the scope
  decides which local documents a run in another repository sees → Q-22
- Overlay vs repository on the same path, and Edit on a repository document → Q-23
- The design has no way to delete a local document → P-9
- Repository removal while it has local documents → Q-25
- Two tabs saving the same local document → Q-26
- The page design shows a single root header `.devdigest/specs/`, while the reader matches three
  folder names at any depth → AC-52 groups documents under their folder
- Refresh icon semantics (re-list vs git sync) → Q-17
- Skill tab "SERIALIZES AS `## Project specifications`" vs prompt `## Project context` → Q-11
- Trace design shows paths only; the description asks for per-document token volume → Q-10
- Preview surface not designed on the tabs → AC-16
- Versioning of attachment changes → Q-9
- Relationship to the per-agent `repo_intel` toggle → Q-12

## Edge cases not covered
- Repository not cloned (reviews are allowed before the clone, review-flow.md:47-48) → EC-1
- Empty search result → EC-2
- Renamed / deleted attached document, or absent from another repository → EC-3
- Symlink escape → EC-4
- Path traversal in API input → EC-5
- Absolute clone path (home directory, user name) leaking → EC-6
- Oversized document / budget overflow → EC-7
- Binary or invalid UTF-8 `.md` → EC-8
- Same path in several repositories → EC-9
- PR edits an attached document → EC-10
- Concurrent attachment change during a run; failed save → EC-11
- Keyboard-only reorder (drag handles in the design are pointer-only) → EC-12
- Delimiter break-out through content or file name; instructions inside a document → EC-13
- Raw HTML / script in Preview → EC-14
- Duplicate document via agent + skill → EC-15
- Globally disabled skill with attachments → EC-16
- Trace of a failed run after documents were read → EC-17
- Vendored folders full of docs (any-depth glob also matches e.g. `vendor/x/docs/`) → EC-18
- Model cites a document that was not injected → EC-19
- Local / repository path collision (create, upload, later sync) → EC-20
- Unsaved edits on navigation → EC-21
- Repository removed with local documents (`DELETE /repos/:id`, repos/routes.ts:43) → EC-22
- Concurrent saves of one local document → EC-23

## Module interactions
| From | To | Via (external contract) | New / changed / existing | Consumers affected |
|---|---|---|---|---|
| Studio (tabs, page) | API | list a repository's context documents (path, type, folder, tokens, over-limit flag; "not cloned" state; truncation flag) | new | studio |
| Studio | API | read one document's text for preview, by repo-relative path | new | studio |
| Studio | API | get / set an agent's ordered attached paths | new (or an extension of `Agent`) | studio; MCP `list_agents` `safeParse`s `Agent` — an added optional field is harmless (mcp/src/format/agents.ts) |
| Studio | API | get / set a skill's ordered attached paths | new (or an extension of `Skill`) | studio |
| Studio (page) | API | per-document usage ("Used by N agents", coverage %) | new | studio |
| Studio (page) | API | create / edit / upload local documents, create folders | new | studio |
| API (reader) | Repository working copy | filesystem, read-only, inside the clone dir | new | — |
| API | Local documents (DevDigest data dir) | filesystem, read-write, outside every clone | new | — (persisted data the user sees) |
| Agents module | Agent versions | `AgentVersionConfig` gains the ordered attached paths | changed | agent version history; eval replays |
| Run executor | Engine (reviewer-core) | `PromptParts.specs` (resolved strings) + label per document | existing slot; label changes from `spec-<i>` to the path | engine tests (`server/test/prompt-*.test.ts` pass `specs`) |
| Engine | Run executor | `Finding` with optional cited-document paths | changed (`@devdigest/shared`, both vendored copies) | studio finding card; MCP `get_findings`; structured-output schema sent to the model |
| Run executor | Trace store | `RunTrace.specs_read`, `prompt_assembly.specs` + per-document tokens | existing fields filled; per-doc field new (Q-10) | studio trace drawer, `GET /runs/:id/trace` |
| Server configuration | API (reader) | search globs (environment) | new | operator |

Proposed shapes (not decided; for the planner): `GET /repos/:id/context-docs`,
`GET /repos/:id/context-docs/content?path=`, `GET|PUT /agents/:id/context-docs`,
`GET|PUT /skills/:id/context-docs` with body `{ paths: string[] }` (full ordered list, idempotent,
like `POST /agents/:id/skills` with `skill_ids`).

```mermaid
sequenceDiagram
    participant UI as Studio (tabs, page)
    participant API as API (agents, skills, context reader)
    participant FS as Repo working copy (default branch)
    participant RX as Run executor
    participant RC as reviewer-core
    participant LLM as LLM provider
    UI->>API: list context docs (active repo)
    API->>FS: walk globs, check containment
    API-->>UI: paths, types, tokens
    UI->>API: save ordered paths (agent or skill)
    API-->>UI: saved list
    Note over RX: POST /pulls/:id/review
    RX->>API: attached paths (agent, then enabled skills; dedup)
    RX->>FS: read each doc from the PR's repo (skip unreadable, 8k budget)
    RX->>RC: specs[] with path labels
    RC->>LLM: single prompt (no extra call)
    LLM-->>RC: review with cited paths
    RC-->>RX: review + assembly
    RX->>RX: drop citations of non-injected paths
    RX->>API: persist findings + trace (specs_read, per-doc tokens)
```

Notes for the implementation planner (internal wiring, not part of the spec):
- The engine already supports the section; changes there are limited to the label escaping
  (prompt.ts:33), the guard text (:16-28), the trusted rule (pattern of `INTENT_SCOPE_RULE`, :59-62)
  and the finding schema. reviewer-core stays I/O-free: the server resolves paths to strings.
- `reviews` must not import another module's folder (run-executor.ts:438); reach attachments and the
  reader through the container, like `agentsRepo.enabledSkillsForPrompt`.
- Containment check must resolve the real path and compare it with the clone root; the existing
  `readClone` (repo-intel/service.ts:818) does not.
- Token counts through the tokenizer adapter, as for skills (`withSkillStats`).
- A list query shown in the UI needs a total `ORDER BY` (server/INSIGHTS.md 2026-09-24).
- Reorder must be pointer-event based, not HTML5 DnD (client/INSIGHTS.md 2026-09-24); reuse the
  SkillsTab mechanics.
- A trace may be read before it is written (server/INSIGHTS.md 2026-09-24) — tests on `specs_read`
  must poll the trace endpoint.
- `@devdigest/shared` changes must be synced into `client/src/vendor/shared` (compare only the
  touched files — root INSIGHTS.md 2026-09-24).
- "Sync with GitHub" (AC-82) should reuse `POST /repos/:id/refresh` (repos/routes.ts:38-41); verify
  that it advances the working tree — for an existing clone `clone()` only runs `fetch`
  (simple-git.ts:57-60), while `sync()` resets to `origin/<branch>` (:77-88).
- Local documents live per repository in DevDigest's data directory (next to `~/.devdigest/workspace`
  and `secrets.json`); repository removal (repos/routes.ts:43) must delete them (AC-87).
- Stale-save detection (AC-85) needs a version token (content hash or mtime) returned with each read.
- The citation filter (AC-49) is a mechanical gate in the spirit of grounding
  (reviewer-core/specs/grounding.md); log every drop.

## UX improvements
- P-1 Show attached-but-missing documents as rows with a "Missing" badge and a checkbox to detach —
  cost S — status: accepted → AC-45
- P-2 Structured citation on findings, filtered to injected paths, shown as a chip — cost M —
  status: accepted → AC-48, AC-49, AC-50, AC-41
- P-3 Per-row token counts plus a budget bar with an overflow warning — cost S — status: accepted →
  AC-11, AC-17, AC-47
- P-4 Inherited documents on the agent tab, labelled "via <skill>" — cost S — status: accepted →
  AC-46
- P-5 Record the commit sha the documents were read at — cost S — status: rejected → NG-4
- P-6 Doc-type filter chips — cost S — status: rejected → NG-5
- P-7 Keep the selected document in the page URL (`?doc=<path>`), select the first document when
  none is given — cost S — status: accepted → AC-73
- P-8 Guard unsaved edits — cost S — status: accepted → AC-74
- P-9 Delete a local document (and an empty local folder) from the page, behind a confirmation that
  lists the agents and skills attaching it — cost S — status: accepted → AC-86

## Decisions log
- Round 1: draft written.
- Round 2: Q-1 → paths relative to the PR's repository; tabs list the active repository · Q-2 →
  default-branch working copy · Q-3 → skip, log and trace, run continues · Q-4 → agent first, then
  skills in link order, first occurrence wins · Q-5 → 64 KB per file, 20 attachments, 8,000-token
  budget, skip whole documents, list up to 1,000 · Q-6 → server configuration (environment) · Q-7 →
  full standalone page as designed (undefined elements → Q-13 to Q-17) · Q-8 → three folders at any
  depth, including under `.devdigest/` · P-1, P-2, P-3, P-4 accepted · P-5, P-6 rejected.
- Round 3: Q-13 → coverage = % of enabled agents receiving the document directly or via an enabled
  skill (AC-71) · Q-14 → no index, footer "N files · scanned X ago" (AC-54, NG-7) · Q-15 → Other:
  local overlay in the DevDigest data directory, outside the clone, listed with repository
  documents, survives sync, never in git (AC-55, AC-60 to AC-70, NG-8); follow-ups Q-22, Q-23,
  Q-25, Q-26 · Q-16 → enabled agents, directly or via a skill (AC-72) · Q-10 → new per-document
  entries next to `specs_read`, failed runs list documents read so far (AC-37, AC-38, AC-78) · Q-9 →
  agent version bumps, skill version does not (AC-75, AC-76) · Q-19 → "Too large" badge, checkbox
  disabled (AC-6) · Q-12 → independent of `repo_intel` (AC-77, NG-9) · P-7, P-8 accepted (AC-73,
  AC-74). Q-17, Q-18, Q-20, Q-21 reclassified as blocking: each leaves a marker in an AC or NFR
  (AC-57, NFR-2, AC-2, AC-1).
- Round 4: Q-22 → local documents per repository (AC-60, NG-10) · Q-23 → repository wins: shadowed
  local copy listed with "Shadowed", repository documents read-only, collisions rejected with 422
  (AC-65, AC-67, AC-84) · Q-17 → Other: refresh re-reads without network, "Sync with GitHub" is a
  separate action behind a confirmation using the existing repository sync (AC-57, AC-82, AC-83) ·
  Q-18 → ≤ 200 ms per run, ≤ 1 s per list (NFR-2) · Q-20 → default globs + warning (AC-80) · Q-21 →
  nearest folder (AC-79) · Q-11 → paths under `## Project context` (AC-81) · Q-25 → deleted with the
  repository, confirmation states the count (AC-87) · Q-26 → recommended default: stale save rejected
  with 409, newer content shown (AC-85) · P-9 accepted (AC-86). No open question left.
- Approval: user approved the spec; Status set to approved.

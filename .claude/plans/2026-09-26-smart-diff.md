# Development Plan: Smart Diff (role-grouped "Files changed" + inline review findings)

Created: 2026-09-26 · Branch: hw-003 · HEAD: cea5689 · Status: ready

## Goal & acceptance criteria
P1
- "Files changed" shows role groups in the fixed order core → tests → wiring → docs → boilerplate. Each group has a role label, a one-line role hint and a file count. Empty groups are hidden (Q3).
- A lock file (`pnpm-lock.yaml`, `*.lock`, …) lands in `boilerplate`. The `docs` and `boilerplate` groups start collapsed.
- Once a review exists, each group header shows a dot plus a number, placed right before "N files". The number is the count of FILES in the group that have ≥1 finding, not the count of findings.
- A file card with findings shows a dot next to its path, with no number. This is separate from the existing GitHub-comment counter (`FileCard.tsx:67-74`).
- In an expanded file, each finding is rendered under the line `RIGHT:${start_line}`, showing severity, title, rationale and Accept / Dismiss.
- A "Smart order / Original order" toggle switches back to the GitHub order.
P2
- The classifier patterns and the role order live in one server constants file. A table test covers "path → role", including the 3 contested cases.
- `GET /pulls/:id/smart-diff` returns a body that passes `SmartDiff.parse`. `SmartDiffRole` has five values in both copies of `brief.ts`.
- Viewing Smart Diff never calls an LLM. Grouping also works before the first review.
- An inline finding has a left bar in its severity colour and a severity label on the right: CRITICAL→`blocker`, WARNING→`warning`, SUGGESTION→`suggestion`. Colours and icons come from `SEV` (`client/src/vendor/ui/primitives/tokens.ts:6-14`, re-exported at `primitives/index.ts:2`). No new palette.
- Inline Accept / Dismiss call `useFindingAction()` (`client/src/lib/hooks/reviews.ts:139-161`), and the card shows the new state.
- A finding whose line is not in the patch appears in a "findings outside the diff" block at the end of the file. It is never dropped.
- The existing comments toggle hides finding comments as well as GitHub threads.
P3 (cheap; S6)
- Group headers stay sticky while scrolling.
- An inline finding collapses to one line.
- Before any review, a "review not run yet" hint replaces the counters.
- Counters and inline findings refresh after Run review without a page reload, even when the user sits on the Files tab.
- Every label comes from `client/messages/en/prReview.json` → `smartDiff`.

## Scope
In: the shared contract enum (both copies); the server classifier, grouping builder, service method and route inside the `reviews` module; generic annotation slots in the shared `client/src/components/diff-viewer`; a new client hook; the `DiffTab` feature (groups, markers, inline findings, toggles); i18n; a page-level refresh after runs; `INSIGHTS.md` entries.
Out: `pseudocode_summary`; PR split suggestions (`too_big` is always `false`, `proposed_splits: []`); a DB schema change or migration; any LLM call; editing `client/src/vendor/ui/**`; editing `FindingCard`; docs/specs updates (doc-writer not selected; see Risks); fixing known onion deviations.

## Context used
- Guidance read: `CLAUDE.md`, `server/AGENTS.md` (= `server/CLAUDE.md`), `client/AGENTS.md` (= `client/CLAUDE.md`), `TESTING.md`, `client/docs/ui-architecture.md`, `INSIGHTS.md` (root, server, client), and the precedent plan `.claude/plans/2026-09-25-intent-layer.md`.
- Lessons applied:
  - `server/INSIGHTS.md:80-88` (a list query without ORDER BY reshuffles). `getPrFiles` has no ORDER BY (`server/src/modules/reviews/repository/pull.repo.ts:28-33`), and `pr_files` has no order column (`server/src/db/schema/pulls.ts:36-45`). The builder therefore sorts files within a group by path, and the client takes "original order" from `pr.files`, not from this route.
  - `server/INSIGHTS.md:30-57` (hermetic tests). The route it-test injects mock LLMs and asserts that no call happened.
  - `client/INSIGHTS.md:30-39` (no `user-event`). New client tests use `fireEvent`.
  - `client/INSIGHTS.md:65-82` (`borderColor` is a shorthand). `InlineFinding` styles set all four border sides as longhands.
  - Root `INSIGHTS.md:75-86` (vendor drift). S1 copies the canonical `brief.ts` whole and compares only that file.
- Skills:
  - `onion-architecture` (SKILL.md "Where does this code go?", rules/fastify.md, rules/zod-contracts.md, rules/testing.md) — S1, S2.
  - `fastify-best-practices`, `zod` — S1, S2.
  - `typescript-expert` — all steps.
  - `frontend-ui-architecture` (placement tree, naming in references/file-placement.md:104-129, composition in references/component-splitting.md:62-76), `react-best-practices`, `next-best-practices` (`'use client'` at the leaf) — S3–S6.
  - `engineering-insights` — S7.
  - `react-testing-library` — test-writer only.
  - `pr-self-review` and `security` are gates run by separate agents and are not assigned to any step.

## Architecture constraints
| Rule | Source | How the plan complies |
|------|--------|-----------------------|
| Pure, IO-free logic must not need HTTP or a DB | onion SKILL.md "Where does this code go?"; rules/testing.md diagnostic | `classifyFile` / `buildSmartDiff` / `selectLatestReviews` import only `@devdigest/shared` types and local constants. No Fastify, no Drizzle. |
| No horizontal import of another module's internals | onion rules/fastify.md "Encapsulation is the module boundary" | The classifier lives **inside** `modules/reviews/smart-diff/`. The later pre-prompt filter will live in the same module (`diff-loader.ts` / `run-executor.ts`), so reusing it needs no cross-module import. A separate `smart-diff` module would force that reuse to become a horizontal import. |
| A route does 4 things, with one service call; errors are domain errors | rules/fastify.md | The route is `getContext` → `service.smartDiff(...)`. A PR missing from the workspace → `NotFoundError`, raised in the service. |
| Response serialized by the Zod schema | `server/AGENTS.md` Conventions; rules/zod-contracts.md | Route options: `response: { 200: SmartDiffResponse }` (`review-api.ts:84-86`). |
| Only repositories touch Drizzle | onion SKILL.md allowed imports | No new SQL. The service reuses `ReviewRepository.getPull` / `getPrFiles` / `reviewsForPull` (`server/src/modules/reviews/repository.ts:31-66`). |
| Known deviation: `ReviewService` takes `Container` | onion SKILL.md "Known deviations" | The new method matches the existing class pattern. It is not refactored. |
| Contracts: edit canonical, copy to client in the same change | `CLAUDE.md` Conventions; `server/AGENTS.md` Do not touch | S1 owns both copies of `brief.ts`. The caller sanctioned this as the exception to "do not touch vendor". |
| Server modules registered statically | `CLAUDE.md`; `server/src/modules/index.ts:27-39` | No new module. The route joins `reviews/routes.ts`, which is already registered. |
| Client data only through `lib/hooks` → `lib/api.ts` | `client/AGENTS.md` | New `client/src/lib/hooks/smart-diff.ts`, following the `hooks/intent.ts` pattern. |
| No literal UI strings | `client/AGENTS.md`; `client/docs/ui-architecture.md` "Text and theming" | All new text goes under `prReview.smartDiff`. The literals DiffTab already has (`DiffTab.tsx:55,60`) move to i18n while the file is being edited. |
| Shared code knows nothing about features; composition before configuration | frontend SKILL.md rules 2 and 4; component-splitting.md | `diff-viewer` gets generic slots (annotations keyed by `lineKey`, a header marker, an unanchored-block title) and knows nothing about findings. All finding logic stays in `DiffTab`. |
| Subject-named modules, not `helpers`/`utils` | frontend file-placement.md:104-114 | New client pure module: `DiffTab/smart-diff-model.ts`. New server files: `glob.ts`, `classify.ts`, `build.ts`. |
| `src/vendor/ui/**` read-only | `client/AGENTS.md` Do not touch | `SEV`, `Icon`, `Button`, `Markdown` are imported, never edited. |
| Test naming: DB-backed `*.it.test.ts`; client test beside its component | `CLAUDE.md` Naming; `TESTING.md` Conventions | Test plan below. |
| No new dependency, lockfiles untouched | `CLAUDE.md`; caller | Hand-written glob→RegExp. `server/package.json` has no glob library. |

## Decisions (defaults the plan runs on)
- D1 Client data flow (the caller asked for a choice). The client calls `GET /pulls/:id/smart-diff` **only for roles and group order**, so the classifier is single-sourced on the server and never duplicated in the client. Patch text and the original order come from `pr.files` (`GET /pulls/:id`). Finding details (id, severity, title, rationale, state) come from `usePrReviews(prId)` (`hooks/reviews.ts:51-57`, key `["reviews", prId]`). That cache is already refreshed on run done (`page.tsx:164-169`) and invalidated by `useFindingAction` (`hooks/reviews.ts:157-159`), so findings stay live, and the role query never needs to be invalidated. The UI does not read `finding_lines`, because `SmartDiff` carries no finding id, severity or text. The server still fills it per the contract for API consumers and the later lesson.
- D2 "Latest review" means the newest review **per agent**. From `reviewsForPull` (newest first, `review.repo.ts:59-75`), keep `kind === 'review'` and the first row per `agent_id` (null counts as one key). Reason: "Run all" writes one review per agent, and a re-run of the same agent supersedes its older review. The server (`selectLatestReviews`) and the client (`latestReviewPerAgent`) implement the same rule. This is a sync point (see Contracts).
- D3 The server returns **all five** groups in `SMART_DIFF_ROLE_ORDER`, empty ones as `files: []`, with files sorted by path within each group. The client hides empty groups.
- D4 Glob semantics. A pattern without `/` matches the **basename** at any depth (gitignore style). A pattern with `/` is anchored at the repo root unless it starts with `**/`. `*` does not cross `/`, and `**/` matches zero or more directories. Matching is case-sensitive. `.test.ts(x)` is written as two patterns. So `client/dist/x.js` → core (`dist/**` is root-anchored); see Q2.
- D5 Accepted and dismissed findings still count toward the dots and counters and are still rendered, muted with their state tag. Accept/Dismiss therefore changes only the card state.
- D6 A single comments toggle covers GitHub threads and finding comments. Its **initial** value is "shown" when the selected reviews have ≥1 finding and "hidden" otherwise, which keeps today's clean-by-default diff before a review (`DiffTab.tsx:21-22`). It is derived during render as `userChoice ?? hasFindings`, with no effect.
- D7 The inline finding is a new, simpler `InlineFinding` component, not a reuse of `FindingCard`. The requested layout (left severity bar, severity word on the right, one-line collapse) differs from `FindingCard` (`FindingCard.tsx:54-121`: compact badge on the left, category, confidence, link). `FindingCard` stays untouched.

## Steps

### S1 Contract: five-value `SmartDiffRole` in both copies
- Module / layer: ring 2 contracts (server canonical + client copy)
- Files:
  - modify `server/src/vendor/shared/contracts/brief.ts:119` — `z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`. Nothing else changes (`SmartDiffFile`/`SmartDiffGroup`/`SmartDiff` at `:122-151` and `SmartDiffResponse` at `review-api.ts:84-86` stay as they are).
  - copy the whole file to `client/src/vendor/shared/contracts/brief.ts`. The two copies are identical today (verified, lines 1-100 and 118-151).
- Skills to apply: onion rules/zod-contracts.md; zod
- Depends on: —
- Done when: both copies are byte-identical, and both packages type-check. The existing `server/test/contracts.test.ts:149-160` (role `core`) still passes unchanged.
- Verify: `diff -q server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`; `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `cd client && pnpm typecheck`

### S2 Server: classifier, builder, service method, route
- Module / layer: `modules/reviews` — pure logic (ring 3 helpers) + service (ring 3) + transport (ring 5)
- Files:
  - create `server/src/modules/reviews/smart-diff/constants.ts`:
    - `SMART_DIFF_ROLE_ORDER = ['core','tests','wiring','docs','boilerplate'] as const satisfies readonly SmartDiffRole[]`, the display order.
    - `SMART_DIFF_RULES: ReadonlyArray<{ role: SmartDiffRole; patterns: readonly string[] }>` in **precedence** order, first match wins:
      - boilerplate: `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/**`, `build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`
      - tests: `**/*.test.ts`, `**/*.test.tsx`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `e2e/**`
      - wiring: `index.ts`, `index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**`
      - docs: `**/*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE`
    - `SMART_DIFF_FALLBACK_ROLE = 'core'`.
    - Precedence and display order are two separate constants in the same file.
  - create `server/src/modules/reviews/smart-diff/glob.ts` — `globToRegExp(pattern): RegExp` and `isBasenamePattern(pattern): boolean`, following D4. Escape regex metacharacters; `**/` → `(?:.*/)?`; a trailing `/**` → `/.*`; `*` → `[^/]*`; anchor with `^…$`.
  - create `server/src/modules/reviews/smart-diff/classify.ts` — compile `SMART_DIFF_RULES` once at module load. `classifyFile(path: string): SmartDiffRole` strips a leading `./` or `/`, tests basename patterns against the last path segment and the others against the full path, and returns the fallback when nothing matches.
  - create `server/src/modules/reviews/smart-diff/build.ts`:
    - `selectLatestReviews<R extends { kind: string; agent_id: string | null }>(newestFirst: R[]): R[]` (D2).
    - `buildSmartDiff(files: { path: string; additions: number; deletions: number }[], findings: { file: string; start_line: number }[]): SmartDiff` (D3). `finding_lines` holds the unique, ascending `start_line` values of the findings whose `file === path`. `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`. `pseudocode_summary` is omitted.
  - create `server/src/modules/reviews/smart-diff/index.ts` — named exports only (`classifyFile`, `buildSmartDiff`, `selectLatestReviews`, `SMART_DIFF_ROLE_ORDER`, `SMART_DIFF_RULES`). This is the public entry for the later pre-prompt filter.
  - modify `server/src/modules/reviews/service.ts` (Reads section, next to `reviewsForPull` `:160-174`) — `async smartDiff(workspaceId, prId): Promise<SmartDiff>`:
    - `getPull` → `NotFoundError('Pull request not found')` when missing;
    - `getPrFiles(prId)`;
    - `reviewsForPull(prId)` mapped with the existing `reviewToDto` (`helpers.ts:117`), agent name `null`;
    - `selectLatestReviews`, then flatten the findings;
    - `buildSmartDiff`.
    It makes no LLM or container adapter call.
  - modify `server/src/modules/reviews/routes.ts`:
    - add `GET /pulls/:id/smart-diff` to the header comment (`:10-17`);
    - in the Reads section (`:128-132`) add `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, async (req) => { const { workspaceId } = await getContext(container, req); return service.smartDiff(workspaceId, req.params.id); })`;
    - import `SmartDiffResponse` from `@devdigest/shared`.
- Contracts relied on: `SmartDiff`/`SmartDiffRole` (S1); `ReviewDto`/`ReviewDtoFinding` (`reviews/helpers.ts:73-93`).
- User decisions applied: rule order and patterns, the 3 contested cases, no new dependency, `too_big: false`, no LLM.
- Skills to apply: onion-architecture (SKILL.md checklist 1, 2, 8, 10; rules/fastify.md); fastify-best-practices (route schema); zod; typescript-expert (`as const`/`satisfies`)
- Depends on: S1
- Done when:
  - `classifyFile` is importable without Fastify or a DB;
  - the route is served by the already-registered reviews plugin;
  - the onion self-check greps find nothing in `modules/reviews/smart-diff`;
  - the existing suites are green.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test`; `rg -n "from '.*db/schema|from 'drizzle-orm|from 'fastify" server/src/modules/reviews/smart-diff` (expect no output)

### S3 Client shared diff-viewer: generic annotation slots (backward compatible)
- Module / layer: shared component `client/src/components/diff-viewer` (knows nothing about findings)
- Files:
  - create `client/src/components/diff-viewer/annotations.ts`:
    - `export interface FileAnnotations { byKey: ReadonlyMap<string, React.ReactNode>; unanchoredTitle?: React.ReactNode; marker?: React.ReactNode }`. Keys use `lineKey(side, line)` (`comments.ts:34-36`).
    - pure `partitionAnnotations(byKey, renderedKeys)` → `{ anchored: Map; unanchoredKeys: string[] }`, mirroring `partitionThreads` (`comments.ts:89-106`), so nothing is dropped.
  - modify `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` — optional `annotation?: React.ReactNode`, rendered after the thread list (`:67-71`) and before the composer. It renders regardless of `showComments`; the caller decides visibility.
  - modify `client/src/components/diff-viewer/FileCard/FileCard.tsx` — optional `annotations?: FileAnnotations`:
    - compute `renderedKeys` once and share it with the comment partition (`:43-49`);
    - render `annotations.marker` immediately after the path span (`:60-62`) and before the stats and the comment counter (`:63-74`, unchanged);
    - pass each line the anchored nodes for `keysForLine(ln)` (`comments.ts:63-74`);
    - after `OutdatedComments` (`:91`), when `unanchoredKeys.length > 0`, render a block titled `unanchoredTitle` with those nodes, reusing the `cs.outdatedWrap`/`cs.outdatedTitle` styles (`comments.ts:158-172`).
    - The auto-expand rule (`constants.ts:4`, `FileCard.tsx:35-37`) is unchanged.
  - modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` — optional `annotationsFor?: (file: PrFile) => FileAnnotations | undefined`, forwarded to each `FileCard`. Use `key={f.path}` instead of the index.
  - modify `client/src/components/diff-viewer/index.ts` — also export `FileCard`, `lineKey` and `type FileAnnotations` (named exports, no wildcard).
- Skills to apply: frontend-ui-architecture (rule 4 dependency direction; component-splitting.md "composition before configuration"); react-best-practices (derive in render/`useMemo`, no effects)
- Depends on: — (this step does not use the contract)
- Done when: every existing call site (`DiffTab.tsx:62`, `client/src/test/smoke.test.tsx:36-44`) compiles and behaves the same without the new props; with `annotations`, nodes appear under the matching line, unmatched keys appear in the trailing block, and the marker appears next to the path.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S4 Client data hook, pure model, constants, i18n
- Module / layer: client data layer + `DiffTab` feature model
- Files:
  - create `client/src/lib/hooks/smart-diff.ts` — `usePrSmartDiff(prId)`: key `["pr-smart-diff", prId]`, `api.get<SmartDiffResponse>(\`/pulls/${prId}/smart-diff\`)`, `enabled: !!prId`. The pattern follows `hooks/intent.ts:10-19`. Roles depend only on files, so no invalidation is needed (D1).
  - modify `client/src/lib/hooks/index.ts:4-11` — add `export * from "./smart-diff";`, which matches the existing barrel style.
  - create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/smart-diff-model.ts` — pure, no React:
    - `latestReviewPerAgent(reviews: ReviewRecord[])` (D2, mirrors the server);
    - `findingsByFile(reviews)` → `Map<path, FindingRecord[]>`;
    - `findingAnchorKey(f)` = `lineKey("RIGHT", f.start_line)`;
    - `buildRoleGroups(smart: SmartDiffResponse, files: PrFile[])` → `{ role; files: PrFile[] }[]`. It follows the server group order and joins by path; `pr.files` entries missing from the response go to `core`; empty groups are dropped (D3).
    - `countFilesWithFindings(files, byFile)`.
  - create `.../DiffTab/constants.ts`:
    - `ROLE_I18N: Record<SmartDiffRole, { label: …; hint: … }>` (keys under `smartDiff`);
    - `COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"])`;
    - `SEVERITY_LABEL_KEY: Record<Severity, "blocker" | "warning" | "suggestion">`, with `Severity` from `@devdigest/shared` (`contracts/findings.ts:11`).
  - modify `client/messages/en/prReview.json` `smartDiff` (`:59-68`). Keep the existing keys and add:
    - `testsLabel` "Tests", `docsLabel` "Docs";
    - `coreHint` "The substance of the change — review closely", `testsHint` "Tests that exercise the change", `wiringHint` "Config, barrels and plumbing", `docsHint` "Documentation and notes", `boilerplateHint` "Generated, lock and snapshot files — skim";
    - `title` "Files changed · {count} files";
    - `smartOrder` "Smart order", `originalOrder` "Original order";
    - `showComments` "Show comments ({count})", `hideComments` "Hide comments ({count})";
    - `filesWithFindings` "{count} files with findings", `fileHasFindings` "This file has review findings";
    - `findingsOutsideDiff` "Findings outside the diff";
    - `reviewNotRun` "Review not run yet — run a review to see findings in the diff";
    - `groupingUnavailable` "Couldn’t group files by role — showing original order";
    - `severity.blocker` "blocker", `severity.warning` "warning", `severity.suggestion` "suggestion";
    - `expandFinding` "Expand finding", `collapseFinding` "Collapse finding".
    Accept/Dismiss and accepted/dismissed reuse `finding.*` (`:2-15`); note that `finding.dismiss` reads "Reject" today.
- Skills to apply: frontend-ui-architecture (placement tree: one feature → feature folder; constants-and-config: domain enums derived from the contract; subject naming); typescript-expert (`Record<SmartDiffRole, …>` forces all five roles)
- Depends on: S1
- Done when: the hook and the model type-check against the five-value enum, and the JSON is valid.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S5 Client DiffTab: groups, markers, counters, toggles, inline findings
- Module / layer: `DiffTab` feature (client component)
- Files:
  - create `.../DiffTab/_components/SmartDiffGroup/{SmartDiffGroup.tsx,styles.ts,index.ts}`:
    - props `{ role, filesCount, filesWithFindings: number | null, defaultCollapsed, children }`, where the children are the `FileCard`s (composition);
    - owns its collapsed state, initialized from `defaultCollapsed`;
    - header left: chevron, role label, hint;
    - header right: when `filesWithFindings != null`, a dot (colour `var(--accent)`, `aria-label`/`title` = `filesWithFindings`) and the number, then `filesCount` ("N files");
    - never colour alone: the number is always text.
  - create `.../DiffTab/_components/InlineFinding/{InlineFinding.tsx,styles.ts,index.ts}`:
    - props `{ finding: FindingRecord; pending: boolean; onAction: (a: FindingActionKind) => void }`;
    - a left bar in `SEV[severity].c`, set with longhand border properties only (`client/INSIGHTS.md:65-82`);
    - header: `Icon[SEV[severity].icon]`, the title, and accepted/dismissed tags via `prReview.finding.*`; on the right, the severity word `t(\`smartDiff.severity.${SEVERITY_LABEL_KEY[sev]}\`)` in `SEV[sev].c`;
    - body: `Markdown` rationale, plus Accept/Dismiss `Button`s with `active` state, like `FindingCard.tsx:96-117`;
    - `data-finding-id` on the root. Muted when accepted or dismissed (D5).
  - modify `.../DiffTab/DiffTab.tsx` (`:18-65`):
    - hooks: `usePrSmartDiff(prId)`, `usePrReviews(prId)` (same cache as `page.tsx:41`), `useFindingAction()`, plus the existing comment hooks;
    - state `order: "smart" | "original"` (default `smart`) and `commentsChoice: boolean | null` (D6);
    - derive in render, not in state: `latest`, `byFile`, `hasReview = latest.length > 0`, `showComments`, and `groups = buildRoleGroups(...)` when the data is loaded;
    - `annotationsFor(file)`: `marker` is the dot when `byFile` has the path; `byKey` maps each `findingAnchorKey` to its `InlineFinding` nodes, or is an empty Map when `!showComments`; `unanchoredTitle` = `t("smartDiff.findingsOutsideDiff")`;
    - `onAction` → `action.mutate({ findingId, action, prId })` (as in `FindingsPanel.tsx:127`); `pending` = `action.isPending && action.variables?.findingId === f.id`;
    - `SectionLabel` title `t("smartDiff.title", { count: filesCount })`; the right side holds the order toggle `Button` (label shows the other mode) and the comments toggle. The comments toggle is visible when GitHub comments + findings > 0, and its count is their sum;
    - smart mode: while the smart diff loads → `Skeleton`; on error → an inline `groupingUnavailable` note plus the original list; otherwise one `SmartDiffGroup` per group (`defaultCollapsed = COLLAPSED_ROLES.has(role)`, `filesWithFindings = hasReview ? countFilesWithFindings(...) : null`) rendering `FileCard key={path} file commenting annotations`;
    - original mode: `<DiffViewer files={files} commenting annotationsFor>`;
    - move the literals at `:55,60` to i18n.
  - create `.../DiffTab/styles.ts` — the file marker dot and toolbar layout.
- Contracts relied on: `SmartDiffResponse`, `ReviewRecord`, `FindingRecord`, `FindingActionKind`, `PrFile` (`@devdigest/shared`); `FileAnnotations`/`FileCard`/`lineKey` (S3).
- Skills to apply: frontend-ui-architecture ("Where business logic lives": derive in render, pure model module; props budget; nested `_components/`); react-best-practices; next-best-practices (`"use client"` stays on these leaves; `page.tsx` is already a client component)
- Depends on: S3, S4
- Done when: the P1/P2 UI criteria can be seen with mocked hooks, with no fetch in any component and no literal strings.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S6 P3 polish: sticky headers, one-line collapse, empty state, live refresh
- Module / layer: `DiffTab` feature + page composition
- Files:
  - modify `.../DiffTab/_components/SmartDiffGroup/styles.ts` — header `position: "sticky"`, `top: 0`, `zIndex: 2`, opaque `var(--bg-…)` background. Check the actual scroll container in the browser (see Risks).
  - modify `.../DiffTab/_components/InlineFinding/InlineFinding.tsx` — a local `collapsed` state (default expanded). The header click toggles it; collapsed shows only the header row. Set `aria-expanded` and the `expandFinding`/`collapseFinding` label.
  - modify `.../DiffTab/DiffTab.tsx` — when `!hasReview` and the reviews query has settled, render a muted `reviewNotRun` line under the `SectionLabel`, and pass `filesWithFindings = null` (no zero counters).
  - modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` — mirror the `RunStatus` pattern (`RunStatus.tsx:21-26`). Keep a `wasRunning` ref on `reviewRunning` (`page.tsx:50`); when it flips from true to false, call `qc.invalidateQueries({ queryKey: ["reviews", prId] })` and `["pr-runs", prId]`. This covers a user who switched to the Files tab while `RunStatus` (mounted only inside `FindingsTab`, `FindingsTab.tsx:99`) was unmounted. `usePrActiveRuns` already polls every 4 s while runs are active (`hooks/reviews.ts:33`).
- Skills to apply: react-best-practices (an effect is justified only to sync with server-driven state transitions, following the existing precedent); frontend-ui-architecture
- Depends on: S5
- Done when: the four P3 behaviours work, and the existing page, `FindingsTab` and `RunStatus` tests are green.
- Verify: `cd client && pnpm typecheck && pnpm test`; a manual browser check through `./scripts/dev.sh`: open a PR, go to Files changed, scroll (headers stick), run a review, stay on the Files tab, and the counters appear.

### S7 Insights
- Module / layer: `server/INSIGHTS.md`, `client/INSIGHTS.md` (English)
- Files: modify only if something genuinely new turned up (for example glob-anchoring surprises, or the sticky scroll container), per the `engineering-insights` rubric and dedup procedure. This is a mandatory repo rule (`CLAUDE.md` Insights) and is performed by the implementer.
- Skills to apply: engineering-insights
- Depends on: S2, S6
- Done when: new entries (if any) follow the Format in each file; none duplicates an existing one.
- Verify: read-through.

## Parallel execution (waves)
| Wave | Instance | Steps | Owns | Checks it may run |
|------|----------|-------|------|-------------------|
| 1 | implementer #1 | S1 | both copies of `contracts/brief.ts` | server + client typecheck |
| 2 | implementer #1 (backend) | S2 | `server/src/modules/reviews/{smart-diff/**,service.ts,routes.ts}` | server only |
| 2 | implementer #2 (frontend) | S3 → S4 → S5 → S6 | `client/src/components/diff-viewer/**`, `client/src/lib/hooks/{smart-diff,index}.ts`, `.../_components/DiffTab/**`, `client/messages/en/prReview.json`, `.../[number]/page.tsx` | client only |
| 3 | implementer #1 | S7 | `*/INSIGHTS.md` | none |

S2 and S3–S6 share no files and sit in different packages. The frontend is built against the fixed route shape (`SmartDiff`) with mocked hooks and does not need S2 running. S3 does not depend on S1, so it may start in wave 1 alongside S1. Afterwards the orchestrator runs every package's full suite once.

## Cross-module contracts & sync points
- `SmartDiffRole` / `SmartDiff` — `server/src/vendor/shared/contracts/brief.ts` ⇄ `client/src/vendor/shared/contracts/brief.ts` (byte-identical) ⇄ `SMART_DIFF_ROLE_ORDER`/`SMART_DIFF_RULES` (server constants) ⇄ `ROLE_I18N` (client constants, a `Record` keyed by the enum, so a missing role fails typecheck) ⇄ `prReview.smartDiff.*Label/*Hint`.
- Route `GET /pulls/:id/smart-diff` — `reviews/routes.ts` ⇄ `ReviewService.smartDiff` ⇄ `client/src/lib/hooks/smart-diff.ts`.
- Rule "latest review per agent" (D2) — `server/.../smart-diff/build.ts selectLatestReviews` ⇄ `client/.../DiffTab/smart-diff-model.ts latestReviewPerAgent`. The same fixture rows are used in both test suites.
- Finding anchor — `FindingRecord.start_line` ⇄ `lineKey("RIGHT", n)` (`comments.ts:34-36`) ⇄ `keysForLine` (`comments.ts:63-74`).
- Query key `["reviews", prId]` — `usePrReviews`, `useFindingAction`, `useDeleteRun`, `useDeleteReview`, `useRunReview` (`hooks/reviews.ts`) ⇄ the S6 invalidation in `page.tsx`.

## Test plan
- Existing suites to run (implementer, every step):
  - `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm exec vitest run .it.test` (Docker) — contracts and reviews routes;
  - `cd client && pnpm typecheck && pnpm test` — smoke `DiffViewer`, the PR page components.
  No existing test is expected to break: `contracts.test.ts:149-160` uses `core`, and `smoke.test.tsx:27-45` uses `DiffViewer` without the new props. If one breaks, the step that broke it updates it.
- New tests (all `owner: test-writer`; kept out of the implementation steps):
  - Classifier table "path → role" — unit — `server/test/smart-diff-classify.test.ts` — owner: test-writer. `it.each` rows cover:
    - every pattern family, e.g. `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `Cargo.lock`, `dist/a.js`, `x/y.min.js`, `a.generated.ts` → boilerplate; `src/a.test.tsx`, `x.it.test.ts`, `src/test/a.ts`, `e2e/specs/a.json` → tests; `server/src/modules/index.ts`, `vitest.config.ts`, `tsconfig.build.json`, `.env.example`, `.github/workflows/ci.yml` → wiring; `docs/a.txt`, `client/README.md`, `LICENSE` → docs; `src/app.ts`, `src/index.tsx` → core;
    - the 3 contested rows: `__tests__/__snapshots__/x.snap` → boilerplate; `.claude/skills/security/SKILL.md` → wiring; `e2e/README.md` → tests. Each carries a comment recording the decision;
    - the D4 anchoring row `client/dist/x.js` → core;
    - an assertion that `SMART_DIFF_ROLE_ORDER` equals `SmartDiffRole.options` as a set, in the fixed order.
  - `buildSmartDiff` + `selectLatestReviews` — unit — `server/test/smart-diff-build.test.ts` — owner: test-writer. Cases: five groups in fixed order including empty ones; files sorted by path; `finding_lines` unique and ascending, from `start_line` only, for the matching file only; `total_lines` sums additions + deletions; `too_big: false` and `proposed_splits: []`; `SmartDiff.parse(result)` succeeds; newest-per-agent selection with `summary` reviews excluded.
  - Route — integration (Postgres) — `server/test/smart-diff.it.test.ts` — owner: test-writer. Seed a PR with `pr_files` (incl. `pnpm-lock.yaml`, a test file, a `.md`) and insert reviews and findings directly: two reviews from the same agent (only the newer one counts) and one from another agent.
    - Before any review, the response groups the files and every `finding_lines` is `[]`.
    - After reviews, `SmartDiff.parse(res.json())` succeeds and the lock file sits in `boilerplate`.
    - A PR from another workspace or an unknown uuid → 404; a non-uuid id → 422.
    - Inject `MockLLMProvider` for `openai` and `openrouter` plus `MockSecretsProvider({})`, and assert that `.calls` is empty (no LLM).
  - diff-viewer slots — component — `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` — owner: test-writer. The annotation renders under the `RIGHT:n` line; an unmatched key renders in the trailing block with its title; the marker renders next to the path; without `annotations` nothing changes.
  - Pure client model — unit — `.../DiffTab/smart-diff-model.test.ts` — owner: test-writer. Cases: `latestReviewPerAgent` (same fixture as the server); `buildRoleGroups` (server order, empty groups dropped, a missing path goes to core); `countFilesWithFindings` counts files, not findings.
  - DiffTab behaviour — component — `.../DiffTab/DiffTab.test.tsx` — owner: test-writer. `vi.mock` `@/lib/hooks/reviews` and `@/lib/hooks/smart-diff`; `NextIntlClientProvider` with the `prReview` + `shell` messages; `fireEvent`. Cases:
    - group order and labels;
    - empty groups hidden;
    - docs/boilerplate collapsed and core open;
    - a group counter of 2 files for 3 findings, placed before "N files";
    - the file dot is distinct from the comment counter;
    - an inline finding under the right line, with severity words blocker/warning/suggestion;
    - Accept/Dismiss call `mutate({ findingId, action, prId })`;
    - a finding outside the patch lands in the trailing block;
    - the comments toggle hides findings;
    - the order toggle shows the flat original order;
    - the review-not-run hint appears and no counters show before a review.
  - Group header — component — `.../DiffTab/_components/SmartDiffGroup/SmartDiffGroup.test.tsx` — owner: test-writer. Collapse toggling, and the counter hidden when `filesWithFindings` is null.
  - Inline finding — component — `.../DiffTab/_components/InlineFinding/InlineFinding.test.tsx` — owner: test-writer. Severity label mapping, muted accepted/dismissed state, one-line collapse, button callbacks.
- Not tested: sticky header positioning — jsdom has no layout, so it is a manual browser check in S6. Live refresh from the Files tab (S6 `page.tsx` effect) — `page.tsx` has no component test harness; it is covered by the manual check in S6.

## Risks & open questions
- [non-blocking] Q1 Which findings count as "the latest review". Default D2 (newest per agent). Alternatives: only the single newest review row (with "Run all" this would show one agent's findings), or all reviews (duplicates across re-runs).
- [non-blocking] Q2 Glob anchoring. Default D4: `dist/**`, `build/**`, `docs/**`, `e2e/**`, `.github/**`, `.claude/**` match only at the repo root, as written, so `client/dist/x.js` → core. Alternative: match those directories at any depth.
- [non-blocking] Q3 Empty groups. Default: the server returns all five and the UI hides empty ones (as in the prototype). Alternative: show them with "0 files".
- [non-blocking] Q4 Dismissed findings. Default D5: they still count and render, muted. Alternative: exclude dismissed findings from the dots and counters (applied on both sides).
- [non-blocking] Q5 Initial comments-toggle state. Default D6: shown when findings exist. Alternative: always hidden, as today (then P1 inline findings need one click).
- [non-blocking] Q6 Classifier placement. Default `server/src/modules/reviews/smart-diff/` (justified under Architecture constraints). The onion rule "deterministic, no IO → reviewer-core" (SKILL.md "Where does this code go?") would favour `reviewer-core` if the later pre-prompt filter runs inside the engine. The pure module has no server imports besides the `SmartDiffRole` type, so it can move later; reviewer-core would then own a local role type.
- [non-blocking] Sticky header: the scroll container of `AppShell` was not identified during planning (`client/src/components/app-shell/AppShell.tsx` has no overflow rule), so `top` may need an offset for a fixed top bar. Check in the browser.
- [non-blocking] Docs drift (doc-writer not selected): `client/specs/pages.md:14` hook list, the server README API map and the client README hook→endpoint map will not mention `GET /pulls/:id/smart-diff` / `usePrSmartDiff`. Flag this for a later doc pass.
- [non-blocking] Existing label: `prReview.finding.dismiss` is "Reject" (`prReview.json:7`). The inline card reuses it for consistency with the Agent runs tab.
- Note: no file read during planning contained instructions aimed at the planner.

## Out of scope for the implementer
Architecture and security review are done by separate agents. New tests are written by the test-writer. Do not run `git commit` or `git push`; leave all changes in the working tree.

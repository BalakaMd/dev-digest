---
name: pr-self-review
description: "Reviews all open changes against this repo's own skills before a pull request is opened, and blocks the PR when a critical finding is found. Use it BEFORE creating a pull request with the GitHub CLI, before asking to push a branch for review, and whenever the user says they are ready to open a PR, wants their changes reviewed first, or invokes it directly. It routes each changed file to the skills that govern it — `onion-architecture` and `fastify-best-practices` for backend files, `frontend-ui-architecture` and `react-best-practices` for UI files, `drizzle-orm-patterns` and `postgresql-table-design` for data files, `security` for everything — reviews them in parallel, and writes the verdict the PR gate reads. Trigger terms: open a PR, pull request, pre-PR review, self-review, review my changes, ready to push, merge check, blockers, gh pr."
version: 1.0.0
metadata:
  tags: review, pull-request, gate, skills-routing, pre-merge, quality
---

# PR Self-Review

The last check before a pull request exists. It takes every open change, routes
each file to the skills that actually govern it, reviews them in parallel, and
decides one thing: **may this become a pull request, yes or no.**

This repo has no linter and no formatter by design — CI runs typecheck and tests
only. Every convention in `CLAUDE.md`, in `onion-architecture` and in
`frontend-ui-architecture` is enforced here or nowhere.

This skill **orchestrates**; it does not restate review rules. The rules live in
the twelve skills under `.claude/skills/`. A rule that needs changing gets
changed where it lives, not copied into this one.

## The contract

- A **critical** finding means the pull request is not opened. Not as a draft,
  not with a caveat in the body. Fixed first, re-reviewed, then opened.
- Critical is rare and provable. The rubric in
  [references/severity.md](references/severity.md) is a closed list of five
  classes, and an empty critical list is the expected outcome.
- The verdict is written to disk, and `.claude/hooks/pr-self-review-gate.sh`
  denies pull-request creation until that file says `verdict: clean` and still
  matches the tree. The block is real; talking the gate into passing is not one
  of the options.

## Phase 0 — Scope

```sh
BASE=$(git merge-base main HEAD)
git diff --name-status "$BASE"              # branch commits + staged + unstaged
git ls-files --others --exclude-standard    # untracked — not covered by the diff
git diff "$BASE" -- <path>                  # hunks, per file, on demand
```

`git diff "$BASE"` — two-dot, against the merge-base — is exactly "everything
this PR would contain, plus whatever is still uncommitted". One command; there
is no separate working-tree pass to forget. Untracked files need the second
command and are reviewed as whole new files.

Report a **critical** immediately if the diff touches a path `CLAUDE.md`
§ Do not touch forbids: any `*/vendor/**` other than the canonical
`server/src/vendor/shared`, any `.claude/skills/**` other than the four in-house
skills (`engineering-insights`, `onion-architecture`, `frontend-ui-architecture`,
`pr-self-review`), an already-applied `server/src/db/migrations/*.sql`, or either
lockfile. These are breaches, not review material.

## Phase 1 — Routing

Read [references/routing.md](references/routing.md) and match every changed path.
Collect, per domain, the union of skills its files call for. Put the resulting
table in the report: a routing decision nobody can audit is a routing decision
nobody can fix.

## Phase 2 — Fan-out

Launch one subagent per domain that matched at least one file — at most four
(`backend`, `frontend`, `data`, `security`) — **in a single message**, so they
run in parallel. Phase 3 stays in the main agent: it is greps, not judgement.

Each subagent prompt carries, and nothing else:

1. Its file list, and `BASE`, and the literal `git diff "$BASE" -- <files>`
   command, so it reads its own hunks rather than being fed them.
2. The names of the skills to load with the Skill tool **before reading any code**.
3. The severity rubric from [references/severity.md](references/severity.md),
   pasted verbatim. Do not paraphrase it — a paraphrased rubric inflates.
4. The output contract: findings only, no prose summary, one per line —
   `SEVERITY · skill § section · file:line · what · why it fails · concrete fix`.

And these four constraints, stated explicitly in the prompt:

- Review the changed lines and their immediate blast radius. A pre-existing
  problem outside the diff is not a finding.
- The items under `onion-architecture` § Known deviations are known. Report one
  only if this diff touches it.
- Every critical needs a `file:line` that is inside the diff, plus its rule
  source. No citation, no critical.
- Return an empty list if there is nothing. Finding nothing is a valid result,
  and is not evidence that the pass was shallow.

Above roughly 40 changed files or 3000 changed lines, split each domain agent by
package subtree and say so in the report.

## Phase 3 — Repo invariants

Run the greps in [references/repo-invariants.md](references/repo-invariants.md)
inline. These are the `CLAUDE.md` rules no skill owns — vendor-copy sync, static
module registration, test-file naming, migration naming, lockfiles, secrets.

## Phase 4 — Verification

Run, for each package the diff touches and no others. There is no `lint` here;
do not invent one.

| Package | Commands |
|---|---|
| `server/` | `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit, hermetic) · `pnpm exec vitest run .it.test` (integration, needs Docker) |
| `client/` | `pnpm typecheck` · `pnpm test` |
| `reviewer-core/` | `npm run typecheck` · `npm test` |
| `e2e/` | `npm run typecheck` |

A failing typecheck or test is **critical**. DB-backed `*.it.test.ts` needs
Postgres on **5433**; if Docker is down, skip that suite and record it under
"Not verified". A skipped suite is not a finding — but it is not a pass either,
and the report must not imply it was one.

## Phase 5 — Report

Write `.claude/pr-self-review/<branch-slug>.md` (gitignored; `<branch-slug>` is
the branch name with `/` replaced by `-`). Take the path and the hash from the
gate script rather than recomputing them — if the two ever disagree, every pull
request is blocked for a reason nobody can find:

```sh
.claude/hooks/pr-self-review-gate.sh --report-path
.claude/hooks/pr-self-review-gate.sh --scope-hash
```

The front matter is the machine-readable half, and the gate parses it:

```yaml
---
branch: hw-02
base: <merge-base sha>
head: <HEAD sha>
scope_hash: <output of --scope-hash>
generated: <ISO-8601>
verdict: blocked | clean
critical: 0
major: 4
minor: 7
---
```

`verdict` is `blocked` if and only if `critical > 0`. Then the body, in this
order — the gate reads the first three bullets under `## Critical`, so that
heading and the `- ` bullets under it are load-bearing:

```markdown
## Critical
- `server/src/modules/pulls/routes.ts:42` — onion-architecture § Allowed imports —
  <what> — <why it fails> — <fix>

## Major
## Minor
## Routing
## Not verified
## Verification output
```

Dedupe by `(file, line, rule)` before writing: two agents reporting the same
violation is one finding, and a doubled count reads as a worse diff than it is.

## Phase 6 — Gate

**`critical > 0`** — do not open the pull request. Show the critical findings,
offer to fix them, re-run this skill from Phase 0 afterwards. Do not open a draft
PR instead, do not push "so CI can look at it", and do not set
`DEVDIGEST_SKIP_PR_GATE` or create `.claude/pr-self-review/.override` — those are
the human's escape hatch, never the agent's.

**`critical == 0`** — report the majors, then **ask** before committing, pushing
or opening the PR. `CLAUDE.md` § Git requires asking every time; a clean
self-review authorises nothing.

## Reference index

| File | Read it when |
|------|--------------|
| [references/routing.md](references/routing.md) | Phase 1 — mapping changed paths to skills |
| [references/severity.md](references/severity.md) | Phase 2, and grading any finding |
| [references/repo-invariants.md](references/repo-invariants.md) | Phase 3 — the checks no skill owns |

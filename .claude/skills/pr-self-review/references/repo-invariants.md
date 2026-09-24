# Repo invariants — the checks no skill owns

Phase 3. These are the `CLAUDE.md` and `AGENTS.md` rules that no skill covers,
because they are about this repository rather than about a technology. Run them
inline in the main agent: they are greps, not judgement, and a subagent adds a
round trip for nothing.

Every command assumes `BASE=$(git merge-base main HEAD)` and the repo root as
the working directory. Trust the output, not the examples — this file is a list
of questions, and the answers change.

## 1 · Vendor copies (critical when it fires)

`@devdigest/shared` is canonical in `server/src/vendor/shared`;
`client/src/vendor/shared` is a copy. Changing a contract means changing both.
Check only the files this diff touched:

```sh
git diff --name-only "$BASE" -- 'server/src/vendor/shared/*' 'client/src/vendor/shared/*' |
  sed -E 's#^(server|client)/src/vendor/shared/##' | sort -u |
  while IFS= read -r f; do
    diff -q "server/src/vendor/shared/$f" "client/src/vendor/shared/$f" >/dev/null 2>&1 ||
      echo "DIVERGED: $f"
  done
```

**Touched files only, on purpose.** The two trees are already not identical on
`main` — `adapters.ts` and the `contracts/{eval-ci,knowledge,productionize,trace}.ts`
copies differ in comment text. A whole-tree `diff -r` reports those five on every
run, and five standing false criticals train everyone to ignore the gate. A diff
that does not touch them did not cause them.

Also critical: any change under `client/src/vendor/` with no matching change in
`server/src/vendor/shared`, and **any** change under `client/src/vendor/ui`,
which is vendored `@devdigest/ui` and has its canonical source elsewhere.

```sh
git diff --name-only "$BASE" -- 'client/src/vendor/*'
```

## 2 · Static module registration

Server modules are registered by hand in `server/src/modules/index.ts` — there is
no autoload, so an unregistered module is simply dead code that type-checks.

```sh
git diff --name-only --diff-filter=A "$BASE" |
  grep -oE '^server/src/modules/[^/]+/' | sort -u |
  while IFS= read -r d; do
    n=$(basename "$d")
    grep -q "modules/$n" server/src/modules/index.ts || echo "UNREGISTERED: $n"
  done
```

## 3 · Test-file naming

A DB-backed server test **must** end `*.it.test.ts`; CI splits the suites on that
suffix, so a misnamed one runs in the hermetic job and fails there for reasons
that look nothing like the real cause. DB-backed means it pulls in
`test/helpers/pg`:

```sh
git diff --name-only "$BASE" -- 'server/test/*' | grep -E '\.test\.ts$' |
  grep -v '\.it\.test\.ts$' | xargs -r grep -l "helpers/pg" 2>/dev/null
```

A new client feature component wants a sibling `*.test.tsx` in the same folder:

```sh
git diff --name-only --diff-filter=A "$BASE" |
  grep -E '^client/src/app/.*/_components/[^/]+/[A-Z][A-Za-z0-9]*\.tsx$' |
  while IFS= read -r f; do
    [ -f "${f%.tsx}.test.tsx" ] || echo "NO SIBLING TEST: $f"
  done
```

Missing test — major. Misnamed integration test — major, unless CI is red,
which makes it critical under class 5.

## 4 · Migrations

drizzle-kit generates these. A modified or deleted `.sql` under
`server/src/db/migrations/` is critical: the migration has been applied
somewhere, and editing it rewrites history the database does not have.

```sh
git diff --name-status "$BASE" -- 'server/src/db/migrations/*.sql'
```

`M` or `D` → critical. An added file whose name does not match
`^[0-9]{4}_[a-z0-9_]+\.sql$` was hand-named rather than generated → major.

## 5 · Lockfiles and package boundaries

This is **not** a monorepo: each package owns its own lockfile, `server` and
`client` use pnpm, `reviewer-core` and `e2e` use npm.

```sh
git diff --name-only "$BASE" | grep -E '(pnpm-lock\.yaml|package-lock\.json)$'
git diff --name-only "$BASE" -- '*package.json' | xargs -r grep -l '"workspaces"'
```

A lockfile in the diff is fine when the matching `package.json` changed too, and
critical on its own — it means somebody edited it by hand. Any `workspaces` key
is critical.

## 6 · Secrets

Secrets live in `~/.devdigest/secrets.json` (mode `0600`) with `process.env` as
the fallback. Never in the database, never in git.

```sh
git diff "$BASE" | rg -n '^\+' |
  rg -n 'sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY|(api[_-]?key|token|secret|password)\s*[:=]\s*.{8,}'
```

Read every hit. A literal in a test fixture is noise; a real-looking credential
is critical and needs saying out loud, because rotating it matters more than the
pull request does.

## 7 · Port 5433

Postgres listens on **5433** here, not the default. Parts of the READMEs still
say 5432, which is how the mistake keeps getting copied. Markdown is excluded:
the gotcha itself has to name the wrong port to warn about it.

```sh
git diff "$BASE" -- ':!*.md' | rg -n '^\+.*\b5432\b'
```

## 8 · Repo hygiene

Files in this repository are written in English, and they do not name other
contributors' branches, commits or pull requests — it is a course repo that gets
handed in, and those references go stale the moment the branch is deleted.

```sh
git diff "$BASE" | rg -n '^\+.*\p{Cyrillic}'
git diff "$BASE" -- '*.md' | rg -n '^\+.*(\bPR #[0-9]+|\b(homework|hw)-[0-9]{2,}\b|\borigin/[a-z0-9._-]+)'
```

Both are majors: they do not break anything, and they are exactly the kind of
thing nobody notices again once it is merged.

## 9 · Invented tooling

There is no linter and no formatter in this repo, by design. CI runs typecheck
and tests only.

```sh
git diff "$BASE" -- '*package.json' | rg -n '^\+.*"(lint|format|prettier|eslint)"'
```

Adding one is a legitimate change and a deliberate one — it is a major finding
so that it gets discussed rather than arriving as a side effect.

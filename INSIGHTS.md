# Insights — the DevDigest repository as a whole

Append-only log of traps, surprises and decisions discovered while working on
this repository. This is the pressure valve for `AGENTS.md`: anything worth
remembering but not worth its tokens in every session belongs here.

Read this before a non-trivial change. Add an entry whenever something cost you
time that it should not have.

## Format

Newest first. One entry per finding:

```
## YYYY-MM-DD — [category] Short, specific title
**Symptom** — what was observed.
**Cause** — what was actually going on.
**Takeaway** — what to do differently, concretely.
```

Categories: `gotcha` · `root-cause` · `convention` · `dead-end` · `perf-cost` ·
`env-quirk`. The `engineering-insights` skill holds the full rubric, the quality
bar, and the deduplication procedure — consult it before reading or writing.

Promote an entry into `AGENTS.md` only if it passes the line test there: "if I
remove this line, will Claude start making mistakes?"

---

## 2026-09-25 — [gotcha] A subagent's `description:` breaks YAML if it contains ": " mid-sentence
**Symptom** — a new agent file's frontmatter failed to parse ("mapping values are
not allowed here") even though it looked identical in shape to the three
existing agents.
**Cause** — the `description` field is written as an unquoted YAML plain
scalar. A colon followed by a space anywhere in that scalar — for example
"...architecture skills: dependency direction, layer violations..." — is
itself valid YAML mapping syntax, so the parser tries to start a nested
mapping right there and fails. `path:line`-style colons (no space after) are
fine; the trap is specifically a colon used as prose punctuation.
**Takeaway** — before shipping a new agent's `description`, either avoid a
bare "word: word" construction (use an em dash or semicolon instead) or quote
the whole field. Verify with an actual YAML parser (`python3 -c "import
yaml; yaml.safe_load(...)"`), not just by eye — the existing three agents'
descriptions happen to avoid this construction, so nothing in the repo
demonstrates the failure until it is hit.

## 2026-09-25 — [gotcha] `$(cmd) $?` inside one line reads the wrong exit status
**Symptom** — a test-matrix loop (`sh guard.sh < "$f" 2>/dev/null; echo
"$(basename "$f") $?"`) printed exit code `0` for every fixture, including
ones that should have been denied with exit `2`.
**Cause** — `$?` is expanded as part of assembling the `echo` command's
arguments, and the command substitution `$(basename "$f")` runs first as part
of that same assembly. Whatever the substituted command's own exit status is
(here, `basename`'s success) is what `$?` reports — the prior command's status
is already gone by the time `$?` is read, even though it appears earlier in
the source line.
**Takeaway** — capture `$?` into a variable on the line immediately after the
command whose status you need, before running anything else — including a
command substitution — on the same or a later line: `sh script < "$f"; rc=$?;
echo "$(basename "$f") $rc"`. A one-liner that mixes a status check with a
command substitution silently reports the substitution's status instead, and
will mask every failure as success.

## 2026-09-24 — [gotcha] A PreToolUse(Bash) matcher sees the whole command, heredocs included
**Symptom** — the new PR gate denied a `cat > file <<EOF` call that was merely
writing documentation, because the document mentioned the gated command.
**Cause** — a `PreToolUse` hook receives the entire command string. A substring
test (`*"gh pr create"*`) therefore matches the words wherever they appear: in a
heredoc body, a `grep` pattern, a commit message, a comment.
**Takeaway** — match at command position, not by substring: anchor to start of
line or to a shell separator (`(^|[;&|(])[[:space:]]*cmd`). Over-matching is
worse than it looks — the first thing a gate that blocks unrelated work gets is
switched off, and then it protects nothing.

## 2026-09-24 — [convention] `vendor/shared` is already out of sync on `main`
**Symptom** — a "the two vendored copies must be identical" check reported five
critical findings on a diff that touched neither copy.
**Cause** — `server/src/vendor/shared` and `client/src/vendor/shared` differ on
`main` in `adapters.ts` and several `contracts/*.ts` files. Mostly comment text,
so nothing fails and nobody has fixed it — but not only: the client
`knowledge.ts` was also missing `AgentVersionConfig` / `AgentVersion`. It and
`trace.ts` were re-synced by the skills work (copy the canonical file whole);
the remaining drift is still comment-only.
**Takeaway** — compare only the shared files a diff actually touches. A standing
false positive is worse than no check: it trains everyone to skim past the
category, and the one real divergence goes past with it.

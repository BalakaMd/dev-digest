# Insights — the DevDigest repository as a whole

Append-only log of traps, surprises and decisions discovered while working on
this repository. This is the pressure valve for `CLAUDE.md`: anything worth
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

Promote an entry into `CLAUDE.md` only if it passes the line test there: "if I
remove this line, will Claude start making mistakes?"

---

## 2026-09-18 — [gotcha] Course features are in git history, not missing

**Symptom** — a lesson feature (L01 run-cost badge) appears absent from the
tree, so the obvious move is to build it from scratch.
**Cause** — `c6af1e4` reverted `main` to the starter state on purpose. The
feature work is still in history, and several lessons were implemented more than
once on separate homework branches. For cost, the surviving lineage was `84e2c1e`
(PR #101); an earlier independent attempt sits at `93119a5`.
**Takeaway** — before implementing anything from the course roadmap in
`README.md`, search history first: `git log --all --oneline | grep -i <feature>`.
Compare the candidates rather than taking the first hit — they differ in quality,
and the one that survived into `main` is usually, but not always, the better one.
Port with `git checkout <sha> -- <paths>` limited to feature files; a
`cherry-pick` or a revert-of-the-revert also drags that branch's `CLAUDE.md`,
`INSIGHTS.md` and skills over the current ones. Check the candidate's
`INSIGHTS.md` too — the original author may have logged traps for that feature.

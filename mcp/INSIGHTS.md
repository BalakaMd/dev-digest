# Insights — `@devdigest/mcp`

Append-only log of traps, surprises and decisions discovered while working on
`@devdigest/mcp`. This is the pressure valve for `AGENTS.md`: anything worth
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

## 2026-09-28 — [env-quirk] `@modelcontextprotocol/sdk` 1.x needs zod ≥3.25, one minor ahead of the server's pin
**Symptom** — the server pins `zod` `^3.24.1`. Installing that exact range in
`mcp/` would satisfy `npm install` (no peer-dep error thrown, npm 7+ only
warns), but the SDK's own peer range is `^3.25 || ^4.0` — a plain `^3.24.1`
install can resolve to a 3.24.x patch that is technically outside it.
**Cause** — `@modelcontextprotocol/sdk@1.31.0`'s `peerDependencies.zod` is
`"^3.25 || ^4.0"` (checked via `npm view @modelcontextprotocol/sdk@1.31.0
peerDependencies`), not `^3.x` generally. The repo's "Zod 3" convention is
about the major version, not this exact minor.
**Takeaway** — `mcp/package.json` pins `zod` `^3.25.0` (still Zod 3, per the
repo's stack table) specifically to land inside the SDK's peer range with
margin, rather than copying the server's `^3.24.1` verbatim. If the SDK is
ever bumped past 1.31, re-check `peerDependencies.zod` before assuming the
existing pin still clears it.

## 2026-09-28 — [env-quirk] `tsx` does apply this package's own tsconfig `zod` path alias to imports inside the vendored shared contracts (R4, confirmed)
**Symptom** — `server/src/vendor/shared/**` imports `zod` internally, and
`mcp/` borrows those files via a `@devdigest/shared` path alias while
resolving its OWN `zod` copy (`mcp/node_modules/zod`), not the server's. It
was unclear whether `tsx`/`vitest` would honor `mcp/tsconfig.json`'s `zod` →
`./node_modules/zod` remap for code that physically lives outside `mcp/src`.
**Cause** — both `tsx` (via esbuild-based resolution, cwd-rooted) and the
`vitest.config.ts` alias (`zod` → `mcp/node_modules/zod`) resolve module
specifiers by the **importing package's** config, not the imported file's
location on disk. A `tsconfig.json`/vitest alias applies uniformly regardless
of which physical folder the importing statement's file sits in.
**Takeaway** — this means the MCP package does NOT depend on `server/`
being installed at runtime, confirmed by running `mcp/test/config.test.ts`
(which imports a type from `@devdigest/shared`) and the full suite with no
`server/node_modules` symlink present. Re-verify this only if the alias
mechanism itself changes (e.g. a bundler swap away from `tsx`/Vite's
resolver).

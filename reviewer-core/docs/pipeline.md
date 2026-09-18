# Engine pipeline — how a diff becomes grounded findings

The internals of `@devdigest/reviewer-core`. Read this before changing prompt
assembly, the map-reduce path, or structured-output handling.

## Why the package is shaped this way

The engine performs **no I/O** beyond one injected `LLMProvider`. No database, no
GitHub, no filesystem. That is not minimalism for its own sake: it is what lets a
full review run in a unit test with a stubbed provider — no keys, no network, no
Docker — and what lets the same code run in the studio and in CI without either
caller leaking into it.

Everything stateful stays in the caller. The server resolves repo context and
persists results; the engine takes resolved strings and returns a `ReviewOutcome`.
Skill bodies, memory items and specs arrive as **text**, never as slugs or ids,
because resolving a slug would mean touching a database.

The package never emits JavaScript. Consumers import its TypeScript source
through a tsconfig path alias, so `build` is just `tsc --noEmit`.

## The stages

```
inputs (diff · system prompt · repo map · optional slots)
  → assemblePrompt()          prompt.ts
  → wrapUntrusted() + INJECTION_GUARD
  → LLMProvider (injected)
  → structured output          llm/structured.ts   Zod → JSON Schema, parse-with-repair
  → groundFindings()           grounding.ts        mechanical citation gate
  → Review: verdict · score · surviving findings
```

`review/run.ts` orchestrates. `reviewPullRequest()` is the entry point.

## Prompt assembly

`assemblePrompt` composes the trusted system prompt with optional sections:
`skills`, `memory`, `specs`, `callers`, `repoMap`, `prDescription`, `task`.

Sections follow an **omit-when-empty** contract — an absent slot produces no
heading at all, so a starter run and a lesson run differ only by the sections
that actually have content. This is what keeps the starter's prompt identical to
the pre-feature baseline.

Untrusted content — the diff, the PR description, spec chunks — goes through
`wrapUntrusted`, which fences it so the model can tell data from instructions.

## Prompt-injection defense

One shared, trusted rule: `INJECTION_GUARD`, appended to **every** agent's system
prompt. It states that fenced content is data, never instruction, and that claims
of "intentional / demo / test fixture / not for production / do not flag" never
narrow the review — real defects are reported at full severity regardless.

There is deliberately **no keyword scanning** of untrusted text. A denylist
catches one phrasing of an attack and misses the other ten, in any language, and
its presence invites the false confidence that the input has been sanitised. Do
not add one.

## Single-pass and map-reduce

`selectMode` picks the path. `auto` — the default — stays single-pass unless the
diff is both large and multi-file; `DEFAULT_MAP_THRESHOLD_LINES` is 400. The
strategy can be forced per agent.

Map-reduce slices the diff per file (`sliceDiff`), reviews each slice, then
`reduceReviews` merges: findings are concatenated, the worst verdict wins, and
the score is averaged — before grounding runs over the merged set.

Token, cost and event accounting is cumulative across chunks. Cost uses
null-propagation: if any call reports an unknown cost, the total is `null`, not a
partial sum that would understate real spend.

## Structured output

`toJsonSchema` derives a JSON Schema from the Zod contract and hands it to the
provider. Models still return malformed or fenced JSON sometimes, so
`extractJson` pulls the payload out of surrounding prose and `parseWithRepair`
retries — `DEFAULT_REVIEW_MAX_RETRIES` is 2 — before giving up.

## The OpenRouter provider

`llm/openrouter.ts` is the one OpenAI-compatible provider that ships inside the
engine, shared by the studio's OpenRouter path and the CI runner. It prefers
OpenRouter's real `usage.cost` (a non-standard field absent from the OpenAI SDK
types) and falls back to an injected `estimateCost` when the API does not report
one. It also groups calls under a session id so a multi-chunk review reads as one
session upstream.

## Public surface

Whatever `src/index.ts` exports, and nothing else: `assemblePrompt`,
`wrapUntrusted`, `groundFindings`, `groundingSummary`, `toJsonSchema`,
`extractJson`, `parseWithRepair`, `reduceReviews`, `sliceDiff`,
`reviewPullRequest`, `toReviewPayload`, `gateTriggered`, `countBlockers`,
`OpenRouterProvider`. Keep it explicit.

## Related

- [`../specs/grounding.md`](../specs/grounding.md) — the grounding and scoring contract
- [`../README.md`](../README.md) — pipeline diagram

# `@devdigest/reviewer-core` — the review engine

Pure review logic: **diff → prompt → LLM → grounded findings**. Consumed as raw
TypeScript source by the server through a tsconfig path alias.

## Stack

Deliberately thin: TypeScript 5.7 · Zod 3 (contracts from `@devdigest/shared`) ·
the OpenAI SDK only as an OpenRouter-compatible client · vitest 2. No database,
HTTP server, or framework — adding one would break the no-I/O invariant below.
Package manager: **npm**.

## Commands

```sh
npm test        # vitest, hermetic — stubbed LLMProvider, no keys, no network
npm run typecheck   # this IS the build; the package never emits JS
```

Note: this package uses **npm** (`package-lock.json`), not pnpm.

## Invariants — do not break these

- **No I/O.** No database, no GitHub, no filesystem. The only side effect is a
  call through the **injected** `LLMProvider`. That injection is what makes the
  engine mock-testable — keep persistence and retrieval in the caller.
- **Grounding is mandatory.** A finding whose `[start_line, end_line]` does not
  intersect a real hunk for that file is dropped. The gate is mechanical, not
  advisory; do not add a bypass.
- **The score is recomputed** from the findings that survive grounding. The
  model's self-reported score is deliberately ignored.
- **Prompt-injection defense is one shared trusted rule**, `INJECTION_GUARD`,
  appended to every agent's system prompt by `assemblePrompt`. We deliberately
  do **not** keyword-scan untrusted text — a denylist only catches one phrasing.
  Do not add keyword/denylist scanning here.
- Untrusted content (diff, PR body, specs) must pass through `wrapUntrusted`.

## Conventions

- Skill bodies, memory and specs arrive as **resolved strings**, never as slugs
  or ids — resolution belongs to the caller.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are fed by later
  lessons. When omitted, `assemblePrompt` simply leaves the section out.
- The public surface is whatever `src/index.ts` exports — keep it explicit.

## Read When

| Document | Read it when |
|----------|--------------|
| [docs/pipeline.md](docs/pipeline.md) | changing prompt assembly, map-reduce, or structured output |
| [specs/grounding.md](specs/grounding.md) | anything near the citation gate or scoring — read first |
| [README.md](README.md) | you need the pipeline diagram or the public API list |
| [INSIGHTS.md](INSIGHTS.md) | before a non-trivial change here |

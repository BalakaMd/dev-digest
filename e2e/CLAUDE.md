# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows driven by Vercel **agent-browser** (Rust + CDP).
No Playwright, no LLM, no API key.

## Stack

Vercel **agent-browser** (Rust + CDP) driven by a `run.ts` harness under tsx ·
TypeScript 5.7. No test framework, no Playwright, no assertion library — the
waits are the assertions. Package manager: **npm**.

## Commands

```sh
npm test              # runs the flows against an already-running stack
../scripts/e2e.sh     # hermetic: isolated stack on alternate ports, then run
npm run typecheck     # tsc --noEmit
```

This package uses **npm** (`package-lock.json`), not pnpm.

## Conventions

- **`specs/` here holds executable browser flows.** Each is `NN-name.flow.json`, a
  JSON list of agent-browser commands run in order by `run.ts`, which filters on
  that extension — `specs/flows.md` documents them and is ignored by the runner.
- **Assertions are the waits.** `wait --text` / `wait --url` exit non-zero on
  timeout, and a non-zero exit fails the step and the flow.
- **Deterministic locators only** — `--url`, `--text`, `find role|text|label`.
  Never use agent-browser's AI `chat` command: runs must stay stable and
  key-free.
- Flows target **read-only seeded data** (`acme/payments-api`, PR #482). A flow
  must not depend on state left by another flow.
- `{BASE}` is substituted with `E2E_BASE_URL` (default `http://localhost:3000`).

## Gotchas

- `scripts/e2e.sh` is a **local convenience only**. CI brings up its own stack
  and calls the runner directly — keep the two in sync by hand.
- The hermetic run uses an ephemeral Postgres with no volume, so the seeded demo
  repo is the only repo and the home redirect lands on it.

## Read When

| Document | Read it when |
|----------|--------------|
| [docs/runner.md](docs/runner.md) | debugging the harness or changing how steps execute |
| [specs/flows.md](specs/flows.md) | adding a flow or asking what the suite already covers |
| [README.md](README.md) | you need the flow format or the command reference |
| [INSIGHTS.md](INSIGHTS.md) | before adding or debugging a flow |

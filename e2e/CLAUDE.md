# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows driven by Vercel **agent-browser** (Rust + CDP).
No Playwright, no LLM, no API key.

## Commands

```sh
npm test              # runs the flows against an already-running stack
../scripts/e2e.sh     # hermetic: isolated stack on alternate ports, then run
```

This package uses **npm** (`package-lock.json`), not pnpm.

## Conventions

- **`specs/` here means browser flows, not product specifications.** Each file is
  `NN-name.flow.json`, a JSON list of agent-browser commands executed in order by
  `run.ts`. Product specs for this package do not live here.
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

## Reference (load only when the condition matches)

| Document | Read it when |
|----------|--------------|
| [README.md](README.md) | you need the flow format or the command reference |
| [docs/](docs/) | deeper background on the runner |
| [INSIGHTS.md](INSIGHTS.md) | before adding or debugging a flow |

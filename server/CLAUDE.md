# `@devdigest/api` — Fastify + Postgres

Imports repos and PRs, indexes repos with `repo-intel`, stores agents, and runs
the reviewer. Consumes `@devdigest/reviewer-core` as raw TypeScript source.

## Commands

```sh
pnpm dev                                          # :3001
pnpm db:migrate                                   # required; never runs on boot
pnpm db:seed                                      # idempotent demo data
pnpm exec vitest run --exclude '**/*.it.test.ts'  # unit (hermetic, no Docker)
pnpm exec vitest run .it.test                     # integration (testcontainers)
```

## Conventions

- **Adding a module** = one `modules/<name>/routes.ts` exporting a default
  Fastify plugin + one import and one entry in `modules/index.ts`. Nothing else.
- **Everything goes through the DI container** (`platform/container.ts`): `git`,
  `codeIndex`, `repoIntel`, `depgraph`, `tokenizer`, `priceBook`, `secrets`,
  `auth`, `jobs`, `runBus`. Never construct an adapter inline — tests swap them
  via `adapters/mocks.ts`.
- **Validation is schema-first.** Routes declare Zod `params`/`body` from
  `@devdigest/shared` via `fastify-type-provider-zod`; the same schema also
  serializes the response. Invalid input is rejected with 422 **before** the
  handler. Do not hand-roll `Schema.parse(req.body)` in handlers.
- **Plugins register before modules** so encapsulated module plugins inherit
  helmet, cors, rate-limit, SSE and the shared error handler.
- **Secrets have one read chokepoint**: `LocalSecretsProvider`
  (`adapters/secrets/local.ts`). `GITHUB_TOKEN` is canonical, `GITHUB_PAT` is a
  back-compat fallback. Secrets are not part of `AppConfig`.
- A DB-backed test **must** use the `*.it.test.ts` suffix or the CI split breaks.

## Gotchas

- Stale `running` runs are reaped on boot, and the reap is **awaited** before the
  server listens — this assumes a single API instance per DB.
- `REPO_INTEL_ENABLED` is on by default, but prompt sections only populate once
  the repo is **indexed**. An unindexed repo degrades silently to diff-only.
- `EMBEDDINGS_ENABLED=false` by default guarantees **zero** OpenAI calls.
- Rate limiting is disabled under `NODE_ENV=test` so suites can use `inject()`.

## Do not touch

- `src/vendor/shared/**` — canonical `@devdigest/shared`; changing it requires
  syncing `client/src/vendor/shared`
- `src/db/migrations/**` — drizzle-kit output; add a migration, never edit one

## Reference (load only when the condition matches)

| Document | Read it when |
|----------|--------------|
| [README.md](README.md) | you need the API map, the DI flow diagram, or the env table |
| [docs/](docs/) | deeper background on a server subsystem |
| [specs/](specs/) | you are implementing a new server module for a lesson |
| [INSIGHTS.md](INSIGHTS.md) | before a non-trivial change here |

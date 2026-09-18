# Server architecture — DI, adapters, and the request lifecycle

How `@devdigest/api` is put together. Read this before adding a module, swapping
an adapter, or changing how a route reaches the outside world.

## The shape in one paragraph

`buildApp()` (`src/app.ts`) is the single composition root. It creates the Fastify
instance, wires the Zod type provider, constructs the DI container, registers the
transport plugins and the error handler, then registers every feature module from
a static registry. It is exported rather than hidden behind `server.ts` so tests
can drive the whole app through `app.inject()` without binding a port.

## Order of registration matters

Plugins go on **before** modules. Feature modules are encapsulated Fastify
plugins, and an encapsulated plugin inherits only what was registered before it.
Helmet, CORS, rate limiting, SSE, and the shared error handler are therefore all
installed first; a module registered ahead of them would silently lose them.

Two things happen before the server accepts traffic:

- **Stale-run reaping.** `ReviewService.reapStaleRuns()` marks `agent_runs` rows
  left in `running` by a dead process. It is awaited, not fired-and-forgotten,
  because a fresh process has no in-flight runs of its own — every `running` row
  at that moment is genuinely orphaned. Awaiting also closes the race where a run
  created right after boot could be reaped by a late-finishing async reaper.
  This assumes **one API instance per database**; replicas would need heartbeats.
- **Health endpoints.** `/health` is pure liveness. `/health/ready` pings the DB
  with `select 1` and answers `503` — not `500` — when it fails, so an
  orchestrator reads it as "not ready yet" rather than "crashed".

## The DI container

`platform/container.ts` holds config, the Drizzle handle, and every adapter. It
is decorated onto the Fastify instance, so any route reaches it as
`app.container`. Adapters are **lazily constructed and cached**, and several are
resolved through `SecretsProvider` rather than config.

| Port | Production adapter | Notes |
|------|--------------------|-------|
| `secrets` | `LocalSecretsProvider` | `~/.devdigest/secrets.json` (mode `0600`), `process.env` fallback |
| `auth` | `LocalNoAuthProvider` | single-user local studio |
| `github()` | `OctokitGitHubClient` | **throws `ConfigError` when `GITHUB_TOKEN` is unset** |
| `git` | `SimpleGitClient` | real `git` into `DEVDIGEST_CLONE_DIR` |
| `llm(id)` | OpenAI / Anthropic / OpenRouter | resolved per agent's `provider` |
| `codeIndex` | `RipgrepCodeIndex` | |
| `repoIntel` | `RepoIntelService` | degrades to ripgrep-only when disabled |
| `depgraph` | `DepCruiseGraph` | |
| `tokenizer` | `TiktokenTokenizer` | |
| `priceBook` | `PriceBook` | live OpenRouter prices, 6h TTL, static fallback |
| `jobs` | `JobRunner` | p-queue; clone and re-index run here |
| `runBus` | in-memory bus | fans run events out to SSE |

`ContainerOverrides` lets a test inject any of these. The mocks live in
`src/adapters/mocks.ts` (`MockLLMProvider`, `MockGitHubClient`, `MockGitClient`,
`MockSecretsProvider`, …). **Never construct an adapter inline in a service** —
that is the one thing that makes a code path untestable.

Note the asymmetry: `github()` and `llm()` are `async` because they must resolve
a secret first, while `git`, `tokenizer` and friends are plain getters. A missing
key surfaces as a thrown `ConfigError` at call time, not at boot — the app is
designed to start with no keys at all.

## Request lifecycle

```
HTTP → helmet · cors · rate-limit · SSE
     → route Zod schema (params/body)      ← invalid input stops here with 422
     → module plugin (modules/<name>/routes.ts)
     → service (e.g. ReviewService)
     → container adapters / Drizzle
     → response serialized by the same Zod schema
```

Validation is **schema-first**: routes declare `params`/`body` from
`@devdigest/shared` through `fastify-type-provider-zod`, and the same schema
serializes the response. Handlers do not call `Schema.parse(req.body)` — that
pattern validated input only, left responses unchecked, and duplicated the schema
reference in every route.

The error handler converts failures into one envelope, `{ error: { code, message,
details } }`: schema validation → `422`, `AppError` subclasses → their own status,
a response that fails *its own* serialization schema → a generic `500` with the
real object logged but never leaked.

Rate limiting is global at 120/min, disabled under `NODE_ENV=test` so integration
suites can hammer `inject()`. Expensive routes tighten it locally —
`POST /pulls/:id/review` allows 10/min because one call can fan out to several
LLM runs. SSE and `/health*` are exempt.

## Adding a module

Create `modules/<name>/routes.ts` exporting a default Fastify plugin, then add
one import and one entry to `modules/index.ts`. Registration is **static**, not
filesystem autoload, because a native dynamic `import()` of a `.ts` file does not
behave the same under tsx, vitest, and a bundler.

## Related

- [`../specs/review-flow.md`](../specs/review-flow.md) — the review cycle contract
- [`../README.md`](../README.md) — API map and environment table

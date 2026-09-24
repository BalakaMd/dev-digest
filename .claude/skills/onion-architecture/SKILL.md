---
name: onion-architecture
description: "Enforces Onion Architecture in the DevDigest backend (`server/` and `reviewer-core/`). Use BEFORE writing or reviewing any server-side code: adding or changing a module under `server/src/modules/`, touching a `routes.ts` / `service.ts` / `repository.ts`, adding an adapter or a port, wiring anything into the DI container, writing a Drizzle query, or deciding where a piece of logic belongs. Trigger terms: architecture, layering, dependency rule, ports and adapters, hexagonal, clean architecture, repository pattern, dependency injection, business logic in the route handler, \"where should this code live\"."
metadata:
  tags: architecture, onion, hexagonal, backend, fastify, drizzle, dependency-injection
---

# Onion Architecture — `server/` and `reviewer-core/`

This backend is already onion-shaped: ports in `@devdigest/shared`, adapters in
`server/src/adapters/`, one composition root in `platform/container.ts`, and a
pure core in `reviewer-core`. The shape was never written down, so every session
re-derives it and the drift is visible in the code. This skill is the written
form: what the rings are, who may import whom, and how to tell when a change is
about to cut across them.

## The one rule

> All code can depend on layers more central, but code cannot depend on layers
> further out from the core. — Palermo, 2008

Two consequences that do all the work:

1. **Inner rings declare interfaces; outer rings implement them.** A port lives
   next to the code that *needs* it, not next to the SDK that satisfies it.
2. **Dependencies are given, never fetched.** A ring receives what it needs
   through its constructor. Reaching out for a dependency — importing a concrete
   adapter, or taking the whole `Container` — inverts the arrow and is the
   failure this skill exists to prevent.

## The rings, mapped to this repo

| Ring | What it is | Lives in | May depend on |
|---|---|---|---|
| 1 · Domain core | review engine, pure, no IO | `reviewer-core/src/**` | `zod` only |
| 2 · Contracts & ports | Zod contracts + adapter interfaces | `server/src/vendor/shared/**` | `zod` only |
| 3 · Application | use-case orchestration | `modules/*/service.ts`, `modules/*/run-executor.ts`, `modules/*/pipeline/**` | rings 1–2 |
| 4a · Persistence | SQL, row → contract mapping | `modules/*/repository.ts`, `modules/*/repository/**`, `src/db/**` | rings 1–2, `drizzle-orm` |
| 4b · Adapters | the outside world, behind a port | `src/adapters/**` | rings 1–2, its own SDK |
| 5 · Transport | HTTP, SSE, serialization | `modules/*/routes.ts` | rings 1–3 |
| 6 · Composition root | constructs everything | `src/app.ts`, `src/platform/container.ts` | everything |

`platform/` is mixed on purpose: `container.ts` and `app.ts` are the composition
root, while `errors.ts`, `jobs.ts`, `sse.ts`, `prompt.ts` and friends are
infrastructure that inner rings reach only through the abstractions they export.

The asymmetry worth memorising: **the composition root is the only place allowed
to name a concrete class.** Everything else knows an interface.

## Allowed imports

| File | `drizzle-orm` · `db/schema` | `adapters/**` | `@devdigest/shared` | `platform/container` |
|---|---|---|---|---|
| `modules/*/routes.ts` | ❌ | ❌ | ✅ | ✅ — only to pull a service out |
| `modules/*/service.ts` | ❌ | ❌ — via a port | ✅ | ❌ — take ports in the constructor |
| `modules/*/repository.ts` | ✅ | ❌ | ✅ | ❌ — take `Db` in the constructor |
| `adapters/**` | ❌ | ✅ — its own | ✅ | ❌ |
| `platform/container.ts` | ✅ | ✅ | ✅ | — |
| `reviewer-core/**` | ❌ | ❌ | ❌ — owns its types | ❌ |

A ✅ in the `container` column is narrow: a route may read `app.container` to
construct or fetch its service and nothing else. `container.db` in a route
handler is the single most common violation in this repo.

## Where does this code go?

- Deterministic, no IO, meaningful without a database → **`reviewer-core`**.
- Coordinates several steps, decides *what* happens → **`service.ts`**.
- Speaks SQL → **`repository.ts`**.
- Only makes sense over HTTP (status codes, SSE framing, query strings) →
  **`routes.ts`**.
- Calls something outside this process → **a port in `vendor/shared/adapters.ts`
  plus an adapter in `adapters/<name>/`**.
- Decides *which* implementation is used → **`platform/container.ts`**.

If a piece of logic seems to need two of these, it is two pieces of logic.

## Adding a module

1. `modules/<name>/repository.ts` — a class taking `Db`, returning contract
   types from `@devdigest/shared`, every method scoped by `workspaceId`.
2. `modules/<name>/service.ts` — a class taking its explicit dependencies
   (repository, ports, `runBus`, …). No Fastify types, no SQL.
3. `modules/<name>/routes.ts` — a default-export Fastify plugin: Zod schema,
   `getContext()`, one service call per route.
4. `modules/<name>/{constants,helpers}.ts` for literals and pure transforms.
5. One import plus one entry in `modules/index.ts` — registration is static.

Write `service.ts` even when it is a four-line pass-through. The thin service is
the seam that lets ring 5 stay ignorant of ring 4; skipping it is exactly how
`settings`, `polling`, `workspace` and `pulls` ended up querying Drizzle from
their route handlers.

## Review checklist

Ten yes/no questions for a backend diff. A "no" is a finding, not a preference.

1. Does every new route handler end in a single service call?
2. Is `drizzle-orm` / `db/schema` imported only from a repository file?
3. Does the repository return `@devdigest/shared` types rather than
   `$inferSelect` rows?
4. Does the new service declare its dependencies in its constructor signature
   instead of taking `Container`?
5. Does every call to something outside this process go through a port?
6. Is the new port declared in `vendor/shared/adapters.ts`, implemented in
   `adapters/`, mocked in `adapters/mocks.ts`, and exposed as a lazy getter on
   `Container`?
7. Are `server/src/vendor/shared` and `client/src/vendor/shared` still identical?
8. Is input parsed exactly once, by the route's Zod schema?
9. Does `reviewer-core` still import nothing but `zod` and its own modules?
10. Can the new logic be tested without Postgres? If not, it is in the wrong ring.

## Self-check commands

There is no linter in this repo by design, so these greps are the enforcement.
Run them before claiming a module is clean — trust the output, not the snapshot
below.

```sh
# only a repository may reach the database
rg -n "from '.*db/schema|from 'drizzle-orm" server/src/modules --glob '!**/repository*'

# nothing in a module may name a concrete adapter
rg -n "from '\.\./\.\./adapters" server/src/modules

# services must not take the whole container
rg -n "constructor\(private container: Container" server/src/modules

# the core must stay pure
rg -n "from '(node:|postgres|drizzle|octokit|fastify)" reviewer-core/src
```

Match on the `from '…'` clause rather than a bare word: the loose version fires
on prose in comments, and a self-check that cries wolf stops being run.

## Known deviations

A snapshot taken when this skill was written, kept so nobody "discovers" these
as new bugs. Re-run the commands above before acting on any of it.

- `settings`, `polling`, `workspace` and `pulls` have no `service.ts` or
  `repository.ts`; their `routes.ts` queries `container.db` directly.
- Four more files reach the database from outside a repository:
  `settings/feature-models.ts`, `repos/helpers.ts`, `reviews/run-executor.ts`
  and `reviews/diff-loader.ts`.
- `ReviewService`, `RepoService`, `AgentsService` and `RepoIntelService` take
  `Container` instead of explicit dependencies — service locator, not injection.
- `ReviewRepository` exports Drizzle row types (`FindingRow`, `PullRow`,
  `$inferSelect`) across the ring boundary.
- `reviews/diff-loader.ts` and `repo-intel/service.ts` import adapters
  (`git/diff-parser`, `astgrep`, `codeindex`) directly rather than via a port.

Do not "fix" these opportunistically in an unrelated change. Match the pattern
of the ring you are in, leave the deviation, and mention it.

## Deeper reading

| File | Read it when |
|---|---|
| [rules/layers.md](rules/layers.md) | you are unsure which ring a file belongs to |
| [rules/fastify.md](rules/fastify.md) | writing or reviewing a `routes.ts` |
| [rules/drizzle.md](rules/drizzle.md) | writing a query, a repository, or a transaction |
| [rules/ports-di.md](rules/ports-di.md) | adding an adapter, a port, or a service constructor |
| [rules/zod-contracts.md](rules/zod-contracts.md) | changing a request/response shape or a shared contract |
| [rules/testing.md](rules/testing.md) | deciding what kind of test a change needs |
| [examples.md](examples.md) | you want the good/bad pair from this codebase |
| [references.md](references.md) | you need the source behind a rule |

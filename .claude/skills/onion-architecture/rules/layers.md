# Rings, in detail

The ring table in `SKILL.md` is the summary. This file is for the cases where
the summary does not settle the argument.

## Ring 1 — the domain core (`reviewer-core/src`)

The review engine: prompt assembly, structured output, citation grounding, the
reduce step, `reviewPullRequest`. It has no database, no filesystem, no GitHub,
no Fastify. Its single side effect is an **injected** `LLMProvider`.

This purity is the reason the same engine runs both in the API process and in
the CI runner. Anything you add here must survive being called from a unit test
with no Docker, no network and no environment variables.

`server` consumes it as **raw TypeScript source** through a tsconfig path alias;
`reviewer-core` never emits JS. So an import from `reviewer-core` into `server`
is free, and an import in the other direction is impossible by construction —
which is the dependency rule enforced by the build rather than by discipline.

## Ring 2 — contracts and ports (`server/src/vendor/shared`)

Two different things share this folder:

- `contracts/*.ts` — Zod schemas and inferred types that cross package
  boundaries (`Review`, `Finding`, `PrDetail`, `RunTrace`, `Settings`, …).
  These are the vocabulary every other ring speaks.
- `adapters.ts` — the **ports**: `LLMProvider`, `GitHubClient`, `GitClient`,
  `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`. The file says it
  itself: all external calls go behind these interfaces.

A port belongs here because inner rings need it. It is not "the octokit
interface" — it is "what the application needs from a forge", which happens to
be satisfied by octokit today.

`client/src/vendor/shared` is a copy. The canonical file is the server's; both
change in the same commit.

## Ring 3 — application services (`modules/*/service.ts`)

A service answers *what happens*, in domain terms, for one use case. It:

- receives already-parsed input and a `workspaceId`;
- calls repositories and ports;
- decides order, branching, and failure handling;
- returns contract types.

It must not: import Fastify types, build a URL, format an HTTP status, write
SQL, or construct an adapter.

`run-executor.ts` and `pipeline/**` are the same ring — a long use case split
for readability, not a new layer.

## Ring 4a — persistence (`modules/*/repository.ts`, `src/db`)

See [drizzle.md](drizzle.md). The short version: this is the only ring that
knows the database exists, and `src/db/schema` is its private vocabulary.

## Ring 4b — adapters (`src/adapters/**`)

One folder per external concern, each implementing a port. An adapter translates
between the SDK's vocabulary and ours, and holds the ugliness (retries,
pagination, rate-limit handling, SDK-specific error shapes) so the rings inside
never see it.

Adapters do not import each other, with one exception the code already relies
on: an adapter may *compose* a port it receives — `RipgrepCodeIndex` takes a
`GitClient`. That is still inward-facing: it depends on the interface.

Every adapter has a mock next to it in `adapters/mocks.ts`. If a new adapter is
hard to mock, the port is shaped wrong.

## Ring 5 — transport (`modules/*/routes.ts`)

See [fastify.md](fastify.md).

## Ring 6 — the composition root (`app.ts`, `platform/container.ts`)

`buildApp()` creates the Fastify instance, wires plugins in order, builds the
`Container`, and registers the module registry. `Container` lazily constructs
every adapter and caches it, resolving secrets on the way.

Two properties matter and are easy to break:

- **Overridable.** `ContainerOverrides` is how every test swaps an adapter. An
  adapter constructed anywhere else is an adapter no test can replace.
- **Lazy and failing late.** The app boots with no API keys at all; a missing key
  surfaces as a `ConfigError` when that adapter is first resolved, not at boot.
  Keep that property when adding a getter.

## Deciding, when it is genuinely unclear

Ask which ring would have to change if the given external fact changed:

| If this changed… | …the change belongs in |
|---|---|
| the HTTP shape of a request | ring 5 (and ring 2 if the contract moved) |
| the table layout | ring 4a only |
| the LLM vendor | ring 4b only |
| the order of steps in a review | ring 3 |
| what counts as a grounded finding | ring 1 |

If a single change forces edits in rings 1 and 4 at once, a concept is leaking:
usually an infrastructure type used as a domain type.

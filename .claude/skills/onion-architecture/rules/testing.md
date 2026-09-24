# One kind of test per ring

The test pyramid here is not about counts — it is a consequence of the rings.
Where a behaviour can be tested tells you which ring it is really in.

| Ring | Test | Needs |
|---|---|---|
| 1 · core (`reviewer-core`) | plain unit, no mocks beyond a stub `LLMProvider` | nothing |
| 2 · contracts | schema round-trip, if anything | nothing |
| 3 · services | unit with `ContainerOverrides` + `adapters/mocks.ts` | nothing |
| 4a · repositories | `*.it.test.ts` | Postgres via testcontainers |
| 4b · adapters | `*.it.test.ts`, or unit against a stubbed SDK | depends |
| 5 · transport | `*.it.test.ts` through `app.inject()` | Postgres |

## The diagnostic

**If testing a piece of logic requires Postgres, that logic is in the wrong
ring.** A branch that decides *what* should happen belongs in a service, where a
mock is enough; a query belongs in a repository, where the database is the point.
This is the practical payoff of the whole architecture — if a change makes tests
need more infrastructure than before, it moved logic outward.

## Mechanics

- A DB-backed test **must** end in `*.it.test.ts`. CI splits on that suffix, so
  the wrong name silently changes which job runs it.
- Unit suite: `pnpm exec vitest run --exclude '**/*.it.test.ts'` — hermetic, no
  Docker.
- Integration suite: `pnpm exec vitest run .it.test`.
- `buildApp()` is exported so tests drive the whole app through `app.inject()`
  without binding a port.
- Rate limiting is disabled under `NODE_ENV=test`, which is why `inject()` loops
  do not trip it.

## Injecting, not patching

Swap adapters through `ContainerOverrides`:

```ts
const container = new Container(config, db, {
  github: new MockGitHubClient(...),
  llm: { openrouter: new MockLLMProvider(...) },
});
```

Module mocking (`vi.mock` on an adapter path) is the smell that something
constructs its dependency inline instead of receiving it. Fix the construction;
do not reach for the patch.

## Testing the core

`reviewer-core` tests take a stub `LLMProvider` and assert on prompt assembly,
grounding and reduction. No network, no database, no environment. Keep it that
way: a test there that needs a fixture repository on disk means IO crept into
ring 1.

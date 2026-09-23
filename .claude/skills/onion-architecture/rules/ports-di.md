# Ports, adapters and injection

The dependency rule survives or dies here. Everything else is bookkeeping.

## Adding an external dependency

Five steps, in this order:

1. **Declare the port** in `server/src/vendor/shared/adapters.ts` — the
   interface the application needs, in the application's words. Not the SDK's
   surface; the subset we actually use, named after the capability.
2. **Copy the contract** to `client/src/vendor/shared/adapters.ts` in the same
   commit if the client sees it.
3. **Implement the adapter** in `server/src/adapters/<name>/`. This is the only
   file allowed to import the SDK. Retries, pagination, SDK error shapes and
   vendor quirks stop here.
4. **Write the mock** in `server/src/adapters/mocks.ts`, next to
   `MockLLMProvider`, `MockGitHubClient`, `MockGitClient`, `MockCodeIndex`,
   `MockSecretsProvider`, `MockAuthProvider`.
5. **Expose it on `Container`** as a lazy, cached getter, plus a field on
   `ContainerOverrides` so tests can inject the mock.

If step 4 is hard, the port is shaped after the SDK rather than after the need.
Reshape the port; do not write a cleverer mock.

## Sync vs async getters on the container

Deliberate asymmetry, worth preserving: getters that need a secret are `async`
(`github()`, `llm(id)`, `embedder()`); the rest are plain getters (`git`,
`codeIndex`, `tokenizer`, `depgraph`). The app is designed to boot with no keys
at all, so a missing key must surface as a `ConfigError` at first use, not at
startup.

Adapters are cached. `invalidateSecretCaches()` exists because a new key saved
through `SecretsProvider.set` has to reach the next resolve — call it after
persisting a secret.

## Injection, not location

New services declare what they need:

```ts
export class ReviewService {
  constructor(private deps: {
    repo: ReviewRepository;
    agents: AgentsRepository;
    llm: (id: Provider) => Promise<LLMProvider>;
    bus: RunBus;
  }) {}
}
```

not:

```ts
export class ReviewService {
  constructor(private container: Container) {}   // service locator
}
```

The difference is not style. With the first signature, the compiler tells you
what a class needs and a reader sees its whole surface; with the second, the
dependency list is whatever the body happens to touch, and a missing wiring is a
runtime failure. That is the standard argument against Service Locator
(Seemann), and it is why the composition root exists at all: one place that
knows concrete classes, so nothing else has to.

`ReviewService`, `RepoService` and `RepoIntelService` currently take `Container`.
That is acknowledged debt, not the pattern. New services take explicit deps; a
service being substantially rewritten for other reasons may be converted, and
the conversion stays in its own commit.

## Ports the code already owns

`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`,
`SecretsProvider`, `AuthProvider`, plus two narrower local ones: `DepGraph`
(`adapters/depgraph`) and `Tokenizer` (`adapters/tokenizer`), and the `RepoIntel`
facade in `modules/repo-intel/types.ts`.

`RepoIntel` is worth noting: a facade over a whole subsystem, injectable like any
other port, so features that depend on repository intelligence can be tested
without indexing anything. Reach for the same shape when a module grows a
subsystem of its own.

## Secrets

One read chokepoint: `LocalSecretsProvider` (`~/.devdigest/secrets.json`, mode
`0600`, `process.env` as fallback). Secrets are not part of `AppConfig`, never
live in the database or in git, and are resolved through the port like any other
external dependency.

## Reference

- Service Locator is an Anti-Pattern: <https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/>
- Composition Root: <https://blog.ploeh.dk/2011/07/28/CompositionRoot/>

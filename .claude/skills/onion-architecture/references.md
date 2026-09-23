# References

Sources behind the rules in this skill. Grouped by what they justify.

## Onion and ports & adapters — first sources

- [The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
  — Jeffrey Palermo, 2008. The original statement of the dependency rule: all
  coupling points toward the centre.
- [Part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/)
  — interfaces are declared by the core, implemented on the outside. This is why
  our ports live in `vendor/shared/adapters.ts` and not next to the SDKs.
- [Part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/)
  — what the layout looks like in practice.
- [Part 4: after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/)
  — which parts held up in long-lived systems, from the author.
- [Hexagonal Architecture (the original 2005 article)](https://alistair.cockburn.us/hexagonal-architecture/)
  — Alistair Cockburn. "Allow an application to equally be driven by users,
  programs, automated test or batch scripts" — the reason a route handler may
  not hold logic.
- [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
  — Robert C. Martin. The same rule, a different drawing; useful when someone
  arrives with Clean Architecture vocabulary.
- [Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/)
  — a critical reading of the ring model and where it is over-applied.
- [Sliced Onion Architecture](https://odrotbohm.github.io/2023/07/sliced-onion-architecture/)
  — Oliver Drotbohm on vertical slices beating horizontal layers. This is the
  argument for our `modules/<name>/` layout over a global `services/` folder.

## Patterns this skill leans on

- [Repository](https://martinfowler.com/eaaCatalog/repository.html)
  — Martin Fowler's catalogue entry; the canonical definition.
- [The Repository pattern, at length](https://www.cosmicpython.com/book/chapter_02_repository.html)
  — Percival & Gregory. Why a repository returns domain objects rather than rows.
- [Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/)
  — Mark Seemann. The argument against `constructor(container)`: hidden
  dependencies turn compile-time errors into runtime ones.
- [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
  — Mark Seemann. Why construction belongs in exactly one place — our
  `platform/container.ts` plus `app.ts`.
- [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)
  — Martin Fowler. The failure mode on the other side: rings kept so thin that
  services degrade into transaction scripts.
- [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
  — Alexis King. The formal reason Zod runs once, at the boundary.
- [Organizing App Logic with the Clean Architecture](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/)
  — Khalil Stemmler. Six kinds of application logic and where each belongs, in
  TypeScript rather than C#.
- [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
  — transaction boundaries and repository granularity in a TypeScript codebase.

## Our stack, specifically

- [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
  and [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)
  — plugin encapsulation is the mechanism that makes a module a boundary, and
  the reason registration order matters.
- [Fastify — Errors](https://fastify.dev/docs/latest/Reference/Errors/)
  — background for the single error envelope produced by our error handler.
- [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions)
  and [Relational queries](https://orm.drizzle.team/docs/rqb)
  — transaction ownership and query shape inside the repository ring.
- [Zod](https://zod.dev/) — schemas as the boundary contract.

## If we ever automate enforcement

Not wired up today; this skill is advisory. `dependency-cruiser` is already a
dependency of `server` (used by the repo-intel indexer), so the rules could be
expressed as a config and run from a vitest test — CI here runs typecheck and
tests only, and there is no linter by design.

- [dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
  and [CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md)
  — `forbidden` rules with `from` / `to` path patterns, plus baselines for
  existing violations.
- [Taking Frontend Architecture Serious With Dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)
  — what a layer rule looks like in a real config.

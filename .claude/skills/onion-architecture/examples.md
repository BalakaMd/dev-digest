# Good and bad, from this codebase

Real pairs, not invented ones. Paths are relative to the repository root.

## 1 · A route that queries the database

**Bad** — `server/src/modules/pulls/routes.ts`. The handler resolves a repo with
Drizzle, calls GitHub, upserts rows, and decides the offline-degradation policy,
all inside the transport ring:

```ts
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db
    .select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  let gh = null;
  try { gh = await container.github(); } catch { /* serve persisted PRs */ }
  if (gh) { /* fetch, then insert each PR */ }
  // …
});
```

None of this is reachable from a job, a CLI or a unit test. The "local-first"
rule — sync when a token exists, never fail the read — is a product decision
living in an HTTP handler.

**Good** — `server/src/modules/reviews/routes.ts`. Same amount of work behind
the scenes, none of it here:

```ts
app.post('/pulls/:id/review', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const body = RunRequest.parse(req.body ?? {});
  const targets = await service.resolveTargets(workspaceId, body);
  const { runs, reviews } = await service.runReview(workspaceId, req.params.id, targets, req.log);
  return { pr_id: req.params.id, runs, reviews };
});
```

## 2 · Repository shape

**Good** — `server/src/modules/reviews/repository.ts` takes `Db`, is the only
review-domain file touching the database, and splits by aggregate behind one
facade:

```ts
export class ReviewRepository {
  constructor(private db: Db) {}
  getPull(workspaceId: string, prId: string) { return pullRepo.getPull(this.db, workspaceId, prId); }
}
```

**Bad, in the same file** — the row types escape the ring:

```ts
export type ReviewRow = typeof t.reviews.$inferSelect;
export type { FindingRow, PullRow };
```

Services and helpers now depend on the table layout. The fix is to map to
`Finding` / `PrDetail` from `@devdigest/shared` inside the repository, so a
column rename stops at ring 4.

## 3 · Service construction

**Bad** — `server/src/modules/reviews/service.ts`:

```ts
export class ReviewService {
  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
  }
}
```

The signature says "this class needs everything". A reader cannot tell what it
actually touches, and a missing wiring fails at runtime.

**Good** — what a new service looks like:

```ts
export class SkillsService {
  constructor(private deps: { repo: SkillsRepository; llm: LLMProvider }) {}
}
```

Constructed in the route plugin from the container, which is the one place
allowed to know the concrete classes.

## 4 · Reaching past a port

**Bad** — `server/src/modules/reviews/diff-loader.ts`:

```ts
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
```

A ring-3 file naming a ring-4b implementation. Two ways out, both fine:
`parseUnifiedDiff` is pure, so it can move into the module (or into
`reviewer-core`); or diff parsing becomes part of the `GitClient` port.

**Good** — `server/src/adapters/codeindex/ripgrep.ts` receives a `GitClient`
rather than importing `SimpleGitClient`. It composes an interface, so the
dependency still points inward.

## 5 · A pure helper that belongs in the core

**Good** — `reviewer-core/src/grounding.ts` decides whether a finding is
supported by the diff. No database, no HTTP, no config; it runs identically in
the API process and in the CI runner, and its tests need nothing but the module.

That is the test for ring 1: could this function be published as a library
tomorrow without dragging anything with it?

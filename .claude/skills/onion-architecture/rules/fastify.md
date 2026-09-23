# Transport ring — `modules/*/routes.ts`

Fastify is a delivery mechanism. The application must not be able to tell
whether it was invoked over HTTP, from a job, or from a test.

## What a handler is allowed to do

Exactly four things:

1. resolve tenancy — `const { workspaceId } = await getContext(container, req)`;
2. declare its Zod schema (`params` / `body` / `response`) in the route options;
3. call **one** service method;
4. return the result, or throw an `AppError` subclass.

```ts
app.post('/pulls/:id/review', { schema: { params: IdParams, body: RunRequest } },
  async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.runReview(workspaceId, req.params.id, req.body);
  });
```

Everything that is not one of those four things is a different ring wearing a
route handler as a costume.

## Hard rules

- **No `container.db` in a route.** No `drizzle-orm` import, no `db/schema`
  import. If a route needs data, it needs a repository, which means it needs a
  service.
- **No business branching.** `if (repo.status !== 'ready') throw …` is a domain
  decision; it belongs in the service, where a job or a test can reach it too.
- **One service call per route.** Two calls in a handler means the orchestration
  between them is untested and unreachable from anywhere but HTTP. Add a service
  method that does both.
- **Errors are domain errors.** Throw `NotFoundError`, `ValidationError`,
  `ExternalServiceError` or `ConfigError` from `platform/errors.ts`. The
  centralised error handler maps them to status codes and to the single
  `{ error: { code, message, details } }` envelope. A handler that writes
  `reply.code(404)` has duplicated that mapping.
- **Build the service once**, at plugin registration, not per request:
  `const service = new ReviewService(container)` at the top of the plugin.
- **SSE is still transport.** Bridging `runBus` to an event stream belongs in
  the route; deciding *what* events exist belongs in the service.

## Encapsulation is the module boundary

Each module is an encapsulated Fastify plugin and inherits only what was
registered before it. That is why `app.ts` registers helmet, CORS, rate limit,
SSE and the error handler **before** the module registry — a module registered
earlier would silently lose all of them. Registration is static in
`modules/index.ts` because a native dynamic `import()` of a `.ts` file does not
behave the same under tsx, vitest and a bundler.

Decorators (`app.container`) are the sanctioned way for a module to reach shared
infrastructure. A module importing another module's internals is a ring
violation in the horizontal direction: go through the shared repository exposed
on `Container` (`container.agentsRepo`, `container.reviewRepo`) instead.

See `server/docs/architecture.md` for the full registration order and request
lifecycle; this file does not duplicate it.

## Route-level configuration that is genuinely transport

Rate limits, `config: { rateLimit: false }` for SSE, and cache headers are
transport concerns and belong in the route options — for example the tighter
10/min on `POST /pulls/:id/review`, because one call fans out to several LLM
runs. That is a statement about HTTP traffic, not about reviews.

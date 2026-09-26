---
name: deprecation-policy
description: When a PR removes or replaces a public route, field or export, require that it was deprecated first — marked, announced, and kept working for the agreed window — before it disappears.
type: convention
---

## Deprecate first, remove later

A public route, field, parameter, or export is never removed in the same change
that replaces it. The rule has two phases.

**Phase 1: deprecate.** This ships in a minor release, and everything keeps
working:
1. Keep the old thing working, alongside its replacement.
2. Mark it where consumers will see it:
   - `@deprecated` JSDoc naming the replacement;
   - `deprecated: true` in the OpenAPI or Zod schema description;
   - a `Deprecation` / `Sunset` response header on a deprecated route.
3. Add a changelog entry that states the replacement and the planned removal
   version or date.
4. Optionally, log or count calls to the old path, so removal can be timed on
   real usage.

**Phase 2: remove.** This ships in the next major release, after the window:
- Delete the old thing, and add a **BREAKING** changelog entry that points back
  to the deprecation notice.

Report as **CRITICAL**: a public surface removed or renamed without a prior
deprecation in the codebase or changelog.

Report as **WARNING**:
- A deprecation that names no replacement.
- A deprecation with no removal target.
- A replacement added while the old path silently changes behaviour instead of
  staying identical.

### Bad — replaced and removed in one step

```diff
-app.get('/v1/invoices', listInvoices);
+app.get('/v1/billing/invoices', listInvoices);
```

Every existing integration starts getting 404s the moment this deploys.

### Good — both paths live, and the old one says it is going away

```ts
app.get('/v1/billing/invoices', listInvoices);

/** @deprecated Use GET /v1/billing/invoices. Removed in v2 (2026-12-01). */
app.get('/v1/invoices', async (req, reply) => {
  reply.header('Deprecation', 'true').header('Sunset', 'Tue, 01 Dec 2026 00:00:00 GMT');
  return listInvoices(req, reply);
});
```

### Good — a deprecated field kept, and documented, next to its replacement

```ts
export const Invoice = z.object({
  total_cents: z.number().int(),
  /** @deprecated Use `total_cents`. Removed in v2. */
  total: z.number().describe('DEPRECATED — use total_cents'),
});
```

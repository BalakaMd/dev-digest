---
name: breaking-change
description: When the diff touches a public route, schema or exported type, decide whether an unchanged existing caller still works, and report every change where it does not as CRITICAL.
type: rubric
---

## Would an unchanged caller still work?

Apply this test to every change on a public surface: HTTP routes, request and
response schemas, shared contract packages, exported SDK types, event payloads.
A change is **breaking** when a caller written against the previous version, and
not modified, now fails, misreads data, or silently changes behaviour.

Report each breaking change as **CRITICAL** and name:

1. **The surface.** The route, schema, or type, and the exact field.
2. **The caller that breaks.** Name it when it is in the repo; otherwise say "any
   external client".
3. **The compatible alternative.** For example: add the new field alongside the
   old one, make the new input optional with a default, or ship it as a new route
   or version.

Always breaking:
- A request or response field is removed or renamed, including a casing change
  (`created_at` → `createdAt`).
- A request field is added as required, or an optional field becomes required.
- Input is narrowed: a smaller enum, a stricter regex, a lower max length, a type
  that is no longer accepted.
- A response field changes type, becomes nullable, or becomes optional.
- A status code, error code, or error body shape changes.
- A path, HTTP method, query parameter name, or positional argument order changes.

Not breaking (do not report these as CRITICAL):
- An optional input with a default is added.
- A response field is added. The exception is a consumer that rejects unknown
  keys; check for one before deciding.
- Validation is loosened.

### Bad — a required field added to an existing endpoint

```diff
 const CreatePayment = z.object({
   amount: z.number().int().positive(),
+  currency: z.string().length(3),
 });
```

Every existing client that sends `{ amount }` now gets a 422. The diff looks like
a small feature, but it is a breaking change.

### Good — the same capability, added compatibly

```ts
const CreatePayment = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('USD'),
});
```

Old clients keep working, and new clients can send `currency`.

### Bad — a rename presented as a cleanup

```diff
-return { id: p.id, created_at: p.createdAt };
+return { id: p.id, createdAt: p.createdAt };
```

Consumers that read `created_at` now get `undefined`, and no build fails. Report
it, and suggest returning both keys for one deprecation window.

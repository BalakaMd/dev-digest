---
name: response-schema
description: When a route handler is added or changed, require a declared response schema and check that what the handler returns matches it exactly — no undeclared fields, no missing ones, no untyped `any`.
type: convention
---

## Every response is declared, and the handler honours the declaration

For each route the diff adds or changes:

1. **A response schema exists.** The route declares its success response, and
   each error response it can return, as a schema. Examples: a Zod schema in the
   route options, or an OpenAPI `responses` entry. A new route without one is a
   WARNING. A changed route without one is a WARNING that names the fields that
   changed.
2. **The returned value matches the schema.** Compare the object the handler
   builds with the declared shape:
   - An extra field leaks internal data, or is silently stripped.
   - A missing field breaks the consumer.
   - A field with the wrong type (for example, a `Date` object where the schema
     says ISO string) breaks the consumer in production but not in tests.
3. **The response is built from a DTO, not a raw row.** A handler that returns a
   database row, an ORM entity or `any` couples the contract to storage, so the
   next migration becomes an API change. The response is a mapped DTO object
   instead.
4. **Errors use the shared error envelope.** Errors are thrown as the app's typed
   errors, not built as ad-hoc `{ message }` objects that each route shapes
   differently.

Report the route, the field, and both sides of any disagreement.

### Bad — the raw row goes out, and the schema says otherwise

```ts
app.get('/users/:id', { schema: { response: { 200: UserDto } } }, async (req) => {
  return db.users.findById(req.params.id); // includes password_hash, deleted_at
});
```

Depending on the serializer, `password_hash` either leaks or is stripped by luck.
Either way, the contract now depends on the table layout.

### Good — a mapped DTO that matches the declared schema

```ts
app.get('/users/:id', { schema: { response: { 200: UserDto } } }, async (req) => {
  const row = await users.get(req.params.id);
  if (!row) throw new NotFoundError('User not found');
  return toUserDto(row); // { id, name, created_at: row.createdAt.toISOString() }
});
```

### Bad — a new route that declares nothing

```ts
app.post('/refunds', async (req) => ({ ok: true, refund }));
```

No request schema and no response schema means no validation, no documentation,
and nothing a client can generate types from.

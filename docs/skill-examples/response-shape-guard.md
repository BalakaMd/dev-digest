---
name: response-shape-guard
description: When a handler changes what it returns, check the declared schema and every copy of the contract agree with it.
type: convention
---

## The handler and the contract must agree

For each route the diff touches:

1. Compare what the handler actually returns against the response schema it
   declares. Extra fields that no schema mentions leak; missing fields break the
   consumer. A route with NO declared response schema and a changed return shape
   is itself worth a finding.
2. Check the DTO mapping. A row→DTO function that gained a field, dropped one, or
   changed a null default changes the wire contract even when the route did not.
3. Check every copy of the contract. When a schema is duplicated across packages,
   a change to one copy leaves the other stale — producer and consumer now
   disagree, and nothing will fail at build time.

Report the specific field, both sides of the disagreement, and which one is
wrong.

### Bad — the handler and its declared schema drift apart

```ts
// route declares: response: { 200: z.object({ id: z.string(), score: z.number() }) }
return { id: row.id, score: row.score, internalNotes: row.notes };
```

`internalNotes` is either stripped silently or leaks, depending on whether the
serializer is active. Neither is what the author intended, and no test says so.

### Good — one shape, declared and returned

```ts
// response: { 200: ReviewDto }
return ReviewDto.parse({ id: row.id, score: row.score });
```

### Bad — a DTO mapper changing the wire contract with no route change

```diff
 export function toRepoDto(row: RepoRow): Repo {
-  return { id: row.id, full_name: row.fullName, clone_path: row.clonePath };
+  return { id: row.id, full_name: row.fullName };
 }
```

The route is untouched, so the diff reads as internal — but `clone_path` just
disappeared from every response. Report it as a response change, not a refactor.

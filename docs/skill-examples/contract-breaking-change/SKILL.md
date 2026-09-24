---
name: contract-breaking-change
description: When the diff changes a route signature, request/response shape or status code, classify it as breaking or compatible.
type: rubric
---

## Breaking vs compatible

Classify every change to a public surface. BREAKING means an existing caller,
written against the previous version and unchanged, stops working.

**Breaking — report as CRITICAL**
- Removing or renaming a request or response field.
- Adding a required request field, or making an optional one required.
- Narrowing a type, enum, or validation rule on input.
- Changing a response field's type or making a non-null field nullable.
- Changing a status code, error code, or error body shape.
- Changing a route path, method, or parameter name/order.
- Removing a default that callers relied on, or changing what it means.

**Compatible — do not report as breaking**
- Adding an optional request field with a default.
- Adding a response field (unless the consumer validates strictly and rejects
  unknown keys — check whether it does before deciding).
- Loosening input validation.

For every breaking change, name the caller that breaks and give the compatible
alternative: a new optional field, a new route/version, or a deprecation window.

### Bad — a rename, dressed as a cleanup

```diff
 export const Repo = z.object({
   id: z.string(),
-  full_name: z.string(),
+  fullName: z.string(),
 });
```

Every consumer reading `full_name` now reads `undefined`. Nothing fails at build
time on the other side of the wire. CRITICAL.

### Good — additive, with the old field kept until callers move

```diff
 export const Repo = z.object({
   id: z.string(),
-  full_name: z.string(),
+  /** @deprecated use fullName; removed in v3 */
+  full_name: z.string(),
+  fullName: z.string(),
 });
```

Both shapes ship, old callers keep working, and the removal is a separate,
announced change.

---
name: semver-discipline
description: When a PR changes a published API or package surface, check that the version bump and changelog match the kind of change — major for breaking, minor for additive, patch for fixes only.
type: rubric
---

## The version number tells the truth about the change

Apply this when the diff changes something other people consume: a published
package, an SDK, an API with a version in its path or header, or a shared
contract module. Classify the change first, then check the bump:

| Change | Required bump |
|--------|---------------|
| Anything breaking (see `breaking-change`): a removed or renamed field, a new required input, a narrowed type, a changed status code | **MAJOR** |
| A new route, a new optional field, a new export, or a new enum value that output may contain | **MINOR** |
| A bug fix, a performance change or an internal refactor, with the same inputs and outputs | **PATCH** |

Report as **CRITICAL**:
- A breaking change shipped under a minor or patch bump. Consumers on `^x.y.z`
  receive it automatically.
- A version bump in one place only. Examples: `package.json` without the
  exported `VERSION` constant, or the OpenAPI `info.version` without the
  `/v2/` route prefix.

Report as **WARNING**:
- The public surface changed but the version was not bumped.
- No changelog entry was added. Or it exists, but it hides a breaking change
  under "Changed" without a **BREAKING** marker and a migration note.
- A pre-1.0 package uses `0.x` minors to hide breaking changes it never
  announces.

### Bad — a breaking rename under a patch bump

```diff
-  "version": "2.4.1",
+  "version": "2.4.2",
```
```diff
-export function createClient(opts: { apiKey: string }) {
+export function createClient(opts: { token: string }) {
```

Every consumer on `^2.4.1` upgrades on their next install, and their code stops
compiling.

### Good — major bump, marked and explained

```diff
-  "version": "2.4.1",
+  "version": "3.0.0",
```
```md
## 3.0.0
### BREAKING
- `createClient({ apiKey })` → `createClient({ token })`. Rename the option; the value is unchanged.
```

### Good — an additive change stays minor

```diff
-  "version": "2.4.1",
+  "version": "2.5.0",
```
```ts
export function createClient(opts: { apiKey: string; timeoutMs?: number }) {
```

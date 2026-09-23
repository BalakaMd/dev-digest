# Constants, config and tokens

"Where do constants go?" is four different questions wearing one name. Answer the
right one.

## The four kinds

| Kind | Example | Where it goes |
|------|---------|---------------|
| Local magic value | `const MAX_VISIBLE_ROWS = 50` | Top of the file that uses it |
| Domain enum / union | finding severities, run statuses | With the entity, ideally derived from the shared contract |
| Runtime config / env | API base URL, feature flags, timeouts | One config module — the only reader of `process.env` |
| Design token | colours, spacing, radii, font sizes | The theme / CSS layer, not a TypeScript file |

Almost every "constants folder" problem is two of these four being mixed.

## Local magic values

A number or string used in exactly one file becomes a named `const` at the top of
that file. The point is the name, not the location: `MAX_VISIBLE_ROWS` explains
what `50` means, and keeping it next to its only use means the reader sees both
at once.

Do not promote it just because it is `UPPER_SNAKE_CASE`. Uppercase does not imply
global.

## Domain enums and unions

Values that describe a domain object — statuses, severities, kinds, roles — belong
with that object, not in a general constants file. They are part of the entity's
contract, and they change when the entity changes.

Prefer deriving them from a single source rather than restating them:

```ts
// The contract is the source of truth; the UI list is derived from it.
export const SEVERITIES = ['info', 'minor', 'major', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
```

When a validation schema already describes the value, derive the type and the
list from the schema rather than maintaining a parallel copy. Two hand-maintained
lists of the same enum will diverge; the question is only when.

If the values cross a package boundary (client and server both know them), they
belong in the shared contract module, and both sides import from there.

## Runtime config and environment variables

Collect configuration into **one module**, and make it the only place that reads
`process.env`. Everything else imports named values from it.

This buys three things: a single place to validate and fail fast at startup; a
single place to see what the app is configurable by; and a hard boundary that
stops secrets from leaking into modules that get bundled for the browser.

```ts
// config/env.ts — the only file that touches process.env
export const API_BASE = required('NEXT_PUBLIC_API_BASE');
export const REQUEST_TIMEOUT_MS = 15_000;
```

In Next.js only `NEXT_PUBLIC_`-prefixed variables reach the client; everything
else is replaced with an empty string in client bundles. Treat that as a
guardrail, not a design: keep server config in server-only modules so an
accidental import fails at build time rather than silently producing `undefined`.

Secrets never live in the repository, in the database, or in client-readable
config. Where this repo keeps them is documented in the root `CLAUDE.md`.

## Design tokens

Colours, spacing, radii, typography and shadows belong to the theme layer — CSS
custom properties or the styling framework's token configuration — not to a
TypeScript constants file.

The reason is that tokens have to work in places JavaScript does not run: static
CSS, pre-paint theme scripts, media queries, print styles. A token defined in TS
and a token defined in CSS will drift, and the drift shows up as a dark-mode bug.

Export a TS constant only when JavaScript genuinely needs the value (a chart
library that takes a colour string, for example), and derive it from the token
rather than hard-coding a second copy.

## User-facing strings

Strings people read are content, not constants. In an internationalised app they
live in the message catalogue, keyed by feature namespace, and components
reference them by key.

A literal string in a component is a missing translation waiting to be found in
production. This applies to `aria-label`s, placeholders, empty states and error
messages, not just headings.

Strings people do *not* read — query keys, event names, storage keys, route
segments — are code. Those follow the rules above.

## Query keys and other structured identifiers

Cache keys, analytics event names and storage keys are worth a small factory
beside the data layer that owns them:

```ts
export const pullKeys = {
  all: ['pulls'] as const,
  byRepo: (repoId: string) => ['pulls', repoId] as const,
};
```

The value is that invalidation and reading use the same construction, so a
renamed key cannot half-update. Inline string arrays scattered across mutations
are how caches quietly stop invalidating.

## Why a global `constants/` folder decays

A top-level `constants/index.ts` attracts everything that has no obvious home:
domain enums, UI copy, colours, timeouts, regexes, a couple of URLs. It ends up
imported by every module in the app, which makes it both a change-amplifier and a
dependency-cycle magnet, and reading it tells you nothing about any feature.

If a value has no obvious home, that is a signal about the missing boundary, not
a reason to create a bucket. Name the feature or entity it belongs to, and put it
there.

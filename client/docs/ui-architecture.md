# UI architecture — boundaries, data flow, and file layout

How `@devdigest/web` is organised. Read this before adding a screen, moving
state, or touching the data layer.

## The Server/Client boundary

Next.js 15 App Router. The boundary here is deliberately **high**: the root
layout is a Server Component, and most `page.tsx` files opt into
`"use client"` at the top.

| Route | Component kind |
|-------|----------------|
| `layout.tsx` | Server |
| `/` | Client |
| `/onboarding` | Client |
| `/repos/[repoId]/pulls` | Client |
| `/repos/[repoId]/pulls/[number]` | Client |
| `/agents/[id]` | Client |
| `/agents` | Server (delegates to a client view) |
| `/settings/[section]` | Server (delegates to a client view) |

This is not an accident, and it is not the shape a Next.js tutorial would
suggest. Every screen is driven by TanStack Query against a **separate** Fastify
origin, with client-side filters, live SSE run logs, and optimistic mutations.
There is no server-side data fetching to preserve, so pushing `"use client"` down
to leaves would only fragment each screen without winning anything back.

Where a page *is* a Server Component, the pattern is the same: it renders a
single client view (`_components/<Name>View`) and does nothing else.

What the server side still does: `layout.tsx` resolves the locale and messages
with `getLocale()` / `getMessages()` and hands them to `NextIntlClientProvider`,
and injects a pre-paint theme script so the dark theme does not flash. `<body>`
carries `suppressHydrationWarning` because browser extensions inject attributes
before React hydrates — it suppresses that one element only, so real mismatches
deeper in the tree are still reported.

## Data flow — one path, no exceptions

```
component → src/lib/hooks/*  →  src/lib/api.ts  →  Fastify :3001
              (TanStack Query)     (apiFetch)
```

Components never call `fetch` and never build a URL. `API_BASE` comes from
`NEXT_PUBLIC_API_BASE`, and `apiFetch` normalises every failure into `ApiError`
carrying `status`, `code` and `details`, so screens can branch their error UX
(toast / inline / full-screen) on the status rather than on string matching.

One subtlety worth knowing: `apiFetch` sets `content-type: application/json`
**only when a body is actually sent**. A body-less POST — refresh, reindex — would
otherwise trip Fastify's "Body cannot be empty when content-type is
application/json".

Hooks are grouped by domain in `src/lib/hooks/`: `core.ts` (repos, pulls,
settings), `agents.ts`, `reviews.ts` (runs, findings, comments, SSE run events),
`trace.ts`, `repo-intel.ts`. Mutations invalidate the query keys they affect —
`["repos"]`, `["pulls", repoId]` and so on.

## File layout

A `page.tsx` composes and holds screen-level state (filters, sort, query params).
Feature logic lives in a colocated `_components/<PascalCase>/` folder with its own
`<PascalCase>.test.tsx`. Nesting `_components/` inside a feature folder is the
normal way to split further — `SettingsView/_components/SettingsApiKeys/` is
typical, not a smell. The leading underscore keeps these folders out of routing.

Genuinely cross-screen pieces live outside `app/`: `src/components/app-shell`
(nav, breadcrumbs, `g`-then-key shortcuts), `src/components/run-cost-badge`, and
the vendored primitives in `src/vendor/ui` (`@devdigest/ui`).

Shared display helpers go in `src/lib/format.ts`; single-consumer helpers stay
next to their component.

## Text and theming

Every user-facing string goes through `next-intl`. Keys live in
`messages/<locale>/<namespace>.json`, one namespace per feature area
(`prReview`, `agents`, `settings`, `runs`, …). A literal string in a component is
a bug, not a shortcut.

Colors come from CSS variables (`var(--text-secondary)`, `var(--crit)`) so both
themes work without per-component branching.

## Tests

`*.test.tsx` under vitest + jsdom with `fetch` mocked — no API and no browser.
That is why the data layer has exactly one entry point: mocking `apiFetch`'s
target is enough to drive any screen. Real browser journeys live in
[`../../e2e`](../../e2e).

## Related

- [`../specs/pages.md`](../specs/pages.md) — routes and the data each one needs
- [`../README.md`](../README.md) — the UI route map diagram

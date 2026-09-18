# `@devdigest/web` — the studio (Next.js 15)

App Router + React 19. Imports repos, browses PRs, runs and reads reviews,
authors agents.

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query · next-intl · Tailwind 4 ·
recharts · mermaid · react-markdown · Zod 3 · vitest 2 + Testing Library + jsdom.
Package manager: **pnpm**.

## Commands

```sh
pnpm dev        # :3000
pnpm test       # vitest + jsdom, fetch mocked — no API and no browser needed
pnpm typecheck
```

## Conventions

- **Data access has one path**: `src/lib/hooks/*` (TanStack Query) →
  `src/lib/api.ts`. Components never call `fetch` directly and never hardcode a
  URL; the base is `NEXT_PUBLIC_API_BASE`.
- **Pages are thin.** A `page.tsx` composes; feature logic lives in a colocated
  `_components/<Name>/` folder with its own `*.test.tsx`. Nested
  `_components/` inside a feature folder is the normal way to split further.
- **All user-facing text goes through `next-intl`** — keys in
  `messages/<locale>/<namespace>.json`. No literal strings in components.
- Cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts) lives in
  `src/components/app-shell`.
- Mind the RSC/Client boundary: hooks and context providers
  (`src/lib/providers.tsx`, `theme.tsx`, `toast.tsx`, `repo-context.tsx`) are
  client-side; keep `'use client'` at the leaf that needs it, not at the page.

## Do not touch

- `src/vendor/**` — vendored `@devdigest/shared` and `@devdigest/ui`. The
  canonical copy of `shared` is `server/src/vendor/shared`; edit there and sync.

## Reference (load only when the condition matches)

| Document | Read it when |
|----------|--------------|
| [README.md](README.md) | you need the UI route map or the hook→endpoint mapping |
| [docs/](docs/) | deeper background on a UI subsystem |
| [specs/](specs/) | you are building a new screen for a lesson |
| [INSIGHTS.md](INSIGHTS.md) | before a non-trivial change here |

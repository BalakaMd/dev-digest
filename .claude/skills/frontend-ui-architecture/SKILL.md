---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organisation for React and Next.js — where components, hooks, constants, types and utilities live, how far to split a component, where business logic belongs, and how to keep module boundaries clean. Use this whenever creating a new component, screen, hook or feature folder; whenever deciding where to put a file or what to name a folder; whenever a component grows too large, a utils file turns into a dumping ground, or logic is duplicated across screens; and whenever reviewing or refactoring frontend structure. Reach for it even when the user only says \"add a page\", \"extract this\", \"where should this live\" or \"clean this up\" — placement decisions get made silently and are expensive to undo later. Architecture only: for React API rules use react-best-practices, for Next.js framework conventions use next-best-practices, and for runtime performance neither this skill nor those."
version: 1.0.0
metadata:
  tags: react, nextjs, architecture, code-organisation, file-structure, boundaries, colocation
---

# Frontend UI Architecture

Where code goes, and why. This skill answers placement questions — which file,
which folder, which layer — so that structure is a decision rather than an
accident.

## Scope

This skill covers **architecture and code organisation only**. It deliberately
does not repeat what the neighbouring skills already say:

| Question | Skill |
|----------|-------|
| Where does this file go? How far do I split it? Where does logic live? | **this one** |
| Is this hook correct? Is this component pure? Should this be memoised? | `react-best-practices` |
| How do App Router conventions work — metadata, images, route handlers? | `next-best-practices` |
| Where does this belong on the **server** — layers, ports, DI, repositories? | `onion-architecture` |

Runtime performance is out of scope on purpose. Good boundaries usually help
performance, but that is a side effect, not the goal here.

## Four rules that settle most cases

**1. Colocate by default.** Put code as close to its only consumer as possible.
A helper used by one component is a function in that component's file or a
sibling module — not an entry in a global `utils/`. Code that lives together
gets updated together and deleted together.

**2. Group by feature, not by file type.** `components/`, `hooks/`, `types/` at
the top level scales badly: one change touches four folders, and nothing tells
you which files belong to each other. Group by domain instead, so that deleting
a feature folder removes a feature and breaks nothing else.

**3. Logic leaves the JSX, but does not land in a bucket.** Extracting logic out
of a component is right; dropping it into `utils.ts` or `helpers.ts` is not.
Every extracted piece gets a name that says what it is about — the entity, the
rule, the format — never `helper`, `util`, `misc`, `common` or `manager`.

**4. Dependencies point one way.** `shared → features → app`. Shared code knows
nothing about features. Features do not import each other; they get composed at
the page or app level. This is the rule that keeps a codebase from turning into
a graph nobody can reason about.

## Placement decision tree

Run this for each new file, top to bottom, and stop at the first match:

```
Who uses this?
├─ one component            → keep it in that component's file, or a sibling
│                             module in the same folder
├─ one feature / one screen → the feature folder (its own components/, hooks/,
│                             model/, api/ — only the parts it needs)
├─ two or more features, and it is about a domain object (a pull request,
│  a review, a user)        → the entity/domain module for that object
└─ two or more features, and it is generic (a button, a date formatter,
   a fetch wrapper)         → the shared layer
```

**The promotion rule.** Do not start at the bottom. Write code where it is used,
and move it up only when a *second real* consumer appears — not an anticipated
one — and only once its shape has stopped changing. Promoting too early produces
an abstraction shaped by one caller that every later caller has to fight. See
[references/duplication-and-boundaries.md](references/duplication-and-boundaries.md).

Demotion is equally legitimate: shared code that ended up with one consumer
belongs back next to it.

## Where each kind of thing goes

| Thing | Rule | More |
|-------|------|------|
| Component | Feature folder if screen-specific, shared UI layer only if genuinely generic | [file-placement](references/file-placement.md) |
| Sub-component | Nested inside the parent's folder — nesting is normal, not a smell | [file-placement](references/file-placement.md) |
| Custom hook | Next to the feature it serves; shared only when a second feature uses it | [business-logic-and-state](references/business-logic-and-state.md) |
| Types | With the code that owns them; cross-package contracts in the shared contract module | [file-placement](references/file-placement.md) |
| Domain rule (validation, eligibility, pricing) | Plain framework-free function in the entity's model module | [business-logic-and-state](references/business-logic-and-state.md) |
| Formatter / display helper | Shared only if several features format the same way; otherwise sibling file | [file-placement](references/file-placement.md) |
| API call | The data layer, never in a component | [business-logic-and-state](references/business-logic-and-state.md) |
| Local magic value | `const` at the top of the file that uses it | [constants-and-config](references/constants-and-config.md) |
| Domain enum / union | With the entity, ideally derived from the shared contract | [constants-and-config](references/constants-and-config.md) |
| Runtime config, env vars | One config module — the only place that reads `process.env` | [constants-and-config](references/constants-and-config.md) |
| Design tokens (colour, spacing) | The theme/CSS layer, not a TypeScript constants file | [constants-and-config](references/constants-and-config.md) |
| User-facing string | The i18n catalogue, keyed by feature namespace | [constants-and-config](references/constants-and-config.md) |
| Test | Beside the file it tests | [file-placement](references/file-placement.md) |

## How far to split a component

Splitting is not a line-count exercise. Ask three questions, in order:

1. **Does it have more than one reason to change?** A component that renders a
   list *and* owns the filter form *and* decides which rows are visible has three.
   Split along those seams, not at an arbitrary line count.
2. **Is a section of the JSX reusable, or merely long?** Long-but-cohesive markup
   stays. Extracting it into a component that is used once and takes eight props
   just moves the complexity and adds an indirection.
3. **Would the extracted piece have a name?** If the only honest name is
   `<MiddleSection>` or `<Part2>`, the seam is wrong — look for a different one.

Signals that a split is overdue: a props list that keeps growing; boolean props
that switch between layouts; a component whose tests need half a page of setup;
two branches of JSX that share nothing but the wrapper.

Reach for **composition before configuration**: pass `children` and slots instead
of adding `showHeader`, `variant`, `isCompact`. Details, the props budget, and
what became of the container/presentational split are in
[references/component-splitting.md](references/component-splitting.md).

## Where business logic lives

Four places, in order of preference. Take the first one that fits:

1. **Derived during render.** Anything computable from props and state is
   computed in the render body. It is not state, and it does not belong in an
   Effect — an Effect that only copies or transforms data is a placement bug.
2. **In the event handler.** Logic that runs *because the user did something*
   belongs where that something is handled, not in an Effect reacting to the
   state it changed.
3. **In a custom hook.** When stateful logic is genuinely shared, or when a
   component needs to synchronise with something outside React, wrap it in a hook
   named for the concrete use case (`useReviewRun`, not `useOnMount`).
4. **In a plain module.** Rules that do not need React — validation, eligibility,
   scoring, sorting, derived domain values — are pure functions with no imports
   from React. They are the easiest code in the app to test and the cheapest to
   reuse, and keeping them framework-free is what makes them so.

Data access is its own layer, not a fifth option: components neither call `fetch`
nor build URLs. On the server side in Next.js, that layer is a data access
module marked `server-only` that performs its own authorisation and returns
narrow DTOs — page components must not hand raw records to client components.

State placement follows the same logic as file placement: keep it in the
component that uses it, lift it to the lowest common owner when two components
need it, and push it back down when it no longer needs to be up there. See
[references/business-logic-and-state.md](references/business-logic-and-state.md).

## Next.js specifics

`app/` is for routing. Route groups `(group)` organise without changing URLs;
private folders `_folder` hold colocated code the router must ignore. Pages
compose and stay thin; the substance lives in colocated feature folders.

Put `'use client'` at the boundary that actually needs interactivity, not at the
top of a page — everything a client module imports joins the client graph, but a
Server Component passed through `children` does not. Read
[references/nextjs-app-router.md](references/nextjs-app-router.md) before adding
a route, moving a boundary, or touching the data layer of a Next.js app.

## Applying this in dev-digest

This repo's client already follows the model; the vocabulary differs. Read
[client/docs/ui-architecture.md](../../../client/docs/ui-architecture.md) and
[client/AGENTS.md](../../../client/AGENTS.md) for the authoritative description —
this table is only the translation:

| This skill says | In `client/` that is |
|-----------------|----------------------|
| Feature folder | `src/app/**/_components/<PascalCase>/`, with its own `<PascalCase>.test.tsx` |
| Nested feature folder | `_components/` inside a feature folder — normal, e.g. `SettingsView/_components/SettingsApiKeys/` |
| Cross-feature shared component | `src/components/<kebab-case>/` |
| Shared primitives layer | `src/vendor/ui` (vendored `@devdigest/ui` — do not edit) |
| Data layer | `src/lib/hooks/*` (TanStack Query) → `src/lib/api.ts` (`apiFetch`); never `fetch` in a component |
| Shared contracts | `src/vendor/shared` (canonical copy lives in `server/src/vendor/shared`) |
| Shared display helpers | `src/lib/format.ts`; single-consumer helpers stay beside their component |
| User-facing strings | `messages/<locale>/<namespace>.json` via `next-intl` — no literals in components |

Two deliberate local divergences, so do not "fix" them:

- Most `page.tsx` files here are Client Components. Every screen is driven by
  TanStack Query against a **separate** Fastify origin, so there is no
  server-side data fetching to preserve and pushing the boundary down would
  fragment screens for nothing. The Next.js guidance on boundary placement still
  applies to any *new* server-rendered screen.
- There is no linter in this repo, so the import-boundary rules are conventions
  enforced in review, not by tooling.

## Reference index

| File | Read it when |
|------|--------------|
| [references/file-placement.md](references/file-placement.md) | deciding which folder a file goes in, or naming a folder |
| [references/component-splitting.md](references/component-splitting.md) | a component is growing, or you are about to extract one |
| [references/business-logic-and-state.md](references/business-logic-and-state.md) | logic or state is in the wrong place, or you are adding either |
| [references/constants-and-config.md](references/constants-and-config.md) | adding a constant, an enum, an env var or a token |
| [references/nextjs-app-router.md](references/nextjs-app-router.md) | adding a route, moving `'use client'`, or touching server data access |
| [references/duplication-and-boundaries.md](references/duplication-and-boundaries.md) | tempted to extract a shared thing, or you found duplication |
| [examples.md](examples.md) | you want the before/after shape of any rule above |

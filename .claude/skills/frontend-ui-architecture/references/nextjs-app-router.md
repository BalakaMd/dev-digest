# Next.js App Router architecture

Framework conventions themselves (metadata, images, route handlers, caching) are
covered by the `next-best-practices` skill. This file covers only the structural
decisions: what goes in `app/`, where the client boundary sits, and where server
data access lives.

## `app/` is the routing layer

Folders under `app/` define URL segments, and a segment becomes a public route
only when it contains a `page` or `route` file. Everything else in there is
inert — which is why colocating project files inside route segments is safe by
default.

Next.js is deliberately unopinionated about the rest. Three strategies are all
legitimate, and the only real requirement is picking one and staying consistent:

1. Keep `app/` purely for routing, with all application code outside it.
2. Put shared application code in top-level folders inside `app/`.
3. Keep globally shared code at the `app/` root and split feature-specific code
   into the route segments that use it.

The third is the best fit for the feature-folder model in
[file-placement.md](file-placement.md): each route keeps its own parts, and only
genuinely cross-route code moves up.

## Route groups and private folders

**Route groups** `(name)` organise routes without appearing in the URL. Use them
to group by section, intent or team; to give a subset of routes their own layout;
to scope a `loading.tsx` to one route instead of a whole branch; or to create
several root layouts for parts of the app with completely different chrome.

**Private folders** `_name` opt a folder and everything under it out of routing.
Colocation works without them, so they are a convention rather than a
requirement, but they earn their keep: they separate UI from routing at a glance,
they sort predictably in editors, and — the practical one — they cannot collide
with a future Next.js file convention.

Nest only when the URL genuinely needs the segment. Deep folder trees that exist
for organisation belong in route groups or private folders, not in the path.

## Pages compose

A `page.tsx` composes and holds screen-level concerns (params, search params,
screen-level state). The substance lives in the colocated feature folder. A page
that has grown past composition is a feature folder waiting to be extracted.

Where a page must be a Server Component but the screen is interactive, the clean
shape is a page that renders a single client view component and does nothing
else.

## The `'use client'` boundary

`'use client'` marks a **boundary between the server and client module graphs**,
not a per-file annotation. Once a file carries it, everything it imports and
everything it directly renders joins the client bundle. Putting it at the top of
a page therefore drags the whole screen across.

Place it at the component that actually needs state, event handlers, lifecycle or
browser APIs, and keep the rest of the tree on the server.

The escape hatch that makes this practical: a Server Component passed as
`children` or another prop is **not** part of the client component's module
graph. It renders on the server, and the client component receives the rendered
output.

```tsx
// modal.tsx — client: owns the open/closed state
'use client';
export default function Modal({ children }) { return <div>{children}</div>; }

// page.tsx — server: Cart stays a Server Component
export default function Page() {
  return <Modal><Cart /></Modal>;
}
```

Context providers must be client components, and they should wrap `{children}`
as deep in the tree as possible rather than the whole document — a provider
around `<html>` opts the entire app out of static optimisation.

Third-party components that use client-only features but ship without the
directive get wrapped in your own one-line client module rather than forcing the
consumer page to become a client component.

## Data access on the server

Pick one data-fetching approach per application and stay with it; mixing them
makes it impossible for a reader — or an auditor — to know what to expect.

- **External HTTP APIs** — the app already has a backend with its own security
  model. Server Components call it like any client would, forwarding credentials
  explicitly. Zero trust: the API still authorises every request.
- **Data Access Layer** — the default for new projects. An internal module that
  runs only on the server, performs its own authorisation, and returns narrow
  DTOs.
- **Component-level queries** — fine for prototypes, risky in production, because
  it is one careless prop away from shipping a whole database record to the
  browser.

The DAL shape is worth knowing even if the project uses the first option:

```ts
// data/posts.ts
import 'server-only';

export async function getVisibleProfile(slug: string) {
  const viewer = await getCurrentUser();          // authorisation lives here
  const row = await db.user.findUnique({ where: { slug } });
  return {                                         // a DTO, not the record
    username: row.username,
    phone: canSeePhone(viewer, row) ? row.phone : null,
  };
}
```

Three structural rules follow:

- **`import 'server-only'`** in modules that must never be bundled for the
  browser. It turns an accidental client import into a build error instead of a
  runtime leak. `client-only` is its mirror for modules touching `window`.
- **Only the data layer reads `process.env`** for secrets. See
  [constants-and-config.md](constants-and-config.md).
- **Return DTOs, not records.** A client component's props type is a contract; if
  it is `{ user: User }`, callers will pass the whole user. Ask for the fields
  the component renders.

## Server Actions stay thin

A Server Action is a separate entry point, reachable by POST regardless of which
UI references it. A page-level authorisation check does not protect it.

Structurally that means: the action validates its input, delegates to the
`server-only` data layer where authentication, authorisation and ownership checks
live, revalidates what it changed, and returns only what the UI needs. Business
logic inside the `'use server'` file itself duplicates what the data layer should
own and puts the security check in the outer ring rather than the inner one.

Mutations never happen as a side effect of rendering — no cookie writes, no cache
invalidation, no deletions in a page body. Rendering answers "what does this look
like"; actions answer "what changed".

## Where this repo diverges

In `client/`, most `page.tsx` files are Client Components. Every screen is driven
by TanStack Query against a **separate** Fastify origin, with client-side
filtering, SSE run logs and optimistic mutations. There is no server-side data
fetching to preserve, so pushing the boundary down would fragment screens without
winning anything back. That is a documented decision, not drift — see
`client/docs/ui-architecture.md`.

The boundary guidance above still governs any *new* server-rendered screen, and
the DAL guidance applies to `server/`, which owns all data access in this
architecture.

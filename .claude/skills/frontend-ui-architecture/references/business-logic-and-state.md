# Business logic and state

Where logic belongs, and where the state it operates on belongs.

## The layering, and why it matters here

Separate presentation, domain and data. The payoff is not architectural purity —
it is that each of the three can be thought about on its own. Domain rules mixed
into JSX have to be reasoned about through the UI: you cannot read them without
reading the markup, you cannot test them without rendering, and you cannot reuse
them anywhere else.

In a React codebase the three layers look like this:

| Layer | What it is | Depends on |
|-------|-----------|------------|
| Presentation | Components, JSX, event wiring, formatting for display | domain, data |
| Domain | Validation, eligibility, scoring, sorting, derived domain values | nothing (no React imports) |
| Data | Fetch/mutation modules, query hooks, caches, server data access | domain |

The dependency arrow never points back up. A domain function that imports from
`react` or reaches for a component is no longer a domain function.

## Where to put a piece of logic

Take the first option that fits.

**1. Derive it during render.** Anything computable from props and state is a
value, not state. Compute it in the render body.

```tsx
// Not state, not an Effect — just a value.
const visibleFindings = findings.filter((f) => severities.has(f.severity));
```

State that mirrors other state is the single most common structural mistake in
React codebases. An Effect that only copies, transforms or resets data is a
placement bug, not a performance one: it duplicates the source of truth, adds a
render pass, and puts the rule somewhere nobody looks for it.

**2. Put it in the event handler.** Logic that runs *because the user did
something* belongs where that something is handled. An Effect cannot see what the
user did — only that some state changed — so reacting to state in an Effect
discards the information you needed.

The same applies to chains: if effect A sets state that triggers effect B, the
whole chain usually collapses into one handler.

**3. Extract a custom hook.** When stateful logic is genuinely shared, or when a
component must synchronise with something outside React (a subscription, a
browser API, a stream), wrap it in a hook.

Name it for the concrete use case — `useReviewRun(runId)`, `useOnlineStatus()`,
`useMediaQuery(query)` — not for a lifecycle (`useMount`, `useUpdateEffect`).
Lifecycle hooks fight React's model and hide bugs; use-case hooks communicate
intent and survive API changes.

Do not extract for trivial duplication: a hook wrapping a single `useState` earns
nothing. And a function that calls no hooks should not be named `use*` — call it
`getSorted`, not `useSorted`, so it can be called conditionally.

**4. Put it in a plain module.** Rules that need no React are pure functions with
no React imports, living in the entity's model segment. `canRequestReview(pr,
viewer)`, `scoreFinding(finding)`, `nextRetryDelay(attempt)`. This is the
cheapest code in the codebase to test and reuse, and keeping it framework-free is
exactly what makes it so.

## Data access is a layer, not an option

Components do not call `fetch` and do not build URLs. One path exists — a hook
layer over a request module — and everything goes through it. That single path is
what makes it possible to change the base URL, add auth, normalise errors or add
retries in one edit rather than forty.

Two consequences worth stating:

- **Errors get normalised once**, at the request module, into a shape screens can
  branch on (status code, error code, details) instead of matching strings.
- **Mutations invalidate the keys they affect.** Cache invalidation belongs with
  the mutation, not scattered across the components that triggered it.

On the server side in Next.js, the same idea has a stronger form: a data access
layer marked `server-only`, performing its own authorisation and returning narrow
DTOs. See [nextjs-app-router.md](nextjs-app-router.md).

## Two kinds of state

Most confusion about "state management" comes from treating one problem as two,
or two as one:

- **Server cache** — data that lives on a server and is cached on the client.
  It is stale by nature, needs revalidation, deduplication, retries and
  invalidation. Caching is genuinely hard; use a library built for it rather than
  hand-rolling it into component state.
- **UI state** — which tab is open, whether a dialog is showing, the draft text
  in a field. It is owned by the client and needs none of the above.

Keeping them separate is what stops an app from acquiring a giant global store
whose job is to hold copies of server responses.

## Where state lives

Same logic as file placement.

1. **Start local.** State used by one component lives in that component.
2. **Lift to the lowest common owner.** When two components need it, find their
   closest common parent and put it there. If no existing component fits, a new
   component whose job is to own that state is a legitimate answer.
3. **Push it back down.** Lifting happens naturally as code grows; colocating
   again requires a deliberate look. State that ended up high but is now read in
   one subtree belongs back in that subtree.
4. **Context near its consumers, not at the root.** Wrap the subtree that
   actually uses the value. A provider at the application root re-renders the
   world and tells the reader nothing about scope.
5. **Prefer composition before context.** Passing a rendered child through
   removes most of the drilling that makes people reach for context.

React itself is a state management library. Global stores are a specific tool for
a specific problem, not the default destination for every value.

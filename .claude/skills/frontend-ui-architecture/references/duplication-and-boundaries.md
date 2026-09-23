# Duplication and module boundaries

Two failure modes, one topic. Too little abstraction scatters a change across the
codebase; too much abstraction concentrates every change into one file that
nobody dares touch. The second is worse, and it is the more common one in
frontend code.

## Prefer duplication over the wrong abstraction

The decay sequence is well documented and depressingly familiar:

1. Someone sees duplication and extracts an abstraction.
2. A new requirement arrives that does not quite fit.
3. Rather than reconsidering the abstraction, someone adds a parameter and a
   branch.
4. Repeat. The clean helper becomes a condition-laden procedure.
5. The worse it gets, the more effort is sunk into it, and the less anyone wants
   to undo it.

The remedy when you recognise it: inline the abstraction back into each caller,
delete the parts each caller does not need, and — only then — look for the real
abstraction in what remains. Going back is the fastest way forward.

The preventive version: **Avoid Hasty Abstractions**. Let duplication exist while
you are still learning what the code is. Abstract when the commonality is
obvious, not when it is merely plausible. Optimise for change, because
requirements move in directions nobody predicted.

## The rule of three, used properly

Waiting for three occurrences is a heuristic, not a ritual. What matters is what
the third occurrence *proves*:

- Three call sites that differ only in their inputs → a real abstraction. Extract
  it.
- Three call sites that need three different flags to behave correctly → not one
  abstraction. Three things that look alike.

Ask what would happen if one call site's requirement changed. If the answer is "a
new boolean parameter", the shared version is already the wrong shape.

Two more distinctions worth making:

- **Duplicated logic is expensive; duplicated markup is often cheap.** Two screens
  with similar JSX that answer to different stakeholders will diverge. Share the
  rule (a pure function, a hook) and let the markup repeat.
- **Coincidental similarity is not duplication.** Two functions with identical
  bodies and unrelated reasons to change should stay two functions.

## Unidirectional dependencies

Modules depend in one direction only:

```
shared  →  entities  →  features  →  app
```

- **Shared** knows nothing about anything above it. A UI primitive that imports a
  feature's type has broken the layer.
- **Features do not import each other.** When feature A needs something from
  feature B, there are three legitimate answers: the thing belongs in a shared
  entity, the two features are really one, or they should be composed together at
  the page/app level where both are already known.
- **App composes.** Routing, providers and page composition may import from
  everything below.

The payoff is concrete: a change to a shared module can only affect things above
it, a feature can be deleted by deleting its folder, and there is no import cycle
to unpick.

Feature-Sliced Design states the same rule over more layers: a module may import
only from layers strictly below its own. Where a same-layer import is genuinely
justified — usually between entities — it goes through an explicit, named
cross-import entry rather than reaching into internals.

## Enforcing it

Where a linter is available, this is mechanically enforceable with
`import/no-restricted-paths`:

```js
'import/no-restricted-paths': ['error', {
  zones: [
    // features must not import from the app layer
    { target: './src/features', from: './src/app' },
    // shared must not import from features or app
    { target: ['./src/components', './src/hooks', './src/lib', './src/utils'],
      from: ['./src/features', './src/app'] },
    // no cross-feature imports
    { target: './src/features/auth', from: './src/features', except: ['./auth'] },
  ],
}],
```

**This repo has no linter** — CI runs typecheck and tests only, and the root
`CLAUDE.md` says not to invent a `lint` script. So here the rule is a convention
plus a review check. When reviewing or writing a change, verify:

- [ ] No import reaches from a shared module into a feature.
- [ ] No feature imports another feature's internals.
- [ ] Nothing imports *through* a feature's internals — cross-module imports go to
      its public entry point.
- [ ] No new import cycle (a module that imports a barrel that re-exports it).
- [ ] A helper promoted to a shared location has at least two real consumers.

## When to break a rule

Sometimes the honest answer is a temporary violation with a comment saying why
and what would remove it. That is far better than silently inventing a bucket
module to launder the dependency through. A named exception is reviewable; a
`common/` folder is not.

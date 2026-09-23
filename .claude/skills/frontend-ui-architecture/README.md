# frontend-ui-architecture

**Version 1.0.0**

A skill about *where frontend code goes*. It answers the placement questions that
get decided silently and cost the most to undo: which folder a component belongs
in, how far to split it, where constants live, what counts as a utility, where
business logic sits, and how to keep module boundaries from tangling.

Written to be portable to any React / Next.js codebase, with one short section
mapping the model onto this repo's `client/`.

## Contents

| File | What it holds |
|------|---------------|
| `SKILL.md` | The rules, the placement decision tree, and the repo mapping. This is what loads into context when the skill triggers. |
| `examples.md` | Nine annotated before/after pairs, one per rule. |
| `references/file-placement.md` | Feature vs type layout, colocation, the promotion ladder, naming, module public APIs. |
| `references/component-splitting.md` | One-reason-to-change, the props budget, composition over configuration, what became of container/presentational. |
| `references/business-logic-and-state.md` | Presentation/domain/data layering, where a piece of logic goes, server cache vs UI state, state placement. |
| `references/constants-and-config.md` | The four different things called "constants" and where each belongs. |
| `references/nextjs-app-router.md` | `app/` as routing, route groups and private folders, the `'use client'` boundary, the Data Access Layer. |
| `references/duplication-and-boundaries.md` | AHA, the wrong abstraction, the rule of three, unidirectional dependencies and how to enforce them. |

## Scope, and what it deliberately leaves alone

This skill covers **architecture and code organisation only**. It does not repeat
the neighbouring skills, and it points at them instead:

- `react-best-practices` — React API rules: purity, hook correctness, memoisation.
- `next-best-practices` — Next.js framework conventions: metadata, images, route
  handlers, caching, bundling.
- `onion-architecture` — the same kind of questions for `server/` and
  `reviewer-core/`.

Runtime performance is out of scope on purpose. Good boundaries usually help
performance, but that is a side effect here, not the subject.

## Sources

Everything below was read while writing version 1.0.0. Each entry says which part
of the skill it backs.

### Official documentation

- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) —
  colocation inside `app/`, private folders `_folder`, route groups `(group)`,
  and the three sanctioned organisation strategies. Backs
  `references/nextjs-app-router.md`.
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) —
  `'use client'` as a module-graph boundary, passing Server Components through
  `children`, providers rendered deep, `server-only` / `client-only`. Backs the
  boundary section and example 8.
- [Next.js — How to think about data security](https://nextjs.org/docs/app/guides/data-security) —
  the Data Access Layer, DTOs, "only the DAL reads `process.env`", thin Server
  Actions, and why a broad props type is a security problem. Backs the data
  access section and example 9.
- [React — Thinking in React](https://react.dev/learn/thinking-in-react) —
  decomposing UI into a component hierarchy by single responsibility, and finding
  the common owner for a piece of state. Backs `references/component-splitting.md`.
- [React — Reusing logic with custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) —
  when to extract a hook, why `use*` names must be concrete use cases rather than
  lifecycles, and why a non-hook function must not be named `use*`. Backs the
  "where to put a piece of logic" ladder.
- [React — You might not need an Effect](https://react.dev/learn/you-might-not-need-an-effect) —
  derived values, event-handler logic, effect chains, resetting state with `key`.
  Used here as a *placement* rule, not a performance one. Backs example 3.
- [React — Choosing the state structure](https://react.dev/learn/choosing-the-state-structure) —
  avoiding state that mirrors other state.
- [React — Sharing state between components](https://react.dev/learn/sharing-state-between-components) —
  lifting state to the lowest common owner.
- [React — Passing data deeply with context](https://react.dev/learn/passing-data-deeply-with-context) —
  context as a deliberate choice after composition, not a reflex.

### Architecture references

- [bulletproof-react — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) —
  the feature folder and its segments, unidirectional `shared → features → app`,
  no cross-feature imports, and the ESLint `import/no-restricted-paths` zones.
  Backs `references/duplication-and-boundaries.md`.
- [Feature-Sliced Design — overview](https://feature-sliced.design/docs/get-started/overview) —
  layers, slices and segments (`ui`, `api`, `model`, `lib`, `config`), and the
  rule that a layer may import only from layers strictly below it.
- [Feature-Sliced Design — public API](https://feature-sliced.design/docs/reference/public-api) —
  what a good module entry point does, why wildcard re-exports are a liability,
  and controlled same-layer cross-imports.
- [Martin Fowler — PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) —
  why domain logic must not live in the presentation layer: it lets you reduce
  the scope of your attention. Backs `references/business-logic-and-state.md`.

### Duplication and abstraction

- [Sandi Metz — The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) —
  the decay sequence and the remedy: when the abstraction is wrong, the fastest
  way forward is back.
- [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) —
  avoid hasty abstractions; optimise for change.
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) —
  place code as close to where it is relevant as possible; the consistency,
  discoverability and friction arguments; the exceptions (e2e tests, integration
  docs).
- [Kent C. Dodds — State colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) —
  keeping state in the smallest scope that needs it, and pushing it back down as
  a deliberate act.
- [Kent C. Dodds — Application state management with React](https://kentcdodds.com/blog/application-state-management-with-react) —
  server cache vs UI state, providers by feature, and why prop drilling is often
  desirable.

### Superseded patterns, kept for context

- [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) —
  the original split, carrying the author's 2019 update: *"I wrote this article a
  long time ago and my views have since evolved. In particular, I don't suggest
  splitting your components like this anymore."* Hooks achieve the same
  separation without the extra layer.
- [patterns.dev — Container/Presentational pattern](https://www.patterns.dev/react/presentational-container-pattern/) —
  a current write-up of the pattern and what hooks replaced.

### Naming and the `utils` anti-pattern

- [The utility module antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/) —
  why a catch-all `utils` module grows without bound and becomes unmaintainable.
- [Are utils folders a code smell?](https://dev.to/noway/are-utils-folder-where-you-put-random-stuff-you-don-t-know-where-to-put-otherwise-a-code-smell-3054) —
  the practitioner argument for banning meaningless names (`helper`, `util`,
  `misc`, `common`) and organising by feature instead.

### In-repo context

- `client/docs/ui-architecture.md` — the authoritative description of this repo's
  client layout; the skill's repo-mapping table translates to it rather than
  restating it.
- `client/AGENTS.md`, `CLAUDE.md` — the conventions the skill must not contradict
  (one data path, `next-intl` for all strings, no linter in this repo).

### Skill-authoring practice

- The bundled `skill-creator` skill — progressive disclosure across three loading
  levels, a `SKILL.md` under 500 lines, a deliberately pushy `description` because
  skills tend to under-trigger, imperative voice, and reasons over bare
  imperatives.

## Changelog

### 1.0.0 — 2026-09-23

Initial version. Covers file placement, component splitting, business logic and
state placement, constants and configuration, Next.js App Router structure, and
duplication/boundary rules, plus nine worked examples and a mapping onto this
repo's `client/`.

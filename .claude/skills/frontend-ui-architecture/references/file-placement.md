# File placement

Which folder a file goes in, and what to call it.

## Type-based vs feature-based layout

The default layout most projects start with groups files by what they *are*:

```
src/
├── components/     # every component in the app
├── hooks/          # every hook in the app
├── types/
└── utils/
```

This works until roughly the point where a person can no longer hold the whole
app in their head. After that it fails in three specific ways: a single change
touches four unrelated folders; nothing in the structure says which files belong
together; and deleting a feature means hunting its pieces across the tree.

Feature-based layout groups by *what the code is about*:

```
src/
├── app/            # application shell: routing, providers, entrypoints
├── features/
│   ├── reviews/
│   │   ├── api/          # requests and query hooks for this feature
│   │   ├── components/   # components only this feature renders
│   │   ├── hooks/
│   │   ├── model/        # domain rules, stores, schemas
│   │   ├── types/
│   │   └── utils/
│   └── repos/
└── shared/         # genuinely feature-agnostic: ui primitives, lib, config
```

A feature folder contains **only the segments it actually needs**. An empty
`utils/` in every feature is cargo cult, not structure.

The test for a feature boundary: *if this folder were deleted, would anything
outside it break?* If the answer is yes for anything other than the route that
mounts it, the boundary is in the wrong place.

Feature-Sliced Design formalises this further — layers (`app`, `pages`,
`widgets`, `features`, `entities`, `shared`) sliced by domain and segmented by
technical purpose (`ui`, `api`, `model`, `lib`, `config`). Adopt the whole
methodology only if the project is large enough to pay for the ceremony; adopt
its two load-bearing ideas — domain slices and one-way layer imports — always.

## Colocation

Place code as close to where it is relevant as possible. Separated files fall out
of sync: it is easy to move or delete a component and forget the helper, the
test, or the fixture that lived three folders away.

Concretely:

- The test sits beside the file it tests.
- A helper with one consumer sits in that consumer's file, or beside it.
- A type used only by one component is declared in that component's file.
- Fixtures and mocks for one feature live in that feature.

What genuinely does not colocate: end-to-end tests (they do not map to a source
file and should survive internal restructuring), and integration documentation
that spans several modules — that belongs in a README at the folder that contains
them all.

## The promotion ladder

Code moves **up** a level only when a second real consumer appears:

```
inside the component file
        ↓ (a sibling in the same folder needs it)
a module beside the component
        ↓ (another part of the same feature needs it)
the feature's own segment (hooks/, model/, utils/)
        ↓ (a second feature needs it, and it is about a domain object)
the entity module for that object
        ↓ (a second feature needs it, and it is generic)
shared/
```

Two conditions must both hold before promoting: a *real* second consumer (not an
anticipated one), and a shape that has stopped changing. Promoting something
still in flux means every later change to it ripples through callers that never
asked for the flexibility.

Demotion is a normal move too. A shared module that lost its consumers and now
has one belongs back beside that one.

## Nesting

Nesting a component folder inside another component folder is the normal way to
split a large feature — not a smell. `ReviewPanel/_components/FindingRow/` says
exactly what it means: `FindingRow` belongs to `ReviewPanel` and nothing else may
import it.

The limit is comprehension, not depth. If you cannot say in one sentence what a
folder contains, the problem is the boundary, not the number of slashes.

## Naming

**Folders and files carry meaning.** Ban the words that carry none: `helper`,
`helpers`, `util`, `utils`, `misc`, `common`, `shared` (as a file name), `manager`,
`data`, `stuff`. A file called `PdfUtils.ts` forces a reader to open it to learn
what it does; `renderPdfPage.ts` does not.

The `utils` module is the canonical failure case: it starts as one shared
function and grows without bound into an unsorted pile that everything imports
and nobody can safely change. If a function does not have a home, that is
information — it usually means the feature it belongs to has not been named yet.

Workable names describe the subject:

| Instead of | Use |
|------------|-----|
| `utils/format.ts` | `formatDuration.ts`, or `lib/date.ts` if there are several date functions |
| `helpers/pr.ts` | `entities/pull-request/model/status.ts` |
| `components/Common/` | `shared/ui/` for primitives, or the feature folder |
| `lib/misc.ts` | split it — each function goes where its subject lives |

A grouped module (`lib/date.ts` holding several date functions) is fine. The
distinction is subject-based grouping versus leftovers-based grouping.

Follow whatever casing the project already uses and do not introduce a second
convention. Consistency here matters more than which convention wins.

## Public API of a module

A feature or entity folder that other code imports from benefits from one
explicit entry point — an `index.ts` that re-exports exactly what is public. It
does three things: insulates callers from internal restructuring, makes a
behaviour change visible as an API change, and keeps internals genuinely
internal.

Two caveats:

- **Do not wildcard.** `export * from './ui/Comment'` hides what the contract
  actually is and leaks internals by accident. Name the exports.
- **Barrel files have a cost.** A barrel that re-exports a large tree makes every
  importer pull the whole tree into the module graph, which hurts tree-shaking,
  slows dev-server cold starts, and can create import cycles. Use one barrel at
  the boundary of a module people import *across*; do not barrel every folder,
  and do not route intra-feature imports through the feature's own barrel.

The rule of thumb: one public entry per module that outsiders import, direct
paths everywhere else.

# Component splitting

How far to break a component apart, and when to stop.

## Start from the data, not the line count

The original decomposition advice still holds: draw boxes around the UI, and let
each box handle one thing. A well-shaped data model usually maps onto the
component tree almost directly, because the UI and the data describe the same
information architecture. If a component matches one piece of the data model, it
is probably the right size.

Line counts are a symptom, not a criterion. A 250-line form that renders one
cohesive thing is fine. A 60-line component that fetches, filters and renders is
already three components.

## One reason to change

The useful version of "single responsibility" for components is: *a component
should have one reason to change.* Count the reasons:

- A `PullRequestPanel` that renders the header, owns the filter state, decides
  which findings are visible, and formats timestamps changes when the header
  design changes, when filtering rules change, when visibility rules change, and
  when the date format changes. Four reasons, four seams.
- A `FindingRow` that renders one finding changes when a finding's presentation
  changes. One reason. Leave it alone.

Split along the seams you find this way, not at an arbitrary midpoint.

## Three questions before extracting

1. **Does the piece have a name?** If the only honest name is `<MiddleSection>`,
   `<Part2>` or `<Content>`, the seam is wrong. A name that describes the subject
   (`<FindingsSummary>`, `<RunTimeline>`) means you found a real boundary.
2. **Is it reusable, or just long?** Extracting a once-used block that needs eight
   props does not reduce complexity — it relocates it and adds an indirection to
   follow.
3. **Does it own something?** A component that owns state, an effect, or a
   decision is worth extracting even if it is short. A component that owns
   nothing but markup is worth extracting only when it repeats.

## The props budget

A long props list is the most reliable signal that a component is doing too much
or is the wrong abstraction. Treat roughly five to seven props as the point where
you stop and look, not as a hard cap.

Diagnose before you cut:

| Symptom | What it usually means |
|---------|----------------------|
| Many booleans (`isCompact`, `showHeader`, `hideFooter`) | Configuration where composition belongs |
| Props only some branches read | Two components wearing one name |
| A prop passed straight through several levels | The tree wants composition, not drilling |
| An entire domain object passed in "just in case" | The component's contract is too broad — pass the fields it renders |

That last one matters beyond tidiness: a client component whose props type is a
whole record encourages callers to hand it everything, including fields that
should never reach the browser.

## Composition before configuration

When a component needs to vary, prefer giving the caller a slot over giving it a
flag.

```tsx
// Configuration: every new variant adds a prop and a branch.
<Card title={t('runs.title')} showActions hideBorder variant="compact" />

// Composition: the caller decides, the card stays one component.
<Card>
  <Card.Header>{t('runs.title')}</Card.Header>
  <Card.Body><RunList /></Card.Body>
</Card>
```

Composition also solves prop drilling without reaching for context. Passing a
rendered element down as `children` means the intermediate components never need
to know about the data it closed over.

Compound components (`Card` + `Card.Header` + `Card.Body`) are the natural form
for pieces that are always used together and share implicit state. They cost a
little more machinery, so use them for real families of parts, not for a single
wrapper.

## Prop drilling is not automatically a bug

Passing a value down two or three levels makes the data flow explicit and is
often the clearest option. Reach for context when drilling becomes genuinely
painful — many levels, many values, many intermediate components that do not care
— and place the provider near the subtree that consumes it rather than at the
root. A provider at the root is a global variable with extra steps.

## Presentational vs container: what actually survived

The old rule — "container components fetch data, presentational components take
props and render" — was retracted by its own author in 2019, on the grounds that
hooks let you separate stateful logic from markup without an arbitrary extra
component layer.

What survived, and is still worth doing:

- **Keep logic and markup separable.** A custom hook for the logic and a
  component for the view achieves it without a wrapper component.
- **Keep some components free of data access,** so they are trivial to reuse and
  to test. That is a property to aim for, not a layer to impose everywhere.

What to stop doing: mechanically creating a `XContainer` for every `X`. If the
container would do nothing but call one hook and spread its result, inline it.

In Next.js the split reappears in a different, load-bearing form: a Server
Component fetches and a Client Component handles interaction. That boundary is
real — it is enforced by the framework and has security implications — so it is
worth designing around. See
[nextjs-app-router.md](nextjs-app-router.md).

## When duplicated markup is the right answer

Two screens that look similar today but answer to different stakeholders will
diverge. Merging them into one component with a `mode` prop buys a small
deduplication now and a conditional thicket later.

Duplicate the markup, keep the shared *logic* in one place (a hook or a pure
function), and revisit when a third case shows you what the real abstraction is.
See [duplication-and-boundaries.md](duplication-and-boundaries.md).

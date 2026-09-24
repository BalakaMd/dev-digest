# Severity rubric

Paste the three grade definitions and the anti-inflation rules into every
subagent prompt **verbatim**. A paraphrased rubric inflates: each retelling
softens a constraint, and two hops later "this looks fragile" is blocking a
pull request.

The whole design rests on `critical` staying rare and provable. A gate that
fires on everything is a gate that gets switched off, and then nothing is
checked at all.

## CRITICAL — blocks the pull request

Five closed classes. A finding that fits none of them is not critical, however
serious it feels.

**1 · Correctness or data loss, provable from the diff.**
A concrete scenario can be written out: these inputs, this state → this wrong
outcome. Includes a repository query that lost its `workspaceId` scoping, which
is a cross-tenant leak even when every test passes.

**2 · Security at HIGH confidence**, as the `security` skill defines confidence
in § Core Philosophy: attacker-controlled input reaching a sink with the data
flow traced, a committed secret, a new route with no auth or ownership check.
MEDIUM confidence is a major. LOW is not reported.

**3 · A hard architecture rule broken**, from `onion-architecture`
§ Allowed imports:

- `drizzle-orm` or `db/schema` imported outside a repository file
- a service taking `Container` instead of explicit constructor dependencies
- `reviewer-core` importing anything but `zod` and its own modules
- a concrete adapter named anywhere but the composition root

**4 · A contract or do-not-touch breach.**
The two `vendor/shared` copies diverged; a vendored file edited in place instead
of its canonical source; an already-applied migration edited; a lockfile
hand-edited.

**5 · Verification failed.**
Typecheck or tests red in a package the diff touches.

## MAJOR — real, does not block

Missing test for new behaviour. File-placement violations
(`frontend-ui-architecture` § Placement decision tree). Logic in an Effect that
belongs in render or a handler. A missing Zod schema on a path with no security
consequence. Naming-convention breaches. Performance smells. Security findings
at MEDIUM confidence.

Majors are reported and discussed; they do not stop a pull request. Say so
plainly rather than implying the author should fix them first.

## MINOR — worth a line

Style, naming preference, a documentation gap, a comment that no longer matches
the code.

## Anti-inflation rules

These are constraints, not advice.

- **A critical needs a written failure scenario.** "Could be a problem", "might
  not scale", "is fragile", "is a bit risky" — all cap at major. If the scenario
  cannot be stated, the finding is not understood well enough to block on.
- **Never critical**, whatever else is true of it: taste; a missing comment; an
  unused import; an item listed under `onion-architecture` § Known deviations; a
  test fixture; anything outside the diff.
- **Every critical cites a source.** `file:line` inside the diff, plus
  `skill § section`. No citation → downgrade to major. This is mechanical.
- **Pre-existing is not new.** A rule this repo has been breaking for months is
  not introduced by a diff that happens to sit near it. Mention it once, as a
  minor, and move on.
- **An empty critical list is the expected outcome.** Three criticals in a small
  diff means the rubric was applied loosely, not that the diff was bad. Re-read
  the five classes before writing the report.

## Deduping

Two subagents reporting the same violation is one finding. Dedupe by
`(file, line, rule)`. The `security` agent sees every changed file and will
overlap with the domain agents by design — that overlap is the point, and it
must not show up as a doubled count in the report.

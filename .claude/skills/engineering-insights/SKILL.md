---
name: engineering-insights
description: Read and maintain the engineering insight log (INSIGHTS.md) for the module being worked on in this repo. Use this at the START of any non-trivial task — before changing code — to see what earlier sessions already learned about that module, and again at the END to record anything genuinely new. Trigger it whenever work touches server/, client/, reviewer-core/ or e2e/; whenever the user reports a bug, starts a feature, or debugs something confusing; whenever you hit a surprise, a dead end, a non-obvious root cause, or a tooling quirk; and whenever the user mentions insights, lessons learned, gotchas, pitfalls, or "what did we learn". Do not skip it because the task looks small — the log only pays off if it is read before the work and updated after it.
---

# Engineering Insights

A per-module log of what earlier sessions learned the hard way. Each module owns
an `INSIGHTS.md`; this skill governs how to read one before working and how to
add to one afterwards.

The point is to stop paying for the same lesson twice. An agent that rediscovers
a footgun every session is burning time the log could have saved — but a log
stuffed with trivia is worse than none, because nobody reads a file that mostly
wastes their attention. Everything below exists to keep that balance.

## Where the logs live

| Work touches | Log |
|---|---|
| `server/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| several modules at once, or `scripts/`, Docker, CI, repo layout | `INSIGHTS.md` (root) |

When work spans modules, route by **substance, not by file count**: the log that
gets the entry is the one where the finding actually applies. A change that
touched eight client files because one server contract shifted is a server
insight. Only findings about the interaction *between* modules, or about the
repository as a whole, belong in the root log.

## Reading, at the start of a task

Do this before changing code, while there is still time for it to change your
approach — an insight read afterwards only tells you what you should have done.

1. Work out which module the task concerns (the table above).
2. Read **only the `##` headings** of that log first. They are dated titles and
   cost a dozen lines.
3. Open the full entry only for headings that plausibly touch the task at hand.

Heading-first is deliberate. Recalled context helps only while it stays short
enough to sharpen your attention rather than split it, and these logs grow
without bound. Pulling in twenty irrelevant entries to find one relevant entry
makes you *worse* at the task.

If the task spans modules, read the relevant module's headings plus the root's.

## Writing, at the end of a task

Ask first whether there is anything worth writing. Usually there is not, and
that is the expected outcome — a session that fixed a typo has taught nobody
anything. Silence is the correct default; an entry has to earn its place.

Before writing anything, **re-read the log**. A near-duplicate is worse than a
missing entry, because it splits one lesson across two places that will drift
apart. If the finding is already there:

- **Same lesson, already accurate** — write nothing.
- **Same lesson, but you learned more** — sharpen the existing entry in place
  instead of appending a second one.
- **Contradicts an existing entry** — the old one is probably stale. Correct it
  and say what changed, rather than leaving a reader to pick between two.

## The bar

An entry qualifies only if every one of these is true. If you find yourself
arguing for a "yes", it is a no.

1. **Surprise** — an engineer competent in this stack, new to this module, would
   not have predicted it.
2. **Cost** — it actually cost time, or sent the work down a wrong path.
3. **Durability** — it will still be true after the next refactor. Anything tied
   to today's branch, ticket, or in-flight work fails here.
4. **Not derivable** — reading the code, types, or tests would not have revealed
   it. If it is plainly visible in the source, the source is already saying it.
5. **Not already known** — it is absent from this module's `INSIGHTS.md` *and*
   from the applicable `AGENTS.md`.

## Categories

Tag each entry with one. The tag is how a future reader skims the log, so pick
the one matching what the reader would be looking for.

| Tag | For |
|---|---|
| `gotcha` | behaviour that contradicts a reasonable expectation |
| `root-cause` | a symptom→cause link that was not obvious from the symptom |
| `convention` | an unwritten rule of the codebase, discovered in practice |
| `dead-end` | an approach that looked right, was tried, and failed — and why |
| `perf-cost` | a finding about speed, token spend, or money |
| `env-quirk` | a durable quirk of the tooling, runtime, or environment |

`dead-end` earns special attention because it is the category teams reliably
fail to record. Negative knowledge is invisible in a codebase: nothing in the
source says "three people tried this and it does not work", so the next agent
happily spends the same afternoon on it. When you abandon an approach for a
real reason, that reason is worth more than most successes.

## Entry format

Newest first, at the top of the log's entry section.

```
## YYYY-MM-DD — [category] Short, specific title
**Symptom** — what was observed.
**Cause** — what was actually going on.
**Takeaway** — what to do differently, concretely.
```

The title carries the weight, because heading-first reading means it is often
the only part that gets read. "Migrations do not run on boot" earns its line;
"Database issue" does not.

## What not to record

- **Vague resolve.** "Be more careful with migrations" is not a takeaway — it
  names no action, so it changes no behaviour. Say what to do instead.
- **One-off flukes.** A network blip, a Docker hiccup, a transient CI failure.
  Recording these as durable lessons actively poisons the log: a future agent
  reads a fluke as a rule and starts avoiding something that was never a
  problem. When unsure whether a failure was systemic or incidental, leave it
  out — a missing entry costs one rediscovery, a wrong entry misleads forever.
- **Session narration.** "Refactored the review service" is a commit message.
  The log records what was *learned*, not what was done.
- **Restating the code.** If a reader would learn it by opening the file, the
  file already documents it better than a summary will.
- **Anything already in `AGENTS.md`.** That file loads in every session and is
  kept under a hard line budget; duplicating it here wastes the budget twice.
- **Blame.** "I used the wrong port" helps nobody. Reframe toward what made the
  mistake easy — "the README still says 5432, the compose file says 5433" —
  because the second version is fixable and the first is not.

## Promoting to AGENTS.md

An insight that turns out to matter in *every* session in a module has outgrown
the log. Move it into that module's `AGENTS.md`, but only if it survives the
line test kept there: "if I remove this line, will Claude start making
mistakes?" Then trim it from `INSIGHTS.md` down to a pointer, or drop it.

This is the intended escalation path, and it is one-directional. `INSIGHTS.md`
is the wide net; `AGENTS.md` is the short list that everyone pays for on every
turn. Keeping the gate between them tight is what keeps the eager file small.

# The e2e runner — how flows execute

How `@devdigest/e2e` turns JSON files into a browser test run. Read this before
adding a flow, debugging a failure, or changing the harness.

## Why there is a harness at all

The suite is driven by Vercel **agent-browser**, a native (Rust + CDP) browser
automation CLI. agent-browser is a *CLI*, not a test framework: it has no runner,
no suite concept, and no assertions. `run.ts` is the thin layer that adds exactly
those three things and nothing more.

This is why the package has **zero runtime dependencies** — no Playwright, no
vitest, no assertion library. `tsx` and `typescript` are the only devDependencies.

## Execution model

```
run.ts
  ├─ read specs/*.flow.json, sorted lexically
  └─ for each flow, for each step:
        agent-browser <cmd…>   ← one child process per step
        non-zero exit  → step fails → flow aborts
        optional stdout substring check
  finally: agent-browser close
```

Every step is a separate `agent-browser` invocation, but they share **one browser
session** — the agent-browser daemon keeps the page alive between calls. That is
what makes a multi-step flow coherent despite each command being its own process.

Flows run **in series**, in filename order, which is why specs are numbered.
The shared session is torn down in a `finally`, so a crash or a failing flow
still closes the browser.

## Assertions are exit codes

There is no `expect`. A command that exits non-zero fails the step, and
`wait --text` / `wait --url` exit non-zero when their condition never holds
within the timeout. **The waits are the assertions.**

On top of that, a step may declare `assert.stdoutIncludes` for a light substring
check on the command's output. That is the only assertion primitive in the
harness.

A failed step **aborts its flow** — remaining steps are skipped — but the other
flows still run, so one broken screen does not hide the state of the rest.

## Substitution and configuration

`resolveArgs` replaces `{BASE}` in every argument with the base URL before the
command runs, so specs stay portable across ports.

| Env | Default | Purpose |
|-----|---------|---------|
| `E2E_BASE_URL` | `http://localhost:3000` | web app origin, substituted as `{BASE}` |
| `AGENT_BROWSER_BIN` | `agent-browser` | binary name or path |
| `E2E_STEP_TIMEOUT` | `60000` | per-command timeout in ms |

## Failure artifacts

When a step throws, the runner best-effort captures `test-results/<id>-fail.png`
before aborting the flow. The screenshot attempt is itself wrapped in a `catch` —
a browser too broken to screenshot must not replace the real failure message with
a screenshot error.

Only the first line of the error message is kept, because agent-browser's stack
traces are long and the first line carries the cause.

## Two ways to run

- `npm test` — runs against a stack that is **already up**. Fast, but it uses
  whatever data your dev database happens to hold.
- `../scripts/e2e.sh` — hermetic. Brings up an isolated stack on alternate ports
  with an **ephemeral** Postgres (no volume), seeds it, runs, then tears
  everything down. Safe to run beside a live dev stack.

CI does neither: it stands up its own stack and calls the runner directly. That
means `scripts/e2e.sh` and `.github/workflows/e2e-web.yml` describe the same
setup twice and must be kept in step by hand.

## Related

- [`../specs/flows.md`](../specs/flows.md) — what the flows guarantee
- [`../README.md`](../README.md) — flow format and command reference

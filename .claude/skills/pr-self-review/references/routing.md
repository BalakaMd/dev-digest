# Routing — changed path to skill

Match every changed path top to bottom and **accumulate**: a
`server/src/modules/pulls/routes.ts` matches both the module row and the routes
row, so its agent loads `onion-architecture`, `fastify-best-practices` and `zod`.
A `+` in the table means "in addition to the rows above it".

| Changed path | Skills to load | Domain |
|---|---|---|
| `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/**` | `onion-architecture` | backend |
| `server/src/modules/*/routes.ts` | `+ fastify-best-practices`, `+ zod` | backend |
| `server/src/modules/*/repository*.ts`, `server/src/db/**` | `+ drizzle-orm-patterns` | data |
| `server/src/db/migrations/*.sql`, `server/src/db/schema*.ts` | `+ postgresql-table-design` | data |
| `reviewer-core/src/**` | `onion-architecture` (ring-1 purity) | backend |
| `*/vendor/shared/**` | `zod`, `onion-architecture` | backend |
| `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `react-best-practices` | frontend |
| `client/src/app/**` | `+ next-best-practices` | frontend |
| `client/src/**/*.test.tsx` | `+ react-testing-library` | frontend |
| any `*.ts` / `*.tsx` | `typescript-expert` | folded into its domain |
| **every** changed file | `security` | security |
| `.github/workflows/**`, `scripts/*.sh`, `docker-compose.yml`, `Dockerfile*` | `security` | security |
| `e2e/**`, `*.md`, `*.json` | none — invariants only | inline |

## Two rows that are easy to get wrong

**`security` runs on the whole diff, as its own subagent.** It is the one review
that reads across boundaries by nature — a value is safe or unsafe because of
where it came from, which is usually in a different package from where it lands.
Scoping it to one domain defeats it.

The one exception: skip it when the diff contains no executable file at all —
nothing matching `*.{ts,tsx,js,jsx,mjs,sql,sh,yml,yaml}` or `Dockerfile*`. A
docs-and-skills-only diff has no attack surface, and an agent with nothing to
review still returns opinions.

**`typescript-expert` never gets an agent of its own.** It has no boundary: it
would match every file in every diff and duplicate whatever the domain agent is
already doing. Fold it into whichever agent owns the file.

## Domains and their agents

Four at most, launched in one message so they run in parallel. Skip any domain
that matched no files — an agent with nothing to review still costs a round trip
and still returns opinions.

| Domain | Owns | Typically loads |
|---|---|---|
| `backend` | `server/src/{modules,adapters,platform}`, `reviewer-core/src`, `vendor/shared` | `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert` |
| `frontend` | `client/src` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert` |
| `data` | `server/src/db`, `modules/*/repository*.ts` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `security` | the entire diff | `security` |

A file can belong to two domains — a repository file is both `backend` and
`data`. Give it to both; the overlap is caught when findings are deduped by
`(file, line, rule)`, and the alternative is a gap.

## What is not routed

`e2e/**`, markdown and JSON get no skill. They still go through Phase 3
invariants — a `package.json` with a workspace field and a doc naming somebody
else's branch are both findings, and neither is a skill's job.

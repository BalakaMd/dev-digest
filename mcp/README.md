# `@devdigest/mcp` — local stdio MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
lets an MCP client (Claude Code, the Inspector, …) drive DevDigest reviews
through the existing API — a thin client, never a second way into the
database.

## Tools

| Tool | What it does | API calls |
|------|--------------|-----------|
| `devdigest_list_agents` | List configured review agents (name, model, enabled) | `GET /agents` |
| `devdigest_run_review` | Run agent(s) on a PR, blocking up to 120 s | `GET /repos`, `GET /repos/:id/pulls/:number`, `GET /agents`, `GET /settings/secrets-status`, `POST /pulls/:id/review`, `GET /pulls/:id/runs`, `GET /pulls/:id/reviews` |
| `devdigest_get_findings` | Read findings for a PR (one run or the latest per agent), paginated | `GET /pulls/:id/runs`, `GET /pulls/:id/reviews` |
| `devdigest_get_conventions` | Read a repo's extracted coding conventions | `GET /repos`, `GET /repos/:id/conventions` |
| `devdigest_get_blast_radius` | Blast radius of a PR: symbols declared in its changed files, their callers (`file:line`) and the HTTP endpoints / crons that depend on them. Read-only, no LLM | `GET /repos`, `GET /repos/:id/pulls/:number`, `GET /pulls/:id/blast` |

A PR is identified as `owner/repo#123` or a GitHub PR URL; a repo as
`owner/repo`. `response_format: "concise" | "detailed"` (default `concise`)
controls how much detail comes back.

`devdigest_get_blast_radius` lists every caller the API returns per symbol (the
API keeps at most 20 per symbol, best-ranked first). `detailed` adds each
caller's function name and the indexed commit. When the repo index is degraded,
the output starts with an `Index incomplete (<reason>)` line. A PR that was
never imported is not synced on demand.

## Env vars

| Var | Default | Meaning |
|-----|---------|---------|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the DevDigest API |
| `DEVDIGEST_MCP_HTTP_TIMEOUT_MS` | `10000` | Per-request timeout to the API |

No secrets live here — `devdigest_run_review`'s key pre-check reads only the
booleans from `GET /settings/secrets-status`.

## Package manager: npm

`reviewer-core` and `e2e` are this repo's non-app tooling packages and both
use npm; `server`/`client` are the pnpm apps. npm ships with Node, so a
teammate who only opens the repo in an MCP client can run this package without
installing pnpm, and `npm --prefix mcp run` sets the cwd Claude Code needs for
the tsconfig path alias below.

## Registering with Claude Code

The project-scope `.mcp.json` at the repo root already registers this server:

```json
{ "mcpServers": { "devdigest": { "type": "stdio", "command": "npm", "args": ["--prefix", "mcp", "run", "--silent", "start"] } } }
```

`./scripts/dev.sh` does not install or start this package. Install its
dependencies once, by hand:

```sh
cd mcp && npm ci
```

Then start the API (`./scripts/dev.sh` or `cd server && pnpm dev`) and check
that `/mcp` in Claude Code shows `devdigest` connected with 5 tools. Without
`mcp/node_modules` the server fails to start and `/mcp` only says "failed".

## Running it directly (Inspector)

```sh
npx @modelcontextprotocol/inspector npm --prefix mcp run --silent start
```

## Runtime

Runs as raw TypeScript under `tsx` — no build step, matching `server` dev and
`e2e`. `@devdigest/shared` resolves to `../server/src/vendor/shared` via a
tsconfig path alias (never a workspace field — this is not a monorepo).
Transport: **stdio only**, local.

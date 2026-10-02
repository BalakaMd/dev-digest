# `@devdigest/mcp` — local stdio MCP server

A thin HTTP client of the DevDigest API (Fastify on `:3001`), exposed over MCP
stdio. Five tools: list agents, run a review (blocking, 120 s cap), get
findings, get conventions, and get a PR's blast radius (read-only, from the
persisted repo index).

## Stack

TypeScript 5.7 · `@modelcontextprotocol/sdk` 1.x · Zod 3 (own copy; contracts
borrowed from `@devdigest/shared` via a tsconfig path alias) · `tsx` (no build
step) · vitest 2. Package manager: **npm** (like `reviewer-core`/`e2e`, not
pnpm — see `mcp/README.md` for the reasoning).

## Commands

```sh
npm run start       # tsx src/index.ts — stdio; normally spawned by Claude Code
npm test            # vitest, hermetic — fake fetch, no network
npm run typecheck   # tsc --noEmit
```

## Conventions

- **stdout carries only the MCP protocol.** `index.ts` redirects
  `console.log/info/debug` to stderr first; `log.ts` writes to stderr only.
  Never `console.log`/print anywhere else in this package.
- **Thin client: no DB, no server internals.** `api/client.ts` is the only
  module that calls `fetch`; every response is `safeParse`d against
  `@devdigest/shared`. The only server import is that vendored shared
  contracts module — never `server/src/modules/**` or `server/src/db/**`.
- **Zod-instance rule:** only schemas built with this package's own `zod`
  import go into a tool's `inputSchema`/`outputSchema`. Shared contracts are
  used only to validate API responses (a different zod copy at runtime is
  harmless there — see `INSIGHTS.md`).
- Errors funnel through one place: `tools/common.ts#toToolError`. A tool
  result never carries a stack trace; the raw error goes to stderr first.
- `run_review`'s wait loop (`review/wait.ts`) takes an injected clock/sleep —
  tests never wait on a real timer.

## Do not touch

- The only route this package's tests may hit through a fake `fetch` is
  documented in `src/api/client.ts`'s method list — do not add a call that
  reaches Postgres or a server module directly.

## Read When

| Document | Read it when |
|----------|--------------|
| [README.md](README.md) | you need the tool table, env vars, or how to register this in Claude Code |
| [INSIGHTS.md](INSIGHTS.md) | before a non-trivial change here |

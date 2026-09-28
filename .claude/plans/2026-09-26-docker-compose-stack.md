# Development Plan: Whole stack via docker compose, Cloud-Run-ready images

Created: 2026-09-26 · Branch: hw-003 · HEAD: 59f65c2 · Status: ready

## Goal & acceptance criteria

User task (translated): "Review the project carefully and write a plan for running the whole project with docker-compose, e.g. with a single command, so that it can later be moved easily to something like Cloud Run."

- "running the whole project with docker-compose, e.g. with a single command" → S5, S6
- "`docker compose up` (or one wrapper script) brings up postgres → one-shot migrate (→ optional seed) → API → web" → S3, S4, S5, S6 · deviates: the command is `docker compose --profile app up …` (or `./scripts/stack.sh up`), because bare `docker compose up -d` must stay Postgres-only for `scripts/dev.sh:57` and `.github/workflows/e2e-web.yml:56`. The seed always runs: `LocalNoAuthProvider` throws when the seeded user and workspace are missing (`server/src/adapters/auth/local.ts:23,34`). See Q3 and Q5.
- "using production-style images that deploy unchanged to Cloud Run" → S2, S3, S4 · deviates: the API image is env-configurable (S2 adds `WEB_ORIGIN`; Cloud Run uses `--port 3001`). The web image bakes `NEXT_PUBLIC_API_BASE` in at `next build` (`client/next.config.mjs:8-10`, `client/src/lib/api.ts:5-6`), so it must be **rebuilt per environment** with a build arg. It cannot be deployed unchanged. See Q2.
- "Local dev via `scripts/dev.sh` and the Postgres-only compose must keep working" → S5, S7
- "from a clean clone with only Docker + an API key: one command → web on :3000 talks to API" → S1, S5, S6, S7
- "migrations applied" → S5, S7
- "`docker compose down` + up is idempotent" → S5, S7
- "images build for linux/amd64" → S3, S4, S6, S7
- "dev.sh unchanged behaviour" → S5, S7 (dev.sh itself is not edited)
- "Actual Cloud Run deployment … out of scope; include only a short 'Cloud Run mapping' section" → see § Cloud Run mapping (no step)

## Scope
In: root `.dockerignore`, `server/Dockerfile`, `client/Dockerfile`, conditional standalone output in `client/next.config.mjs`, `app` profile services in the root `docker-compose.yml`, the `scripts/stack.sh` wrapper, an optional `WEB_ORIGIN` CORS override in server config (+ unit test), and INSIGHTS entries.
Out: gcloud/Terraform, Cloud SQL, CI workflows for images, doc updates (see Q7), `server/docker-compose.yml` (see Q8), changes to `scripts/dev.sh` / `scripts/e2e.sh`, `package.json` / lockfile edits, and any esbuild bundling (see Q1).

## Context used
- Guidance read: `CLAUDE.md`, `server/AGENTS.md` (= `server/CLAUDE.md`), `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `TESTING.md`, `README.md` (grep), `server/README.md` (grep), `.github/workflows/e2e-web.yml`, `.claude/skills/pr-self-review/references/{routing,repo-invariants}.md`.
- Lessons applied:
  - `TESTING.md:83-86`: `server/package.json` is skip-worktree, and its committed `start` is `node dist/server.js`, which does not run without a build. The plan never edits it. The runtime entry is `tsx src/server.ts`, which CI already runs (`e2e-web.yml:85-88`) and `scripts/e2e.sh:134` also uses.
  - `server/INSIGHTS.md` 2026-09-26 (real keys leak into processes via env or `secrets.json`): the images never bake `.env` files (S1 allowlist). Secrets reach the container only at runtime.
  - Root `INSIGHTS.md` 2026-09-24 (`vendor/shared` drift): not touched.
  - `CLAUDE.md` Gotchas (5433 vs 5432) and `repo-invariants.md` §7 (the PR gate flags any added non-md line containing `5432`): in-network DB URLs **omit the port** (`postgres://devdigest:devdigest@postgres/devdigest`, where postgres.js defaults to the container port). The host still publishes 5433 (`docker-compose.yml:13`, unchanged).
  - `CLAUDE.md` Do-not-touch: no edits to lockfiles, `*/vendor/**`, migrations or `.claude/skills/**` (outside the listed own skills).
- Skills:
  - `onion-architecture`: config stays in the platform ring and secrets stay out of `AppConfig` (`config.ts:9-14`). Step S2.
  - `zod`: env schema field. Step S2.
  - `next-best-practices` § `self-hosting.md` (standalone output, `HOSTNAME=0.0.0.0`, copy `.next/static`). Step S4.
  - `fastify-best-practices` § `rules/deployment.md` (non-root user, health/readiness probes, graceful shutdown). Steps S3, S5.
  - `security`: every Dockerfile, compose and `.sh` file is routed to it (`routing.md:21`). Covers non-root users, no secrets in images or context, and least exposure. Steps S1, S3, S4, S5, S6.
  - `engineering-insights`: mandatory insight recording. Step S7.
  - Review-only skills (`pr-self-review`) are not assigned to implementation steps.

## Key facts the steps rely on (verified in code)
- The API listens on `0.0.0.0:${API_PORT}` (default 3001) (`server/src/server.ts:29`, `server/src/platform/config.ts:29`). It does **not** read `PORT`. On Cloud Run, deploy with `--port 3001`.
- The CORS origin is hard-wired to `http://localhost:${WEB_PORT}` (`config.ts:85`, used at `server/src/app.ts:90`).
- Health endpoints: `/health` (liveness) and `/health/ready` (DB `select 1`, 503 when down) (`app.ts:100-112`).
- SIGTERM starts a graceful close and logs "`SIGTERM received — shutting down`" (`server.ts:13-26`).
- In `NODE_ENV=development` the logger uses the `pino-pretty` transport (`app.ts:55-58`), so containers must set `NODE_ENV=production`.
- Migrations: the programmatic drizzle `migrate()` creates the `vector` extension first (`server/src/db/migrate.ts:19-34`). The folder is resolved relative to the file (`migrate.ts:10`). The CLI guard is `import.meta.url === file://argv[1]` (`migrate.ts:37`), and seed has the same guard (`server/src/db/seed.ts:257`). Both are idempotent.
- Runtime file reads by path: prompts at `src/prompts/*.md` (`server/src/platform/prompts.ts:20`), migrations at `src/db/migrations`. `@vscode/ripgrep` is imported dynamically, with a silent fallback when it is missing (`server/src/adapters/codeindex/ripgrep.ts:21-40`). `@ast-grep/napi` is a native prebuilt (`server/src/adapters/astgrep/index.ts:20`). simple-git needs the `git` CLI (`server/src/adapters/git/simple-git.ts:1,68`).
- `reviewer-core` source is aliased from `server/tsconfig.json:24-25`. It imports `@devdigest/shared` values (`reviewer-core/src/review/run.ts:9`) and `openai`/`zod` from `reviewer-core/node_modules` (`e2e-web.yml:73-80`), and it is ESM through `reviewer-core/package.json:5`. The image must mirror the `/app/server` + `/app/reviewer-core` sibling layout.
- pnpm config per package: `node-linker=hoisted` (`server/.npmrc:1`, `client/.npmrc:1`). Build scripts are already approved via `allowBuilds` in `server/pnpm-workspace.yaml:1-7` (ripgrep, ast-grep, esbuild) and `client/pnpm-workspace.yaml:1-4`. Both files must be copied **before** `pnpm install`, otherwise the layout and build approvals differ.
- Cloning and secrets paths: `DEVDIGEST_CLONE_DIR` and `DEVDIGEST_SECRETS_PATH` are configurable (`config.ts:31,34,69-76`). `LocalSecretsProvider` reads the file first and falls back to `process.env` (`server/src/adapters/secrets/local.ts:37-42`). It writes mode 0600 and creates the directory (`local.ts:44-49`).
- Reviews run **after** the HTTP response (`void this.executor.executeRuns(...)`, `server/src/modules/reviews/service.ts:134`). Jobs run on an in-process p-queue (`server/src/platform/jobs.ts:40`). Stale runs are reaped on boot, which assumes a single instance (`app.ts:70-85`).
- The client calls the API **from the browser**: `apiFetch` (`client/src/lib/api.ts:24`) and SSE `EventSource` (`client/src/lib/hooks/reviews.ts:181`). Every page is `"use client"`, so there is no server-side API fetch.
- next-intl reads `process.cwd()/messages/<locale>/*.json` at runtime via `readdirSync` (`client/src/i18n/request.ts:16-24`). File tracing will not pick it up, so the runner image must copy `client/messages`. `client/public/` does **not** exist, so do not copy it.
- `.gitignore:12` ignores `.env` at any depth. The developer's `server/.env` / `client/.env` may hold real keys.

## Architecture constraints
| Rule | Source | How the plan complies |
|------|--------|-----------------------|
| Not a monorepo; each package owns its lockfile and installer | `CLAUDE.md` Conventions, Do not touch | Each image installs per package with its own tool (`pnpm install --frozen-lockfile` / `npm ci`). No workspace fields and no lockfile edits. |
| `reviewer-core` never emits JS; server imports raw TS | `CLAUDE.md`, `reviewer-core/CLAUDE.md` | Runtime runs `tsx` over source. Nothing compiles `reviewer-core`. |
| Migrations never run on boot | `server/AGENTS.md:17` | A separate one-shot `migrate` service (a Cloud Run Job later). The API command never migrates. |
| Secrets never in DB or git; single read chokepoint | `CLAUDE.md` Gotchas, `server/AGENTS.md:38-40` | No keys in images or compose literals. They arrive at runtime through `env_file` or the Settings UI → `DEVDIGEST_SECRETS_PATH` on a volume. |
| Config in the platform ring; secrets not in `AppConfig` | `onion-architecture`, `config.ts:9-14` | S2 adds a non-secret `WEB_ORIGIN` field only. |
| The 5432 literal is flagged by the PR gate | `repo-invariants.md` §7 | In-network URLs omit the port. |
| `server/package.json` is skip-worktree | `TESTING.md:83` | It is not edited. `tsx` stays a devDependency, so the image installs devDeps (Q12). |
| No linter/formatter invented | `CLAUDE.md` | None added. |

## Steps

### S1 Root `.dockerignore` (allowlist)
- Module / layer: repo root, build context
- Files: create `.dockerignore`. Use allowlist style: first ignore `**`, then re-include `server/`, `client/`, `reviewer-core/`, then re-exclude `**/node_modules`, `**/.next`, `**/dist`, `**/.env`, `**/.env.*`, `**/clones`, `**/coverage`, `**/*.tsbuildinfo`, `**/*.log`. Keep `**/.npmrc` and `**/pnpm-workspace.yaml` included; they are needed by S3/S4. Add a comment line explaining why an allowlist is used: host `node_modules` has darwin binaries, and `.env` may hold real keys.
- Skills to apply: `security` § secrets management
- Depends on: —
- Done when: the context contains only the three package dirs and has no `.env`, `node_modules`, `.next`, `clones` or `.git`.
- Verify: `printf 'FROM busybox\nCOPY . /ctx\nRUN find /ctx -maxdepth 3 | sort\n' | docker build --no-cache --progress=plain -f- .` Inspect the listing: no `.env`, `node_modules`, `.next` or `clones` entries.

### S2 Server: optional `WEB_ORIGIN` CORS override (runtime, for Cloud Run)
- Module / layer: `server` / platform (config)
- Files:
  - modify `server/src/platform/config.ts`. Add `WEB_ORIGIN: z.string().url().optional()` to `EnvSchema` (lines 15-42). Set `webOrigin: parsed.WEB_ORIGIN ?? \`http://localhost:${parsed.WEB_PORT}\`` (line 85). Update the `webOrigin` doc comment (line 54): "Allowed CORS origin (WEB_ORIGIN, else http://localhost:WEB_PORT)".
  - modify `server/.env.example`. Add a commented `# WEB_ORIGIN=` line with a one-line comment near `WEB_PORT` (line 28).
  - create `server/test/config.test.ts` (hermetic unit, **not** `.it.test.ts`). It calls `loadConfig({...})` with explicit env objects, never `process.env`. Two cases: the default derives from `WEB_PORT`, and `WEB_ORIGIN` overrides it.
- Skills to apply: `onion-architecture` (platform ring; no secrets in `AppConfig`), `zod` (optional + url validation)
- Depends on: —
- Done when: `loadConfig({ WEB_ORIGIN: 'https://web.example.run.app' }).webOrigin` equals that URL, and the default is unchanged.
- Verify: `cd server && pnpm exec vitest run test/config.test.ts && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm typecheck`

### S3 `server/Dockerfile` (API, migrate and seed share one image)
- Module / layer: `server` + `reviewer-core`, container image. Build context = repo root (`-f server/Dockerfile`).
- Files: create `server/Dockerfile`.
  - Base: `node:22-bookworm-slim`. Use Debian/glibc because `@ast-grep/napi` and `@vscode/ripgrep` ship glibc prebuilts; say so in a comment and do not use alpine. `apt-get install --no-install-recommends git ca-certificates` (simple-git needs `git`).
  - `deps` stage:
    - `npm i -g pnpm@10` (matches CI `pnpm/action-setup` `version: 10`; see Q9).
    - `WORKDIR /app`.
    - Copy `reviewer-core/package.json` and `package-lock.json`, then `npm ci --omit=dev` in `reviewer-core`.
    - Copy `server/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `.npmrc`, then `pnpm install --frozen-lockfile` in `server`. This installs devDeps because `tsx` is one.
    - **Do not set `NODE_ENV=production` in this stage.** pnpm would skip devDeps.
  - `runtime` stage (same base, without pnpm):
    - Copy the two `node_modules` trees from `deps`.
    - Copy `reviewer-core/{package.json,tsconfig.json,src}` → `/app/reviewer-core/`.
    - Copy `server/{package.json,tsconfig.json,src}` → `/app/server/`. `src` carries `db/migrations` and `prompts`.
    - `RUN mkdir -p /data && chown node:node /data`.
    - Set `ENV NODE_ENV=production DEVDIGEST_CLONE_DIR=/data/clones DEVDIGEST_SECRETS_PATH=/data/secrets.json`.
    - `WORKDIR /app/server`, `USER node`, `EXPOSE 3001`.
    - `CMD ["node_modules/.bin/tsx","src/server.ts"]`. Migrate and seed use the same image with the command overridden to `node_modules/.bin/tsx src/db/migrate.ts` or `… src/db/seed.ts`.
  - No `ARG` or `ENV` carries any key.
- Skills to apply:
  - `security` (non-root, no secrets, minimal packages)
  - `fastify-best-practices` § deployment (non-root, probes)
- Depends on: S1
- Done when: the image builds, and a container runs as `node` with a working `git`, a resolvable ripgrep binary and no `.env`.
- Verify:
  - `docker build -f server/Dockerfile -t devdigest-api:local .`
  - `docker run --rm devdigest-api:local sh -c 'id -un; git --version; ls -a /app/server; node -e "import(\"@vscode/ripgrep\").then(m=>{require(\"fs\").accessSync(m.rgPath);console.log(\"rg ok\")})"'`. Expect `node`, a git version, no `.env`, and `rg ok`.

### S4 Web image: conditional standalone output + `client/Dockerfile`
- Module / layer: `client`, build config + container image. Build context = repo root (`-f client/Dockerfile`).
- Files:
  - modify `client/next.config.mjs` (lines 6-11). Add `output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined`, with a comment that only the Docker build sets it. This keeps `pnpm build && pnpm start` in CI (`e2e-web.yml:101-102`) and dev unchanged.
  - create `client/Dockerfile`. Three stages on `node:22-bookworm-slim` with `npm i -g pnpm@10`:
    - `deps`: copy `client/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,.npmrc}`, then `pnpm install --frozen-lockfile`.
    - `builder`: copy `node_modules` and `client/`. Declare `ARG NEXT_PUBLIC_API_BASE=http://localhost:3001` and `ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1`, then `pnpm build`.
    - `runner`: `WORKDIR /app`, `ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1`. `COPY --chown=node:node` of `.next/standalone` → `./`, `.next/static` → `./.next/static` and `messages` → `./messages`. There is no `public/`. Then `USER node`, `EXPOSE 3000`, `CMD ["node","server.js"]`.
- Skills to apply:
  - `next-best-practices` § self-hosting (standalone, HOSTNAME, static copy, build-time `NEXT_PUBLIC_*`)
  - `security` (non-root; no `.env` in context)
- Depends on: S1
- Done when: the default `pnpm build` produces no `.next/standalone`. The image serves `/` with 200, and translated UI text renders, which proves `messages/` was found.
- Verify:
  - `cd client && pnpm typecheck && pnpm test && pnpm build && test ! -d .next/standalone`
  - `docker build -f client/Dockerfile --build-arg NEXT_PUBLIC_API_BASE=http://localhost:3001 -t devdigest-web:local .`
  - `docker run --rm -d -p 3000:3000 --name dd-web-check devdigest-web:local && sleep 3 && curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/ ; docker logs dd-web-check | grep -i -E 'ENOENT|messages' ; docker rm -f dd-web-check`. Expect 200 and no `ENOENT … messages`.

### S5 Root `docker-compose.yml`: `app` profile services
- Module / layer: repo root, orchestration
- Files: modify `docker-compose.yml`. Leave the `postgres` service byte-identical (lines 4-20). Add:
  - An extension field `x-api-image` (YAML anchor) with `build: {context: ., dockerfile: server/Dockerfile}` and `image: devdigest-api:local`. `migrate`, `seed` and `api` all use it, so the image is built once and then cached.
  - Shared API env anchor:
    - `DATABASE_URL: postgres://devdigest:devdigest@postgres/devdigest` (no port literal, see constraints)
    - `NODE_ENV: production`
  - `migrate`: `profiles: ["app"]`, command `node_modules/.bin/tsx src/db/migrate.ts`, `depends_on: postgres: {condition: service_healthy}`, `restart: "no"`.
  - `seed`: `profiles: ["app"]`, command `… src/db/seed.ts`, `depends_on: migrate: {condition: service_completed_successfully}`, `restart: "no"`. Add a comment: it is required because `LocalNoAuthProvider` needs the seeded user and workspace, and it is idempotent.
  - `api`:
    - `profiles: ["app"]`, `ports: ["3001:3001"]`.
    - `env_file: [{path: server/.env, required: false}]`. This reuses keys a developer already keeps there (`scripts/dev.sh:44`).
    - `environment:` (overrides `env_file`) = the shared anchor plus `API_PORT: 3001`, `WEB_PORT: 3000`, `DEVDIGEST_CLONE_DIR: /data/clones`, `DEVDIGEST_SECRETS_PATH: /data/secrets.json`.
    - `volumes: [devdigest_data:/data]`.
    - `depends_on: seed: {condition: service_completed_successfully}`.
    - Healthcheck: `["CMD","node","-e","fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]` with `start_period: 30s`.
    - `restart: unless-stopped`.
  - `web`:
    - `profiles: ["app"]`.
    - `build: {context: ., dockerfile: client/Dockerfile, args: {NEXT_PUBLIC_API_BASE: "${NEXT_PUBLIC_API_BASE:-http://localhost:3001}"}}`, `image: devdigest-web:local`.
    - `ports: ["3000:3000"]`, `depends_on: api: {condition: service_healthy}`.
    - Node-fetch healthcheck on `http://127.0.0.1:3000/`.
    - `restart: unless-stopped`.
  - Volume `devdigest_data: {name: devdigest_data}` next to the existing `devdigest_pgdata`.
  - Do **not** set `container_name` on new services, so they cannot clash with the fixed `devdigest-postgres` / `devdigest-e2e-postgres`. Do **not** add a `docker-compose.override.yml` / `compose.yaml`: those are auto-loaded or preferred and would change bare `docker compose up -d`.
  - Top-of-file comment:
    - bare `up -d` = Postgres only (dev.sh and CI)
    - `--profile app` = full stack
    - keys come from `server/.env` or the Settings UI (persisted in `devdigest_data`)
- Skills to apply:
  - `security` (no literal keys; only the DB dev creds that already exist at lines 9-11)
  - `fastify-best-practices` § deployment (readiness probe)
- Depends on: S3, S4
- Done when: bare compose resolves to `postgres` only, and the profile brings up all services in order with api and web healthy.
- Verify:
  - `docker compose config --services`. Expect exactly `postgres`.
  - `docker compose --profile app config -q`
  - `docker compose --profile app up -d --build --wait`
  - `docker compose --profile app ps -a`. Expect migrate and seed `Exited (0)`, api and web healthy.
  - `docker compose --profile app logs migrate | grep 'migrations applied'`

### S6 Wrapper `scripts/stack.sh` (single command)
- Module / layer: repo root scripts
- Files: create `scripts/stack.sh` (executable, `set -euo pipefail`, header help block in the same style as `scripts/dev.sh:2-12`). Subcommands:
  - `up` (default): check `docker compose version`, warn when compose is older than 2.24 (needed for `env_file.required`, Q10). Warn, but do not fail, when neither `server/.env` nor `OPENROUTER_API_KEY` is present: the app boots without a key, per `CLAUDE.md` Gotchas. Then run `docker compose --profile app up -d --build --wait` and print `web http://localhost:3000 · api http://localhost:3001`.
  - `down`: `docker compose --profile app down`. It keeps volumes, and the script says `down -v` resets data.
  - `logs [svc]`: `docker compose --profile app logs -f`.
  - `build-amd64`: `docker buildx build --platform linux/amd64 -f server/Dockerfile -t devdigest-api:amd64 .` and the same for the client with `--build-arg NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:3001}"`. Use `--load` so no registry is assumed.
  - Mention the port conflict: `dev.sh` servers and this stack both use 3000/3001, so run one at a time.
- Skills to apply: `security` (quote variables; no secret echoing)
- Depends on: S5
- Done when: `./scripts/stack.sh` starts the stack and `./scripts/stack.sh down` stops it without removing volumes.
- Verify: `bash -n scripts/stack.sh && ./scripts/stack.sh up && ./scripts/stack.sh down && docker volume ls | grep -E 'devdigest_(pgdata|data)'`

### S7 Acceptance run + insights
- Module / layer: whole repo (verification), `INSIGHTS.md` files
- Files: modify `INSIGHTS.md` (root: Docker/compose/scripts findings), and `server/INSIGHTS.md` / `client/INSIGHTS.md` only for package-specific findings. Add an entry only if it passes the `engineering-insights` bar, after re-reading the log for duplicates. Candidates to evaluate, not to force: the next-intl `messages/` runtime read being missed by standalone tracing; `NODE_ENV=production` in a pnpm install stage silently dropping devDeps (`tsx`); a bare `docker compose up` staying Postgres-only only because of profiles.
- Skills to apply: `engineering-insights` (bar, dedup, format, routing table)
- Depends on: S1–S6
- Done when: every check below passes, and any insight written meets the bar.
- Verify (one per acceptance criterion):
  1. One command: `./scripts/stack.sh up`.
  2. Web talks to API:
     - `curl -fsS -D- -o /dev/null -H 'Origin: http://localhost:3000' http://localhost:3001/health | grep -i 'access-control-allow-origin: http://localhost:3000'`
     - Open http://localhost:3000 in a browser. It lands on the seeded repo `acme/payments-api` with no "Cannot reach the DevDigest engine" error (`client/src/lib/api.ts:37`).
     - Optional, if `agent-browser` is installed: `cd e2e && npm test`. It defaults to `E2E_BASE_URL` http://localhost:3000.
  3. Migrations applied: `docker compose --profile app logs migrate | grep 'migrations applied'` and `curl -fsS http://localhost:3001/health/ready`.
  4. Idempotent:
     - `./scripts/stack.sh down && ./scripts/stack.sh up`. It must succeed again with migrate and seed `Exited (0)`.
     - A key set in Settings survives the cycle, because it lives in `devdigest_data`.
     - Graceful stop: `docker compose --profile app stop api && docker compose --profile app logs api | grep 'SIGTERM received'`. If the line is missing, tsx is not forwarding signals: switch the CMD to `node --import tsx src/server.ts` and re-verify.
  5. linux/amd64: `./scripts/stack.sh build-amd64`, then `docker image inspect devdigest-api:amd64 devdigest-web:amd64 --format '{{.Architecture}}'` prints `amd64` twice.
  6. dev.sh unchanged:
     - `./scripts/stack.sh down && ./scripts/dev.sh --db-only`. It succeeds, and `docker compose ps` lists only `postgres`.
     - `git diff --quiet -- scripts/dev.sh scripts/e2e.sh .github/`
  7. No port literal: `git diff -- ':!*.md' | grep -nE '^\+.*\b5432\b'`. Expect no output.
  8. Existing suites: see the Test plan.
  - Note: a true clean-clone check (`git clone` of a commit containing this work) is only possible after the user commits. Until then, S1's context listing stands in for it.

## Independent step groups (for parallel implementers)
- Group A: **S2** only (`server/src/platform/config.ts`, `server/.env.example`, `server/test/config.test.ts`). No `Depends on`, no shared files; its checks are server vitest/tsc only.
- Group B: **S1 → (S3 ∥ S4) → S5 → S6**. S3 (`server/Dockerfile`) and S4 (`client/Dockerfile`, `client/next.config.mjs`) are mutually independent after S1: disjoint files, different packages. Both run `docker build`, which is safe to run concurrently with different tags.
- S7 runs last, after A and B.
- Recommendation: ~10 files in total, below the one-instance limit. The groups are too small to earn separate cold starts (`dev-flow` "Parallel instances" rule 6), so use **one implementer instance**. If you split anyway, use `#1: S2 ∥ #2: S1,S3,S4,S5,S6`, then S7 in this session.

## Cross-module contracts & sync points
- `NEXT_PUBLIC_API_BASE` (build-time) ↔ the API published host/port. These must change together: the `web.build.args` in compose (S5), the `build-amd64` arg in S6, and the `client/Dockerfile` ARG default (S4).
- The API CORS origin (`WEB_PORT` / `WEB_ORIGIN`, S2) ↔ the web published origin (`3000` in S5). Opening the UI at `127.0.0.1:3000` instead of `localhost:3000` breaks CORS.
- Image filesystem layout `/app/server` + `/app/reviewer-core` ↔ `server/tsconfig.json:24-25` and `reviewer-core/tsconfig.json:22-23` relative aliases.
- `DEVDIGEST_CLONE_DIR` / `DEVDIGEST_SECRETS_PATH` (S3 image defaults) ↔ the `devdigest_data:/data` mount (S5) ↔ `/data` owned by `node` (S3).
- The postgres service name `postgres` ↔ the host part of `DATABASE_URL` in S5.

## Test plan
- Existing suites to run:
  - `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm typecheck`: S2 changes config.
  - `cd server && pnpm exec vitest run .it.test` (needs Docker): `loadConfig` is used by every it-suite (e.g. `server/test/reviews.it.test.ts:15`).
  - `cd client && pnpm test && pnpm typecheck && pnpm build`: S4 changes `next.config.mjs`. The default build must stay non-standalone.
  - `cd reviewer-core && npm test`: sanity only; its source is not touched.
- New tests:
  - `WEB_ORIGIN` overrides the CORS origin, and the default still derives from `WEB_PORT` — unit (hermetic) — `server/test/config.test.ts` — owner: implementer (S2).
- Not tested:
  - Dockerfiles, compose and `scripts/stack.sh` — TESTING.md has no container/infra suite, and CI does not build images. They are verified by the S3–S7 commands instead (see Q14).
  - Cloud Run mapping — out of scope for implementation.

## Cloud Run mapping (reference, not implemented)
| Compose piece | Cloud Run / GCP | Notes / follow-up needs |
|---|---|---|
| `postgres` | Cloud SQL for PostgreSQL 16 | `migrate.ts:23` runs `CREATE EXTENSION IF NOT EXISTS vector`. The DB user needs the privilege (Q11). `DATABASE_URL` from Secret Manager, unix socket `/cloudsql/<CONN>` (postgres.js URL form: Q11). |
| `migrate`, `seed` | Cloud Run **Jobs** from `devdigest-api` with command override (`node_modules/.bin/tsx src/db/{migrate,seed}.ts`) | Execute before rolling out a new API revision. The seed inserts demo fixtures too (Q5). |
| `api` | Cloud Run service | `--port 3001`, `WEB_ORIGIN=<web URL>` (S2), `NODE_ENV=production`. Keys as Secret Manager env vars (`local.ts:40-41` env fallback). Background reviews and jobs (`service.ts:134`, `jobs.ts`) need instance-based billing (CPU always allocated) + `min-instances=1`. Stale-run reaping assumes one instance (`app.ts:78-79`), so `max-instances=1`. SSE needs a request timeout up to 3600s. `/health` = liveness, `/health/ready` = startup/readiness probe. `/data` is ephemeral (Q6). Rate limit is keyed by IP behind Google's proxy without `trustProxy` (`app.ts:96`), which is a follow-up. |
| `web` | Cloud Run service | Standalone server honours injected `PORT` and `HOSTNAME=0.0.0.0`. Build with `NEXT_PUBLIC_API_BASE=<api URL>` (per-environment image, Q2). |
| `devdigest_data` volume | none by default | Clones and the UI-entered `secrets.json` are lost on instance restart (Q6). |
| Images | Artifact Registry | `./scripts/stack.sh build-amd64`, then tag and push, which is a follow-up. |

## Risks & open questions
- [non-blocking] Q1 Server runtime: **tsx over source (default)** vs esbuild bundle.
  - Why tsx: it is the path CI already proves (`e2e-web.yml:85-88`), it keeps the path-relative assets working unchanged (`prompts.ts:20`, `migrate.ts:10`, the CLI guards at `migrate.ts:37`/`seed.ts:257`), and it needs no `package.json` edit (skip-worktree, `TESTING.md:83`).
  - What a bundle would need: esbuild is only a transitive dependency of tsx, so it must be added or pinned. Mark every package external (native `@ast-grep/napi`, dynamic `@vscode/ripgrep`). Copy `src/prompts` to `<dist>/../prompts` and the migrations to `<dist>/migrations`. Add separate migrate/seed entries.
  - Cost of tsx: a bigger image, since it includes devDeps, and slower cold starts because of on-the-fly transpile.
- [non-blocking] Q2 Browser → API: **browser-direct with build-time `NEXT_PUBLIC_API_BASE` + runtime `WEB_ORIGIN` (default)**. This matches the current data layer (`api.ts:5-6`, `reviews.ts:181`), but the web image is per-environment. The alternative is a same-origin proxy Route Handler in `client` that reads a runtime `API_INTERNAL_URL`, which gives one web image for every environment and removes CORS. It changes the data-access path, and SSE streaming through the proxy needs research.
- [non-blocking] Q3 Compose layout: **`profiles: ["app"]` in the root file (default)**. This keeps bare `docker compose up -d` Postgres-only for `dev.sh:57` and `e2e-web.yml:56` with a single source for `postgres`. The alternative is a second file used via `-f docker-compose.yml -f <file>`. Never name that file `compose.yaml` or `docker-compose.override.yml`, since compose auto-loads or prefers them.
- [non-blocking] Q4 Secrets in compose: **optional `env_file: server/.env` + Settings UI persisted in the `devdigest_data` volume (default)**. The alternative is compose interpolation from a root `.env` / shell (`${OPENROUTER_API_KEY:-}`). Do not mix the two: an interpolated empty value in `environment:` would override `env_file`.
- [non-blocking] Q5 Seed: **always on (default)**, because the no-auth provider requires the seeded user and workspace (`local.ts:23,34`). Making it truly optional, or skipping the demo PR fixtures on Cloud Run, needs a server change that splits bootstrap from demo data. That is a follow-up.
- [non-blocking] Q6 Clones and UI secrets on Cloud Run: the filesystem is ephemeral. Default for the follow-up: keys only via Secret Manager env, with the UI key entry treated as non-persistent there. For clones, a Cloud Storage FUSE or Filestore volume at `/data`, or re-clone on demand. Check whether stored repo `clonePath` values (`repo-intel/pipeline/full.ts:144`) break after a restart.
- [non-blocking] Q7 Docs would become incomplete: `README.md` (lines 23, 68, 93-119 describe Docker as Postgres-only), `CLAUDE.md` § Commands (no stack command), `server/README.md:94-100` (env table lacks `WEB_ORIGIN`; also shows 5432). No doc-writer was selected. Default: a separate docs pass after approval.
- [non-blocking] Q8 `server/docker-compose.yml` duplicates the old root file and uses the same project and container name. Default: leave it untouched.
- [non-blocking][research] Q9 pnpm version: `allowBuilds` in the per-package `pnpm-workspace.yaml` must be honoured by the pnpm in the image. Default: `pnpm@10` like CI. After the first green build, pin the exact version the developer uses (`pnpm --version`). The S3 ripgrep check detects skipped build scripts.
- [non-blocking][research] Q10 Compose features: `env_file.required: false` needs Compose ≥ 2.24. `up --wait` with one-shot services that exit 0 should be confirmed on the installed version. If `--wait` treats them as failures, use `--wait api web`.
- [non-blocking][research] Q11 Cloud SQL: confirm pgvector availability for PG16, the privilege needed for `CREATE EXTENSION vector`, and the postgres.js unix-socket URL syntax (`?host=/cloudsql/...`).
- [non-blocking] Q12 Image size: the API image carries devDeps (vitest, testcontainers, drizzle-kit) because `tsx` is a devDependency and `server/package.json` is skip-worktree. Moving `tsx` to dependencies and pruning is a later option.
- [non-blocking] Q13 Pre-existing: `scripts/e2e.sh:27` defaults `PG_PORT` to 5433, which is already the port `devdigest-postgres` publishes (`docker-compose.yml:13`). Its comment claims dev uses 5432. This plan does not change it, and the stack's 3000/3001 do not collide with e2e's 3100/3101.
- [non-blocking] Q14 No CI builds the images, so Dockerfile regressions go unnoticed until someone builds. A small workflow is a possible follow-up.
- [non-blocking] Local builds use the working-tree (skip-worktree) `server/package.json`, not the committed one. Only its scripts are known to differ, and `--frozen-lockfile` checks dependencies only. The clean-clone check runs after the commit.

## Out of scope for the implementer
Architecture and security review are done by separate agents. Do not commit or push. Leave changes in the working tree.

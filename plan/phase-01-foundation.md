# Phase 01 — Foundation & Monorepo

**Goal:** Set up a monorepo where every component boots: web, api, agent, ai, proto and dev infrastructure. Business features start in Phase 2.
**Depends on:** nothing
**No tests in this phase.**

---

## 1. Root workspace

- [ ] `package.json` (private, `"packageManager": "pnpm@9"`), with scripts:
  - `dev` → `turbo run dev --filter=web --filter=api`
  - `build`, `lint`, `typecheck`, `format` → turbo / prettier
  - `proto:gen` → `buf generate`
  - `db:migrate` → `pnpm --filter api prisma migrate dev`
  - `db:studio`, `infra:up`, `infra:down` (docker compose in `infra/`)
- [ ] `pnpm-workspace.yaml`: `apps/*`, `packages/*`
- [ ] `turbo.json`: pipelines `build` (dependsOn `^build`, outputs `dist/**`, `.next/**`), `dev` (persistent, cache false), `lint`, `typecheck`
- [ ] `.nvmrc` = `22`, `.editorconfig`, `.prettierrc` (singleQuote, semi, printWidth 100), `.gitignore` (node_modules, dist, .next, .env*, !.env.example, agent/bin, ai/.venv, __pycache__)
- [ ] Root `.env.example` (copy from overview §7)
- [ ] Root `Makefile` with targets: `infra-up`, `infra-down`, `dev`, `agent-build`, `agent-run`, `ai-dev`, `proto`

## 2. `packages/config`
- [ ] `tsconfig.base.json` (strict, ES2022, moduleResolution bundler), `tsconfig.nest.json` (commonjs, decorators), `tsconfig.next.json`
- [ ] `eslint.config.mjs` flat config preset (typescript-eslint, import order). Export it for apps.

## 3. `packages/shared`
- [ ] Build with `tsup` (cjs + esm + dts). Name: `@nestus/shared`.
- [ ] `src/enums.ts`: `Role`, `ServerStatus` (`PENDING|ONLINE|OFFLINE|DEGRADED`), `ActorType`. Add more enums in later phases.
- [ ] `src/schemas/` folder with a zod `paginationQuery` schema (`cursor`, `limit` 1–100, default 25)
- [ ] `src/errors.ts`: `ErrorCode` string union plus `ApiError` type
- [ ] `src/index.ts` barrel

## 4. `apps/api` (NestJS 11)
- [ ] Scaffold with the Nest CLI and use `@nestus/shared`.
- [ ] `src/main.ts`: `app.setGlobalPrefix('api/v1')` (exclude `health`, `metrics`), helmet, CORS (`APP_URL`, credentials), cookie-parser, `ZodValidationPipe` global, shutdown hooks, Swagger at `/api/docs` (via `nestjs-zod` patch).
- [ ] `src/config/env.ts`: zod-validated env schema. Fail fast on boot with a readable error.
- [ ] `src/common/filters/http-exception.filter.ts` → `{ error: { code, message, details } }`
- [ ] `src/common/` stubs to fill later: `decorators/`, `guards/`, `interceptors/`
- [ ] `LoggerModule` (nestjs-pino, pretty in dev, adds `reqId`)
- [ ] `PrismaModule` (global `PrismaService` with `onModuleInit` connect)
- [ ] `RedisModule` (global; provides `REDIS` = ioredis client; separate `REDIS_SUB` for pub/sub)
- [ ] `PgModule` (global raw `pg.Pool` named `PG_POOL`, for Timescale hot paths in Phase 4)
- [ ] `HealthModule`: `GET /health` → `{ status, db, redis, version, uptime }` (uses @nestjs/terminus)
- [ ] `EventEmitterModule.forRoot({ wildcard: true })`
- [ ] `BullModule.forRootAsync` connected to Redis (queues are added later)

### Prisma
- [ ] `prisma/schema.prisma`: postgresql datasource, generator client, plus a single `SystemSetting { key String @id; value Json; updatedAt }` model
- [ ] First migration `init`. Add raw SQL at the top of the migration:
  ```sql
  CREATE EXTENSION IF NOT EXISTS timescaledb;
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  ```
- [ ] Note in `apps/api/prisma/README.md`: *Hypertables are created with raw SQL migrations and queried through `PG_POOL`. They are never Prisma models.*

## 5. `apps/web` (Next.js 15)
- [ ] `create-next-app` with TS, App Router, `src/` dir, Tailwind v4, ESLint. Import shared tsconfig.
- [ ] `shadcn init` (style: new-york, base color: zinc, CSS variables). Add components: button, card, input, label, dialog, dropdown-menu, table, badge, tabs, tooltip, sonner, sheet, separator, skeleton, avatar, select, switch, textarea, command, popover, scroll-area.
- [ ] Theme: dark-first infra look. Use `next-themes`, Geist Sans for UI and JetBrains Mono for metrics/logs. Accent color: electric cyan (`oklch(0.78 0.14 210)`). Status colors as tokens: `--ok`, `--warn`, `--crit`, `--info`.
- [ ] `src/lib/api.ts`: typed fetch wrapper (base URL, JSON, error-envelope parsing into `ApiError`, auth header injection added in Phase 2)
- [ ] `src/providers.tsx`: QueryClientProvider, ThemeProvider, Toaster
- [ ] `src/app/page.tsx`: placeholder landing with the NESTUS wordmark, the tagline *Deploy. Observe. Understand. Recover.*, and links to `/login` and `/register` (pages arrive in Phase 2)
- [ ] `src/app/status/page.tsx`: calls api `/health` and shows the result (proves the web→api wiring works)

## 6. `proto/` (buf)
- [ ] `buf.yaml` (module `proto`, lint DEFAULT, breaking FILE)
- [ ] `buf.gen.yaml`:
  - Go: `protocolbuffers/go` + `grpc/go` → `agent/gen/` with `paths=source_relative`
  - TS: `ts-proto` → `packages/proto-ts/src/gen` with options `outputServices=grpc-js,esModuleInterop=true,useDate=true,oneof=unions`
- [ ] `proto/nestus/v1/common.proto`: `message Empty {}`, `message KeyValue { string key = 1; string value = 2; }`
- [ ] `packages/proto-ts`: package `@nestus/proto-ts`, built with tsup, depends on `@grpc/grpc-js` and `@bufbuild/protobuf` as ts-proto requires

## 7. `agent/` (Go)
- [ ] `go mod init github.com/<your-github>/nestus/agent`
- [ ] `cmd/nestus-agent/main.go` with a cobra root and subcommands `version`, `run` (stub that prints "agent starting" and blocks until SIGINT/SIGTERM), `enroll` (stub)
- [ ] `internal/version/version.go`: `Version`, `Commit`, `BuildDate`, set by `-ldflags`
- [ ] `internal/logx`: zerolog setup (JSON; console writer when TTY)
- [ ] `agent/Makefile`: `build` (linux/amd64 + linux/arm64 into `bin/`), `run`, `proto` (calls root buf)

## 8. `ai/` (Python)
- [ ] `uv init --package nestus_ai` (src layout), python 3.12
- [ ] Dependencies: `fastapi`, `uvicorn[standard]`, `pydantic-settings`, `httpx`, `structlog` (add LangGraph etc. in Phase 9)
- [ ] `src/nestus_ai/main.py`: FastAPI app with `GET /health` → `{status:"ok", version}`
- [ ] `src/nestus_ai/settings.py`: pydantic-settings reading the root `.env`
- [ ] Script: `uv run uvicorn nestus_ai.main:app --reload --port 8000`

## 9. `infra/docker-compose.dev.yml`
- [ ] `postgres`: `timescale/timescaledb-ha:pg17`, user/pass/db `nestus`, volume `pgdata`, healthcheck `pg_isready`
- [ ] `redis`: `redis:7-alpine`, `--appendonly yes`, volume
- [ ] Network `nestus-dev`
- [ ] (Loki, Tempo, OTel, Prometheus and Grafana are added in Phases 4 and 7)

## 10. CI (build-only)
- [ ] `.github/workflows/ci.yml`: on push/PR → pnpm install (cache) → `pnpm lint && pnpm typecheck && pnpm build`. Also a `go build ./...` job and a `uv sync && python -c "import nestus_ai"` job. **No test jobs yet.**

## 11. Docs
- [ ] Replace `README.md` with: one-paragraph pitch, the architecture diagram from the overview, a "Getting started" section (`make infra-up`, `pnpm i`, `pnpm db:migrate`, `pnpm dev`, `make agent-run`, `make ai-dev`), and a link to `plan/`.

---

## Done when
- [ ] `make infra-up` starts postgres and redis, and both are healthy
- [ ] `pnpm i && pnpm db:migrate` runs, and the extensions `timescaledb`, `vector` and `pg_trgm` exist
- [ ] `pnpm dev` serves web on :3000 and api on :4000
- [ ] `http://localhost:3000/status` shows db: up, redis: up
- [ ] `http://localhost:4000/api/docs` loads Swagger
- [ ] `pnpm proto:gen` generates Go and TS code without errors
- [ ] `cd agent && go run ./cmd/nestus-agent version` prints the version
- [ ] `make ai-dev` → `curl localhost:8000/health` returns ok
- [ ] `pnpm lint && pnpm typecheck && pnpm build` pass

# NESTUS — Master Build Plan

> **Deploy. Observe. Understand. Recover.**
> An AI-powered platform that deploys, monitors, diagnoses and heals software running on your own servers.

This folder holds the full build plan. **Phases 1–10 build the product with no tests.** **Phase 11** adds a light round of tests and chaos demos.

---

## 1. How to execute this plan

1. Do the phases **in order**. Each phase builds on the ones before it.
2. To run a phase, give your coding agent this prompt:
   > "Read `plan/00-overview.md` and `plan/phase-NN-*.md`. Implement every task in that phase. Follow the conventions in the overview. Do not write tests."
3. A phase is finished when every item in its **Done when** checklist works when you try it by hand.
4. Commit at the end of each phase: `git commit -m "feat: phase NN — <name>"`.
5. **Do not write tests in phases 1–10.** Speed comes first. All testing happens in Phase 11.
6. If a task is unclear, use the decision already written in this overview. Don't create a new pattern.

## 2. Phase map

| # | Phase | Main deliverable |
|---|-------|------------------|
| 01 | [Foundation & Monorepo](phase-01-foundation.md) | Monorepo, dev infra, skeletons for web/api/agent/ai all booting |
| 02 | [Identity, Orgs, RBAC & Shell](phase-02-identity-rbac.md) | Auth, organizations, roles, API keys, audit log, dashboard shell |
| 03 | [Go Agent & Agent Gateway](phase-03-agent-gateway.md) | Agent enrolls, connects over gRPC and runs typed commands |
| 04 | [Metrics & Live Monitoring](phase-04-metrics-monitoring.md) | Host and container metrics stored in TimescaleDB, live charts |
| 05 | [Deployment Engine](phase-05-deployment-engine.md) | GitHub → build → Docker deploy on your VPS, env vars, live build logs |
| 06 | [Release Management](phase-06-release-management.md) | Domains + SSL, zero-downtime deploys, rollback, webhooks, approvals, notifications |
| 07 | [Observability](phase-07-observability.md) | Logs (Loki), error groups, traces (OTel/Tempo), uptime checks, DB monitoring |
| 08 | [Incidents & Self-Healing](phase-08-incidents-recovery.md) | Alert rules, incidents, recovery policies, approval gates, verification |
| 09 | [AI Engineering Agent](phase-09-ai-engine.md) | LangGraph investigations, evidence-based root cause, chat, postmortems |
| 10 | [Topology, K8s, Scale & Launch](phase-10-topology-k8s-launch.md) | Live topology map, Kubernetes mode, replicas/autoscale, hardening, prod deploy |
| 11 | [Testing & Chaos Demo](phase-11-testing-chaos.md) | A taste of unit/integration/e2e tests, chaos scripts, interview demo |

## 3. Architecture

```
                          ┌──────────────────────────── NESTUS CONTROL PLANE (your main VPS) ───────────────────────────┐
  Browser ──HTTPS/WSS──▶  │  apps/web (Next.js)  ──REST/Socket.IO──▶  apps/api (NestJS modular monolith)                │
                          │                                             │  ├─ REST /api/v1   ├─ Socket.IO /realtime       │
                          │                                             │  ├─ gRPC :50051 (AgentGateway)                  │
                          │                                             │  ├─ BullMQ workers (deploy, alerts, recovery)   │
                          │                                             │  └─ /internal/v1 (for AI service)               │
                          │                    ai/ (Python FastAPI + LangGraph) ◀──HTTP──┘ (scoped short-lived token)    │
                          │  PostgreSQL+TimescaleDB+pgvector │ Redis │ Loki │ Tempo │ Prometheus │ OTel Collector │ Grafana │
                          └───────────────────────────────────────▲────────────────────────────────────────────────────┘
                                                                  │ outbound gRPC bidi stream (agent dials out → NAT friendly)
                    ┌─────────────────────────────┬───────────────┴──────────────┬──────────────────────────────┐
              VPS 01: nestus-agent (Go)     VPS 02: nestus-agent         VPS 03: nestus-agent        K8s cluster: nestus-agent (k8s mode)
              Docker + Caddy proxy          Docker + Caddy proxy         Docker + Postgres           client-go
```

**Three planes:**
- **Control plane** (`apps/api`, `apps/web`): users, orgs, RBAC, servers, apps, deployments, incidents, policies, audit.
- **Execution plane** (`agent/`): runs on each server, collects telemetry, and runs only typed, allowlisted commands.
- **Intelligence plane** (`ai/`): reasons over real evidence and proposes structured actions. It never runs anything itself.

## 4. Tech stack (pinned decisions)

| Area | Choice |
|------|--------|
| Monorepo | pnpm workspaces + Turborepo, Node 22 LTS |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, Zustand, Recharts, @xyflow/react, cmdk, socket.io-client |
| Backend | NestJS 11, Prisma 6, nestjs-zod, nestjs-pino, BullMQ, Socket.IO (+ Redis adapter), @grpc/grpc-js, octokit |
| Agent | Go 1.23+, grpc-go, gopsutil v4, Docker Engine SDK, cobra, zerolog, client-go (Phase 10) |
| AI | Python 3.12, uv, FastAPI, LangGraph, langchain-anthropic / langchain-openai / langchain-ollama, pydantic v2, fastembed |
| Default LLM | Anthropic `claude-sonnet-5-5` (reasoning), `claude-haiku-5-5` (summaries). Switch with `LLM_PROVIDER` |
| Database | PostgreSQL 17 on the `timescale/timescaledb-ha:pg17` image (includes TimescaleDB + pgvector) |
| Cache/Queue | Redis 7 + BullMQ |
| Logs / Traces | Loki 3, Tempo, OpenTelemetry Collector (contrib) |
| Self-metrics | Prometheus + Grafana (monitors NESTUS itself and receives span metrics) |
| Proto | buf (generate Go + TypeScript with ts-proto) |
| Proxy on managed servers | Caddy 2 (automatic HTTPS, configured through its admin API) |
| CI/CD | GitHub Actions, GHCR, goreleaser |

## 5. Final repository layout

```
nestus/
├─ apps/
│  ├─ web/                 # Next.js dashboard
│  └─ api/                 # NestJS control plane (REST + gRPC + WS + workers)
├─ agent/                  # Go agent (cmd/, internal/)
├─ ai/                     # Python AI engine (src/nestus_ai/)
├─ packages/
│  ├─ shared/              # zod schemas, enums, permission map, action registry types
│  ├─ proto-ts/            # generated TS from proto/
│  └─ config/              # tsconfig + eslint presets
├─ proto/nestus/v1/        # *.proto (source of truth for agent protocol)
├─ infra/                  # docker-compose.dev.yml + configs (loki, tempo, otel, prometheus, grafana)
├─ deploy/                 # prod compose, Caddyfile, helm chart, install.sh
├─ scripts/                # dev helpers, chaos scripts (phase 11)
├─ plan/                   # this plan
└─ .github/workflows/
```

## 6. Conventions (apply in every phase)

**Ports (dev):** web `3000` · api `4000` · gRPC `50051` · ai `8000` · postgres `5432` · redis `6379` · grafana `3001` · loki `3100` · tempo `3200` · otel `4317/4318` · prometheus `9090`

**API**
- REST prefix `/api/v1`. Org-scoped routes: `/api/v1/orgs/:orgId/<resource>`.
- Success response: the resource itself, or `{ data, nextCursor }` for lists. Use cursor pagination.
- Error response: `{ error: { code: "SERVER_NOT_FOUND", message, details? } }`. One global exception filter produces this shape.
- Validate every input with zod (`nestjs-zod`). Shared DTO schemas live in `packages/shared`.
- IDs: Prisma `cuid()`. Times are stored in UTC as `timestamptz`.
- Every mutating endpoint has `@RequirePermission(...)` and `@Audit('<resource>.<verb>')`.
- Domain events go through `EventEmitter2` and are named `<resource>.<past-tense>`, e.g. `deployment.succeeded`.

**Code**
- Each NestJS feature is one module: `apps/api/src/modules/<feature>/{*.module,*.controller,*.service}.ts`.
- Each Next.js feature is a route group: `apps/web/src/app/(app)/[orgSlug]/<feature>/`. Shared UI goes in `src/components/`.
- Go: `agent/internal/<pkg>`. No global state. Use `context.Context` everywhere.
- Python: `ai/src/nestus_ai/<pkg>`. Use type hints and pydantic models.
- Logging: structured JSON (pino / zerolog / structlog). Never log secrets.

**Security rules (never break these)**
1. The agent runs **only typed commands from an allowlist**. It never runs arbitrary shell strings.
2. The AI **never runs actions**. It may only *propose* registered actions. The Recovery Engine checks permissions, policy and risk before anything runs.
3. Every state-changing action is written to `AuditLog` with an actor type: `USER | API_KEY | AGENT | SYSTEM | AI | POLICY`.
4. Secrets (env values, DSNs, kubeconfigs, tokens) are encrypted at rest with AES-256-GCM. Tokens are stored only as hashes.
5. Tenant isolation: every query is scoped by `orgId`. Loki and Tempo use `X-Scope-OrgID = orgId`.

## 7. Global environment variables (`.env.example` at repo root)

```
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
DATABASE_URL=postgresql://nestus:nestus@localhost:5432/nestus
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
NESTUS_ENCRYPTION_KEY=base64-32-bytes
GRPC_PORT=50051
GRPC_PUBLIC_URL=localhost:50051
INTERNAL_SERVICE_TOKEN=change-me
AI_SERVICE_URL=http://localhost:8000
GITHUB_APP_ID= / GITHUB_APP_PRIVATE_KEY= / GITHUB_APP_SLUG= / GITHUB_WEBHOOK_SECRET= / GITHUB_CLIENT_ID= / GITHUB_CLIENT_SECRET=
LOKI_URL=http://localhost:3100
TEMPO_URL=http://localhost:3200
PROMETHEUS_URL=http://localhost:9090
OTEL_PUBLIC_ENDPOINT=http://<control-plane-ip>:4318
LLM_PROVIDER=anthropic   # anthropic | openai | ollama
ANTHROPIC_API_KEY= / OPENAI_API_KEY= / OLLAMA_BASE_URL=
```

## 8. The five hard problems to talk about in interviews

1. **Distributed communication:** outbound gRPC bidirectional streams, reconnect with backoff and jitter, command routing across API instances through Redis pub/sub.
2. **Fault tolerance:** the agent buffers metrics and logs on disk when it is offline. Idempotent command IDs. The control plane can restart without losing state, because state lives in Postgres and Redis.
3. **Scalability:** batched ingest, TimescaleDB hypertables with continuous aggregates and retention, low-cardinality Loki labels, stateless API behind a Redis adapter.
4. **Security:** typed command allowlist, signed commands, mTLS, RBAC, approval gates, audit log, encrypted secrets.
5. **AI reliability:** answers must cite tool evidence, a validator removes unverified claims, AI can only propose registered actions, and every action is verified after it runs.

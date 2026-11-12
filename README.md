# NESTUS

> **Deploy. Observe. Understand. Recover.**

An AI-powered platform that deploys, monitors, diagnoses and heals software running on your own servers.

```
                          ┌──────────────────────────── NESTUS CONTROL PLANE ───────────────────────────┐
  Browser ──HTTPS/WSS──▶  │  apps/web (Next.js)  ──REST/Socket.IO──▶  apps/api (NestJS)                  │
                          │                                             │  ├─ REST /api/v1               │
                          │                                             │  ├─ gRPC :50051 (Phase 3+)     │
                          │                    ai/ (Python FastAPI) ◀──HTTP──┘                          │
                          │  PostgreSQL+TimescaleDB │ Redis │ (Loki/Tempo/… in later phases)              │
                          └───────────────────────────────────────▲─────────────────────────────────────┘
                                                                  │ outbound gRPC (agent dials out)
                                                    nestus-agent (Go) on each VPS
```

## Getting started

```bash
make infra-up          # postgres + redis
pnpm i
pnpm db:migrate
pnpm dev               # web :3000 · api :4000

make agent-run         # Go agent stub
make ai-dev            # Python AI :8000
```

- Web: http://localhost:3000
- API docs: http://localhost:4000/api/docs
- Health: http://localhost:4000/health
- Status page: http://localhost:3000/status

## Build plan

See [`plan/`](plan/) — phases 1–11. Phase 2 covers identity, orgs, RBAC, audit, and the dashboard shell.

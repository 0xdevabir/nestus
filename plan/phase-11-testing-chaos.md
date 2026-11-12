# Phase 11 — Testing (a taste) & Chaos Demo

**Goal:** Add a **light but meaningful** test layer across every component (enough to show you know how to test infrastructure software), plus repeatable chaos scenarios that double as your interview demo. Not aiming for full coverage — aim for the parts that are **safety-critical** or **easy to break**.
**Depends on:** Phases 01–10

---

## 1. Tooling setup
- [ ] **API:** Jest (Nest default) + `@nestjs/testing` + `testcontainers` (Postgres timescaledb-ha + Redis) for integration
- [ ] **Web:** Vitest + Testing Library for a few components. Playwright for E2E.
- [ ] **Agent:** standard `go test` + `testify`. `-race` on.
- [ ] **AI:** `pytest` + `pytest-asyncio` + `respx` (mock httpx)
- [ ] Root scripts: `pnpm test`, `pnpm test:e2e`. `make agent-test`, `make ai-test`, `make test-all`.

## 2. Unit tests — pick these (highest value)

### API (`apps/api/src/**/*.spec.ts`)
- [ ] `rbac.spec.ts` — `ROLE_PERMISSIONS` + `can()`: a VIEWER can't `env:reveal`, an OPERATOR can't approve HIGH risk, an OWNER can do everything
- [ ] `crypto.service.spec.ts` — encrypt/decrypt roundtrip, a tampered ciphertext throws, the version prefix is present
- [ ] `alert-state-machine.spec.ts` — OK→PENDING→FIRING after `forSec`, RESOLVED after 2 false evaluations, flap guard
- [ ] `recovery-guardrails.spec.ts` — rate limit, cooldown, circuit breaker opens after 3 failures, AI proposals forced to PENDING_APPROVAL, HIGH risk always needs approval, autonomy OFF/SUGGEST/AUTO matrix (**the most important test file in the project**)
- [ ] `policy-matcher.spec.ts` — template rendering `{{alert.containerId}}`, `deployedWithinMin` condition
- [ ] `metrics-query.spec.ts` — the range → source table (raw / 1m / 1h) and bucket size selection
- [ ] `logql-builder.spec.ts` — input escaping (no LogQL injection), filters combine correctly
- [ ] `error-fingerprint.spec.ts` — the same stack with different ids/numbers → same fingerprint
- [ ] `github-webhook.spec.ts` — signature verification passes/fails, paths outside rootDir are ignored

### Agent (`agent/internal/**/_test.go`)
- [ ] `commands/registry_test.go` — unknown type rejected, a type not in the allowlist rejected, bad params rejected, duplicate `command_id` ignored
- [ ] `commands/signature_test.go` — valid signature accepted; tampered params/expired/unsigned rejected
- [ ] `transport/backoff_test.go` — exponential growth, cap 60s, jitter bounds, reset after a healthy period
- [ ] `buffer/ring_test.go` — append/replay order, cap enforcement drops the oldest, survives reopen
- [ ] `collector/rates_test.go` — rate calc from deltas, counter reset handling
- [ ] `logs/multiline_test.go` + offset persistence

### AI (`ai/tests/`)
- [ ] `test_validators.py` — fabricated evidence ids are stripped; confidence is capped when the root cause has no valid evidence; an unknown action type is rejected
- [ ] `test_investigation_graph.py` — run the graph with LangChain's `FakeListChatModel` (scripted structured outputs) + `respx`-mocked internal API → asserts the evidence was gathered, the loop stops at ≤3 iterations, and the persisted result contains valid citations
- [ ] `test_tools.py` — each tool registers evidence and prefixes `[evidence_id=...]`

### Web
- [ ] `TimeRangePicker` and `formatBytes/formatRate` helpers (Vitest)

## 3. Integration tests (API + real Postgres/Redis via Testcontainers)
- [ ] `auth.int-spec.ts` — register → login → refresh rotation → reuse detection revokes the family
- [ ] `tenant-isolation.int-spec.ts` — user of org A gets 404/403 on org B's servers, apps, incidents and logs endpoints (**must-have**)
- [ ] `agent-gateway.int-spec.ts` — start the gRPC server in-process. A fake agent client (ts or Go test binary) enrolls → connects → sends Hello/Heartbeat/MetricsBatch → rows land in `host_metrics` → `dispatch('docker.restart')` arrives at the fake agent → the result marks the command SUCCEEDED
- [ ] `recovery-flow.int-spec.ts` — fire CONTAINER_DOWN → the default policy proposes `container.restart` → executes against the fake agent → verify passes → incident resolves (use fake timers/short windows via config)

## 4. E2E (Playwright, against `docker compose` + one local agent)
- [ ] `onboarding.spec.ts` — register → Add Server dialog shows the install command → (the test starts a local agent with the token) → server becomes ONLINE → Overview shows live CPU
- [ ] `incident.spec.ts` — `docker kill` the demo app container → incident appears in the header indicator → timeline shows the auto-restart → resolved
- [ ] `rbac.spec.ts` — a viewer doesn't see the approve/deploy buttons

## 5. Load & resilience (taste)
- [ ] `agent/cmd/agent-sim`: a Go binary that simulates **N agents** (goroutines) with fake metrics/logs/containers using real enrollment tokens (`--count 200 --interval 5s`)
- [ ] Run 200 simulated agents for 10 minutes → record in `docs/benchmarks.md`: ingest rows/sec, API CPU/mem, p95 flush time, Socket.IO fan-out latency (from the Grafana self-monitoring dashboard). Screenshot it.
- [ ] k6 script `scripts/k6/api-read.js` — dashboard read endpoints at 50 VUs → p95 < 300ms target
- [ ] Resilience checks (document the results):
  - kill the API while 200 sim agents run → all reconnect within 60s (thanks to jitter), buffers replay, no data gaps
  - restart Redis → BullMQ and Socket.IO recover
  - run 2 API instances behind Caddy → commands still route to the right agent via Redis pub/sub

## 6. Chaos scenarios = your interview demo (`scripts/chaos/`)
Each script is idempotent, prints what it's doing, and states the **expected NESTUS behavior**:

| Script | Breaks | Expected NESTUS behavior |
|---|---|---|
| `01-crash-container.sh` | `docker kill` shop-api | Incident → auto-restart (policy) → verified → resolved in < 1 min |
| `02-bad-deploy.sh` | pushes a commit to `demo/shop-api` that leaks memory | OOM → incident → AI root cause "memory leak introduced in deploy #N" → rollback proposed → you approve → recovered |
| `03-db-saturation.sh` | k6 hammering an endpoint with a slow query + a small pool | Latency spike → incident → AI cites DB connections at 95% + slow query → manual-steps recommendation |
| `04-disk-fill.sh` | `fallocate -l` until 90% | DISK_FULL → prune images auto → verified |
| `05-agent-partition.sh` | `iptables` block to the control plane for 2 min | Server OFFLINE incident → network restored → buffered metrics/logs replayed, no gaps |
| `06-restart-loop.sh` | deploy an image that exits after 5s | RESTART_LOOP → SEV1 → rollback approval flow |
| `07-cpu-spike-autoscale.sh` | CPU load on shop-web | Autoscaler scales 1 → 3 replicas → scales back down |
| `99-reset.sh` | restores everything | Clean demo state |

- [ ] `docs/demo-script.md`: a **7-minute interview walkthrough** — architecture slide (1 min) → live dashboard + topology (1 min) → run `01` (1 min) → run `02` and walk through the AI investigation + approval (3 min) → security model & the five hard problems (1 min)
- [ ] Record a demo video (OBS) and link it in the README

## 7. CI
- [ ] Extend `.github/workflows/ci.yml`: jobs `api-unit`, `api-integration` (services via testcontainers), `agent-test` (`go test -race ./...`), `ai-test`, `web-unit`. A nightly `e2e` workflow (Playwright with compose) uploads traces/videos on failure.
- [ ] Add CI status badges to the README

---

## Done when
- [ ] `make test-all` passes locally. CI is green on every job.
- [ ] Guardrail, tenant-isolation and command-allowlist/signature tests exist and pass. (These are the ones to mention in interviews.)
- [ ] The 200-agent simulation results are in `docs/benchmarks.md`
- [ ] All 7 chaos scripts behave as described, and `99-reset.sh` restores the demo
- [ ] The demo script and video are linked from the README

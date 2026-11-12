# Phase 07 — Observability: Logs, Errors, Traces, Uptime & Database Monitoring

**Goal:** Full observability. Container logs are collected centrally (Loki) and searchable with a live tail. Errors are grouped into fingerprints. Distributed traces come from user apps (OpenTelemetry → Tempo) and give RED metrics and a service graph. Uptime checks and PostgreSQL monitoring round it out. This is the evidence base the AI engine uses in Phase 9.
**Depends on:** Phase 06
**No tests in this phase.**

---

## 1. Dev infra additions (`infra/`)
- [ ] `loki` (grafana/loki:3.x) with `auth_enabled: true` (multi-tenant, tenant = orgId), `allow_structured_metadata: true`, retention 14d (compactor), config file `infra/loki/config.yaml`
- [ ] `tempo` (grafana/tempo) with `multitenancy_enabled: true`, local storage, retention 72h, `metrics_generator` disabled (we use collector connectors instead)
- [ ] `otel-collector` (otel/opentelemetry-collector-contrib), `infra/otel/config.yaml`:
  - receivers: `otlp` (grpc 4317, http 4318), reachable **only from the internal network**. Public ingestion goes through the API's auth proxy (see §4), which validates per-org tokens.
  - processors: `batch`, `memory_limiter`, `resource` (ensure `nestus.org` attr), `tail_sampling` (keep errors + slow (>1s) + 10% of the rest)
  - connectors: `spanmetrics` (RED metrics with dimensions `service.name`, `http.route`, `http.response.status_code`) and `servicegraph`
  - exporters: `otlp/tempo` (with header `X-Scope-OrgID` from the `nestus.org` resource attribute via the `headers_setter` extension), `prometheusremotewrite` → Prometheus
- [ ] Grafana: provision Loki and Tempo datasources with tenant headers (for your own debugging)

## 2. Logs pipeline

### Protocol
```proto
message LogEntry { google.protobuf.Timestamp ts = 1; string source = 2; /* container|journald|file */ string stream = 3; /* stdout|stderr */ string line = 4; map<string,string> attrs = 5; /* container_id, container_name, app_id, deployment_id */ }
message LogBatch { repeated LogEntry entries = 1; bool replayed = 2; }
```
- [ ] Add `LogBatch logs = 21;` to `AgentMessage`

### Agent (`internal/logs`)
- [ ] For every running container with a `nestus.app` label (plus containers listed in config `log_containers`): `ContainerLogs(follow, timestamps, since=lastOffset)` → demux stdout/stderr (`stdcopy`) → line splitter (max line 16KB, truncate)
- [ ] Track the last timestamp per container in `/var/lib/nestus/state/log_offsets.json` so a restart doesn't duplicate or lose logs
- [ ] Watch Docker events: start a tailer on `start`, stop it on `die`/`destroy`
- [ ] Optional sources from config: journald units (`journalctl -o json -f -u <unit>` with fixed args) and files under an allowlist of paths
- [ ] Batch: flush every 1s or 1,000 lines / 1MB. Offline → the same `internal/buffer` as metrics (100MB cap for logs). Replay on reconnect.

### API (`modules/logs`)
- [ ] `LogIngestService`: per batch → detect `level` (JSON line with `level`/`severity` field, pino numeric levels, or regex for `ERROR|WARN|INFO|DEBUG|FATAL|panic|Exception`) → group into Loki streams with **low-cardinality labels only**: `{server, app, container_name, stream, level, source}`. Put `deployment_id`, `container_id` and `trace_id` (if found) in **structured metadata**. Push to `/loki/api/v1/push` with `X-Scope-OrgID: <orgId>`, snappy/gzip, batched every 1s.
- [ ] Publish to Redis channel `logs:<orgId>:<appId>` for live tail (fan-out to Socket.IO room `logs:<appId>` / `logs:server:<serverId>`)
- [ ] `GET /orgs/:orgId/logs?app&server&level&q&from&to&limit&direction` → builds LogQL safely on the server (`{app="x"} |= "q"` or `|~` for regex mode; escape inputs) → Loki `query_range` → normalized `{ entries:[{ts, line, labels, metadata}] }`
- [ ] `GET /logs/context?app&ts&before=50&after=50` (lines around an entry)
- [ ] `GET /logs/volume?app&from&to` → `sum by (level) (count_over_time(...[1m]))` for the histogram
- [ ] Advanced mode: `POST /logs/query { logql }` (perm `logs:read`). Tenant isolation is enforced by the X-Scope-OrgID header, so raw LogQL is safe across tenants.

## 3. Error tracking (log-derived)
```prisma
model ErrorGroup {
  id String @id @default(cuid())
  orgId String
  appId String
  fingerprint String
  title String          // first line, normalized
  sample String         // full raw sample (stack included, max 8KB)
  level String
  count Int @default(0)
  firstSeenAt DateTime
  lastSeenAt DateTime
  firstDeploymentId String?   // the release that introduced it — great evidence for the AI
  status String @default("OPEN") // OPEN | RESOLVED | IGNORED
  @@unique([appId, fingerprint])
}
```
- [ ] In `LogIngestService`, for level ∈ {error, fatal}: join multi-line stack traces (lines that start with whitespace + `at ` or `Caused by` within 100ms of the same container), normalize (strip numbers, UUIDs, hex, quoted strings, timestamps, IPs), take the sha1 of the first 3 normalized lines → upsert ErrorGroup (count via Redis INCR flushed every 10s)
- [ ] Also count errors per minute per app in Redis (`err:rate:<appId>:<minute>`) → Phase 8 error-rate alerts
- [ ] `GET /apps/:id/errors?status&sort=lastSeen|count` · `PATCH /errors/:id {status}` · emit `error_group.new` when a group is first seen

## 4. Distributed tracing
```prisma
model TelemetryToken { id String @id @default(cuid()) orgId String tokenHash String @unique createdAt DateTime @default(now()) }
```
- [ ] Each org gets an OTLP ingest token. The collector's `bearertokenauth` can't do lookups, so put a small **auth proxy** in front of the collector in the API: `POST /otlp/v1/traces` (and `/metrics`, `/logs`) on the API validates `Authorization: Bearer <token>` → sets resource attribute `nestus.org` via header → forwards to the collector at :4318. The public endpoint is `OTEL_PUBLIC_ENDPOINT = API_URL/otlp`. (Simple and secure.)
- [ ] When `Application.tracingEnabled = true`, the deploy pipeline injects:
  `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>`, `OTEL_SERVICE_NAME=<slug>`, `OTEL_RESOURCE_ATTRIBUTES=nestus.app=<appId>,nestus.deployment=<id>,deployment.environment=production`, `OTEL_TRACES_SAMPLER=parentbased_traceidratio`, `OTEL_TRACES_SAMPLER_ARG=1`
- [ ] Docs page in the web app (App → Tracing tab) with copy-paste instrumentation snippets for **NestJS** (`@opentelemetry/sdk-node` + auto-instrumentations, `--require ./tracing.js`) and **Next.js** (`instrumentation.ts` with `@vercel/otel`)
- [ ] Instrument **NESTUS's own API** the same way (service name `nestus-api`, tenant `nestus-system`)
- [ ] API (`modules/traces`):
  - `GET /orgs/:orgId/traces?service&minDuration&status=error&from&to&limit` → Tempo search API (TraceQL `{ resource.service.name = "x" && duration > 500ms }`) with `X-Scope-OrgID`
  - `GET /traces/:traceId` → Tempo → normalized span tree `{ spans: [{id, parentId, name, service, start, durationMs, status, attrs}] }`
  - `GET /apps/:id/red?from&to` → PromQL over spanmetrics: request rate, error rate, p50/p95/p99 latency (`histogram_quantile`), with `nestus_org` label filter
  - `GET /orgs/:orgId/service-graph?from&to` → PromQL on `traces_service_graph_request_total` / `_failed_total` / latency → edges `{client, server, rps, errorRate, p95}` (used by Topology in Phase 10)

## 5. Uptime / HTTP checks
```prisma
model HttpCheck {
  id String @id @default(cuid())
  orgId String
  appId String?
  name String
  url String
  method String @default("GET")
  intervalSec Int @default(60)
  timeoutMs Int @default(10000)
  expectedStatus String @default("2xx")
  expectBodyContains String?
  enabled Boolean @default(true)
  createdAt DateTime @default(now())
}
```
- [ ] Hypertable `http_check_results(time, org_id, check_id, ok bool, status int, latency_ms real, error text)` + 1h aggregate + 90d retention
- [ ] Auto-create a check for each app's primary domain + `healthCheckPath`
- [ ] Runner: BullMQ repeatable job per check (`jobId=check:<id>`, `every=intervalSec*1000`) using `undici` with timing → insert result → emit `http_check.failed` / `http_check.recovered` on state change. Also check TLS certificate expiry days (store it on the check, warn when under 14 days).
- [ ] `GET /http-checks`, CRUD, `GET /http-checks/:id/results?from&to` → uptime %, avg/p95 latency, series

## 6. Database monitoring (PostgreSQL)
```prisma
model DatabaseMonitor {
  id String @id @default(cuid())
  orgId String
  serverId String           // agent that will connect (DB must be reachable from it)
  appId String?
  name String
  engine String @default("postgres")
  dsnEnc String             // encrypted
  enabled Boolean @default(true)
  createdAt DateTime @default(now())
}
```
- [ ] Monitors are pushed to the agent via `ConfigUpdate.extra.db_monitors` (DSN is decrypted only for that agent, over the stream)
- [ ] Agent `internal/dbmon/postgres.go` (pgx), every 15s:
  - connections by state (`pg_stat_activity`), `max_connections`, waiting/locked count, longest running query duration
  - db size, cache hit ratio, xact commit/rollback rate, deadlocks
  - top 10 queries by mean exec time from `pg_stat_statements` (if the extension exists; normalized query text truncated to 500 chars)
  - sends `DbMetricsBatch` (new proto message, field 23)
- [ ] Hypertable `db_metrics(time, org_id, monitor_id, connections_total, connections_active, connections_idle, connections_waiting, max_connections, longest_query_sec, cache_hit_ratio, tps, deadlocks, db_size_bytes)`. Store the latest top-queries JSON in Redis `dbmon:topq:<monitorId>`.
- [ ] `GET /db-monitors`, CRUD, `GET /db-monitors/:id/metrics`, `GET /db-monitors/:id/top-queries`
- [ ] The DB user needs only `pg_monitor`. Show the GRANT statement in the UI.

## 7. Web
- [ ] **Logs page** `/logs`: filter bar (app, server, level chips, text/regex search, time range), log volume histogram (stacked by level, click-drag to zoom), virtualized log list (mono font, level color stripe, timestamp, container name, line; click → expand with labels/metadata, "show context", "view trace" when `trace_id` exists), **Live tail** toggle (Socket.IO), download results. Saved searches in localStorage.
- [ ] **App → Logs tab** (same component, pre-filtered) and **App → Errors tab** (error groups table: title, count, sparkline, first/last seen, introduced-in-deployment link, status actions; detail drawer with the full sample and occurrences over time)
- [ ] **Traces page** `/traces`: search form, results table (root span, service, duration bar, span count, status) and a **trace waterfall view** (nested spans with time bars, service colors, attribute panel, link to logs filtered by trace_id)
- [ ] **App → Monitoring tab:** RED charts (requests/s, error %, p50/p95/p99), container resources, HTTP check uptime + latency
- [ ] **App → Tracing tab:** enable toggle (triggers a redeploy prompt), instrumentation snippets with the org token pre-filled
- [ ] **Monitoring → Uptime** sub-page: checks list with a 90-bar uptime strip (like status pages), latency charts, SSL expiry
- [ ] **Monitoring → Databases** sub-page: connections vs max gauge, active/waiting chart, TPS, cache hit, longest query, top slow queries table
- [ ] Command palette: "Search logs for…" action

---

## Done when
- [ ] App logs appear in the Logs page within about 2s. Live tail streams new lines. Level filtering works.
- [ ] Restarting the agent doesn't duplicate or lose logs
- [ ] Throwing the same error repeatedly in a deployed app creates **one** ErrorGroup whose count increases, linked to the deployment that introduced it
- [ ] A NestJS app with tracing enabled shows traces in the Traces page, and the waterfall renders. RED metrics charts show data.
- [ ] Two apps calling each other produce an edge in `GET /service-graph`
- [ ] The uptime check for an app shows green bars. Stopping the container produces red bars and a `http_check.failed` event (visible in the notification channel if subscribed).
- [ ] Adding a Postgres DB monitor shows connections, TPS and top slow queries
- [ ] Org A cannot see org B's logs or traces (try it with two orgs)

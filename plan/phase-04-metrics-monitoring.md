# Phase 04 — Metrics Pipeline & Live Monitoring

**Goal:** Agents stream host and container metrics. NESTUS stores them efficiently in TimescaleDB and shows a live Overview and Monitoring dashboard. NESTUS also monitors itself with Prometheus and Grafana.
**Depends on:** Phase 03
**No tests in this phase.**

---

## 1. Protocol additions (`agent.proto`)

```proto
message HostMetricPoint {
  google.protobuf.Timestamp ts = 1;
  double cpu_pct = 2; repeated double cpu_per_core = 3;
  double load1 = 4; double load5 = 5; double load15 = 6;
  uint64 mem_used = 7; uint64 mem_total = 8; uint64 mem_available = 9; uint64 swap_used = 10; uint64 swap_total = 11;
  double net_rx_bps = 12; double net_tx_bps = 13;
  double disk_read_bps = 14; double disk_write_bps = 15;
  uint32 process_count = 16; double uptime_sec = 17; uint32 tcp_conns = 18;
  repeated DiskUsage disks = 19;
}
message DiskUsage { string mount = 1; string device = 2; string fstype = 3; uint64 used = 4; uint64 total = 5; double inodes_used_pct = 6; }
message ContainerMetricPoint {
  google.protobuf.Timestamp ts = 1; string container_id = 2; string name = 3;
  double cpu_pct = 4; uint64 mem_used = 5; uint64 mem_limit = 6;
  double net_rx_bps = 7; double net_tx_bps = 8; double blk_read_bps = 9; double blk_write_bps = 10; uint32 pids = 11;
}
message MetricsBatch { repeated HostMetricPoint host = 1; repeated ContainerMetricPoint containers = 2; bool replayed = 3; }
```
- [ ] Add `MetricsBatch metrics = 20;` to `AgentMessage`. Regenerate.

## 2. Agent collectors (`internal/collector`)
- [ ] `HostCollector` (gopsutil v4): every `metrics_interval_sec` (default 5s). Rates (net, disk IO) are computed from deltas between samples. Skip pseudo filesystems (tmpfs, overlay, squashfs, proc...).
- [ ] `ContainerCollector`: for each running container, call `ContainerStatsOneShot` concurrently (bounded to 8). Compute CPU % with the Docker formula (cpu_delta/system_delta × online_cpus × 100).
- [ ] `Batcher`: collect points and flush a `MetricsBatch` every 10s.
- [ ] **Offline buffer (fault tolerance):** if the transport is disconnected, append batches to an on-disk ring buffer at `/var/lib/nestus/buffer/metrics/` (segment files, 50MB cap, oldest dropped). On reconnect, replay oldest-first with `replayed=true`, rate-limited to 20 batches/sec. Put this in a reusable `internal/buffer` package — the logs pipeline uses it in Phase 7.

## 3. TimescaleDB schema (raw SQL migration `metrics_hypertables`)

```sql
CREATE TABLE host_metrics (
  time timestamptz NOT NULL, org_id text NOT NULL, server_id text NOT NULL,
  cpu_pct real, load1 real, load5 real, load15 real,
  mem_used bigint, mem_total bigint, mem_available bigint, swap_used bigint, swap_total bigint,
  net_rx_bps double precision, net_tx_bps double precision,
  disk_read_bps double precision, disk_write_bps double precision,
  process_count int, tcp_conns int, uptime_sec double precision
);
SELECT create_hypertable('host_metrics', 'time', chunk_time_interval => interval '1 day');
CREATE INDEX ON host_metrics (server_id, time DESC);

CREATE TABLE disk_metrics (time timestamptz NOT NULL, org_id text, server_id text NOT NULL, mount text NOT NULL, used bigint, total bigint, inodes_used_pct real);
SELECT create_hypertable('disk_metrics', 'time');
CREATE INDEX ON disk_metrics (server_id, mount, time DESC);

CREATE TABLE container_metrics (
  time timestamptz NOT NULL, org_id text, server_id text NOT NULL, container_id text NOT NULL, container_name text, app_id text,
  cpu_pct real, mem_used bigint, mem_limit bigint, net_rx_bps double precision, net_tx_bps double precision,
  blk_read_bps double precision, blk_write_bps double precision, pids int
);
SELECT create_hypertable('container_metrics', 'time');
CREATE INDEX ON container_metrics (server_id, container_id, time DESC);
CREATE INDEX ON container_metrics (app_id, time DESC);
```
- [ ] Continuous aggregates: `host_metrics_1m` and `host_metrics_1h` (avg, max of cpu, mem, net, disk io, load), `container_metrics_1m` and `container_metrics_1h`. Add `add_continuous_aggregate_policy` for each.
- [ ] Compression: `ALTER TABLE ... SET (timescaledb.compress, timescaledb.compress_segmentby = 'server_id')` + `add_compression_policy(..., interval '2 days')`
- [ ] Retention: raw 7 days, 1m aggregate 90 days, 1h aggregate 2 years (`add_retention_policy`)

## 4. API — ingestion (`modules/metrics`)
- [ ] `MetricsIngestService.ingest(serverId, orgId, batch)`, called by the gateway handler:
  - Push rows into in-memory buffers. Flush every 2s or every 5,000 rows with a single multi-row `INSERT` via `PG_POOL` (or `pg-copy-streams` COPY).
  - For non-replayed batches: write the latest host point to Redis hash `metrics:latest:<serverId>` (TTL 2m) and the top containers to `metrics:latest:containers:<serverId>`
  - Emit an internal event `metrics.ingested` with the latest snapshot (the realtime gateway uses it; alerts use it in Phase 8)
  - Map `container_id → app_id` with an in-memory cache built from the `Container` table
- [ ] Self-metrics with `prom-client`: `nestus_metrics_ingested_points_total`, `nestus_ingest_flush_duration_seconds`, `nestus_agents_connected`, `nestus_commands_total{type,status}`, `nestus_bullmq_queue_depth{queue}`, plus default process metrics. Expose at `GET /metrics` (no auth in dev; behind a basic-auth token in prod).

## 5. API — query endpoints
- [ ] `GET /orgs/:orgId/servers/:id/metrics?metrics=cpu_pct,mem_used,...&from&to&points=300`
  - Picks the source automatically: range ≤ 6h → raw with `time_bucket`, ≤ 7d → `_1m`, else `_1h`
  - Bucket size = range / points. Returns `{ series: [{ metric, points: [[ts, value]] }], resolution }`
- [ ] `GET /servers/:id/metrics/disks` (latest per mount)
- [ ] `GET /servers/:id/metrics/containers?from&to&sort=cpu|mem&limit=10` (top-N over the range + series)
- [ ] `GET /apps/:appId/metrics?...` (container metrics grouped by app_id; useful from Phase 5 on)
- [ ] `GET /orgs/:orgId/overview` → `{ servers: {total, online, offline}, fleet: [{serverId, name, status, cpu, mem, disk, netRx, netTx}], containers: {running, total}, apps: 0, activeIncidents: 0, deploymentsToday: 0 }` (later phases fill in the zeros)
- [ ] Put a shared helper in `packages/shared` for formatting bytes, percents and rates (also used by the web app)

## 6. Realtime gateway (`modules/realtime`)
- [ ] Socket.IO gateway on namespace `/realtime`, using the `@socket.io/redis-adapter` so multiple API instances work
- [ ] Handshake auth with the access JWT → load memberships
- [ ] Client events: `subscribe { room }` / `unsubscribe`. Rooms: `org:<orgId>`, `server:<serverId>`, `command:<id>`. Later: `deployment:<id>`, `logs:<appId>`, `incident:<id>`. Check permissions before joining.
- [ ] Server pushes: `metrics.snapshot` to `server:<id>` (each ingest, throttled to 1 per 5s), `fleet.update` to `org:<id>` (every 10s, compact), `server.status` on online/offline, `command.log` and `command.result`
- [ ] Web hook: `useRealtime(room, event, handler)` with auto-reconnect and token refresh

## 7. Dev infra — self-monitoring
- [ ] Add to `docker-compose.dev.yml`:
  - `prometheus` (`prom/prometheus`) with `--web.enable-remote-write-receiver` (needed for span metrics in Phase 7). Scrape config: `host.docker.internal:4000/metrics`.
  - `grafana` on :3001 (anonymous viewer in dev). Provision datasources: Prometheus, PostgreSQL (Timescale) and Loki/Tempo placeholders. Provision a dashboard `infra/grafana/dashboards/nestus-control-plane.json` (ingest rate, connected agents, queue depth, event loop lag, heap).

## 8. Web
- [ ] Charting primitives in `src/components/charts/`: `TimeSeriesChart` (Recharts AreaChart, gradient fill, synced crosshair, mono font tooltips, unit formatter), `Sparkline`, `GaugeRing` (CPU/RAM/Disk %), `StatCard`
- [ ] `TimeRangePicker`: 15m / 1h / 6h / 24h / 7d / 30d + custom, stored in URL search params. Optional "Live" toggle that appends realtime points.
- [ ] **Overview page:** KPI row (Connected servers, Running containers, Running apps, Active incidents, Deployments today). Fleet table with status, live CPU/RAM sparklines, disk bar, net in/out, uptime. Click a row → server monitoring.
- [ ] **Monitoring page** `/monitoring?server=...`: server selector; gauges row (CPU, RAM, Swap, Disk); charts for CPU %, load avg, memory (used vs available, stacked), network rx/tx, disk IO, per-mount disk usage bars; "Top containers" table by CPU/mem with sparklines; container detail drawer with its own charts
- [ ] Server detail page: add a *Metrics* tab that reuses the same components
- [ ] Colors cross threshold tokens (≥75% warn, ≥90% crit)

---

## Done when
- [ ] With an agent connected, the Overview shows live CPU/RAM updating about every 5s without a page refresh
- [ ] The Monitoring page shows correct charts for 15m, 1h and 24h. Long ranges are served from the aggregates (check `resolution` in the response).
- [ ] Run `stress --cpu 2 --timeout 60` on the VPS → the CPU spike appears live
- [ ] Top containers matches `docker stats`
- [ ] Stop the API for 2 minutes and start it again → the agent replays its buffer, and the gap in the charts is filled
- [ ] Grafana at :3001 shows the NESTUS control-plane dashboard with an ingest rate above 0
- [ ] `SELECT * FROM timescaledb_information.jobs` lists the aggregate, compression and retention policies

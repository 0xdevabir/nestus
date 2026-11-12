-- Host metrics (raw)
CREATE TABLE host_metrics (
  time timestamptz NOT NULL,
  org_id text NOT NULL,
  server_id text NOT NULL,
  cpu_pct real,
  load1 real,
  load5 real,
  load15 real,
  mem_used bigint,
  mem_total bigint,
  mem_available bigint,
  swap_used bigint,
  swap_total bigint,
  net_rx_bps double precision,
  net_tx_bps double precision,
  disk_read_bps double precision,
  disk_write_bps double precision,
  process_count int,
  tcp_conns int,
  uptime_sec double precision
);
SELECT create_hypertable('host_metrics', 'time', chunk_time_interval => interval '1 day');
CREATE INDEX ON host_metrics (server_id, time DESC);
CREATE INDEX ON host_metrics (org_id, time DESC);

-- Disk metrics (per mount)
CREATE TABLE disk_metrics (
  time timestamptz NOT NULL,
  org_id text,
  server_id text NOT NULL,
  mount text NOT NULL,
  used bigint,
  total bigint,
  inodes_used_pct real
);
SELECT create_hypertable('disk_metrics', 'time', chunk_time_interval => interval '1 day');
CREATE INDEX ON disk_metrics (server_id, mount, time DESC);

-- Container metrics
CREATE TABLE container_metrics (
  time timestamptz NOT NULL,
  org_id text,
  server_id text NOT NULL,
  container_id text NOT NULL,
  container_name text,
  app_id text,
  cpu_pct real,
  mem_used bigint,
  mem_limit bigint,
  net_rx_bps double precision,
  net_tx_bps double precision,
  blk_read_bps double precision,
  blk_write_bps double precision,
  pids int
);
SELECT create_hypertable('container_metrics', 'time', chunk_time_interval => interval '1 day');
CREATE INDEX ON container_metrics (server_id, container_id, time DESC);
CREATE INDEX ON container_metrics (app_id, time DESC);

-- Continuous aggregates: host 1m
CREATE MATERIALIZED VIEW host_metrics_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 minute', time) AS bucket,
  org_id,
  server_id,
  avg(cpu_pct) AS cpu_pct_avg,
  max(cpu_pct) AS cpu_pct_max,
  avg(load1) AS load1_avg,
  max(load1) AS load1_max,
  avg(load5) AS load5_avg,
  avg(load15) AS load15_avg,
  avg(mem_used) AS mem_used_avg,
  max(mem_used) AS mem_used_max,
  avg(mem_total) AS mem_total_avg,
  avg(mem_available) AS mem_available_avg,
  avg(net_rx_bps) AS net_rx_bps_avg,
  max(net_rx_bps) AS net_rx_bps_max,
  avg(net_tx_bps) AS net_tx_bps_avg,
  max(net_tx_bps) AS net_tx_bps_max,
  avg(disk_read_bps) AS disk_read_bps_avg,
  max(disk_read_bps) AS disk_read_bps_max,
  avg(disk_write_bps) AS disk_write_bps_avg,
  max(disk_write_bps) AS disk_write_bps_max
FROM host_metrics
GROUP BY bucket, org_id, server_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('host_metrics_1m',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

-- Continuous aggregates: host 1h
CREATE MATERIALIZED VIEW host_metrics_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 hour', time) AS bucket,
  org_id,
  server_id,
  avg(cpu_pct) AS cpu_pct_avg,
  max(cpu_pct) AS cpu_pct_max,
  avg(load1) AS load1_avg,
  max(load1) AS load1_max,
  avg(load5) AS load5_avg,
  avg(load15) AS load15_avg,
  avg(mem_used) AS mem_used_avg,
  max(mem_used) AS mem_used_max,
  avg(mem_total) AS mem_total_avg,
  avg(mem_available) AS mem_available_avg,
  avg(net_rx_bps) AS net_rx_bps_avg,
  max(net_rx_bps) AS net_rx_bps_max,
  avg(net_tx_bps) AS net_tx_bps_avg,
  max(net_tx_bps) AS net_tx_bps_max,
  avg(disk_read_bps) AS disk_read_bps_avg,
  max(disk_read_bps) AS disk_read_bps_max,
  avg(disk_write_bps) AS disk_write_bps_avg,
  max(disk_write_bps) AS disk_write_bps_max
FROM host_metrics
GROUP BY bucket, org_id, server_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('host_metrics_1h',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes');

-- Continuous aggregates: container 1m
CREATE MATERIALIZED VIEW container_metrics_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 minute', time) AS bucket,
  org_id,
  server_id,
  container_id,
  last(container_name, time) AS container_name,
  app_id,
  avg(cpu_pct) AS cpu_pct_avg,
  max(cpu_pct) AS cpu_pct_max,
  avg(mem_used) AS mem_used_avg,
  max(mem_used) AS mem_used_max,
  avg(mem_limit) AS mem_limit_avg,
  avg(net_rx_bps) AS net_rx_bps_avg,
  avg(net_tx_bps) AS net_tx_bps_avg,
  avg(blk_read_bps) AS blk_read_bps_avg,
  avg(blk_write_bps) AS blk_write_bps_avg,
  max(pids) AS pids_max
FROM container_metrics
GROUP BY bucket, org_id, server_id, container_id, app_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('container_metrics_1m',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

-- Continuous aggregates: container 1h
CREATE MATERIALIZED VIEW container_metrics_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 hour', time) AS bucket,
  org_id,
  server_id,
  container_id,
  last(container_name, time) AS container_name,
  app_id,
  avg(cpu_pct) AS cpu_pct_avg,
  max(cpu_pct) AS cpu_pct_max,
  avg(mem_used) AS mem_used_avg,
  max(mem_used) AS mem_used_max,
  avg(mem_limit) AS mem_limit_avg,
  avg(net_rx_bps) AS net_rx_bps_avg,
  avg(net_tx_bps) AS net_tx_bps_avg,
  avg(blk_read_bps) AS blk_read_bps_avg,
  avg(blk_write_bps) AS blk_write_bps_avg,
  max(pids) AS pids_max
FROM container_metrics
GROUP BY bucket, org_id, server_id, container_id, app_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('container_metrics_1h',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes');

-- Compression
ALTER TABLE host_metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'server_id'
);
SELECT add_compression_policy('host_metrics', INTERVAL '2 days');

ALTER TABLE disk_metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'server_id'
);
SELECT add_compression_policy('disk_metrics', INTERVAL '2 days');

ALTER TABLE container_metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'server_id'
);
SELECT add_compression_policy('container_metrics', INTERVAL '2 days');

-- Retention: raw 7d, 1m agg 90d, 1h agg 2y
SELECT add_retention_policy('host_metrics', INTERVAL '7 days');
SELECT add_retention_policy('disk_metrics', INTERVAL '7 days');
SELECT add_retention_policy('container_metrics', INTERVAL '7 days');
SELECT add_retention_policy('host_metrics_1m', INTERVAL '90 days');
SELECT add_retention_policy('container_metrics_1m', INTERVAL '90 days');
SELECT add_retention_policy('host_metrics_1h', INTERVAL '2 years');
SELECT add_retention_policy('container_metrics_1h', INTERVAL '2 years');

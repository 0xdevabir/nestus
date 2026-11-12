# Phase 03 — Go Agent & Agent Gateway

**Goal:** Install a Go agent on a Linux server with one command. It enrolls, keeps a gRPC stream open to the control plane, reports system info and containers, and runs **typed, allowlisted** commands (such as restarting a container) from the dashboard.
**Depends on:** Phase 02
**No tests in this phase.**

---

## 1. Protocol — `proto/nestus/v1/agent.proto`

```proto
syntax = "proto3";
package nestus.v1;
import "google/protobuf/timestamp.proto";
import "google/protobuf/struct.proto";

service AgentGateway {
  rpc Enroll(EnrollRequest) returns (EnrollResponse);
  rpc Connect(stream AgentMessage) returns (stream ControlMessage); // auth via metadata
}

message HostFacts {
  string hostname = 1; string os = 2; string platform = 3; string platform_version = 4;
  string kernel = 5; string arch = 6; int32 cpu_cores = 7; string cpu_model = 8;
  uint64 mem_total_bytes = 9; uint64 disk_total_bytes = 10; string machine_id = 11;
  repeated string ip_addresses = 12; string public_ip = 13; string docker_version = 14;
  string agent_version = 15; string mode = 16; // "docker" | "k8s"
}

message EnrollRequest  { string enrollment_token = 1; HostFacts facts = 2; }
message EnrollResponse { string agent_id = 1; string agent_secret = 2; string server_id = 3; }

message AgentMessage {
  string msg_id = 1;
  google.protobuf.Timestamp sent_at = 2;
  oneof payload {
    Hello hello = 10;
    Heartbeat heartbeat = 11;
    ContainerSnapshot containers = 12;
    CommandAck command_ack = 13;
    CommandLog command_log = 14;
    CommandResult command_result = 15;
    // reserved for later phases:
    // MetricsBatch metrics = 20;  (phase 4)
    // LogBatch logs = 21;          (phase 7)
    // ContainerEvent container_event = 22; (phase 8)
  }
}

message ControlMessage {
  string msg_id = 1;
  oneof payload {
    HelloAck hello_ack = 10;
    Command command = 11;
    ConfigUpdate config = 12;
    Ping ping = 13;
  }
}

message Hello { HostFacts facts = 1; repeated string supported_commands = 2; }
message HelloAck { string server_id = 1; AgentConfig config = 2; }
message Heartbeat { double uptime_seconds = 1; }
message Ping {}
message AgentConfig {
  int32 heartbeat_interval_sec = 1; int32 metrics_interval_sec = 2; int32 container_snapshot_interval_sec = 3;
  repeated string allowed_commands = 4; google.protobuf.Struct extra = 5;
}
message ConfigUpdate { AgentConfig config = 1; }

message ContainerInfo {
  string id = 1; string name = 2; string image = 3; string state = 4; string status = 5;
  string health = 6; int64 created_unix = 7; int32 restart_count = 8;
  map<string,string> labels = 9; repeated string ports = 10; repeated string networks = 11; string ip_address = 12;
}
message ContainerSnapshot { repeated ContainerInfo containers = 1; }

message Command {
  string command_id = 1;          // idempotency key
  string type = 2;                // e.g. "docker.restart" — must be in allowlist
  google.protobuf.Struct params = 3;
  int32 timeout_sec = 4;
  string signature = 5;           // phase 10 (ed25519); empty until then
}
message CommandAck    { string command_id = 1; bool accepted = 2; string reason = 3; }
message CommandLog    { string command_id = 1; string stream = 2; string line = 3; google.protobuf.Timestamp ts = 4; }
message CommandResult { string command_id = 1; bool success = 2; string error = 3; google.protobuf.Struct output = 4; int64 duration_ms = 5; }
```
- [ ] Run `pnpm proto:gen`. Commit the generated code.

## 2. Prisma models

```prisma
enum ServerStatus { PENDING ONLINE OFFLINE DEGRADED }
enum CommandStatus { QUEUED SENT ACCEPTED REJECTED RUNNING SUCCEEDED FAILED TIMED_OUT }

model Server {
  id String @id @default(cuid())
  orgId String
  name String
  status ServerStatus @default(PENDING)
  hostname String?  os String?  platform String?  kernel String?  arch String?
  cpuCores Int?  memTotalBytes BigInt?  diskTotalBytes BigInt?
  publicIp String?  privateIps String[]
  dockerVersion String?  agentVersion String?
  mode String @default("docker")   // docker | k8s (phase 10)
  tags String[]
  lastSeenAt DateTime?
  createdAt DateTime @default(now())
  agent ServerAgent?
  containers Container[]
  @@index([orgId])
}

model ServerAgent {
  id String @id @default(cuid())
  serverId String @unique
  secretHash String
  machineId String?
  connectedAt DateTime?
  disconnectedAt DateTime?
  gatewayInstance String?
  createdAt DateTime @default(now())
  server Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
}

model EnrollmentToken {
  id String @id @default(cuid())
  orgId String
  serverId String
  tokenHash String @unique
  expiresAt DateTime
  usedAt DateTime?
  createdById String
}

model Container {
  id String @id @default(cuid())
  serverId String
  dockerId String
  name String
  image String
  state String     // running | exited | restarting | paused | dead | created
  status String
  health String?
  restartCount Int @default(0)
  labels Json
  ports String[]
  appId String?    // set from label nestus.app (phase 5)
  lastSeenAt DateTime
  server Server @relation(fields: [serverId], references: [id], onDelete: Cascade)
  @@unique([serverId, dockerId])
}

model AgentCommand {
  id String @id @default(cuid())
  orgId String
  serverId String
  type String
  params Json
  status CommandStatus @default(QUEUED)
  actorType ActorType
  actorId String?
  error String?
  output Json?
  queuedAt DateTime @default(now())
  sentAt DateTime?  startedAt DateTime?  finishedAt DateTime?
  durationMs Int?
  @@index([serverId, queuedAt])
}
```

## 3. Command catalog (shared by API and agent)
- [ ] `packages/shared/src/agent-commands.ts`: map of `type → { paramsSchema (zod), defaultTimeoutSec, permission }`. Commands in this phase:
  - `system.ping` · `system.info`
  - `docker.list` · `docker.inspect {containerId}`
  - `docker.start|stop|restart {containerId, timeoutSec?}`
  - Later phases add more types (`build.run`, `deploy.run`, `proxy.*`, `k8s.*`, ...)
- [ ] The Go side has its own registry (`internal/commands/registry.go`). A command runs only if:
  1. a handler exists for its type, **and**
  2. the type is in `allowed_commands` from the agent config (local file overrides, which can only remove entries), **and**
  3. its params decode into the handler's typed Go struct.

  If any check fails → `CommandAck{accepted:false, reason}`.

## 4. API — `AgentGatewayModule` (`apps/api/src/modules/agent-gateway`)
- [ ] `GrpcServerService` (onModuleInit): starts a raw `@grpc/grpc-js` `Server` on `GRPC_PORT` and registers the `AgentGateway` implementation from `@nestus/proto-ts`. Dev uses insecure creds. Prod TLS terminates at Caddy (h2c upstream).
- [ ] `Enroll`: hash the token → find a valid, unused `EnrollmentToken` → mark it used → create `ServerAgent` with a random 48-byte secret (store the argon2/sha256 hash) → update `Server` facts → return creds. Audit `server.enrolled` (actor AGENT).
- [ ] `Connect`:
  1. Read metadata `authorization: Bearer <agentId>.<secret>` → verify it, or end the call with `UNAUTHENTICATED`
  2. Register in `AgentConnectionRegistry` (in-memory `Map<serverId, Session>`). Set Redis `agent:online:<serverId> = <instanceId>` with a 30s TTL, refreshed on each heartbeat.
  3. Wait for `Hello` → update facts → send `HelloAck` with config
  4. Route incoming messages to handlers: heartbeat → `lastSeenAt`; containers → `ContainerSyncService`; command_* → `CommandService`
  5. On stream end/error → mark disconnected and emit `agent.disconnected`
  6. Send `Ping` every 20s
- [ ] **Multi-instance routing:** `CommandService.dispatch()` publishes to Redis channel `agent:cmd:<serverId>`. The instance holding that stream is subscribed and writes the command to it. (This works with one instance too, and it's the scalability story.)
- [ ] `CommandService`:
  - `dispatch(orgId, serverId, type, params, actor, { wait?: boolean })` → validates params with the shared catalog → creates `AgentCommand` (QUEUED) → publishes → status SENT. With `wait`, it returns a promise resolved by `CommandResult` (or a timeout → TIMED_OUT).
  - Command logs are relayed to the Socket.IO room `command:<id>` (gateway built in Phase 4; until then just persist the last 500 lines to Redis list `cmdlog:<id>`)
  - Audit `server.command.<type>`
- [ ] `PresenceMonitor` (BullMQ repeatable job every 15s): servers with `status=ONLINE` and `lastSeenAt < now-30s` → `OFFLINE` + event `server.offline`. Reconnect → `ONLINE` + `server.online`.
- [ ] `ContainerSyncService`: upsert containers from the snapshot. Rows not in the snapshot → state `removed` and delete them after 24h.

## 5. API — servers REST (`modules/servers`)
- [ ] `POST /orgs/:orgId/servers` {name, tags} → creates Server(PENDING) + EnrollmentToken (1h TTL) → returns `{ server, installCommand }`, where
  `installCommand = curl -fsSL ${API_URL}/install.sh | sudo NESTUS_URL=${GRPC_PUBLIC_URL} NESTUS_TOKEN=<token> bash`
- [ ] `POST /servers/:id/enrollment-token` (regenerate) · `GET /servers` · `GET /servers/:id` · `PATCH` (name, tags) · `DELETE` (also sends `agent.uninstall`, best effort)
- [ ] `GET /servers/:id/containers` · `POST /servers/:id/containers/:dockerId/{start|stop|restart}` (perm `server:command`)
- [ ] `GET /servers/:id/commands` (history) · `GET /commands/:id`
- [ ] Public `GET /install.sh` (served from `deploy/install.sh`) and `GET /downloads/agent/:os/:arch` (serves `agent/bin/*` in dev. In prod, redirect to GitHub Releases in Phase 10.)

## 6. `deploy/install.sh`
- [ ] Bash script: check root + systemd + Linux → detect arch → download the binary to `/usr/local/bin/nestus-agent` → `nestus-agent enroll --url $NESTUS_URL --token $NESTUS_TOKEN` → write `/etc/systemd/system/nestus-agent.service` (Restart=always, RestartSec=5, User=root for Docker socket access in v1) → `systemctl enable --now`. Print a success banner. Running it again must be safe.

## 7. Agent (Go) — structure

```
agent/
├─ cmd/nestus-agent/main.go          # cobra: run, enroll, version, status
├─ internal/config/                  # /etc/nestus/agent.yaml + env overrides; credentials at /var/lib/nestus/credentials.json (0600)
├─ internal/enroll/                  # Enroll RPC, persist creds
├─ internal/transport/               # grpc client, Connect stream, send queue, reconnect loop
├─ internal/facts/                   # HostFacts via gopsutil host/cpu/mem/disk/net + docker version
├─ internal/docker/                  # wrapper over github.com/docker/docker/client
├─ internal/collector/               # container snapshot ticker (metrics in phase 4)
├─ internal/commands/                # registry, executor, handlers/{system,docker}.go
└─ internal/version/
```
- [ ] **Transport:** one goroutine reads the stream and one writes from a buffered `chan *AgentMessage` (size 1024). The writer is the only place that calls `stream.Send`. Reconnect with exponential backoff (1s → 60s cap, ±20% jitter). Reset the backoff after 60s of a healthy connection. Re-send `Hello` on every connect.
- [ ] **Executor:** worker pool (4). Each command runs with a `context.WithTimeout`. It sends Ack → Logs → Result. Keep an LRU of the last 1000 `command_id`s so duplicates are ignored (idempotency).
- [ ] **Graceful shutdown** on SIGTERM: stop tickers, finish running commands (10s), close the stream.
- [ ] `nestus-agent status` prints config, server id and connection state (read from a local unix socket or state file).

## 8. Web
- [ ] **Infrastructure page:** server cards/table with name, status dot (pulse when online), hostname, OS, public IP, agent version, last seen (relative), tags. Filter by status/tag.
- [ ] **Add Server dialog:** name + tags → shows the install command in a code block with a copy button. Polls the server status and switches to a "Connected ✓" state when it is ONLINE.
- [ ] **Server detail** `/infrastructure/[serverId]`: tabs
  - *Overview:* facts (CPU model/cores, RAM, disk, kernel, docker version, IPs)
  - *Containers:* table (name, image, state badge, health, restarts, ports) + row actions start/stop/restart with a confirm dialog → shows a toast with the command result
  - *Commands:* history table (type, actor, status, duration), expandable to show output/error
  - *Settings:* rename, tags, regenerate token, delete server

---

## Done when
- [ ] Add Server in the UI → run the install command on a VPS (or `go run ./cmd/nestus-agent enroll ...` + `run` locally) → the server shows **ONLINE** with correct facts
- [ ] The containers on that host show up and refresh within 15s of changes
- [ ] Restarting a container from the UI works. The command history shows SUCCEEDED. The audit log shows the user as actor.
- [ ] Stop the agent → the server goes **OFFLINE** within about 30s. Start it → ONLINE again, with no manual action.
- [ ] Kill and restart the API while the agent runs → the agent reconnects by itself (watch the backoff logs)
- [ ] Remove `docker.restart` from the agent's local allowlist → the command is rejected with a reason shown in the UI

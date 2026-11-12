# Phase 10 — Topology, Kubernetes, Multi-Server Scaling, Hardening & Production Launch

**Goal:** Finish the platform: a live distributed-system topology map, replicas/multi-server deploys with autoscaling, a Kubernetes mode for the agent, security hardening (mTLS, signed commands, 2FA), and NESTUS running in production on your VPS with release pipelines and a polished public face.
**Depends on:** Phase 09
**No tests in this phase.**

---

## Part A — Distributed System Topology

### A1. Connection discovery (agent)
- [ ] `internal/netmap`: every 30s, read established TCP connections: the host via gopsutil `net.Connections("tcp")`, and each container by reading `/proc/<container-pid>/net/tcp` and `tcp6` (the PID comes from `docker inspect`; this shows the container's network namespace without `nsenter`). Map local/remote IPs → containers (via Docker network IPs) or external hosts. Aggregate into `{from, to, port, count}`.
- [ ] New proto `NetFlowSnapshot { repeated NetEdge edges = 1; }`, `NetEdge { string src_container = 1; string dst_container = 2; string dst_ip = 3; uint32 dst_port = 4; uint32 conn_count = 5; }` → `AgentMessage` field 24

### A2. Topology service (`modules/topology`)
- [ ] `TopologyService.build(orgId, {around?, serverId?})` merges:
  - **Nodes:** servers (group), apps, containers, proxies, databases (DatabaseMonitors + containers with images `postgres|mysql|redis|mongo`), domains (external entry), K8s workloads (Part C), external hosts (grouped by port, e.g. `:443 external APIs`)
  - **Edges:** domain → proxy → app (from proxy routes), app → db (from netflow on 5432/6379/...), app ↔ app (netflow + OTel service graph with rps/error rate/p95), server ↔ server (cross-server flows)
  - **Health per node:** from firing alerts / open incidents / container state / HTTP checks. **Metrics per node:** cpu/mem, rps, error rate.
- [ ] Cache the result in Redis for 15s. Push `topology.updated` diffs over Socket.IO room `org:<id>`.
- [ ] `GET /orgs/:orgId/topology?serverId&around&depth` · `GET /topology/nodes/:nodeId` (detail panel data)
- [ ] **Blast radius:** `GET /topology/blast-radius?node=` → downstream/upstream dependents (BFS). The AI tool `get_topology` uses it too.

### A3. Web — Topology page
- [ ] `@xyflow/react` + `elkjs` layered layout (left→right: Internet → proxies → apps → data stores), server group nodes as subflows
- [ ] Custom nodes: App (framework icon, replicas, rps, status ring), Container, Database (connections gauge), Server (cpu/mem bars), External
- [ ] Edges: thickness by rps, animated dash, red when error rate > 1%, labels on hover (rps · err% · p95)
- [ ] Controls: filter by server/app, "Show containers" toggle, search, minimap, fit view, **Incident mode** (highlight affected nodes + blast radius in red/amber, dim the rest)
- [ ] Click a node → right drawer: metrics, recent logs, open incidents, quick actions (restart/rollback/scale → Recovery Engine)
- [ ] Live updates without re-laying out unless nodes are added or removed

## Part B — Replicas, Multi-Server Deploys & Autoscaling

- [ ] Placement model:
  ```prisma
  model AppPlacement { id String @id @default(cuid()) appId String serverId String replicas Int @default(1) isEdge Boolean @default(false) @@unique([appId, serverId]) }
  ```
  Migrate `Application.serverId/replicas` into placements (keep `serverId` as the primary/edge for compatibility)
- [ ] **Replicas on one server:** deploy N containers `nestus-<slug>-d<N>-r<i>`. The Caddy route upstreams list all of them (round robin + active health checks). Blue/green now switches the whole set.
- [ ] **Multi-server:** for placements on several servers, build on each (or build once → `docker save | gzip` streamed through the agent→API→agent stream in chunks. Simpler v1: build on each server in parallel.)
  - Traffic: the edge server's Caddy upstreams include remote replicas at `<server-private-ip>:<hostPort>`. Open host ports only on the private interface (setting `privateNetworkCidr`). Recommend WireGuard/Tailscale between servers (document it).
  - **Rolling strategy** `deployStrategy=ROLLING`: one server at a time → health gate → continue. On failure → stop and roll back the already-updated servers.
- [ ] **`app.scale` action** (Recovery Engine, MEDIUM): `{appId, serverId, replicas}` → start/stop replica containers → update the proxy → verify all healthy. Capacity precondition: projected mem (replicas × memoryLimit or observed avg) < 85% of server RAM.
- [ ] **Autoscaling policies:**
  ```prisma
  model ScalingPolicy { id String @id @default(cuid()) orgId String appId String @unique enabled Boolean @default(true) metric String /* cpu|mem|rps|p95 */ scaleUpAbove Float scaleDownBelow Float minReplicas Int @default(1) maxReplicas Int @default(4) evaluationWindowSec Int @default(180) cooldownSec Int @default(300) }
  ```
  Evaluator job every 30s (avg across replicas from container_metrics / spanmetrics) → proposes `app.scale` with `proposedByType=POLICY` (mode AUTO if autonomy=AUTO) → shows in the incident-less action history
- [ ] Web: App → *Scaling* tab (placements editor, replicas per server, strategy, autoscaling policy form, replica count chart over time)

## Part C — Kubernetes Integration (agent `k8s` mode)

- [ ] Agent `--mode=k8s` (auto-detected when `KUBERNETES_SERVICE_HOST` is set), running in-cluster with `client-go`, using the **same gRPC protocol** (reuse transport, buffer, commands framework)
- [ ] Collectors:
  - Facts: cluster version, node count, total allocatable CPU/mem
  - Snapshot → new proto `K8sSnapshot { nodes, namespaces, deployments (ready/desired/image/revision), pods (phase, restarts, node, reason e.g. CrashLoopBackOff/OOMKilled), services, ingresses }` every 15s
  - Metrics via the `metrics.k8s.io` API (metrics-server) → node + pod CPU/mem → stored in `container_metrics` with `container_id = ns/pod/container`
  - Events (Warning) → `ContainerEvent`-like `K8sEvent` → alert detectors (CrashLoopBackOff, OOMKilled, FailedScheduling, ImagePullBackOff)
  - Pod logs for pods with label `nestus.io/app` → the same LogBatch pipeline
- [ ] Commands (allowlisted): `k8s.rollout_restart {ns, deployment}` (patch the annotation `kubectl.kubernetes.io/restartedAt`), `k8s.scale {ns, deployment, replicas}`, `k8s.rollback {ns, deployment, toRevision?}` (find the ReplicaSet by revision → patch the deployment template), `k8s.delete_pod {ns, pod}`, `k8s.apply_app {manifest}` — **only** manifests generated by NESTUS from an Application (Deployment + Service + Ingress, labels `nestus.io/*`), applied with server-side apply, field manager `nestus`
- [ ] Prisma: `Server.mode = "k8s"` represents a cluster. Add a `K8sResource` cache table, or keep the latest snapshot in Redis (`k8s:snapshot:<serverId>`) — **pick Redis** for speed.
- [ ] Recovery actions mapped for k8s targets: `container.restart` → `k8s.delete_pod`, `deployment.rollback` → `k8s.rollback`, `app.scale` → `k8s.scale`
- [ ] App deploy target = cluster: build happens on a designated docker build server → push to a registry (GHCR or a self-hosted `registry:2` on the control plane, with credentials in org settings) → `k8s.apply_app` with the new image → watch the rollout status until it is available → LIVE
- [ ] `deploy/helm/nestus-agent/`: Deployment (1 replica), ServiceAccount, **least-privilege ClusterRole** (get/list/watch on core + apps + events + metrics; patch/update on deployments + deployments/scale; delete pods; create/patch only in namespaces labeled `nestus.io/managed=true` for apply), Secret for enrollment token/credentials, values (url, token)
- [ ] Add-cluster flow in the UI shows `helm install nestus-agent ./deploy/helm/nestus-agent --set url=... --set token=...` (and later an OCI chart)
- [ ] Web: **Clusters** section under Infrastructure: cluster overview (nodes with capacity bars), workloads table (ready/desired, restarts, image), pods table with status reasons, warning events feed, per-workload actions (restart/scale/rollback). Topology includes k8s workloads.
- [ ] Local dev: `scripts/k3d-up.sh` creates a k3d cluster with metrics-server and installs the chart against your dev control plane

## Part D — Security Hardening

- [ ] **mTLS for agents:** the control plane runs a small internal CA (`modules/pki`, keys encrypted at rest). At enrollment, the agent generates an ECDSA P-256 key and sends a CSR. The API signs a client cert (CN = agentId, 90-day validity). The gRPC server requires client certs in prod. Agents auto-renew at 2/3 lifetime via `RenewCertificate` RPC. Revoke by disabling the agent (deny list checked on connect). The old bearer secret stays as a dev-only fallback.
- [ ] **Signed commands:** the control plane holds an Ed25519 signing key. `Command.signature = sign(command_id|type|canonical_json(params)|expires_at)`. The agent pins the public key from enrollment and rejects unsigned, expired (> 5 min) or invalid commands. (Defense in depth: even a compromised gateway connection can't inject commands.)
- [ ] **2FA (TOTP)** with `otplib`: setup with a QR code, recovery codes (hashed), required for OWNER/ADMIN when org setting `require2fa` is on. Step-up re-auth (password/TOTP within 10 min) for: env reveal, API key create, autonomy mode change, HIGH risk approvals, server delete.
- [ ] **Sessions page:** list active sessions (device, IP, last used) + revoke
- [ ] Secrets: key rotation command `pnpm --filter api cli rotate-encryption-key` (re-encrypts `v1:` → `v2:`)
- [ ] HTTP hardening: strict CSP on web (nonce-based), HSTS, `X-Frame-Options DENY`, per-route throttling, request body size limits, webhook replay protection
- [ ] Agent hardening: systemd unit with `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/nestus /etc/nestus`, plus a documented option to run as user `nestus` in the `docker` group
- [ ] **Security page** in the UI: tabs Audit Log (from Phase 2, plus export CSV), API Keys, Agent Credentials (cert expiry, revoke), Sessions, Policies summary (autonomy mode, approval rules), 2FA enforcement

## Part E — Production Launch of NESTUS Itself

- [ ] Multi-stage Dockerfiles: `apps/api/Dockerfile` (pnpm deploy → node:22-alpine, non-root, runs `prisma migrate deploy` on start), `apps/web/Dockerfile` (Next standalone), `ai/Dockerfile` (uv, python:3.12-slim, pre-download the fastembed model)
- [ ] `deploy/docker-compose.prod.yml`: caddy, web, api (+ worker replica with `ROLE=worker` that runs only BullMQ processors — split the API into `ROLE=api|worker|all`), ai, postgres (timescaledb-ha), redis, loki, tempo, otel-collector, prometheus, grafana (behind basic auth), with resource limits and healthchecks
- [ ] `deploy/Caddyfile`: `nestus.<domain>` → web, `api.nestus.<domain>` → api (with `/otlp/*`), `grpc.nestus.<domain>` → api:50051 via `reverse_proxy h2c://`, `grafana.nestus.<domain>`
- [ ] Backups: nightly `pg_dump` (or `pgbackrest`) to S3-compatible storage (Backblaze/R2) via a cron container. Document the restore steps.
- [ ] GitHub Actions:
  - `release-images.yml`: on tag `v*` → build and push api/web/ai images to GHCR (multi-arch) → SSH deploy (`docker compose pull && up -d`) to the control-plane VPS using environment secrets
  - `release-agent.yml`: on tag `agent-v*` → **goreleaser** (linux amd64/arm64 binaries + checksums + SBOM) → GitHub Release. Install script and `/downloads` redirect point to the latest release.
  - `helm-release.yml`: package the chart → GHCR OCI
- [ ] **Agent self-update:** command `agent.update {version, url, sha256}` (signed) → download → verify checksum → replace the binary → `systemctl restart`. The UI shows "update available" per server.
- [ ] **Dogfooding:** install the agent on the control-plane VPS itself so NESTUS monitors its own host and containers
- [ ] **Public face:**
  - Landing page `/` (marketing): hero with the tagline, an animated topology illustration, feature sections for the 8 modules, an architecture diagram, "How self-healing works" steps, tech stack strip, links to GitHub and a demo video
  - `/docs` (MDX via `@next/mdx` or Fumadocs): Getting started, Install agent, Deploy an app, Observability setup (OTel snippets), Recovery policies, AI engineer, Kubernetes, Security model, Architecture deep-dive (the five hard problems)
  - Polished `README.md`: banner, badges, GIF of the dashboard, architecture diagram (Mermaid), feature list, quick start, tech stack, the security model in one table, roadmap
- [ ] Demo seed: `pnpm --filter api seed:demo` creates a demo org with sample apps (a `demo/` folder with 3 tiny apps: `shop-web` Next.js, `shop-api` NestJS + Postgres, `worker` Node) that you can deploy for the interview demo

---

## Done when
- [ ] The Topology page shows Internet → proxy → shop-web → shop-api → Postgres with live rps and health colors. Killing shop-api turns it red, and incident mode highlights shop-web as the blast radius.
- [ ] Setting shop-api to 3 replicas → 3 containers behind Caddy, and the traffic splits
- [ ] A CPU load test triggers the autoscaling policy to scale up, and it scales down after the cooldown
- [ ] A rolling deploy across 2 servers works, and a forced failure on server 2 rolls server 1 back
- [ ] A k3d cluster with the Helm-installed agent shows nodes/workloads/pods. A CrashLoopBackOff pod opens an incident. `k8s.rollout_restart` and `k8s.scale` work from the UI.
- [ ] In prod, agents connect only with valid client certs. A command with a tampered signature is rejected (check by temporarily corrupting the signature in dev).
- [ ] 2FA is enforced for admins. Step-up auth is required for env reveal.
- [ ] `git tag v0.1.0 && git push --tags` → images built → NESTUS deploys to the VPS at `https://nestus.<your-domain>`
- [ ] `git tag agent-v0.1.0` → GitHub Release with binaries. The install script on a fresh VPS uses it.
- [ ] The landing page, docs and README are complete enough to share on your portfolio

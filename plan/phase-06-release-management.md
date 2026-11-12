# Phase 06 — Release Management: Domains, SSL, Zero-Downtime, Rollback & CI/CD

**Goal:** Turn the deploy engine into a real release platform: custom domains with automatic HTTPS, blue/green zero-downtime deploys, one-click instant rollback, auto-deploy on push with GitHub status checks, approval gates, and notifications.
**Depends on:** Phase 05
**No tests in this phase.**

---

## 1. Edge proxy on every server (Caddy)
- [ ] When the agent starts in docker mode, it ensures a container `nestus-proxy` exists:
  - image `caddy:2-alpine`, ports `80:80`, `443:443`, `443:443/udp`, network `nestus`, volumes `nestus-caddy-data` and `nestus-caddy-config`
  - admin API bound to `127.0.0.1:2019` on the host (`--publish 127.0.0.1:2019:2019`, with Caddy config `admin 0.0.0.0:2019` inside)
  - restart policy `unless-stopped`
- [ ] Agent package `internal/proxy`: manages the Caddy JSON config through the admin API (`/config/apps/http/servers/nestus/routes`). Each route has `@id = "app-<appId>"` so it can be replaced in one call.
- [ ] New agent commands:
  - `proxy.set_route { appId, hosts: [], upstreams: ["nestus-myapp-d12:3000", ...], healthPath }` (upsert by @id; active health checks + `lb_policy round_robin` for later replicas)
  - `proxy.remove_route { appId }`
  - `proxy.status` → current routes + TLS certificate info (from Caddy's `/pki` endpoint and route config)
  - `proxy.restart`
- [ ] Remove `hostPort` publishing from `deploy.run`. Containers are only reachable through the proxy. (Keep `hostPort` as an optional "expose debug port" setting.)

## 2. Domains
```prisma
model Domain {
  id String @id @default(cuid())
  orgId String
  appId String
  hostname String @unique
  isPrimary Boolean @default(false)
  isGenerated Boolean @default(false)
  dnsStatus String @default("PENDING")   // PENDING | VERIFIED | MISCONFIGURED
  sslStatus String @default("PENDING")   // PENDING | ACTIVE | ERROR
  lastCheckedAt DateTime?
  createdAt DateTime @default(now())
}
```
- [ ] On app create, auto-generate `<slug>.<server-public-ip-dashed>.sslip.io` (isGenerated, works immediately with HTTPS)
- [ ] `GET/POST /apps/:id/domains`, `DELETE /domains/:id`, `POST /domains/:id/verify`, `POST /domains/:id/primary`
- [ ] DNS verification (`dns.promises.resolve4`/`resolveCname`): passes when it points at the server's public IP. BullMQ repeatable job re-checks PENDING domains every 2 minutes.
- [ ] Any domain change → `proxy.set_route` with every hostname of the app. Then poll `proxy.status` to update `sslStatus`.

## 3. Zero-downtime (blue/green) deploys
Replace steps 3–5 of the Phase 5 pipeline:
1. **DEPLOYING:** start the new container `nestus-<slug>-d<N>` next to the old one (different name, same network, no host port)
2. **HEALTH_CHECKING:** health check the new container directly. If it fails → stop/remove the new container, **keep the old route**, mark FAILED.
3. **Switch traffic:** `proxy.set_route` with upstreams = the new container only (atomic route replace)
4. **Drain:** wait `drainSeconds` (default 10). Then stop the old container (keep it stopped for 1 hour for forensics, then remove it — agent janitor).
5. **LIVE.** Write a log line: `Traffic switched from d<N-1> to d<N> (0 failed requests)`.
- [ ] Add `Application.drainSeconds Int @default(10)` and `Application.deployStrategy String @default("BLUE_GREEN")` (`RECREATE` is the other option)

## 4. Rollback
- [ ] `POST /deployments/:id/rollback` (perm `deployment:rollback`): target must be a previous deployment of the app that reached LIVE and whose image still exists on the server (check via `docker.image_exists`)
  - Creates Deployment `trigger=ROLLBACK, rollbackOfId=<current>, imageTag=<target.imageTag>, commitSha=<target.commitSha>` → pipeline **skips BUILDING** → deploy + health + switch. Usually under 10s.
  - Marks the replaced deployment `ROLLED_BACK`
- [ ] `POST /apps/:id/redeploy` → same commit, rebuild (trigger REDEPLOY)
- [ ] **Image retention:** after each LIVE, the agent keeps the last `Application.keepImages` (default 5) images for that app and removes the rest (`docker.image_prune_app { appId, keep }`). The UI disables "Rollback" on deployments whose image is gone (`imagePruned Boolean` on Deployment).
- [ ] Emit `deployment.rolled_back`

## 5. CI/CD — GitHub webhooks & checks
- [ ] `POST /webhooks/github` (public, raw body). Verify `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET` (timing-safe compare). Dedupe on `X-GitHub-Delivery` (Redis SET with 24h TTL).
  - `push`: for each app with matching repo + branch and `autoDeploy=true` → create Deployment `trigger=PUSH` with commit info from the payload. Ignore pushes that only touch paths outside `rootDir` (check `commits[].modified/added/removed`).
  - `installation` / `installation_repositories`: sync GitHubInstallation (delete on uninstall)
- [ ] **GitHub feedback:** on status changes, create/update a GitHub **Deployment** + **Deployment Status** (`in_progress`, `success`, `failure`) with `environment_url` = primary domain and `log_url` = NESTUS deployment page. Also create a commit status `nestus/deploy`.
- [ ] Optional pre-deploy command: `Application.preDeployCommand String?` (e.g. `npx prisma migrate deploy`). Runs as a one-off container from the **new image** with the same env before the traffic switch. Logs stream as `stream=predeploy`. If it fails, the deploy fails. (The agent runs it as `docker run --rm <image> sh -c <cmd>` — the command comes from an authorized app setting, never from the AI, and is audited.)

## 6. Approval gates
- [ ] If `Application.requireApproval` is set → new deployments go to `AWAITING_APPROVAL` after Prepare (commit resolved). The build runs only after approval.
- [ ] `POST /deployments/:id/approve` and `/reject {reason}` (perm `deployment:approve`; the triggering user can't approve their own deploy unless they are OWNER)
- [ ] Expire after 24h → CANCELLED
- [ ] Emit `deployment.awaiting_approval`

## 7. Notifications (reused by Phase 8 and 9)
```prisma
model NotificationChannel {
  id String @id @default(cuid())
  orgId String
  name String
  type String          // DISCORD | SLACK | WEBHOOK | EMAIL
  configEnc String     // encrypted JSON: webhook url / emails / secret
  events String[]      // e.g. ["deployment.failed","deployment.succeeded","server.offline","incident.*"]
  enabled Boolean @default(true)
  createdAt DateTime @default(now())
}
```
- [ ] `NotificationService`: listens with `@OnEvent('**')` → matches channel `events` (wildcard support) → enqueues on BullMQ `notifications` (retry ×5 with exponential backoff)
- [ ] Senders: Discord (embed with color by severity), Slack (Block Kit), generic Webhook (JSON body + `X-Nestus-Signature` HMAC header), Email (Resend or SMTP via nodemailer)
- [ ] Message templates per event in `modules/notifications/templates.ts`. Each includes a deep link to the dashboard.
- [ ] `POST /notification-channels/:id/test`
- [ ] Define the canonical **event catalog** in `packages/shared/src/events.ts` (names + payload types). Include the events used so far plus placeholders: `server.online`, `server.offline`, `deployment.*`, `incident.opened`, `incident.resolved`, `action.pending_approval`, `action.executed`, `ai.analysis_completed`

## 8. Web
- [ ] App *Domains* tab: list with DNS + SSL badges, add-domain dialog that shows the DNS record to create (A → server IP), verify button, set primary
- [ ] App *Deployments* tab: "Rollback to this" per row (with a confirm dialog that shows the commit diff summary: `compare` link + commit count via the GitHub compare API), image-pruned state, approval banner with Approve/Reject for pending ones
- [ ] **Release timeline** on the app overview: vertical timeline of the last 20 releases (deploys, rollbacks, approvals) with commit messages
- [ ] Deployment detail: step bar now shows `Switch traffic` and `Drain`
- [ ] App *Settings*: auto-deploy toggle, require approval, deploy strategy, drain seconds, keep images, pre-deploy command
- [ ] **Settings → Notifications** page: channels list, create dialog per type, event multi-select, test button
- [ ] Global header: a pending-approvals badge → popover list

---

## Done when
- [ ] A new app gets an `*.sslip.io` URL with a valid HTTPS certificate
- [ ] Add a custom domain → create the A record → it verifies → HTTPS works
- [ ] Run `while true; do curl -s -o /dev/null -w "%{http_code}\n" https://app...; sleep 0.2; done` during a deploy → **no non-200 responses**
- [ ] A deploy with a failing health check never takes traffic. The old version stays live.
- [ ] Rolling back to a previous deployment takes about 10s with no build
- [ ] `git push` to the branch → deploy starts automatically → GitHub shows the deployment status and environment URL on the commit/PR
- [ ] With "require approval" on, a push waits for approval and builds only after approval
- [ ] A Discord (or Slack) channel receives a message for a successful and for a failed deploy

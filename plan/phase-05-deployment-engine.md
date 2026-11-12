# Phase 05 — Application Deployment Engine

**Goal:** Connect GitHub, create an application from a repo, and deploy it as a Docker container to a chosen server. The build runs on the target server through the agent, logs stream live, env vars are encrypted, and deployment history is recorded.
**Depends on:** Phase 04
**No tests in this phase.**

---

## 1. Key design decisions
- **Integration:** a **GitHub App**, not personal tokens. NESTUS generates short-lived installation tokens (1h) only when a build needs one, and passes the token to the agent for a single clone.
- **Build location:** v1 builds **on the target server** with the agent's Docker SDK (no registry needed; works like Coolify). Image tag: `nestus/<appSlug>:<sha7>-d<deployNumber>`. Images stay on the server, which makes Phase 6 rollback instant.
- **Build types:** `DOCKERFILE` (use the repo's file) or `AUTO` (the agent generates a Dockerfile from an embedded template after detecting the framework).
- **Networking:** every app container joins the Docker network `nestus`. In this phase it is also published on a host port from range 20000–29999 so you can reach it. Phase 6 replaces that with the Caddy proxy.

## 2. Prisma models

```prisma
enum BuildType { DOCKERFILE AUTO }
enum DeploymentStatus { QUEUED AWAITING_APPROVAL BUILDING DEPLOYING HEALTH_CHECKING LIVE FAILED CANCELLED SUPERSEDED ROLLED_BACK }
enum DeploymentTrigger { MANUAL PUSH ROLLBACK REDEPLOY POLICY AI API }
enum EnvScope { BUILD RUNTIME BOTH }

model GitHubInstallation {
  id String @id @default(cuid())
  orgId String
  installationId Int @unique
  accountLogin String
  accountType String
  createdAt DateTime @default(now())
}

model Application {
  id String @id @default(cuid())
  orgId String
  name String
  slug String
  serverId String
  githubInstallationId String?
  repoFullName String          // owner/repo
  branch String @default("main")
  rootDir String @default(".")
  buildType BuildType @default(AUTO)
  dockerfilePath String @default("Dockerfile")
  framework String?            // nextjs | nestjs | node | static | dockerfile
  port Int @default(3000)
  hostPort Int?
  healthCheckPath String @default("/")
  healthCheckTimeoutSec Int @default(60)
  cpuLimit Float?              // cores
  memoryLimitMb Int?
  autoDeploy Boolean @default(true)
  requireApproval Boolean @default(false)   // phase 6
  replicas Int @default(1)                   // phase 10
  currentDeploymentId String?
  tracingEnabled Boolean @default(false)     // phase 7
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([orgId, slug])
}

model EnvironmentVariable {
  id String @id @default(cuid())
  appId String
  key String
  valueEnc String            // v1:<iv>:<tag>:<ciphertext> (base64)
  isSecret Boolean @default(true)
  scope EnvScope @default(BOTH)
  updatedAt DateTime @updatedAt
  @@unique([appId, key])
}

model Deployment {
  id String @id @default(cuid())
  orgId String
  appId String
  serverId String
  number Int
  status DeploymentStatus @default(QUEUED)
  trigger DeploymentTrigger
  triggeredByType ActorType
  triggeredById String?
  commitSha String?
  commitMessage String?
  commitAuthor String?
  branch String
  imageTag String?
  containerName String?
  containerId String?
  rollbackOfId String?
  error String?
  queuedAt DateTime @default(now())
  startedAt DateTime?
  finishedAt DateTime?
  buildDurationMs Int?
  totalDurationMs Int?
  @@unique([appId, number])
  @@index([appId, queuedAt])
}

model DeploymentLogLine {
  id BigInt @id @default(autoincrement())
  deploymentId String
  seq Int
  ts DateTime
  stream String   // system | build | deploy | health
  line String
  @@index([deploymentId, seq])
}
```

## 3. Crypto service (`modules/crypto`)
- [ ] `CryptoService.encrypt(plain) / decrypt(enc)`: AES-256-GCM with `NESTUS_ENCRYPTION_KEY`, versioned prefix `v1:` (allows key rotation later)
- [ ] `CryptoService.hashToken(t)` (sha256 hex) and `randomToken(bytes)` (base62)

## 4. GitHub module (`modules/github`)
- [ ] Config: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM, `\n`-escaped), `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET`
- [ ] Add `infra/github-app-manifest.json` and a short README with instructions to create the app (permissions: Contents R, Metadata R, Pull requests R, Commit statuses RW, Deployments RW; events: push, installation, installation_repositories)
- [ ] `GET /orgs/:orgId/github/install-url` → `https://github.com/apps/<slug>/installations/new?state=<signed orgId>`
- [ ] `GET /github/callback?installation_id&state` → verify state → upsert GitHubInstallation → redirect to the web app
- [ ] `GET /orgs/:orgId/github/repos` (all repos across installations; cache 60s) · `GET .../repos/:owner/:repo/branches` · `GET .../repos/:owner/:repo/detect?branch&rootDir` → reads `package.json`/`Dockerfile` through the contents API and returns `{ framework, suggestedPort, hasDockerfile }`
  - Detection: `next` dependency → nextjs (port 3000). `@nestjs/core` → nestjs (3000). Has a `start` script → node. `index.html` and no package.json → static (80). Dockerfile present → suggest DOCKERFILE.
- [ ] `GitHubService.getInstallationToken(installationId)` (octokit `@octokit/auth-app`) and `getCommit(repo, ref)`

## 5. Applications & env API (`modules/applications`)
- [ ] CRUD: `GET/POST /orgs/:orgId/apps`, `GET/PATCH/DELETE /apps/:id`. Delete sends `app.remove` to the agent (stop + remove containers + images).
- [ ] Allocate `hostPort` on create: the lowest free port in 20000–29999 for that server
- [ ] Env: `GET /apps/:id/env` (secret values masked as `••••••`), `PUT /apps/:id/env` (bulk upsert from a `.env`-format paste or a key/value array), `DELETE /apps/:id/env/:key`, `POST /apps/:id/env/:key/reveal` (perm `env:reveal`, audited)

## 6. Deployment pipeline (`modules/deployments`)
- [ ] `POST /apps/:id/deployments` {ref?} → creates Deployment(QUEUED, number = max+1) → adds a job to BullMQ queue `deployments` with `jobId = deploymentId`
- [ ] **Per-server/app concurrency:** the worker takes a Redis lock `lock:deploy:<appId>` (Redlock-style SET NX PX). If it's taken, the job is re-queued with a delay. A newer queued deployment for the same app makes older QUEUED ones `CANCELLED`.
- [ ] **Worker steps** (each step updates status, writes `system` log lines and emits `deployment.updated`):
  1. **Prepare:** resolve the commit (sha, message, author) through GitHub. Get an installation token. Decrypt env vars. Compute the image tag and container name `nestus-<slug>-d<number>`.
  2. **BUILDING:** `CommandService.dispatch('build.run', { deploymentId, repoUrl: https://x-access-token:<token>@github.com/<repo>.git, sha, rootDir, buildType, dockerfilePath, framework, imageTag, buildArgs: env(BUILD|BOTH) }, { wait: true, timeoutSec: 1200 })`. Agent `CommandLog` lines → `DeploymentLogLine(stream=build)` + Socket.IO room `deployment:<id>`.
  3. **DEPLOYING:** `deploy.run { image, containerName, env: env(RUNTIME|BOTH) + NESTUS_* vars, port, hostPort, network: 'nestus', labels: { 'nestus.app': appId, 'nestus.deployment': deploymentId, 'nestus.org': orgId }, cpuLimit, memoryLimitMb, restartPolicy: 'unless-stopped' }`. In this phase the agent first stops/removes the old container that holds `hostPort` (short downtime; Phase 6 removes it).
  4. **HEALTH_CHECKING:** `health.http { containerName, port, path, timeoutSec, expectStatus: '2xx|3xx' }`. The agent polls the container IP every 2s.
  5. **LIVE:** set `Application.currentDeploymentId`, mark the previous LIVE one as `SUPERSEDED`, record durations, emit `deployment.succeeded`.
  6. On any failure → `FAILED` with the error, emit `deployment.failed`. Leave the previous container untouched where possible.
- [ ] `POST /deployments/:id/cancel` → sends `build.cancel` (the agent cancels the build context) and sets CANCELLED
- [ ] `GET /apps/:id/deployments` · `GET /deployments/:id` · `GET /deployments/:id/logs?afterSeq` (historical; live comes over WS)
- [ ] Also inject runtime env vars `NESTUS_APP`, `NESTUS_DEPLOYMENT`, `NESTUS_COMMIT_SHA` and `PORT`

## 7. Agent — new commands
- [ ] `build.run`: create workdir `/var/lib/nestus/builds/<deploymentId>` → `git clone --depth 1 --branch`/fetch sha (use `go-git`, or `exec git` with **fixed args only**, never a shell) → if AUTO, write the Dockerfile from the embedded template → tar the context → `ImageBuild` via the Docker SDK (BuildKit enabled; stream JSON messages → CommandLog lines) → `defer` cleanup of the workdir (remove the token-bearing remote from git config right after the clone)
- [ ] `build.cancel { deploymentId }` → cancel that build's context
- [ ] `deploy.run`: ensure network `nestus` exists → stop/remove the conflicting container → `ContainerCreate` + `ContainerStart` → return `{containerId, ip}`
- [ ] `health.http`: HTTP check against the container's network IP
- [ ] `app.remove { appId }`: stop/remove containers and images labeled with that app
- [ ] Templates in `agent/internal/build/templates/*.Dockerfile` (`go:embed`):
  - `nextjs`: multi-stage node:22-alpine, detects the pnpm/npm/yarn lockfile, `next build` with `output: 'standalone'` (if it's missing, fall back to `next start`), non-root user
  - `nestjs`: build → `node dist/main.js`
  - `node`: install → `npm start`
  - `static`: `nginx:alpine`, copy the build output dir
- [ ] Add the new types to both command catalogs/allowlists

## 8. Web
- [ ] **Applications list:** cards with name, repo + branch, framework icon, server, status of the current deployment, last deploy time, URL (`http://<serverIp>:<hostPort>`)
- [ ] **New Application wizard** (multi-step dialog or page):
  1. Source: GitHub installation picker ("Install GitHub App" button if there is none) → repo search → branch
  2. Build: root dir, auto-detected framework (editable), build type, Dockerfile path, port
  3. Target: server select (online only), CPU/memory limits
  4. Env vars: key/value editor + "paste .env" textarea
  5. Review → "Create & Deploy"
- [ ] **App detail** `/applications/[appId]` with tabs:
  - *Overview:* current deployment card (commit, author, time, status), URL, quick actions (Deploy, Redeploy), container CPU/mem charts (reuse Phase 4 components)
  - *Deployments:* table (number, status badge with animated in-progress state, commit + message, trigger, actor, duration, time)
  - *Environment:* masked editor, reveal button (permission-gated), save diff confirmation
  - *Settings:* everything from the wizard + delete
- [ ] **Deployment detail** `/deployments/[id]`: step progress bar (Queued → Build → Deploy → Health → Live), live log viewer (virtualized, ANSI colors via `ansi-to-react`, auto-scroll with a pause-on-scroll-up, search, download), cancel button
- [ ] **Deployments page** (global): every deployment across apps with filters
- [ ] Overview KPI "Deployments today" and "Running apps" now use real data

---

## Done when
- [ ] Install the GitHub App on your account → repos appear in the wizard
- [ ] Create an app from a real Next.js repo → deploy → build logs stream live → status reaches **LIVE** → the app loads at `http://<vps-ip>:<hostPort>`
- [ ] Same for a NestJS repo (AUTO build) and for a repo with its own Dockerfile
- [ ] Env vars are encrypted in the DB (check with psql), and the app reads them at runtime
- [ ] A deploy with a broken build ends **FAILED** with a clear error, and the old version keeps running
- [ ] Cancelling an in-progress build works
- [ ] Deployment history shows every attempt with durations. Actions are in the audit log.

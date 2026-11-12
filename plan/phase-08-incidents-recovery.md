# Phase 08 — Incidents, Alerting & Self-Healing Recovery Engine

**Goal:** NESTUS detects problems (alert rules and agent events), groups them into incidents with a timeline, and fixes known problems through a **Recovery Engine**. The engine has a typed action registry, policies, guardrails, approval gates, circuit breakers and a verification step after every action. This is where "autonomous" becomes real and safe.
**Depends on:** Phase 07
**No tests in this phase.**

---

## 1. Agent — container events (fast detection)
```proto
message ContainerEvent { google.protobuf.Timestamp ts = 1; string container_id = 2; string container_name = 3; string action = 4; /* die|oom|health_status|restart|start|kill */ int32 exit_code = 5; bool oom_killed = 6; string health = 7; map<string,string> labels = 8; }
```
- [ ] Add `ContainerEvent container_event = 22;` to `AgentMessage`
- [ ] Agent subscribes to the Docker events API (type=container) and forwards `die`, `oom`, `health_status`, `restart` and `start` right away (not batched). On `die`, inspect the container to fill in `exit_code` and `OOMKilled`.
- [ ] Agent detects a **restart loop**: 3 or more restarts in 5 minutes for the same container → synthetic action `restart_loop`

## 2. Data model
```prisma
enum Severity { SEV1 SEV2 SEV3 SEV4 }
enum IncidentStatus { OPEN INVESTIGATING MITIGATING RESOLVED CLOSED }
enum ActionStatus { PROPOSED PENDING_APPROVAL APPROVED REJECTED EXPIRED EXECUTING SUCCEEDED FAILED VERIFYING VERIFIED VERIFICATION_FAILED SKIPPED }
enum ActionRisk { LOW MEDIUM HIGH }

model AlertRule {
  id String @id @default(cuid())
  orgId String
  name String
  type String          // METRIC_THRESHOLD | SERVER_OFFLINE | CONTAINER_DOWN | CONTAINER_OOM | RESTART_LOOP | HTTP_CHECK_FAILING | ERROR_RATE | NEW_ERROR_GROUP | DEPLOYMENT_FAILED | DB_CONNECTIONS | DISK_FULL | LOG_PATTERN
  scopeType String @default("ALL")   // ALL | SERVER | APP | TAG
  scopeIds String[]
  condition Json       // e.g. { metric:"cpu_pct", op:">", threshold:90, forSec:300 } | { pattern:"ECONNREFUSED", countPerMin:10 }
  severity Severity @default(SEV3)
  enabled Boolean @default(true)
  isDefault Boolean @default(false)
  createdAt DateTime @default(now())
}

model Alert {                 // one active instance per (rule, target)
  id String @id @default(cuid())
  orgId String
  ruleId String
  dedupeKey String           // rule:<id>|server:<id>|app:<id>|container:<name>
  state String               // PENDING | FIRING | RESOLVED
  targetType String  targetId String
  serverId String?  appId String?
  value Float?
  message String
  incidentId String?
  pendingSince DateTime?  firedAt DateTime?  resolvedAt DateTime?
  @@unique([orgId, dedupeKey, state])
}

model Incident {
  id String @id @default(cuid())
  orgId String
  number Int
  title String
  severity Severity
  status IncidentStatus @default(OPEN)
  serverId String?  appId String?
  summary String?
  rootCause String?          // filled by AI (phase 9) or human
  correlationKey String      // server:<id> or app:<id>
  startedAt DateTime @default(now())
  acknowledgedAt DateTime?  acknowledgedById String?
  resolvedAt DateTime?
  mttrSeconds Int?
  @@unique([orgId, number])
  @@index([orgId, status])
}

model IncidentEvent {
  id String @id @default(cuid())
  incidentId String
  type String      // ALERT_FIRED | ALERT_RESOLVED | STATUS_CHANGED | NOTE | ACTION_PROPOSED | ACTION_APPROVED | ACTION_EXECUTED | ACTION_VERIFIED | ACTION_FAILED | AI_ANALYSIS | DEPLOYMENT | ESCALATED
  actorType ActorType
  actorId String?
  message String
  data Json?
  createdAt DateTime @default(now())
  @@index([incidentId, createdAt])
}

model RecoveryPolicy {
  id String @id @default(cuid())
  orgId String
  name String
  description String?
  triggerAlertTypes String[]     // e.g. ["CONTAINER_DOWN"]
  triggerRuleIds String[]
  scopeType String @default("ALL")
  scopeIds String[]
  actionType String
  actionParamsTemplate Json      // supports {{alert.containerId}}, {{app.id}}, {{app.lastGoodDeploymentId}}
  mode String @default("REQUIRE_APPROVAL")  // AUTO | REQUIRE_APPROVAL
  maxExecutionsPerHour Int @default(3)
  cooldownSec Int @default(300)
  conditions Json?               // e.g. { deployedWithinMin: 15 } for rollback
  allowAiTrigger Boolean @default(false)
  enabled Boolean @default(true)
  isDefault Boolean @default(false)
  createdAt DateTime @default(now())
}

model RecoveryAction {
  id String @id @default(cuid())
  orgId String
  incidentId String?
  policyId String?
  type String
  params Json
  risk ActionRisk
  targetType String  targetId String
  serverId String?  appId String?
  proposedByType ActorType   // USER | POLICY | AI
  proposedById String?
  rationale String?
  evidence Json?             // AI evidence refs (phase 9)
  status ActionStatus
  approvedById String?  approvedAt DateTime?  rejectedReason String?
  expiresAt DateTime?
  agentCommandIds String[]
  result Json?  error String?
  verification Json?         // { checks:[...], passed, observedAt }
  createdAt DateTime @default(now())
  executedAt DateTime?  finishedAt DateTime?
  @@index([orgId, status])
}
```

## 3. Alert evaluation (`modules/alerting`)
- [ ] **Event-driven detectors** (react instantly): `server.offline` → SERVER_OFFLINE. ContainerEvent die (non-zero exit, not stopped by NESTUS — check a Redis marker `expected-stop:<containerId>` that NESTUS sets before its own stops) → CONTAINER_DOWN. `oom_killed` → CONTAINER_OOM. `restart_loop` → RESTART_LOOP. `deployment.failed` → DEPLOYMENT_FAILED. `http_check.failed` (3 in a row) → HTTP_CHECK_FAILING. `error_group.new` → NEW_ERROR_GROUP.
- [ ] **Periodic evaluator:** BullMQ repeatable every 30s. For each enabled METRIC_THRESHOLD / DISK_FULL / ERROR_RATE / DB_CONNECTIONS / LOG_PATTERN rule × each target in scope, evaluate over the window (Timescale `avg`/`max` over `forSec`, Redis error-rate counters, `db_metrics` connections/max, Loki `count_over_time` for patterns).
- [ ] **State machine** per dedupeKey: `OK → PENDING` (condition true) `→ FIRING` (true for `forSec`) `→ RESOLVED` (false for 2 consecutive evaluations). Flapping guard: a resolved alert can't re-fire within 2 minutes; extend the existing one instead.
- [ ] **Seed default rules** for every new org (+ migration for existing ones):
  CPU > 90% 5m (SEV3) · Memory > 90% 5m (SEV2) · Disk > 85% (SEV3) / > 95% (SEV1) · Server offline 1m (SEV1) · Container down (SEV2) · Container OOM (SEV2) · Restart loop (SEV1) · HTTP check failing (SEV1) · Error rate > 20/min 3m (SEV2) · Deployment failed (SEV4) · DB connections > 85% of max (SEV2)

## 4. Incident management (`modules/incidents`)
- [ ] **Correlation:** when an alert fires → find an OPEN/INVESTIGATING/MITIGATING incident with the same `correlationKey` (prefer app, then server) opened in the last 30 minutes → attach to it. Otherwise create a new incident (title from the alert message, severity = the alert's). If a new alert has higher severity, upgrade the incident's severity.
- [ ] **Auto-resolve:** when all of an incident's alerts are RESOLVED and 5 minutes pass quietly → RESOLVED (actor SYSTEM). Compute `mttrSeconds`.
- [ ] Endpoints: `GET /incidents?status&severity&app&server`, `GET /incidents/:id` (with alerts, events, actions), `POST /incidents/:id/acknowledge`, `PATCH /incidents/:id {status, severity, rootCause, summary}`, `POST /incidents/:id/notes`, `POST /incidents` (manual)
- [ ] `GET /incidents/:id/context` → snapshot for the UI and AI: affected server/app, metric series ±30 min around start, recent deployments (last 24h), container events, top error groups, log excerpt (errors ±10 min)
- [ ] Events: `incident.opened`, `incident.updated`, `incident.resolved` → notifications + Socket.IO `org:<id>` → `incident.*`

## 5. Recovery Engine (`modules/recovery`) — the safety-critical core

### 5.1 Action registry (`packages/shared/src/actions.ts` for definitions, `apps/api/.../recovery/actions/*.ts` for executors)
Each action implements:
```ts
interface ActionDefinition<P> {
  type: string;
  title: string;
  description: string;          // shown to humans and the AI
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  targetType: 'container' | 'app' | 'server' | 'deployment';
  paramsSchema: z.ZodType<P>;
  requiredPermission: Permission;
  preconditions(ctx, params): Promise<{ ok: boolean; reason?: string }>;  // e.g. target exists, server online
  dryRun(ctx, params): Promise<string>;                                   // human-readable plan
  execute(ctx, params): Promise<ActionResult>;                            // via CommandService / DeploymentService only
  verify(ctx, params, result): Promise<VerificationResult>;              // observe recovery within a window
}
```
Implement:
| Type | Risk | Execute | Verify |
|---|---|---|---|
| `container.restart` | LOW | `docker.restart` | container running + healthy within 60s, no die event |
| `container.start` | LOW | `docker.start` | running within 30s |
| `container.stop` | MEDIUM | sets the expected-stop marker, `docker.stop` | stopped |
| `app.redeploy` | MEDIUM | new Deployment REDEPLOY | deployment LIVE + HTTP check OK |
| `deployment.rollback` | MEDIUM | rollback to `lastGoodDeploymentId` | LIVE + error rate below the pre-incident baseline within 5m |
| `server.prune_images` | LOW | `docker.prune { images:'dangling+unused-nestus', buildCache:true }` | disk % decreased |
| `app.update_resources` | HIGH | update app mem/cpu limit + redeploy | LIVE + no OOM for 10m |
| `proxy.restart` | LOW | `proxy.restart` | HTTP checks pass |
| `app.scale` | MEDIUM | (implemented in Phase 10) | — |

**There is no "run shell command" action. Never add one.**

### 5.2 Proposal & decision flow — `RecoveryService.propose(input)`
1. Validate the type exists and the params pass `paramsSchema`
2. Resolve the target and check `preconditions`
3. **Guardrails** (any failure → status `SKIPPED` with a reason, logged to the incident):
   - Org `autonomyMode`: `OFF` → only USER proposals allowed. `SUGGEST` → everything requires approval. `AUTO` → policy-mode decides.
   - **Rate limit:** executions of this action type on this target in the last hour < `maxExecutionsPerHour`
   - **Cooldown:** last execution on this target was more than `cooldownSec` ago
   - **Circuit breaker:** 3 failed or VERIFICATION_FAILED actions on the target in 30 minutes → breaker opens (Redis key, 1h). Auto-execution is blocked, and the incident is escalated (event ESCALATED + SEV bump + notification).
   - **Concurrency:** one EXECUTING action per target (Redis lock)
4. Decide:
   - risk HIGH → always `PENDING_APPROVAL` (approver must be ADMIN+)
   - proposedBy AI → `PENDING_APPROVAL`, unless a matching policy has `allowAiTrigger && mode=AUTO && risk=LOW`
   - proposedBy POLICY with mode AUTO (and autonomyMode AUTO) → `APPROVED`
   - proposedBy USER with `action:execute` permission (OPERATOR only for LOW risk) → `APPROVED`
   - else `PENDING_APPROVAL` with `expiresAt = now + 30m`
5. Persist + audit + IncidentEvent `ACTION_PROPOSED` + event `action.pending_approval` (notify) or enqueue execution

### 5.3 Execution — BullMQ queue `recovery`
- [ ] Worker: lock target → status EXECUTING → `execute()` → SUCCEEDED/FAILED → VERIFYING → `verify()` (polls for up to the action's window) → VERIFIED / VERIFICATION_FAILED → IncidentEvents for each step → if VERIFIED and the incident's alerts resolve → incident moves to MITIGATING → auto-resolve path
- [ ] On VERIFICATION_FAILED: try the policy's **escalation chain**: `RecoveryPolicy.onFailure` (optional next action type, e.g. restart → rollback). Otherwise escalate to humans.
- [ ] Approval endpoints: `POST /actions/:id/approve`, `POST /actions/:id/reject {reason}`, `GET /actions?status=PENDING_APPROVAL`. Expiry job every minute → EXPIRED.
- [ ] Manual: `POST /actions` {type, params, incidentId?} (from UI buttons) · `POST /actions/dry-run` → returns the plan text + guardrail evaluation without persisting
- [ ] **Policy matcher:** on `alert.fired` → find enabled policies matching the alert type/rule + scope → check `conditions` (e.g. `deployedWithinMin`: the app's current deployment went LIVE less than N minutes ago) → render the params template → `propose({ proposedByType: 'POLICY' })`

### 5.4 Default policies (seeded, editable)
1. **Restart crashed container**: CONTAINER_DOWN → `container.restart`, AUTO, 3/hour, cooldown 60s
2. **Rollback bad release**: CONTAINER_OOM / RESTART_LOOP / HTTP_CHECK_FAILING / ERROR_RATE with `deployedWithinMin: 30` → `deployment.rollback` to last good, REQUIRE_APPROVAL
3. **Free disk space**: DISK_FULL → `server.prune_images`, AUTO, 2/hour
4. **Restart proxy**: HTTP_CHECK_FAILING for every app on one server + all containers healthy → `proxy.restart`, REQUIRE_APPROVAL

## 6. Web
- [ ] Header **incident indicator**: red pulsing pill with the active incident count → dropdown
- [ ] **Incidents page:** tabs Active / Resolved. Table: #number, severity badge, title, affected app/server, status, duration, actions count, AI badge (Phase 9).
- [ ] **Incident detail** `/incidents/[id]`, three columns on desktop:
  - Left: status controls (acknowledge, status select, severity), affected resources, linked alerts with state
  - Center: **timeline** (every IncidentEvent with an icon by type, actor avatar or "Policy"/"System"/"AI" badge, expandable data), note composer
  - Right: **Context** (mini charts of CPU/mem/error rate around the start with a marker line, recent deployments with a "rollback" quick action, top errors, log excerpt) and the **Actions panel** (proposed/pending actions with risk badge, dry-run plan, Approve/Reject; "Run action" menu filtered by allowed actions for the target)
  - Postmortem section placeholder (Phase 9)
- [ ] **Automation page**:
  - Autonomy mode segmented control: Off / Suggest / Auto, with an explanation and an ADMIN-only confirm
  - Policies table + editor (trigger types, scope, action type with a params form generated from the zod schema → JSON schema via `zod-to-json-schema`, mode, rate limit, cooldown, conditions, allow AI)
  - **Action history** (all RecoveryActions: status, proposer, target, verification result) with filters
  - **Approval inbox** (also linked from the header badge)
- [ ] **Alert rules page** (under Monitoring or Automation): CRUD with a condition builder for metric thresholds, enable toggles, "currently firing" list
- [ ] Overview KPI "Active incidents" is now real. Add a "Recent incidents" card. Add a **"Self-healing in the last 7 days"** card (actions verified, MTTR).

---

## Done when
- [ ] `docker kill <app-container>` → within seconds: incident opened → policy auto-restarts it → verified → incident auto-resolves after the quiet period. The timeline shows each step with POLICY as actor. Discord gets opened and resolved messages.
- [ ] Killing it 4 times in an hour → the 4th restart is blocked by the rate limit → incident escalated
- [ ] Deploy a version that crashes on boot (health OK briefly, then exits) → RESTART_LOOP → rollback proposed and **waits for approval** → approve → rollback runs → verified
- [ ] Fill the disk past 85% (`fallocate`) → prune action runs automatically and is verified, or the incident stays open if it can't free enough space
- [ ] Autonomy mode **Suggest** → the same crash only proposes the restart (pending approval)
- [ ] Autonomy mode **Off** → no automatic proposals
- [ ] A VIEWER can't approve. An OPERATOR can approve LOW risk only. HIGH risk needs an ADMIN.
- [ ] Every action shows up in the audit log with the correct actor type (POLICY / USER)

# Phase 02 — Identity, Organizations, RBAC, Audit & Dashboard Shell

**Goal:** Users can sign up, belong to organizations with roles, create API keys, and see an audit trail. The full dashboard shell (navigation for every future module) is in place.
**Depends on:** Phase 01
**No tests in this phase.**

---

## 1. Prisma models

```prisma
enum Role { OWNER ADMIN OPERATOR VIEWER }
enum ActorType { USER API_KEY AGENT SYSTEM AI POLICY }

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  passwordHash  String?
  avatarUrl     String?
  githubId      String?  @unique
  totpSecretEnc String?          // phase 10
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  memberships   Membership[]
  sessions      Session[]
}

model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  autonomyMode String @default("SUGGEST") // OFF | SUGGEST | AUTO (used in phase 8)
  createdAt DateTime @default(now())
  memberships Membership[]
}

model Membership {
  id      String @id @default(cuid())
  userId  String
  orgId   String
  role    Role
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([userId, orgId])
}

model Invitation {
  id String @id @default(cuid())
  orgId String
  email String
  role Role
  tokenHash String @unique
  invitedById String
  expiresAt DateTime
  acceptedAt DateTime?
  createdAt DateTime @default(now())
}

model Session {            // refresh-token family
  id String @id @default(cuid())
  userId String
  refreshTokenHash String @unique
  familyId String
  userAgent String?
  ip String?
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([familyId])
}

model ApiKey {
  id String @id @default(cuid())
  orgId String
  name String
  prefix String          // first 8 chars shown in UI
  keyHash String @unique // sha256
  permissions String[]
  createdById String
  lastUsedAt DateTime?
  expiresAt DateTime?
  revokedAt DateTime?
  createdAt DateTime @default(now())
}

model AuditLog {
  id String @id @default(cuid())
  orgId String?
  actorType ActorType
  actorId String?
  actorLabel String?     // email, key name, "policy:restart-crashed" ...
  action String          // e.g. server.create
  targetType String?
  targetId String?
  metadata Json?
  ip String?
  createdAt DateTime @default(now())
  @@index([orgId, createdAt])
  @@index([targetType, targetId])
}
```

## 2. Permissions (in `packages/shared/src/rbac.ts`)
- [ ] Define `Permission` as a string union. Cover every module of the product now, so later phases only need to use it:
  `org:read org:update org:delete member:read member:invite member:update member:remove apikey:read apikey:write audit:read server:read server:write server:command app:read app:write deployment:read deployment:create deployment:approve deployment:rollback env:read env:reveal env:write logs:read metrics:read incident:read incident:write alert:read alert:write action:propose action:approve action:execute policy:read policy:write ai:use ai:investigate cluster:read cluster:write settings:write`
- [ ] `ROLE_PERMISSIONS: Record<Role, Permission[]>`:
  - VIEWER: every `*:read` except `env:reveal`
  - OPERATOR: VIEWER + `server:command deployment:create deployment:rollback incident:write action:propose action:execute(LOW risk only, enforced in phase 8) ai:use ai:investigate`
  - ADMIN: everything except `org:delete`
  - OWNER: everything
- [ ] Helper `can(role | permissions[], permission): boolean`

## 3. Auth module (`apps/api/src/modules/auth`)
- [ ] `POST /auth/register` {name, email, password} → creates the user, a personal org (`<name>'s Org`, unique slug) and an OWNER membership. Returns the same payload as login.
- [ ] `POST /auth/login` → argon2 verify → returns `{ accessToken, user, memberships }` and sets an httpOnly `nestus_rt` cookie (path `/api/v1/auth`, SameSite=Lax, Secure in prod, 30d)
- [ ] `POST /auth/refresh` → rotates the refresh token. If a revoked token from the same family is reused, revoke the whole family (token theft detection).
- [ ] `POST /auth/logout` → revokes the session and clears the cookie
- [ ] `GET /auth/me`
- [ ] Access JWT: 15 min, payload `{ sub, email }`. Org access is resolved per request, not stored in the token.
- [ ] GitHub OAuth login (`GET /auth/github`, `/auth/github/callback`): link to a user by email or create one. Optional; skip if `GITHUB_CLIENT_ID` is not set.
- [ ] Rate-limit the auth routes with `@nestjs/throttler` (10/min per IP)

## 4. Guards & decorators (`apps/api/src/common`)
- [ ] `JwtAuthGuard` (global, skipped with `@Public()`). Also accepts `Authorization: Bearer nst_...` API keys: hash the key, look it up, check revoked/expired, update `lastUsedAt` (debounced through Redis).
- [ ] `OrgGuard`: reads `:orgId` from the route. Loads the membership (cached in Redis for 60s) or the API key's org. Attaches `req.ctx = { orgId, actor: { type, id, label }, permissions }`.
- [ ] `@RequirePermission(...perms)` + `PermissionGuard`
- [ ] `@CurrentCtx()` param decorator
- [ ] `@Audit(action, { targetParam?: 'id' })` + `AuditInterceptor`: after a successful handler, calls `AuditService.record(...)` with the actor, target and redacted body
- [ ] `AuditService.record()` can also be called directly from services (used by the agent, policies and AI later)

## 5. Org, member, API key and audit modules
- [ ] `GET /orgs` (my orgs), `POST /orgs`, `GET/PATCH/DELETE /orgs/:orgId`
- [ ] `GET /orgs/:orgId/members`, `PATCH /members/:id` (role; owner-only to grant OWNER; the last owner can't be demoted), `DELETE /members/:id`
- [ ] `POST /orgs/:orgId/invitations` → returns an invite link `APP_URL/invite/<token>`. Log it to the console in dev. Send email in prod via Resend if `RESEND_API_KEY` is set.
- [ ] `POST /invitations/:token/accept`
- [ ] `GET/POST /orgs/:orgId/api-keys` (create returns the plaintext `nst_<32 random base62>` **only once**), `DELETE /api-keys/:id` (revoke)
- [ ] `GET /orgs/:orgId/audit-logs?actorType&action&targetType&from&to&cursor` (permission `audit:read`)

## 6. Web — auth & shell
- [ ] Pages: `/login`, `/register`, `/invite/[token]`. Use react-hook-form + zod (shared schemas).
- [ ] Auth state: keep the access token in memory (Zustand). On 401, the api client calls `/auth/refresh` once (single-flight), then retries. On boot, call refresh to restore the session.
- [ ] `middleware.ts`: if there is no `nestus_rt` cookie on an `/(app)` route → redirect to `/login`
- [ ] After login, redirect to `/<orgSlug>/overview`
- [ ] **App shell** `src/app/(app)/[orgSlug]/layout.tsx`:
  - Left sidebar: NESTUS logo + "System online" pulse indicator. Nav groups:
    - **Operate:** Overview, Infrastructure, Applications, Deployments
    - **Observe:** Monitoring, Logs, Traces, Topology
    - **Respond:** Incidents, AI Engineer, Automation
    - **Admin:** Security, Settings
  - Top bar: org switcher, global search / command palette (`⌘K`, cmdk, with navigation commands for now), incident indicator placeholder, user menu (theme toggle, logout)
  - Collapsible on mobile (sheet)
- [ ] Every nav item gets a placeholder page with an `EmptyState` component (icon, title, "Coming in Phase N")
- [ ] Settings section with tabs: **General** (org name/slug), **Members** (table, invite dialog, role select), **API Keys** (create dialog shows the key once with a copy button; list; revoke)
- [ ] Security page: **Audit Log** table (time, actor + type badge, action, target, expandable metadata JSON) with filters and infinite scroll
- [ ] `usePermission(perm)` hook. Hide or disable controls the user can't use.

---

## Done when
- [ ] Register → land on `/<slug>/overview` and see the full sidebar shell
- [ ] Logout/login works. Refreshing the page keeps you logged in. Reusing an old refresh token kills the session family.
- [ ] Invite a second user (dev console link) → they accept → appear in Members with the chosen role
- [ ] A VIEWER can't see the invite button, and the API returns 403 on direct calls
- [ ] Create an API key → `curl -H "Authorization: Bearer nst_..." /api/v1/orgs/<id>/members` works. After revoking, it returns 401.
- [ ] The audit log shows member invites, role changes and API key create/revoke with the correct actors

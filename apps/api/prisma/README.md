# Prisma & TimescaleDB

Prisma owns relational application tables (`SystemSetting`, Users, Orgs, …).

**Hypertables are created with raw SQL migrations and queried through `PG_POOL`. They are never Prisma models.**

Phase 4 adds metric hypertables via `prisma migrate` SQL; the Nest `PgModule` pool is the runtime access path for those hot paths.

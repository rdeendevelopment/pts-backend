# PTS v2 — Seed CLI

Standalone seed for a **fresh v2 target database**. Does not migrate legacy business data.

Related: [v2-migration.md](./v2-migration.md) | [v2-migration-plan.md](./v2-migration-plan.md)

---

## Purpose

Populate required platform data before migration or local v2 development:

- `pts_modules`
- `pts_permissions`
- `pts_roles`
- `pts_role_permissions`
- `pts_work_categories`
- First `super_admin` account + `pts_users` profile + role assignment
- Migration tracking indexes (`pts_migration_runs`, `pts_migration_maps`, `pts_migration_errors`)

---

## Prerequisites

```bash
export MONGO_URI=mongodb://127.0.0.1:27017
export MONGO_V2_DB=pts_v2_dev          # required — must differ from MONGO_DB
export MONGO_DB=rdn_pts_dev            # legacy source (not written by seed)

# Optional super_admin overrides (non-production)
export PTS_V2_SEED_ADMIN_EMAIL=admin@example.com
export PTS_V2_SEED_ADMIN_PASSWORD=Password123
export PTS_V2_SEED_ADMIN_FIRST_NAME=Admin
export PTS_V2_SEED_ADMIN_LAST_NAME=User
```

Template: `src/v2/migration/config/migration.env.example`

---

## Command

```bash
npm run v2:seed
```

Runs `seedCore` then `seedSuperAdmin` idempotently.

---

## Idempotent behavior

| Data | Behavior on re-run |
|------|---------------------|
| System modules | Update metadata; no duplicates |
| Permissions / roles | Upsert system rows |
| Role permissions | Link missing only |
| Work categories | Upsert by `code` |
| Super admin account | Match by email; update profile; no duplicate accounts |
| User profile | One row per `accountId` |
| Role assignment | Create if missing |

---

## Seed scripts

| File | Responsibility |
|------|----------------|
| `seed/seedCore.js` | Modules, RBAC catalog, work categories, indexes |
| `seed/seedSuperAdmin.js` | Account, user profile, super_admin role |
| `seed/seedAll.js` | CLI entry — runs both |

Seed uses `connectTargetForSeed()` so existing v2 module services/repositories work unchanged.

---

## Verify

```bash
npm run v2:migrate:validate
```

Checks:

- `MONGO_V2_DB` configured
- `pts_modules` count > 0
- `pts_accounts` count > 0

---

## Login after seed

```bash
curl -s -X POST http://localhost:3001/api/v2/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Password123"}' | jq
```

**Note:** The runtime v2 API connects to `MONGO_V2_DB` (see `src/v2/database/connection.js`). Legacy `/api/*` continues to use `MONGO_DB`.

---

## What seed does NOT do

- Migrate users, clients, projects, time, or tasks from legacy
- Activate all modules in `pts_modules` (most remain `inactive` until QA)
- Create task workflows (lazy per project in Tasks module)

---

## Differences from runtime bootstrap

| | `server.js` bootstrap | `npm run v2:seed` |
|--|----------------------|-------------------|
| Target DB | Legacy shared connection | `MONGO_V2_DB` only |
| Super admin account | Not created | Created |
| When | Server start | Manual CLI |

For production v2 cutover, use seed CLI on empty target DB — do not rely on server bootstrap alone.

# PTS v2 — Migration CLI

Phase 1 implements migration **foundation** — dual DB connections, tracking collections, seed CLI, and placeholder migrate scripts for later entities.

**Phase 2 (users)** migrates legacy `users` + `account_admins` into `pts_accounts`, `pts_users`, and `pts_account_roles`.

See also: [v2-migration-plan.md](./v2-migration-plan.md) | [v2-seed.md](./v2-seed.md)

---

## Databases

| Variable | Role |
|----------|------|
| `MONGO_URI` | Shared cluster connection string |
| `MONGO_DB` | Legacy **source** database (read-only during migration) |
| `MONGO_V2_DB` | v2 **target** database (`pts_*` collections only) |

**Rules:**

- `MONGO_V2_DB` must differ from `MONGO_DB`.
- Migration tooling never writes to the legacy database.
- Old IDs appear only in `pts_migration_maps` / `pts_migration_errors`.

Copy env template:

```bash
cp src/v2/migration/config/migration.env.example .env.migration
# merge into .env or export before running CLI
```

---

## Folder layout

```text
src/v2/migration/
├── index.js
├── config/migration.env.example
├── seed/
│   ├── seedCore.js
│   ├── seedSuperAdmin.js
│   └── seedAll.js
├── scripts/
│   ├── migrateAll.js
│   ├── migrateUsers.js
│   ├── migrateClients.js
│   ├── migrateProjects.js
│   ├── migrateActivity.js
│   ├── migrateTasks.js
│   ├── validate.js
│   └── rollback.js
├── services/
├── repositories/
├── models/
├── transformers/          # Phase 2+
├── validators/            # Phase 2+
├── helpers/
│   ├── dualConnection.helper.js
│   └── cli.helper.js
├── constants/
├── errors/
├── reports/
└── logs/
```

---

## Tracking collections (target DB)

| Collection | Purpose |
|------------|---------|
| `pts_migration_runs` | Run metadata (mode, status, steps, options) |
| `pts_migration_maps` | Old → new ObjectId mapping |
| `pts_migration_errors` | Failed rows for resume |

Business `pts_*` collections must not store `legacyId`.

---

## Commands

| npm script | Action |
|------------|--------|
| `npm run v2:seed` | Seed core RBAC/modules/categories + super_admin |
| `npm run v2:migrate:dry-run` | Connect source+target; create foundation dry-run record |
| `npm run v2:migrate:users` | Live users migration (`--mode=live` default in script) |
| `npm run v2:migrate:validate` | Verify target DB has seed baseline |

Users migration CLI flags (via `migrateUsers.js`):

```bash
node src/v2/migration/scripts/migrateUsers.js --mode=dry-run --batch-size=500
node src/v2/migration/scripts/migrateUsers.js --mode=live --batch-size=500
node src/v2/migration/scripts/migrateUsers.js --mode=resume --batch-size=500
```

Report output: `src/v2/migration/reports/<runId>/users.json`

---

## Dual connection helper

`src/v2/migration/helpers/dualConnection.helper.js`

| Function | Purpose |
|----------|---------|
| `connectSourceDb()` | Read-only legacy connection (`MONGO_DB`) |
| `connectTargetDb()` | Target connection (`MONGO_V2_DB`) for migration tracking |
| `connectTargetForSeed()` | Default mongoose → target (reuses v2 module repositories) |
| `closeMigrationConnections()` | Close all migration connections |

---

## Migration modes

| Mode | Users migration |
|------|-----------------|
| `dry-run` | Transform + validation report; no writes to business data, maps, or errors |
| `live` | Upsert accounts/users/roles; write maps and errors; create run record |
| `resume` | Skip source rows already mapped (`mapped` or `merged`) |
| Rollback | Placeholder script | Per-step delete on target |

---

## Phase 2 — Users migration

**Source collections (read-only on `MONGO_DB`):**

| Collection | Notes |
|------------|--------|
| `users` | Employees/managers/admins; bcrypt passwords; `roleId` → `roles.name` |
| `account_admins` | Platform admins; `type` defaults to `super-admin` |
| `roles` | Used for role name lookup only |

**Target collections (write on `MONGO_V2_DB`):**

| Collection | Purpose |
|------------|---------|
| `pts_accounts` | Login identity + `security.passwordMigrated` / `passwordResetRequired` |
| `pts_users` | Profile row linked by `accountId` |
| `pts_account_roles` | RBAC assignment from mapped account type |
| `pts_migration_maps` | Old → new mapping (`entityType=account` and `entityType=user`) |
| `pts_migration_errors` | Missing email, duplicate conflicts, etc. |

**Rules:**

- Email normalized (lowercase, trim); missing → `USER_EMAIL_MISSING`
- Duplicate emails merge to one account; prefer role strength `super_admin > admin > manager > employee`
- Compatible bcrypt hashes migrate as-is; incompatible → random unusable hash + forced reset
- v2 business docs never store `legacyId`; maps hold old IDs only
- Idempotent by email (accounts) and `(entityType, oldCollection, oldObjectId)` (maps)

---

## Phase roadmap

| Phase | Scope |
|-------|--------|
| **1** | Config, dual DB, tracking models, seed CLI, placeholders |
| **2 (current)** | Users + accounts migration |
| **3** | Clients, projects, budgets, assignments |
| **4** | Activity weeks/entries |
| **5** | Tasks + comments |
| **6** | Validation suite + cutover |

---

## Quick test

```bash
export MONGO_URI=mongodb://127.0.0.1:27017
export MONGO_DB=rdn_pts_dev
export MONGO_V2_DB=pts_v2_dev

npm run v2:seed
npm run v2:migrate:validate
node src/v2/migration/scripts/migrateUsers.js --mode=dry-run
```

---

## Risks

1. Forgetting to set `MONGO_V2_DB` — seed fails fast with clear error.
2. Same DB name for source and target — blocked by dual connection helper.
3. Running seed against production legacy DB name — always verify `MONGO_V2_DB` before CLI.
4. Server runtime still uses legacy `MONGO_DB` until cutover wiring for `MONGO_V2_DB`.

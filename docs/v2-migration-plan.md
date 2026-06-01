# PTS v2 Migration & Seed Architecture Plan

**Status:** Planning only — no migration code yet.  
**Scope:** New v2 database, legacy DB as read-only source during migration. No legacy API changes, no frontend work.

---

## Architecture overview

```text
┌─────────────────────┐         read-only          ┌─────────────────────┐
│  Legacy DB          │ ─────────────────────────► │  Migration tooling  │
│  (rdn_pts_dev/…)    │                            │  src/v2/migration/  │
│  users, projects,   │                            └──────────┬──────────┘
│  working_hours,     │                                       │
│  tasksV2, …         │                                       │ write + map
└─────────────────────┘                                       ▼
                                                   ┌─────────────────────┐
                                                   │  New v2 DB          │
                                                   │  pts_* only         │
                                                   │  + mapping cols     │
                                                   └─────────────────────┘
```

### Connection model (proposed)

| Env var | Purpose |
|---------|---------|
| `MONGO_URI` | Cluster URI (shared) |
| `MONGO_DB` | Legacy source DB (e.g. `rdn_pts_dev`) |
| `MONGO_V2_DB` | Target v2 DB (e.g. `pts_v2_prod`) — **new, required for migration** |
| `PTS_V2_*` | Business config (timezone, week start, JWT, etc.) |

Runtime v2 API should connect only to `MONGO_V2_DB` after cutover. Migration scripts hold **two connections**: source (read) + target (write).

### Core rules

- New v2 DB uses **only** `pts_*` business collections.
- **No `legacyId`** in v2 business documents.
- Old numeric / legacy IDs live **only** in mapping collections.
- Legacy DB remains untouched (read-only during migration).

---

## 1. Seed plan

### Phase A — Empty DB bootstrap (before entity migration)

Run once on a fresh `MONGO_V2_DB`. Idempotent; safe to re-run.

| Step | Target collection(s) | Source of truth | Notes |
|------|------------------------|-----------------|-------|
| A1 | Indexes on all `pts_*` | `src/v2/modules/*/models` | Same as `bootstrap.js` today |
| A2 | `pts_modules` | `defaultModules.helper.js` | 12 system modules; only `auth` + `modules` active initially |
| A3 | `pts_permissions` | `defaultPermissions.helper.js` | 22 system permissions |
| A4 | `pts_roles` | `defaultRoles.helper.js` | `super_admin`, `admin`, `manager`, `employee` |
| A5 | `pts_role_permissions` | `seed.service.js` logic | Role ↔ permission links |
| A6 | `pts_work_categories` | `activity.constants.js` | 9 default categories by `code` |
| A7 | `pts_accounts` + `pts_users` | **Migration seed script** | Initial super_admin + optional QA accounts |
| A8 | `pts_account_roles` | Link super_admin → `super_admin` role | Required before first login |

**Gap today:** runtime `bootstrap.js` seeds A2–A6 but does **not** create a super_admin account. Migration seed must explicitly create:

```text
pts_accounts      → email, passwordHash, accountType=super_admin, status=active
pts_users         → profile row linked via accountId
pts_account_roles → super_admin role assignment
```

**Not seeded globally (by design):**

| Item | Strategy |
|------|----------|
| Task workflows / statuses | Lazy per project or bulk-created during task migration per project |
| `pts_project_stats` | Recalculated after projects/budgets/assignments migrate |
| Business clients/projects/users | Migrated from legacy, not seeded |

### Phase B — Post-migration recalculation

| Step | Action |
|------|--------|
| B1 | `recalculateProjectStats()` for every migrated project |
| B2 | Verify assignment `stats.consumedMinutes` vs sum of submitted/approved entries |
| B3 | Activate modules in `pts_modules` when QA sign-off |

### Seed vs migrate boundary

| Data | Seed | Migrate |
|------|------|---------|
| RBAC catalog | ✓ | |
| Work categories | ✓ (defaults) | Map legacy `activity_categories` → existing/new categories |
| Accounts/users (production) | super_admin only | All legacy users + admins |
| Clients, projects, time, tasks | | ✓ |

---

## 2. Migration dependency order

Strict chain. Each step writes `pts_migration_maps` before downstream steps resolve FKs.

```text
Step 0   pts_migration_runs         (create run record)
Step 1   accounts + users           pts_accounts, pts_users
Step 2   clients                     pts_clients
Step 3   projects                    pts_projects, pts_project_stats (empty shell)
Step 4   project budgets             pts_project_budgets
Step 5   project assignments         pts_project_assignments
Step 6   activity weeks              pts_time_weeks
Step 7   time entries                pts_time_entries
Step 8   active timers (optional)    pts_active_timers (running only)
Step 9   task workflows              pts_task_workflows, pts_task_workflow_statuses
Step 10  tasks                       pts_tasks, pts_task_members
Step 11  task comments               pts_task_comments
Step 12  task activities             pts_task_activities
Step 13  project files               pts_project_files (from attachments, if in scope)
Step 14  recalculate + validate      stats, counters, reports cross-check
```

### Why this order

1. **Users first** — every FK resolves through maps.
2. **Clients before projects** — `pts_projects.clientId`.
3. **Projects before budgets/assignments** — project FK.
4. **Budgets before assignments** — entries may reference `budgetId`.
5. **Weeks before entries** — `pts_time_entries.timeWeekId` required.
6. **Workflows before tasks** — `workflowStatusId`, `workflowOrder`.
7. **Tasks before comments/activities** — `taskId` FK.

### Legacy source priority

**Activity:**

| Legacy source | v2 target | Rule |
|---------------|-----------|------|
| `time_weeks` + `time_entries` | Primary | Preferred if populated |
| `working_hours` | Fallback | Convert weekly grid → entries only if no `time_entries`; never double-count |
| `active_timers` | Step 8 | Migrate `status=running` only |

**Tasks:**

| Legacy source | v2 target | Rule |
|---------------|-----------|------|
| `tasksV2` | Primary | Closest to v2 shape |
| `tasks` (v1) | Fallback | Only if no v2 row |

---

## 3. Mapping collection design

Three collections in **v2 DB only**.

### `pts_migration_runs`

One document per execution.

```javascript
{
  _id: ObjectId,              // runId
  mode: 'dry-run' | 'live' | 'resume',
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back',
  sourceDb: 'rdn_pts_dev',
  targetDb: 'pts_v2_staging',
  steps: [{
    entityType: 'users',
    status: 'completed',
    startedAt, finishedAt,
    sourceCount, insertedCount, skippedCount, errorCount
  }],
  options: {
    batchSize: 500,
    skipDeleted: true,
    weekStartDay: 'monday',
    businessTimezone: 'UTC'
  },
  startedAt, finishedAt,
  startedBy: 'script|ci|operator',
  notes: String
}
```

### `pts_migration_maps`

One row per source entity mapped (or explicitly skipped).

```javascript
{
  _id: ObjectId,
  runId: ObjectId,
  entityType: 'user' | 'client' | 'project' | 'budget' | 'assignment'
            | 'time_week' | 'time_entry' | 'task' | 'task_comment' | ...,
  oldCollection: 'users',
  oldId: Number | null,               // legacy numeric legacyId
  oldObjectId: ObjectId | null,
  newObjectId: ObjectId,
  status: 'mapped' | 'skipped' | 'conflict' | 'merged',
  migratedAt: Date,
  metadata: {
    sourceHash: String,
    transformVersion: '1.0.0'
  }
}
```

**Indexes:**

- `{ entityType: 1, oldCollection: 1, oldObjectId: 1 }` unique (partial: status=mapped)
- `{ entityType: 1, oldId: 1 }`
- `{ runId: 1, entityType: 1 }`
- `{ newObjectId: 1, entityType: 1 }`

### `pts_migration_errors`

Failed rows; supports resume.

```javascript
{
  _id: ObjectId,
  runId: ObjectId,
  entityType: String,
  oldCollection: String,
  oldId: Number | null,
  oldObjectId: ObjectId | null,
  status: 'error' | 'resolved',
  error: {
    code: 'MISSING_CLIENT' | 'DUPLICATE_EMAIL' | 'INVALID_STATUS' | ...,
    message: String,
    details: Object
  },
  sourceSnapshot: Object,
  migratedAt: Date,
  resolvedAt: Date | null,
  resolvedByRunId: ObjectId | null
}
```

---

## 4. Migration modes

| Mode | Behavior |
|------|----------|
| **dry-run** | Full read + transform + validate; **no writes** to `pts_*` (optional JSON report). |
| **live-run** | Writes target collections + maps; idempotent upsert by `(entityType, oldObjectId)`. |
| **resume failed** | Skips already `mapped` rows; retries `pts_migration_errors`. |
| **rollback (per step)** | Delete v2 rows + maps for `entityType` in `runId`; **never** touch legacy DB. |

**Proposed CLI flags:**

```bash
--mode=dry-run|live|resume
--run-id=<existingRunId>
--step=users|clients|projects|activity|tasks|...
--batch-size=500
--since=<ISO date>              # delta sync for cutover
--rollback --step=tasks --run-id=...
```

---

## 5. Transformation strategy

### Accounts + users

| Legacy | v2 |
|--------|-----|
| `users` | `pts_accounts` + `pts_users` |
| `account_admins` | `pts_accounts` (+ optional `pts_users`) |

- Merge by normalized email; duplicates → `pts_migration_errors`.
- Map legacy role → `accountType` (`employee` / `admin` / `super_admin`).
- Passwords: re-hash if plain available; else force reset flow.
- `pts_users.managerId` via user map.

### Clients

`clients` → `pts_clients`. Map `companyName`, status, billing, address. No `legacyId` on target.

### Projects

`projects` → `pts_projects`. Map `clientId` via client map. Create empty `pts_project_stats` per project.

### Budgets

`project_budgets` (+ optional `project_budget_requests`) → `pts_project_budgets`. Copy consumed minutes; validate later.

### Assignments

`project_assignments` → `pts_project_assignments`. Map allocation, capPeriod, stats.

### Activity

**Weeks:** copy stored `weekStartDate` / `weekEndDate` — do not recompute from config for historical rows.

**Entries:** resolve all FKs via maps; preserve status, minutes, entryDate.

**working_hours fallback:** expand to separate draft entries per day; tag map metadata `source: working_hours`.

### Tasks

**Source:** `tasksV2` primary.

- `tasksV2` → `pts_tasks`
- `taskCommentsV2` → `pts_task_comments`
- `taskActivitiesV2` → `pts_task_activities`
- `taskWorkflowsV2` / `taskWorkflowStatusesV2` → v2 workflow collections

**Project link:** `projectRef.sourceId` (numeric) → map lookup `entityType=project, oldId=sourceId`.

**Workflows:** migrate legacy statuses or create defaults from `workflowDefaults.helper.js`.

---

## 6. Validation strategy

Run after **every step** and full suite before cutover.

| Check | Method |
|-------|--------|
| Count validation | source vs inserted + skipped + errors |
| Total minutes | Σ legacy entries vs Σ `pts_time_entries` by project/user |
| Budget totals | legacy `consumedMinutes` vs v2 budgets |
| Assignment totals | legacy consumed vs v2 assignment stats |
| Sample comparison | N random mapped pairs, field diff |
| Orphan detection | unmapped FKs |
| Missing references | map miss rate |
| Duplicate detection | email, user+weekStart |
| Double-count guard | no row from both `time_entries` and `working_hours` |

Output: `src/v2/migration/reports/<runId>/<step>.json`

**Gate:** cutover blocked unless validation passes or signed waiver per check.

---

## 7. Cutover strategy

```text
Staging dry+live → QA sign-off → Prod dry-run → Legacy write freeze
  → Final delta sync → Switch API to MONGO_V2_DB → Frontend to v2 API
  → Legacy DB read-only archive
```

| Phase | Actions |
|-------|---------|
| Staging | New DB; seed + full migration; QA + report reconciliation |
| Prod dry-run | Read-only validate; no v2 writes |
| Write freeze | Legacy maintenance; stop timers/new entries |
| Final delta | `--since=freezeStart` incremental migrate |
| Switch | Deploy v2 with `MONGO_V2_DB`; activate `pts_modules` |
| Archive | Legacy read-only; retain 90+ days |

---

## 8. Rollback strategy

| Scenario | Action |
|----------|--------|
| Failed mid-step | Fix transformer; `resume` — no legacy changes |
| Bad step data | `--rollback --step=X --run-id=Y` |
| Post-cutover bug | Revert API to legacy `MONGO_DB`; v2 preserved for analysis |
| Full abort pre-cutover | Drop/truncate target `pts_*`; re-seed + re-migrate |

**Rollback order (reverse migration):** tasks → comments → activities → workflows → entries → weeks → assignments → budgets → projects → clients → users → accounts.

**Never rollback legacy DB from migration tooling.**

---

## 9. Folder structure & commands

### Folder layout

```text
src/v2/migration/
├── index.js
├── config/
│   └── migration.env.example
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
│   ├── migrationRun.service.js
│   ├── mapLookup.service.js
│   └── deltaSync.service.js
├── repositories/
│   ├── migrationRun.repository.js
│   ├── migrationMap.repository.js
│   └── migrationError.repository.js
├── transformers/
│   ├── user.transformer.js
│   ├── client.transformer.js
│   ├── project.transformer.js
│   ├── budget.transformer.js
│   ├── assignment.transformer.js
│   ├── activity.transformer.js
│   └── task.transformer.js
├── validators/
│   ├── count.validator.js
│   ├── minutes.validator.js
│   ├── budget.validator.js
│   └── orphan.validator.js
├── reports/
├── helpers/
│   ├── dualConnection.helper.js
│   ├── batchWriter.helper.js
│   └── enumMaps.helper.js
└── logs/
```

### Proposed npm scripts

```json
{
  "v2:seed": "node src/v2/migration/seed/seedAll.js",
  "v2:migrate:dry-run": "node src/v2/migration/scripts/migrateAll.js --mode=dry-run",
  "v2:migrate:all": "node src/v2/migration/scripts/migrateAll.js --mode=live",
  "v2:migrate:users": "node src/v2/migration/scripts/migrateUsers.js --mode=live",
  "v2:migrate:clients": "node src/v2/migration/scripts/migrateClients.js --mode=live",
  "v2:migrate:projects": "node src/v2/migration/scripts/migrateProjects.js --mode=live",
  "v2:migrate:activity": "node src/v2/migration/scripts/migrateActivity.js --mode=live",
  "v2:migrate:tasks": "node src/v2/migration/scripts/migrateTasks.js --mode=live",
  "v2:migrate:validate": "node src/v2/migration/scripts/validate.js",
  "v2:migrate:resume": "node src/v2/migration/scripts/migrateAll.js --mode=resume"
}
```

**Prerequisite (when implementing):** extend `config/mongo.js` with `connectMongoV2()` for target DB.

---

## 10. Risks and recommendations

| Risk | Impact | Recommendation |
|------|--------|----------------|
| Duplicate users | Split identity | Email normalize; manual error queue |
| Missing clients | Orphan projects | Pre-flight report; waiver or placeholder |
| Numeric project IDs | Wrong task board | Map on `(entityType=project, oldId)` only |
| Task project mapping | Empty/wrong workflow | Workflows before tasks; validate FKs |
| working_hours vs time_entries | Double-count | Prefer `time_entries`; mutual-exclusion validator |
| Budget consumed drift | Wrong capacity | Copy legacy; recalc + compare before cutover |
| Password migration | No login | Force reset; temp passwords non-prod only |
| Permissions mismatch | Wrong access | Map to v2 roles; don't copy legacy RBAC |
| Frontend response mismatch | UI breaks | v2 contract QA before switch |
| Week boundary change | Wrong historical weeks | Copy stored week boundaries |
| Active timers at freeze | Data loss | Stop-all-timers maintenance step |

### Priority recommendations

1. Introduce `MONGO_V2_DB` in config before any migration code.
2. Implement map lookup service first — all transformers depend on it.
3. Staging full dry-run → live-run → validate before production.
4. Activity migration is the highest-risk gate (minutes + budgets).
5. Keep mapping collections for audit (minimum 1 year).
6. Do not activate v2 modules in seed until migration QA passes.
7. Extract seed from runtime bootstrap into `v2:seed` CLI.

---

## Related docs

- [v2-migration.md](./v2-migration.md) — CLI usage (Phase 1 implemented)
- [v2-seed.md](./v2-seed.md) — seed CLI
- [v2-folder-structure.md](./v2-folder-structure.md) — module layout and bootstrap
- [v2-rbac.md](./v2-rbac.md) — permissions and roles seed
- [v2-activity.md](./v2-activity.md) — time week/entry rules
- [v2-reports.md](./v2-reports.md) — post-migration validation via reports
- [v2-api-architecture-blueprint.md](./v2-api-architecture-blueprint.md) — original migration notes (§10)

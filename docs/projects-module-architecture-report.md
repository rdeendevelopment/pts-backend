# PTS Projects Module — Architecture Review & Refactoring Plan

**Status:** Pre-refactoring architecture report  
**Audience:** Engineering / product  
**Scope:** Projects, assignments, budgets, time logging, files, notes (pending), reporting at 10k+ scale  
**Constraint:** No code changes in this document — design and migration plan only

---

## Executive Summary

The Projects module works end-to-end for basic CRUD, team assignment, budgets, tasks, and time tracking, but it carries **migration debt** from the legacy system: dual ID schemes (`legacyId` + ObjectId), duplicated domain concepts (two request types, three membership models, two time systems), inconsistent API/frontend field names, and **list endpoints that aggregate time on every read**.

The reported issue — **users cannot log time even after hours are assigned** — is not a single bug. It is a **stack of validation and data-mapping failures** between admin assignment UI, API persistence, employee-facing project payloads, and time-entry guards. The highest-impact root cause is a **field-name mismatch on project create** (`hours_allocated` sent by frontend, `hours_cap_minutes` expected by backend), plus **project status `active` required for logging**, **frontend pending-hours reading wrong API fields**, and **per-user `allowExceed` never persisted or enforced server-side**.

Recommended direction: introduce normalized `pts_*` collections behind a **strangler migration**, fix assignment/time validation in Phase 1, add notes in Phase 2, migrate data in Phases 3–4, then optimize reporting and retire legacy collections.

---

## 1. Current Architecture Problems

### 1.1 Domain fragmentation

| Problem | Impact |
|---------|--------|
| **Two change-request systems** — `project_requests` (legacy) vs `project_budget_requests` (new) | Confusing UX, duplicate approval logic, inconsistent statuses |
| **Three membership models** — `project_assignments`, `project_members`, `taskProjectMembersV2` | Sync jobs, drift, unclear source of truth |
| **Two time systems** — `time_entries` + `time_weeks` (new) vs `working_hours` (legacy Add Activity) | Duplicate validation rules; legacy path bypasses budget/cap checks |
| **Attachments schema drift** — `parentId`/`parentType` in model; repository still queries `linkId` | Files missing on project detail for migrated docs |

### 1.2 Identity & reference model

- Every entity exposes **`legacyId` (Number)** to the API while Mongo uses **`ObjectId`** internally.
- `nextLegacyId()` = `findOne().sort({ legacyId: -1 })` — **does not scale** under concurrent writes (race) or large collections (slow).
- References are inconsistent: some joins use `legacyId`, some use `_id`, some use both (`legacyProjectId` + `projectId`).
- Migrated rows include `migratedAt`, `legacyCreatedAt`, snapshot blobs (`clientSnapshot`, `userSnapshot`) with **no invalidation strategy**.

### 1.3 Validation logic is scattered and inconsistent

Time logging rules live in `time.repository.js` (`assertProjectWritableForUser`). Budget rules live in `budget.repository.js` (`assertBudgetCanConsume`, `resolveBudgetForTimeEntry`). Frontend pre-validates in **three places** with **different field names** (`add-activity`, `add-time-tracking`, admin team UI).

Known logic gaps:

1. **`capPeriod` is stored but never applied** — cap check always sums all `time_entries` for user+project (lifetime), ignoring day/week/month scope.
2. **Per-user `allowExceed` is sent from admin UI but not stored** on `project_assignments` and not checked in cap validation.
3. **Assignment lookup bug** in `assertProjectWritableForUser`: first query matches any assignment for user (not scoped to target project).
4. **Project must be `status: 'active'`** — projects created as `pending` or `in-discussion` block all new time entries (backend + frontend `canWriteToProject`).
5. **Multiple active budgets** on hybrid/retainer projects require explicit `budgetId`; otherwise API returns *"Select a budget or phase"*.

### 1.4 Security & API maturity

- Core `/api/project/*` and `/api/projectUsers/*` routes have **no authentication middleware** (budget routes do).
- Single-field `PUT /project/update/:id` makes transactional edits awkward.
- No structured audit trail for assignment/budget changes.

### 1.5 Frontend ↔ backend contract drift

| Frontend expects | API returns | Result |
|------------------|-------------|--------|
| `hours_allocated` in `assign_user_options` on create | Backend reads `hours_cap_minutes` / `hoursCapMinutes` only | **Caps not saved on project create** |
| `allow_exceed` on assignment | Not in assignment schema | Per-user exceed ignored |
| `allow_exceed` in Add Activity | `allow_budget_exceed` from API | Exceed policy UI wrong |
| `hours` / `pending_hours` / `remaining_hours` | `total_remaining_minutes`, `total_allocated_minutes` | **Pending hours show 0** → submit button disabled |
| `totalAllocatedMinutes` (camelCase) override in repo | Serialized snake_case keys | User cap summary not exposed to UI |

### 1.6 Notes module

- `projects.notes` is a single string field on the project document.
- No CRUD API, no threading, no author/timestamp per note — **notes feature is not implemented**, only a placeholder field.

---

## 2. Why Current DB Structure Fails at Scale (10k+ Projects)

### 2.1 Read amplification on list endpoints

`GET /api/project/all` (limit up to **5000** per request):

1. Loads N project documents + `populate(clientId)`.
2. Runs **budget aggregation** across all project ObjectIds.
3. Runs **time_entry aggregation** (submitted/approved only for logged summary — inconsistent with cap check which includes draft).
4. Loads **all assignments** for those projects with `populate(userId)`.

At 10,000 projects this pattern is **O(projects × related collections)** per page load. Admin dashboards and project lists will degrade linearly.

### 2.2 Write amplification on time entry

Each time entry:

- Aggregates `time_entries` to validate user cap.
- Aggregates `time_entries` again to validate budget.
- Calls `recalculateBudget` (another aggregation).
- Updates `time_weeks.totalMinutes`.

No denormalized counters on assignment or budget beyond `consumedMinutes` (which is recalculated from scratch anyway).

### 2.3 Index gaps

- Cap validation queries `{ userId, projectId, status }` — OK if indexed.
- Budget list sorts by `{ status, createdAt, legacyId }` — partial index opportunity.
- **`legacyId` counter pattern** creates hot documents and scan-on-insert behavior.
- Cross-collection `$or` on `projectId` / `legacyProjectId` in budget aggregation prevents efficient index use.

### 2.4 Data volume growth

- `time_entries` grows without bound (minutes × users × projects × years).
- Without **rollup collections** (`pts_project_stats`), every reporting query scans raw entries.
- Soft-deleted projects/assignments remain in working sets unless queries are perfectly filtered.

### 2.5 Operational risk

- Dual schemas (`working_hours` vs `time_entries`) double storage and confuse reconciliation.
- No migration version field on documents — hard to know which transformation rules applied.

---

## 3. Recommended New MongoDB Collections (`pts_` Prefix)

| Collection | Purpose |
|------------|---------|
| `pts_projects` | Canonical project record |
| `pts_project_assignments` | User ↔ project membership + current allocation snapshot |
| `pts_project_user_allocations` | **Optional but recommended** — versioned allocation history |
| `pts_project_budgets` | Budget buckets |
| `pts_project_requests` | Unified approval workflow (hours, scope, deadline) |
| `pts_project_notes` | Structured notes (pending feature) |
| `pts_project_files` | Project-scoped file metadata |
| `pts_project_events` | Append-only audit / domain events |
| `pts_project_stats` | Materialized counters for list + dashboard |

**Keep separate (not renamed in Phase 3):** `time_entries`, `time_weeks`, `active_timers`, `users`, `clients` — update foreign keys to `pts_projects._id`.

---

## 4. Legacy Collections — Remove After Migration

| Legacy collection | Replacement | When safe to archive |
|--------------------|-------------|----------------------|
| `projects` | `pts_projects` | After read switch + validation pass |
| `project_assignments` | `pts_project_assignments` (+ optional allocations) | After time-entry refs validated |
| `project_budgets` | `pts_project_budgets` | After budget totals match |
| `project_budget_requests` | `pts_project_requests` | After open requests migrated |
| `project_requests` | `pts_project_requests` | After legacy requests migrated |
| `attachments` (project rows) | `pts_project_files` | After file URLs verified |
| `project_members` | Derived from assignments (or drop if Task V2 uses `taskProjectMembersV2` only) | After task access sync rewritten |

**Do not delete immediately:** `time_entries`, `working_hours` (until Add Activity fully on time_entries), `taskProjectMembersV2`, task collections.

---

## 5. Normalized Schema Proposal

### 5.1 `pts_projects`

```javascript
{
  _id: ObjectId,
  publicId: String,              // UUID or slug for external APIs (optional)
  legacyId: Number,              // migration only; indexed, not primary logic

  clientId: ObjectId,            // ref clients
  title: String,
  detail: String,

  projectType: enum,             // fixed_hours | fixed_budget | retainer | hybrid | internal
  status: enum,                  // pending | active | on_hold | completed | archived
  isActive: Boolean,
  isDeleted: Boolean,

  allowBudgetExceed: Boolean,    // project-level default

  // Type-specific config (sparse)
  fixedHours: Number,
  budgetAmount: Number,
  estimatedHours: Number,
  retainerHoursPerMonth: Number,
  retainerRenewalDay: Number,    // 1-28
  autoCreateMonthlyBudget: Boolean,

  deadline: Date,
  startDate: Date,

  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date,

  schemaVersion: Number          // migration tracking
}
```

**Indexes:** `{ clientId: 1, title: 1, isDeleted: 1 }` unique (case-insensitive via normalizedTitle field), `{ status: 1, isDeleted: 1, updatedAt: -1 }`, `{ legacyId: 1 }` sparse.

---

### 5.2 `pts_project_assignments`

```javascript
{
  _id: ObjectId,
  projectId: ObjectId,
  userId: ObjectId,

  status: enum,                  // assigned | unassigned
  role: String,                  // Developer, PM, etc.
  canLogTime: Boolean,

  // Current effective allocation (denormalized for fast reads)
  allocation: {
    allocatedMinutes: Number,    // null = unlimited at user level
    capPeriod: enum,             // none | day | week | month | project
    allowExceed: Boolean,        // user may exceed own cap / project budget
    effectiveFrom: Date,
    effectiveTo: Date            // null = current
  },

  // Denormalized counters (maintained by time-entry service)
  stats: {
    consumedMinutes: Number,
    lastEntryAt: Date
  },

  assignedAt: Date,
  unassignedAt: Date,
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:** `{ projectId: 1, userId: 1, isDeleted: 1 }` unique for active assignment, `{ userId: 1, status: 1, isDeleted: 1 }`, `{ projectId: 1, status: 1, isDeleted: 1 }`.

---

### 5.3 `pts_project_user_allocations` (recommended for audit)

Use when admin changes a member's hours — **do not overwrite history silently**.

```javascript
{
  _id: ObjectId,
  projectId: ObjectId,
  userId: ObjectId,
  assignmentId: ObjectId,

  allocatedMinutes: Number,
  capPeriod: enum,
  allowExceed: Boolean,

  reason: String,                // admin note
  createdBy: ObjectId,
  effectiveFrom: Date,
  effectiveTo: Date,             // set when superseded
  supersededBy: ObjectId,

  createdAt: Date
}
```

**Indexes:** `{ projectId: 1, userId: 1, effectiveFrom: -1 }`, `{ assignmentId: 1, effectiveTo: 1 }`.

---

### 5.4 `pts_project_budgets`

```javascript
{
  _id: ObjectId,
  projectId: ObjectId,

  name: String,
  description: String,
  budgetType: enum,              // fixed | retainer | phase | change_request
  billingType: enum,             // billable | non_billable

  allocatedMinutes: Number,      // null = flexible
  consumedMinutes: Number,       // maintained by events + reconciliation job

  periodStart: Date,
  periodEnd: Date,

  allowExceed: Boolean,
  warningThresholdPercent: Number,
  status: enum,

  sourceRequestId: ObjectId,     // if created from approval

  createdBy: ObjectId,
  approvedBy: ObjectId,
  approvedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:** `{ projectId: 1, status: 1, periodStart: -1 }`, `{ projectId: 1, periodStart: 1, periodEnd: 1 }`, `{ projectId: 1, name: 1 }` unique among non-cancelled.

---

### 5.5 `pts_project_requests` (unified)

```javascript
{
  _id: ObjectId,
  projectId: ObjectId,
  budgetId: ObjectId,            // optional target budget

  requestType: enum,             // additional_hours | phase_extension | scope_change | deadline_change
  title: String,
  description: String,
  requestedMinutes: Number,
  requestedDeadline: Date,

  status: enum,                    // pending | approved | rejected | cancelled
  requestedBy: ObjectId,
  reviewedBy: ObjectId,
  reviewedAt: Date,
  resolutionNote: String,

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:** `{ projectId: 1, status: 1, createdAt: -1 }`, `{ requestedBy: 1, status: 1 }`.

---

### 5.6 `pts_project_notes`

```javascript
{
  _id: ObjectId,
  projectId: ObjectId,

  body: String,                  // markdown or plain text
  bodyFormat: enum,              // plain | markdown

  isPinned: Boolean,
  visibility: enum,              // internal | client_visible (future)

  authorId: ObjectId,
  createdAt: Date,
  updatedAt: Date,
  isDeleted: Boolean
}
```

**Indexes:** `{ projectId: 1, isDeleted: 1, createdAt: -1 }`, `{ projectId: 1, isPinned: -1, createdAt: -1 }`.

---

### 5.7 `pts_project_files`

```javascript
{
  _id: ObjectId,
  projectId: ObjectId,

  title: String,
  storageKey: String,            // S3/local path
  url: String,
  mimeType: String,
  sizeBytes: Number,

  uploadedBy: ObjectId,
  createdAt: Date,
  isDeleted: Boolean
}
```

**Indexes:** `{ projectId: 1, isDeleted: 1, createdAt: -1 }`.

---

### 5.8 `pts_project_events` (audit)

```javascript
{
  _id: ObjectId,
  projectId: ObjectId,

  eventType: String,             // assignment.created | budget.approved | time.rejected | ...
  entityType: String,
  entityId: ObjectId,

  actorId: ObjectId,
  payload: Object,               // before/after diff, error codes, etc.

  createdAt: Date
}
```

**Indexes:** `{ projectId: 1, createdAt: -1 }`, `{ eventType: 1, createdAt: -1 }`, TTL optional for old debug events.

---

### 5.9 `pts_project_stats` (reporting)

One document per project, updated incrementally:

```javascript
{
  _id: ObjectId,                 // same as projectId
  projectId: ObjectId,

  budgetAllocatedMinutes: Number,
  budgetConsumedMinutes: Number,
  budgetRemainingMinutes: Number,

  timeLoggedMinutes: Number,     // all non-rejected entries
  timeBillableMinutes: Number,

  assignmentCount: Number,
  activeBudgetCount: Number,

  taskTotal: Number,
  taskCompleted: Number,

  lastActivityAt: Date,
  recomputedAt: Date,
  version: Number
}
```

Per-user rollup (optional sub-collection or embedded map capped + overflow collection):

`pts_project_member_stats` — `{ projectId, userId, consumedMinutes, capMinutes, remainingMinutes }`.

**Indexes:** `{ budgetRemainingMinutes: 1 }` for alerts, `{ lastActivityAt: -1 }` for admin sort.

---

## 6. User Assigned Hours: Assignment vs Separate Allocation Collection?

### Recommendation

| Approach | Use when |
|----------|----------|
| **Store current cap on `pts_project_assignments.allocation`** | Default — fast time-entry validation, simple reads |
| **Append-only `pts_project_user_allocations`** | Admin changes caps, compliance, disputes, retainer re-allocations |

**Do not** store caps only on the project document — caps are **per user**.

**Do not** require a join to allocations on every time entry in v1 — keep **one current effective allocation** denormalized on the assignment row, updated whenever a new allocation version is created.

### `allowExceed` precedence (recommended)

```
user.allocation.allowExceed === true  → skip user cap check (still apply budget rules unless budget.allowExceed)
else enforce user cap for capPeriod window

project.allowBudgetExceed OR budget.allowExceed → skip budget hard stop
else enforce budget remaining
```

---

## 7. Correct Time Logging Validation Algorithm

Single function: `validateTimeEntry({ userId, projectId, budgetId, entryDate, durationMinutes, excludeEntryId })`.

### Step 0 — Preconditions

- User authenticated; entry duration ≥ 1 minute.
- Week not submitted/approved (if using weekly workflow).
- No time overlap (if start/end provided).

### Step 1 — Project + assignment gate

```
assignment = find assigned pts_project_assignments(projectId, userId)
project = find pts_projects(projectId)

FAIL if:
  !project || project.isDeleted || !project.isActive
  project.status not in LOGGABLE_STATUSES  // recommend: active only, OR active + on_hold with flag
  !assignment || assignment.status != assigned
  assignment.canLogTime == false
```

### Step 2 — Resolve budget

```
budget = explicit budgetId OR auto-select:
  - if exactly one active budget for entryDate period → use it
  - if retainer and none for month → create monthly budget (if configured)
  - if multiple → FAIL with BUDGET_SELECTION_REQUIRED
```

### Step 3 — User allocation check

```
if assignment.allocation.allocatedMinutes is set:
  window = capPeriodWindow(entryDate, assignment.allocation.capPeriod)
  used = SUM(time_entries WHERE user, project, date in window, status != rejected, excludeEntryId)
  if used + duration > allocated AND NOT assignment.allocation.allowExceed:
    FAIL CAP_EXCEEDED with remaining minutes
```

### Step 4 — Project budget check

```
if budget.allocatedMinutes is set:
  consumed = budget.consumedMinutes OR SUM(entries on budget) // prefer counter
  if consumed + duration > allocated AND NOT (budget.allowExceed OR project.allowBudgetExceed):
    FAIL BUDGET_EXCEEDED
```

### Step 5 — Persist + side effects

```
INSERT time_entry
INCREMENT assignment.stats.consumedMinutes (for matching capPeriod window totals in stats job)
INCREMENT budget.consumedMinutes
UPDATE pts_project_stats (async or transactional outbox)
EMIT pts_project_events time.logged
```

### Active timer behavior

| Phase | Validation |
|-------|------------|
| **startTimer** | Steps 1–2 only (no duration yet); optionally warn if cap remaining = 0 |
| **stopTimer** | Full Steps 1–4 using computed duration; discard timer if validation fails |
| **pause/resume** | No budget mutation |

Timers should store `projectId`, `budgetId`, `assignmentId` snapshot at start to detect admin changes mid-session.

---

## 8. Likely Root Cause: Users Cannot Add Assigned Hours

Ranked by probability (based on current code):

### P0 — Assignment hours not persisted on project create

- Frontend `cleanAssignmentOptions` sends `hours_allocated`.
- Backend `saveProject` maps only `hoursCapMinutes` / `hours_cap_minutes`.
- **Result:** Members assigned at create time have `hoursCapMinutes = null`. Admin UI shows hours in form state but DB has no cap.

**Fix:** Map `hours_allocated → hours_cap_minutes` on create; add integration test.

### P0 — Project status not `active`

- `assertProjectWritableForUser` requires `status: 'active'`.
- New projects often created as `pending`.
- Frontend `canWriteToProject` also requires `status === 'active'`.

**Fix:** Align business rule — either auto-activate on first assignment or allow logging for `pending` when assigned.

### P0 — Add Activity UI blocks submit (shows 0 pending hours)

- `getSelectedProjectPendingHours()` reads `hours`, `pending_hours`, `remaining_hours`.
- API returns `total_remaining_minutes` / user cap override (broken — see P1).
- `canSelectedProjectExceed()` reads `allow_exceed`; API returns `allow_budget_exceed`.

**Fix:** Standardize API contract; fix frontend readers; disable button only when backend would reject.

### P1 — User cap summary written to wrong keys

In `getUserAssignedProjects`, after serialize:

```javascript
projectData.totalAllocatedMinutes = userCapMinutes; // wrong — should be total_allocated_minutes
```

Employee apps never receive correct remaining minutes.

### P1 — Per-user `allowExceed` ignored

- Admin sends `allowExceed` on assign; **not stored** in schema.
- Cap validation has **no exceed bypass** at user level.

### P1 — Assignment lookup not scoped to project

First `ProjectAssignment.findOne({ userId, status: 'assigned', ... })` without `projectId` can return wrong assignment → wrong cap or false `canLogTime`.

### P2 — Budget selection required

Hybrid projects with retainer + phase budgets → multiple active budgets → error until user picks budget (time-tracking UI may not force selection).

### P2 — Budget exhausted with `allowExceed: false`

Initial budgets inherit project setting; if project budget consumed, logging fails even when user has personal cap remaining.

### P2 — `canLogTime` unchecked in team UI

Checkbox "Can add time" maps to `canLogTime`; if false, backend returns *"Time logging has been disabled"*.

---

## 9. Recommended Indexes (All `pts_` Collections)

| Collection | Index |
|------------|-------|
| `pts_projects` | `{ clientId: 1, normalizedTitle: 1, isDeleted: 1 }` unique |
| | `{ status: 1, isDeleted: 1, updatedAt: -1 }` |
| | `{ legacyId: 1 }` sparse |
| `pts_project_assignments` | `{ projectId: 1, userId: 1, isDeleted: 1 }` |
| | `{ userId: 1, status: 1, isDeleted: 1 }` |
| `pts_project_user_allocations` | `{ projectId: 1, userId: 1, effectiveFrom: -1 }` |
| `pts_project_budgets` | `{ projectId: 1, status: 1, periodStart: -1 }` |
| | `{ projectId: 1, periodStart: 1, periodEnd: 1, status: 1 }` |
| `pts_project_requests` | `{ projectId: 1, status: 1, createdAt: -1 }` |
| `pts_project_notes` | `{ projectId: 1, isDeleted: 1, createdAt: -1 }` |
| `pts_project_files` | `{ projectId: 1, isDeleted: 1, createdAt: -1 }` |
| `pts_project_events` | `{ projectId: 1, createdAt: -1 }` |
| `pts_project_stats` | `{ lastActivityAt: -1 }`, `{ budgetRemainingMinutes: 1 }` |
| `time_entries` (existing) | `{ userId: 1, projectId: 1, entryDate: 1, status: 1 }` |
| | `{ budgetId: 1, status: 1 }` |
| | `{ projectId: 1, entryDate: -1 }` |

---

## 10. Migration Strategy

### Phase A — Prepare

1. Add `schemaVersion`, `ptsMigratedAt` fields to new collections only.
2. Build `scripts/migrate-pts-projects.js` idempotent runner with batch size 500.
3. Maintain **`legacyId → pts._id` mapping table** in memory or `pts_migration_map` collection.

### Phase B — Backfill new collections

| Step | Action |
|------|--------|
| 1 | Migrate `projects` → `pts_projects` (normalize status, drop orphan snapshots) |
| 2 | Migrate `project_assignments` → `pts_project_assignments` + initial `pts_project_user_allocations` row if cap present |
| 3 | Migrate `project_budgets` → `pts_project_budgets`; recalculate `consumedMinutes` from `time_entries` |
| 4 | Merge `project_requests` + `project_budget_requests` → `pts_project_requests` |
| 5 | Migrate project `attachments` → `pts_project_files` (fix parentId/linkId) |
| 6 | Build `pts_project_stats` via aggregation job |
| 7 | Update `time_entries.projectId` only if ObjectIds change (prefer keep same `_id` on projects to avoid this) |

### Phase C — Validation gates

- For each project: `SUM(budget allocated) >= SUM(member caps)` unless allowExceed flags set.
- For each assignment with cap: `assignment.stats.consumedMinutes === SUM(time_entries)` for user+project.
- For each budget: `consumedMinutes` matches entries.
- Sample 100 projects manual QA in UI.

### Phase D — Switch reads (strangler)

1. Feature flag `PTS_USE_PTS_PROJECTS=true` on API repository layer.
2. Dual-write new assignments/budgets to both legacy and `pts_*` for 2 weeks.
3. Switch reads to `pts_*`; monitor errors.
4. Stop dual-write.

### Phase E — Archive

1. Rename legacy collections → `archive_projects`, etc.
2. Read-only retention 90 days.
3. Drop archives after backup.

**Important:** Keep **`legacyId` in API responses** during transition for Angular app compatibility; remove in API v2.

---

## 11. API Changes Needed

### 11.1 Contract standardization

Single snake_case response schema documented in OpenAPI:

- `user_allocation: { allocated_minutes, consumed_minutes, remaining_minutes, cap_period, allow_exceed, can_log_time }`
- `project_policy: { allow_budget_exceed, loggable_statuses }`
- `budget_summary: { ... }`

### 11.2 New / revised endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v2/projects` | Cursor pagination; returns stats from `pts_project_stats` only |
| `GET /api/v2/projects/:id` | Full detail + notes + files |
| `PATCH /api/v2/projects/:id` | Partial multi-field update |
| `PUT /api/v2/projects/:id/team/:userId/allocation` | Set cap + create allocation version |
| `GET /api/v2/projects/:id/notes` | CRUD notes |
| `GET /api/v2/projects/:id/logging-context` | **Employee pre-flight** — returns caps, budgets, exceed flags, block reasons |
| `POST /api/v2/time/entries/validate` | Dry-run validation (debugging) |

### 11.3 Auth

- All project mutation routes require JWT + RBAC.
- Employee logging routes require assignment check server-side (never trust UI).

### 11.4 Deprecate

- Dual request endpoints → unified `pts_project_requests`.
- `GET /project/all?limit=5000` → paginated cursor with filters.

---

## 12. Frontend Changes Needed

1. **Unified project policy model** — one TypeScript interface consumed by Add Activity, Time Tracking, Project Detail.
2. **Fix assignment payload** — send `hours_cap_minutes` or backend accepts `hours_allocated`.
3. **Call `logging-context` before enabling submit** — show exact block reason instead of generic "not allowed".
4. **Budget picker** — required when `budgets.length > 1`; auto-select when 1.
5. **Status awareness** — show banner when project not loggable (*"Project is pending — activate to log time"*).
6. **Notes tab** — new module wired to `pts_project_notes` (Phase 2).
7. **Remove duplicate client-side cap math** where possible — trust server validate endpoint for edge cases.
8. **Retire Add Activity dependency on `working_hours`** — single path through `time_entries`.

---

## 13. Reporting / Dashboard Optimization (10k+ Projects)

1. **`pts_project_stats` as read model** — updated on time entry create/update/delete via lightweight increment or queue worker.
2. **Admin list query** — projection-only fields: `title, clientName, status, budgetRemaining, lastActivityAt`; no joins.
3. **Cursor pagination** — replace page/limit 5000 with `?cursor=&limit=50&status=active&clientId=`.
4. **Background reconciliation** — nightly job recomputes stats drift; alerts if delta > threshold.
5. **Project dashboard** — cache task summary + time breakdown; invalidate on task/time events.
6. **Separate analytics DB optional** — at 100k+ projects, stream `pts_project_events` to warehouse; out of scope for initial refactor.

---

## 14. Audit Logging & Debugging Improvements

1. **`pts_project_events`** for every assignment, cap change, budget approval, failed validation (include `errorCode`).
2. **Structured API errors** — always `{ message, errorCode, data: { remainingMinutes, capMinutes, budgetId } }` (partially exists today).
3. **`POST /time/entries/validate`** for support team to reproduce user issues without writing data.
4. **Correlation ID** in logs per request (`x-request-id`).
5. **Admin "why can't user X log time?" tool** — runs validation algorithm with dry-run output.

---

## 15. Phased Implementation Plan

### Phase 1 — Fix assigned-hours bug (1–2 weeks)

**Goal:** Users can log time within assigned caps without refactoring DB.

- [ ] Map `hours_allocated` → `hours_cap_minutes` in `saveProject` + `createProjectAssignment`
- [ ] Fix assignment lookup to always filter by `projectId`
- [ ] Persist `allowExceed` on assignment (add field to legacy schema short-term)
- [ ] Honor user `allowExceed` in `assertProjectWritableForUser`
- [ ] Implement `capPeriod` window in cap aggregation
- [ ] Fix `getUserAssignedProjects` snake_case override keys
- [ ] Fix Add Activity / Time Tracking to read `total_remaining_minutes`, `allow_budget_exceed`
- [ ] Align loggable project statuses with product rule
- [ ] Add API tests: create project with team caps → user logs time → success

**Exit criteria:** Reported bug reproduced and fixed in staging; QA sign-off on fixed-hours + retainer scenarios.

---

### Phase 2 — Notes module (1 week)

- [ ] Create `pts_project_notes` (can live alongside legacy before full migration)
- [ ] CRUD API + RBAC
- [ ] Project detail Notes tab (admin + employee read)
- [ ] Migrate `projects.notes` string → first note document

---

### Phase 3 — Introduce `pts_` collections (2–3 weeks)

- [ ] Create collections + indexes
- [ ] Repository abstraction with feature flag
- [ ] Dual-write on create/update for projects, assignments, budgets
- [ ] Unified `pts_project_requests`
- [ ] `pts_project_files` + fix attachment parent lookup

---

### Phase 4 — Migrate data (2 weeks)

- [ ] Run backfill scripts per Section 10
- [ ] Validation reports + manual QA
- [ ] Switch API reads to `pts_*` under flag
- [ ] Update `time_entries` foreign keys if needed

---

### Phase 5 — Reporting & indexes (1–2 weeks)

- [ ] Build `pts_project_stats` + member stats rollups
- [ ] Refactor list/dashboard endpoints to use stats
- [ ] Add cursor pagination to admin project list
- [ ] Nightly reconciliation job

---

### Phase 6 — Cleanup (1 week)

- [ ] Remove dual-write
- [ ] Archive legacy collections
- [ ] Deprecate `working_hours` write path
- [ ] Consolidate `project_members` sync into single hook on assignment change
- [ ] Remove dead code paths + document API v2

---

## Appendix A — Current vs Target Flow (Time Entry)

```
CURRENT (problematic)
  Admin assigns hours (hours_allocated)
    → often NOT saved on create
  Employee opens Add Activity
    → pending hours = 0 (wrong fields)
    → OR backend rejects (status != active)
    → OR budget multi-select error

TARGET
  Admin sets allocation (PUT .../allocation)
    → pts_project_assignments + pts_project_user_allocations
    → pts_project_events
  Employee calls GET .../logging-context
    → UI shows remaining cap + budget + block reason
  Employee submits time
    → validateTimeEntry (single service)
    → increment stats + event
```

---

## Appendix B — Decision Log

| Decision | Rationale |
|----------|-----------|
| Keep current allocation on assignment row | Fast validation path; avoid joins at 10k+ projects |
| Separate allocation history collection | Audit + admin changes without losing history |
| Unified `pts_project_requests` | Reduce overlapping legacy/new flows |
| Materialized `pts_project_stats` | List/dashboard must not aggregate `time_entries` per request |
| Keep `legacyId` during transition | Angular app compatibility |
| Strangler migration vs big-bang | Lower risk; fix P0 bugs in Phase 1 without waiting |

---

*End of report.*

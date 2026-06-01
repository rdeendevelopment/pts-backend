# PTS API v2 — Activity Module

Module path: `src/v2/modules/activity/`  
Routes: `/api/v2/activity/*` (requires `PTS_V2_ENABLED=true`, Bearer token, and RBAC permissions)

---

## Purpose

Activity is the **unified time tracking system** for PTS v2.

- One system only — no legacy `working_hours` flow.
- Draft entries do **not** consume capacity.
- **Week submit** consumes assignment, budget, and project stats counters.
- **Week approve** locks all entries permanently.
- **Week reject** reverses counters and returns entries to draft.

---

## Collections

| Collection | Purpose |
|------------|---------|
| `pts_time_weeks` | Weekly approval container per user (7-day window in business timezone) |
| `pts_time_entries` | Individual time logs linked to project, assignment, budget, work category |
| `pts_active_timers` | One running timer per user |
| `pts_work_categories` | Reusable activity categories (seeded on bootstrap) |

---

## Locked business rules

1. Consumption on **week submit**, not on draft create.
2. Week is the approval boundary.
3. Approved week locks all entries (`isLocked=true`, status `approved`).
4. Rejected week reverses counters; entries return to `draft`.
5. `capPeriod` enforced: `project`, `day`, `week`, `month`.
6. Multiple approved budgets → `budgetId` required.
7. One running timer per user; max duration 16h (configurable via `PTS_V2_MAX_TIMER_MINUTES`).
8. UTC storage; week/day/month boundaries use `PTS_V2_BUSINESS_TIMEZONE` (default `UTC`).
9. Week window start day is configurable via `PTS_V2_WEEK_START_DAY` (`monday` or `sunday`, default `monday`).
10. Each timer stop creates a **separate** draft entry; entries are never auto-merged.
11. Reports aggregate minutes by project (and list individual entries) per business day; multiple sessions on the same task/project/category/day sum in totals only.

---

## Week boundaries

All activity week calculations read global config:

| Variable | Allowed | Default |
|----------|---------|---------|
| `PTS_V2_WEEK_START_DAY` | `monday`, `sunday` | `monday` |
| `PTS_V2_BUSINESS_TIMEZONE` | IANA timezone | `UTC` |

Behavior:

- **`monday`** — week runs Monday 00:00 through Sunday 23:59:59.999 (business timezone).
- **`sunday`** — week runs Sunday 00:00 through Saturday 23:59:59.999 (business timezone).

Used by:

- `getOrCreateWeek` / `pts_time_weeks` creation (`weekStartDate`, `weekEndDate` stored on the document)
- `capPeriod=week` validation (`TimeValidationService` via `getCapPeriodBounds`)
- Admin weekly report day slots (always **7 days** from the week document’s stored boundaries)

Submit, approve, and reject operate on the **existing week document** boundaries — they do not recalculate the window from current config.

---

## Timer and session rules

- Each timer **starts from zero** when the user clicks start.
- Stopping a timer creates one draft time entry with elapsed minutes for that session only.
- **Entries are never auto-merged** — two timer stops (or manual logs) on the same task/project/category/day remain separate rows.
- Weekly reports **aggregate** minutes per project per day and list each entry; totals reflect the sum of separate sessions.

---

## TimeValidationService

Validates before create/update/submit/timer start:

- Project exists and `status=active`
- Active assignment with `canLogTime=true`
- Week not submitted/approved
- User cap by `capPeriod`
- Budget remaining (when budget applies)
- Manual entry allowed by project settings
- Budget selection when multiple approved budgets exist

Preview via `POST /activity/validate-time-entry`.

---

## Weekly lifecycle

```text
draft ──submit──► submitted ──approve──► approved (locked)
                    │
                    └──reject──► rejected (entries draft, counters reversed)
                                    │
                                    └──submit──► submitted
```

### Submit (`POST /weeks/:id/submit`)

1. Validate all draft entries
2. Week → `submitted`, entries → `submitted`
3. Consume assignment/budget/project stats counters
4. Emit project events (Projects audit log)
5. Emit v2 socket events via `activitySocketEvents.helper.js` (best-effort)

### Approve (`POST /weeks/:id/approve`) — requires `activity.manage`

1. Week → `approved`
2. Entries → `approved`, locked
3. Emit `activity.week.approved` to user + affected project rooms

### Reject (`POST /weeks/:id/reject`) — requires `activity.manage`

1. Reverse consumed counters
2. Week → `rejected`
3. Entries → `draft`, unlocked
4. Emit `activity.week.rejected` to user + affected project rooms

---

## Counter updates

On submit, grouped by assignment and budget:

- `assignment.stats.consumedMinutes` += minutes
- `assignment.stats.remainingMinutes` recalculated
- `budget.consumedMinutes` += minutes
- `pts_project_stats` recalculated per affected project

On reject from `submitted`, the same deltas are reversed.

Uses Mongo transactions when available; falls back safely on standalone Mongo.

---

## Routes

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/activity/weeks` | `activity.view` or `activity.manage` | Own weeks unless manage |
| GET | `/activity/weeks/:id` | view/manage | Includes 7-day weekly report |
| POST | `/activity/weeks` | view/manage | Get/create week |
| POST | `/activity/weeks/:id/submit` | view/manage | Own week |
| POST | `/activity/weeks/:id/approve` | `activity.manage` | Admin approval |
| POST | `/activity/weeks/:id/reject` | `activity.manage` | Admin rejection |
| GET/POST/PATCH/DELETE | `/activity/time-entries/*` | view/manage | Own entries unless manage |
| POST | `/activity/validate-time-entry` | view/manage | Pre-flight validation |
| POST | `/activity/timers/start` | view/manage | Own timer |
| POST | `/activity/timers/:id/stop` | view/manage | Creates draft entry |
| POST | `/activity/timers/:id/cancel` | view/manage | |
| GET | `/activity/timers/active/me` | view/manage | |
| GET | `/activity/work-categories` | view/manage | |

---

## Admin weekly report

`GET /activity/weeks/:id` returns:

- Week metadata (`weekStartDate`, `weekEndDate` from the stored week document)
- `report.days[]` — **exactly 7 business days** from `weekStartDate` through `weekEndDate`
- Per day: `date`, `totalMinutes`, `projects[]` with aggregated minutes and individual `entries[]`
- `report.weeklyTotalMinutes`

Days with no logged time appear with `totalMinutes: 0` and empty `projects`.

---

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PTS_V2_BUSINESS_TIMEZONE` | `UTC` | Week/day/month boundary calculations |
| `PTS_V2_WEEK_START_DAY` | `monday` | Week window start (`monday` or `sunday`) |
| `PTS_V2_MAX_TIMER_MINUTES` | `960` | Max timer duration (16h) |

---

## Quick test (curl)

```bash
BASE=http://localhost:3001
TOKEN=$(curl -s -X POST "$BASE/api/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Password123"}' | jq -r '.data.access_token')

# Categories
curl -s "$BASE/api/v2/activity/work-categories" -H "Authorization: Bearer $TOKEN" | jq

# Preview validation
curl -s -X POST "$BASE/api/v2/activity/validate-time-entry" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "<projectId>",
    "workCategoryId": "<categoryId>",
    "minutes": 60,
    "entryDate": "2026-05-19"
  }' | jq
```

---

## Integration with Projects

Activity uses public exports from `src/v2/modules/projects/index.js`:

- `getProjectForActivity`, `getAssignmentForUser`, `getApprovedBudgetsForProject`
- `incrementAssignmentConsumedMinutes`, `reverseAssignmentConsumedMinutes`
- `incrementBudgetConsumedMinutes`, `reverseBudgetConsumedMinutes`
- `recalculateProjectStats`, `emitProjectEvent`, `getProjectStats`

Project delete guard now checks active entries/timers via `projectHasActiveActivity()`.

---

## Realtime (v2 socket)

Activity emits through `helpers/activitySocketEvents.helper.js` only. Emits are **best-effort** (`emitBestEffort`); DB work is never rolled back on socket failure.

Clients connect to Socket.IO namespace `/v2` and join rooms via validated server events (see [v2-socket.md](./v2-socket.md)).

| Action | Event | Rooms |
|--------|-------|-------|
| Week submit | `activity.week.submitted` | `user:{userId}` + `project:{projectId}` for each entry project |
| Week approve | `activity.week.approved` | user + affected projects |
| Week reject | `activity.week.rejected` | user + affected projects |
| Timer start | `activity.timer.started` | user + project |
| Timer stop | `activity.timer.stopped` | user + project |

### Payload shapes (DTO-safe)

**`activity.week.submitted`**

```json
{
  "weekId": "...",
  "userId": "...",
  "weekStartDate": "2026-05-19",
  "weekEndDate": "2026-05-25",
  "totalMinutes": 480,
  "totalEntries": 5,
  "status": "submitted"
}
```

Project room emits add `"projectId": "..."`.

**`activity.week.approved`**

```json
{
  "weekId": "...",
  "userId": "...",
  "status": "approved",
  "approvedBy": "...",
  "approvedAt": "2026-05-21T12:00:00.000Z",
  "lockedAt": "2026-05-21T12:00:00.000Z"
}
```

**`activity.week.rejected`**

```json
{
  "weekId": "...",
  "userId": "...",
  "status": "rejected",
  "rejectedBy": "...",
  "rejectedAt": "2026-05-21T12:00:00.000Z",
  "rejectionReason": "Revise entries"
}
```

**`activity.timer.started` / `activity.timer.stopped`**

```json
{
  "id": "...",
  "userId": "...",
  "projectId": "...",
  "assignmentId": "...",
  "workCategoryId": "...",
  "startedAt": "2026-05-21T10:00:00.000Z",
  "stoppedAt": null,
  "status": "running"
}
```

Draft entry create/update socket events are **not** wired yet.

Operational reporting lives in the Reports module — see [v2-reports.md](./v2-reports.md).

---

## Risks before Reports module

1. `taskId` is stored but not validated against a Tasks collection yet.
2. Retainer auto-monthly budgets still manual in Projects module.
3. Money-budget projects may need hour vs money consumption rules later.
4. Standalone Mongo lacks true multi-document transactions — fallback path is sequential.
5. Changing `PTS_V2_WEEK_START_DAY` does not migrate existing `pts_time_weeks` documents; old weeks keep their stored boundaries.

See [v2-projects.md](./v2-projects.md) and [v2-rbac.md](./v2-rbac.md).

# PTS API v2 — Reports Module

Module path: `src/v2/modules/reports/`  
Routes: `/api/v2/reports/*` (requires `PTS_V2_ENABLED=true`, Bearer token, and RBAC permissions)

---

## Purpose

Reports provides **read-only operational reporting** over existing Activity, Projects, Clients, and Users data.

- No new report collections — queries existing Mongo collections only.
- Aggregated summaries by default; entry rows are optional and paginated.
- Separate time entries remain separate sessions; reports aggregate totals only.

---

## Folder layout

```text
reports/
├── index.js
├── reports.routes.js
├── controllers/
├── services/
├── repositories/
├── models/index.js              # report-friendly indexes on existing collections
├── schemas/
├── validators/
├── dto/
├── helpers/
├── constants/
├── errors/
├── middleware/attachReportsUser.js
└── tests/
```

---

## Data sources

| Collection | Used for |
|------------|----------|
| `pts_time_entries` | Time totals, grouping, optional entry lists |
| `pts_time_weeks` | Weekly approval report (stored week boundaries) |
| `pts_projects` | Project/client scoping |
| `pts_project_stats` | Project capacity summary |
| `pts_clients` | Client summary |
| `pts_users` | User summary |

---

## Routes

All routes require `Authorization: Bearer <token>` and one of:

- `activity.view`
- `reports.view`
- `reports.manage`
- `activity.manage`

| Method | Path | Scope |
|--------|------|-------|
| GET | `/reports/users/:userId/time` | Own user, or any user if manager |
| GET | `/reports/team/time` | Managers only |
| GET | `/reports/projects/:projectId/time` | Managers only |
| GET | `/reports/clients/:clientId/time` | Managers only |
| GET | `/reports/approvals/weeks` | Own weeks, or all if manager |

---

## Query parameters (time reports)

| Param | Values | Notes |
|-------|--------|-------|
| `period` | `daily`, `weekly`, `bi_weekly`, `monthly`, `custom` | Default: `weekly` |
| `startDate` | ISO8601 | Required for `custom`; optional anchor for `daily`/`monthly` |
| `endDate` | ISO8601 | Required for `custom` |
| `status` | `draft`, `submitted`, `approved`, `rejected`, `all` | See status rules below |
| `projectId` | ObjectId | Optional filter |
| `clientId` | ObjectId | Optional filter (resolves client projects) |
| `workCategoryId` | ObjectId | Optional filter |
| `taskId` | ObjectId | Optional filter |
| `includeEntries` | `true`/`false` | Default `false` |
| `page`, `limit` | integers | Entry pagination when `includeEntries=true` (max limit 200) |

---

## Date range behavior

| Period | Window |
|--------|--------|
| `daily` | Single business day (`startDate` or today) in `PTS_V2_BUSINESS_TIMEZONE` |
| `weekly` | Current activity week via `getWeekBounds` and `PTS_V2_WEEK_START_DAY` |
| `bi_weekly` | 14-day window aligned to configured week start |
| `monthly` | Full business month |
| `custom` | Inclusive `startDate` → `endDate` on `entryDate` |

**Week approval report** uses stored `pts_time_weeks.weekStartDate` / `weekEndDate` — not recalculated from config.

Generic time reports filter on **`entryDate`**, not week document boundaries.

---

## Status filter behavior

| Caller | Default when `status` omitted |
|--------|-------------------------------|
| Manager (`reports.manage` or `activity.manage`) | `submitted`, `approved` |
| Self user | `draft`, `submitted`, `approved`, `rejected` |

Explicit `status=all` applies the role default above. Pass a single status to override.

---

## RBAC and self-scope

- **`reports.manage` or `activity.manage`** — team, project, client reports; any user's time report; all approval weeks.
- **Everyone else** — only `/users/:userId/time` for own `userId`; `/approvals/weeks` scoped to own weeks.
- Team/project/client routes return `403 REPORT_FORBIDDEN` for non-managers.

---

## Response shapes (summary)

### User time report

```json
{
  "user": { "id", "displayName", "email" },
  "dateRange": { "period", "startDate", "endDate", "weekStartDay", "timeZone" },
  "statusFilter": ["submitted", "approved"],
  "summary": { "totalMinutes", "totalHours", "totalEntries" },
  "groupedDays": [{ "date", "totalMinutes", "totalHours", "totalEntries" }],
  "groupedProjects": [{ "projectId", "totalMinutes", "totalHours", "totalEntries" }],
  "entries": { "items": [], "pagination": {} }
}
```

`entries` present only when `includeEntries=true`.

### Team time report

Same filters; adds `groupedUsers[]` with nested `days[]` and `projects[]` per user.

### Project time report

Adds `capacity` from `pts_project_stats` and `groupedUsers` / `groupedDays`.

### Client time report

`groupedProjects[]` with per-project totals under the client.

### Weekly approval report

```json
{
  "items": [{
    "weekId", "user", "weekStartDate", "weekEndDate", "status",
    "totalMinutes", "totalEntries", "submittedAt", "approvedAt", "rejectedAt"
  }],
  "total": 1
}
```

---

## Aggregation strategy

1. Build Mongo `$match` on `isDeleted: false`, date range, statuses, optional dimensions.
2. `$group` for summary totals (minutes + entry count).
3. Load lean entry rows only when grouping or `includeEntries=true`.
4. Client filter resolves project IDs first, then matches entries.
5. Report indexes added on existing `pts_time_entries`:
   - `{ userId, entryDate, status, isDeleted }`
   - `{ projectId, entryDate, status, isDeleted }`

No full collection scans; deleted records excluded.

---

## Error codes

| Code | Meaning |
|------|---------|
| `REPORT_INVALID_PERIOD` | Unknown `period` value |
| `REPORT_INVALID_DATE_RANGE` | Missing/invalid custom range |
| `REPORT_FORBIDDEN` | Self-scope or manager permission violation |
| `REPORT_USER_NOT_FOUND` | User id not found |
| `REPORT_PROJECT_NOT_FOUND` | Project id not found |
| `REPORT_CLIENT_NOT_FOUND` | Client id not found |

---

## Quick test (curl)

```bash
BASE=http://localhost:3001
TOKEN=$(curl -s -X POST "$BASE/api/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Password123"}' | jq -r '.data.access_token')

# Own weekly time (manager defaults to submitted+approved)
curl -s "$BASE/api/v2/reports/users/<userId>/time?period=weekly" \
  -H "Authorization: Bearer $TOKEN" | jq

# Team report (manager)
curl -s "$BASE/api/v2/reports/team/time?period=monthly&status=all" \
  -H "Authorization: Bearer $TOKEN" | jq

# Project report with entries page 1
curl -s "$BASE/api/v2/reports/projects/<projectId>/time?period=custom&startDate=2026-05-01&endDate=2026-05-31&includeEntries=true&page=1&limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq

# Weekly approvals
curl -s "$BASE/api/v2/reports/approvals/weeks?status=submitted" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Tests

```bash
node --test src/v2/modules/reports/tests/
```

Covers date ranges (daily/weekly/bi-weekly/monthly/custom), monday/sunday week config, status normalization, grouping, and `minutesToHours`.

---

## Risks before migration / frontend switch

1. Large entry payloads when `includeEntries=true` on wide date ranges — keep ranges narrow or paginate.
2. Client report runs one aggregate per project (N+1) — acceptable for moderate project counts; batch later if needed.
3. Bi-weekly alignment uses epoch-relative pairs — confirm payroll calendar with stakeholders before billing integration.
4. Employees lack `reports.view` by default — they use `activity.view` for own user report only.
5. No export/PDF/scheduled delivery yet — REST read API only.

See also [v2-activity.md](./v2-activity.md) and [v2-rbac.md](./v2-rbac.md).

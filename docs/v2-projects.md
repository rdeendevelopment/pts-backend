# PTS API v2 — Projects Module

Module path: `src/v2/modules/projects/`  
Routes: `/api/v2/projects/*` (requires `PTS_V2_ENABLED=true`, Bearer token, and RBAC permissions)

---

## Purpose

Projects manages **project identity, lifecycle, budgets, team assignments, files, stats, and audit events**.

- Every project belongs to one active client (`pts_clients`).
- Budget capacity lives in `pts_project_budgets` — not on the project document.
- Team membership and per-user hour allocation live in `pts_project_assignments`.
- Denormalized counters live in `pts_project_stats` for fast list/dashboard reads.
- Tasks and Activity are **separate modules** — not implemented here.

---

## Collections

| Collection | Purpose |
|------------|---------|
| `pts_projects` | Project identity, lifecycle, settings |
| `pts_project_budgets` | Source of truth for money/hour capacity |
| `pts_project_assignments` | Team membership + user hour allocation |
| `pts_project_files` | File metadata (URL-based, no storage integration yet) |
| `pts_project_events` | Audit log for important project actions |
| `pts_project_stats` | Denormalized counters (1:1 with project) |

**Not created:** `pts_project_user_allocations`, `pts_tasks`, `pts_time_entries`, `pts_active_timers`.

---

## Budget lifecycle

1. Only **`approved`** budgets add to `totalApprovedMinutes` / `totalApprovedAmount`.
2. **Pending** budgets (`draft`, `pending_client_approval`, `pending_admin_approval`) appear in pending totals only.
3. **Rejected/cancelled** budgets never count toward capacity.
4. **Consumed** budgets remain historical but do not add new capacity.
5. Project creation can include `initialBudget` — creates a budget row with `sourceType: initial`.
6. Initial budget auto-approves when project status is `active` and `settings.autoApproveInitialBudgetOnActivation` is true.
7. Budget type must match project type:
   - `fixed_budget` → money only
   - `fixed_hours` → hours only
   - `hybrid` → money, hours, or hybrid rows
   - `retainer` / `internal` → flexible

Status changes via `PATCH /projects/:projectId/budgets/:budgetId/status` emit `PROJECT_BUDGET_APPROVED` or `PROJECT_BUDGET_REJECTED` events.

---

## Assignment / hour allocation

1. Assignments are the source of truth for project membership.
2. `allocation.allocatedMinutes` is the user's assigned hours (minutes).
3. `stats.consumedMinutes` is updated later by the Activity module (TODO).
4. `stats.remainingMinutes = allocatedMinutes - consumedMinutes`.
5. Available project hours to assign:
   `totalApprovedMinutes - totalAssignedMinutes`
6. On assignment update, current allocation is added back before validation:
   `available = totalApproved - totalAssigned + currentAllocation`
7. If requested allocation exceeds available and `project.allowBudgetExceed` is false → `PROJECT_ASSIGNMENT_EXCEEDS_AVAILABLE_HOURS`.
8. `viewer` role defaults `canLogTime: false`.

---

## Stats calculation

Created automatically when a project is created. Recalculated after:

- Budget create / update / approve / reject / delete
- Assignment create / update / remove
- File add / remove

| Field | Source |
|-------|--------|
| `totalApprovedMinutes/Amount` | Sum of approved budgets |
| `totalPendingMinutes/Amount` | Sum of pending budgets |
| `totalAssignedMinutes` | Sum of active assignment allocations |
| `totalConsumedMinutes` | Sum of assignment consumed minutes (Activity TODO) |
| `totalRemainingMinutes` | `totalApprovedMinutes - totalConsumedMinutes` |
| `totalAvailableToAssignMinutes` | `totalApprovedMinutes - totalAssignedMinutes` |
| `totalMembers` | Active assignments count |
| `totalBudgets`, `totalFiles` | Non-deleted row counts |

---

## Routes

All routes require Bearer authentication.

### Projects

| Method | Path | Permission |
|--------|------|------------|
| GET | `/projects` | `projects.view` or `projects.manage` |
| GET | `/projects/:id` | `projects.view` or `projects.manage` |
| POST | `/projects` | `projects.manage` |
| PATCH | `/projects/:id` | `projects.manage` |
| PATCH | `/projects/:id/status` | `projects.manage` |
| DELETE | `/projects/:id` | `projects.manage` |

### Budgets

| Method | Path | Permission |
|--------|------|------------|
| GET | `/projects/:projectId/budgets` | `budgets.view` or `budgets.manage` |
| POST | `/projects/:projectId/budgets` | `budgets.manage` |
| PATCH | `/projects/:projectId/budgets/:budgetId` | `budgets.manage` |
| PATCH | `/projects/:projectId/budgets/:budgetId/status` | `budgets.manage` |
| DELETE | `/projects/:projectId/budgets/:budgetId` | `budgets.manage` |

### Assignments

| Method | Path | Permission |
|--------|------|------------|
| GET | `/projects/:projectId/assignments` | `assignments.view` or `assignments.manage` |
| POST | `/projects/:projectId/assignments` | `assignments.manage` |
| PATCH | `/projects/:projectId/assignments/:assignmentId` | `assignments.manage` |
| DELETE | `/projects/:projectId/assignments/:assignmentId` | `assignments.manage` |

### Files, stats, events

| Method | Path | Permission |
|--------|------|------------|
| GET | `/projects/:projectId/files` | `projects.manage` |
| POST | `/projects/:projectId/files` | `projects.manage` |
| DELETE | `/projects/:projectId/files/:fileId` | `projects.manage` |
| GET | `/projects/:projectId/stats` | `projects.view` or `projects.manage` |
| GET | `/projects/:projectId/events` | `projects.view` or `projects.manage` |

---

## Create project payload

```json
{
  "name": "Website Redesign",
  "clientId": "<clientObjectId>",
  "description": "Q2 delivery",
  "type": "fixed_hours",
  "status": "draft",
  "priority": "high",
  "startDate": "2026-06-01",
  "dueDate": "2026-09-01",
  "billingType": "billable",
  "currency": "USD",
  "allowBudgetExceed": false,
  "settings": {
    "requireBudgetForTime": true,
    "autoApproveInitialBudgetOnActivation": true
  },
  "tags": ["enterprise"],
  "initialBudget": {
    "title": "Initial estimate",
    "budgetType": "hours",
    "requestedMinutes": 4800,
    "approvedMinutes": 4800,
    "adminApprovalRequired": true
  }
}
```

---

## Error codes

| Code | When |
|------|------|
| `PROJECT_NOT_FOUND` | Project missing or soft-deleted |
| `PROJECT_CLIENT_NOT_FOUND` | Client missing or not active |
| `PROJECT_NAME_ALREADY_EXISTS` | Duplicate name for same client |
| `PROJECT_CODE_ALREADY_EXISTS` | Duplicate project code |
| `PROJECT_INVALID_STATUS` | Invalid status value |
| `PROJECT_INVALID_TYPE` | Invalid project type |
| `PROJECT_INVALID_BILLING_TYPE` | Invalid billing type |
| `PROJECT_INVALID_DATE_RANGE` | `dueDate` before `startDate` |
| `PROJECT_TYPE_REQUIREMENTS_FAILED` | Budget type incompatible with project type |
| `PROJECT_BUDGET_NOT_FOUND` | Budget missing |
| `PROJECT_BUDGET_INVALID_STATUS` | Invalid budget status transition/value |
| `PROJECT_ASSIGNMENT_NOT_FOUND` | Assignment missing |
| `PROJECT_USER_NOT_FOUND` | User missing for assignment |
| `PROJECT_USER_ALREADY_ASSIGNED` | Duplicate project/user assignment |
| `PROJECT_ASSIGNMENT_EXCEEDS_AVAILABLE_HOURS` | Allocation exceeds available approved hours |
| `PROJECT_FILE_NOT_FOUND` | File missing |
| `PROJECT_HAS_ACTIVE_ACTIVITY` | Delete blocked (Activity module TODO) |

---

## Quick test (curl)

```bash
BASE=http://localhost:3001

TOKEN=$(curl -s -X POST "$BASE/api/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Password123"}' | jq -r '.data.access_token')

# Create client first if needed
CLIENT_ID=$(curl -s "$BASE/api/v2/clients?limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data.items[0].id')

# Create project with initial budget
PROJECT=$(curl -s -X POST "$BASE/api/v2/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"Website Redesign\",
    \"clientId\": \"$CLIENT_ID\",
    \"type\": \"fixed_hours\",
    \"initialBudget\": {
      \"title\": \"Initial estimate\",
      \"budgetType\": \"hours\",
      \"requestedMinutes\": 4800
    }
  }")

echo "$PROJECT" | jq
PROJECT_ID=$(echo "$PROJECT" | jq -r '.data.id')

curl -s "$BASE/api/v2/projects/$PROJECT_ID/stats" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/api/v2/projects/$PROJECT_ID/budgets" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/api/v2/projects/$PROJECT_ID/events" -H "Authorization: Bearer $TOKEN" | jq
```

---

## Integration points (future modules)

| Module | Integration |
|--------|-------------|
| **Activity** | Update `assignment.stats.consumedMinutes`, `pts_project_stats.totalConsumedMinutes`, `lastActivityAt`; implement `projectHasActiveActivity()` delete guard |
| **Tasks** | Reference `projectId`; optional `taskId` on entries/timers — validation deferred until Tasks module |
| **Clients** | `clientHasActiveProjects()` wired — blocks client delete when draft/active/on_hold projects exist |

---

## Risks before Activity/Tasks

1. **Consumed minutes stay at zero** until Activity module writes time entries.
2. **Delete guard** (`PROJECT_HAS_ACTIVE_ACTIVITY`) is stubbed — projects can be deleted while timers may exist later.
3. **Budget consumed status** is driven by week submit/reject via Activity module.
4. **Retainer monthly budgets** are supported as budget rows but no scheduler creates them automatically.
5. **File URLs** are metadata only — no upload/storage service integrated.

Activity module (`src/v2/modules/activity/`) now handles time weeks, entries, timers, and counter consumption — see [v2-activity.md](./v2-activity.md).

See [v2 engineering standards](./v2-engineering-standards.md) and [v2-rbac.md](./v2-rbac.md).

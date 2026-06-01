# PTS API v2 — RBAC Module

Module path: `src/v2/modules/rbac/`  
Routes: `/api/v2/rbac/*` (requires `PTS_V2_ENABLED=true`, Bearer token, and RBAC permissions)

---

## Folder layout

```text
rbac/
├── index.js
├── rbac.routes.js
├── constants/rbac.constants.js
├── controllers/rbac.controller.js
├── dto/
├── errors/rbacErrorCodes.js
├── helpers/
├── middleware/
│   ├── authorize.js
│   └── requireSuperAdmin.js
├── models/
├── repositories/
├── services/
├── validators/rbac.validators.js
└── tests/
```

---

## Purpose

RBAC defines **roles**, **permissions**, and **account role assignments** for v2.

- Permissions use the format `<module_key>.<action>` (e.g. `modules.view`, `projects.manage`).
- Roles group permissions (`super_admin`, `admin`, `manager`, `employee`).
- Account assignments link Auth accounts to roles via `accountId` (Users module not required yet).

Permissions are **not stored in JWT**. They are loaded from MongoDB on `/auth/me` and on each `authorize()` check.

---

## Collections

| Collection | Purpose |
|------------|---------|
| `pts_permissions` | Permission definitions linked to `pts_modules` |
| `pts_roles` | Role definitions |
| `pts_role_permissions` | Role → permission links |
| `pts_account_roles` | Account → role assignments |

---

## Default seed

Runs after Module Management seed on bootstrap:

1. Creates/updates 22 system permissions (view/manage pairs + `auth.me`).
2. Creates/updates 4 system roles.
3. Links role permissions:
   - **super_admin** — all permissions
   - **admin** — all except `category: system` (excludes `auth.me`)
   - **manager** — delivery modules (projects, assignments, budgets, activity, tasks, reports) + `auth.me`, `modules.view`
   - **employee** — `auth.me`, `projects.view`, `activity.view`, `tasks.view`, `converse.view`
4. Assigns `super_admin` role to the first active `accountType: super_admin` account if missing.

Custom roles and permissions are never deleted by seed.

---

## Routes

All routes require `Authorization: Bearer <token>`.

| Method | Path | Permission |
|--------|------|------------|
| GET | `/rbac/roles` | `rbac.view` or `rbac.manage` |
| GET | `/rbac/roles/:id` | `rbac.view` or `rbac.manage` |
| POST | `/rbac/roles` | `rbac.manage` |
| PATCH | `/rbac/roles/:id` | `rbac.manage` |
| DELETE | `/rbac/roles/:id` | `rbac.manage` |
| GET | `/rbac/permissions` | `rbac.view` or `rbac.manage` |
| GET | `/rbac/accounts/:accountId/roles` | `rbac.view` or `rbac.manage` |
| POST | `/rbac/accounts/:accountId/roles` | `rbac.manage` |
| DELETE | `/rbac/accounts/:accountId/roles/:roleId` | `rbac.manage` |

---

## Middleware

### `authorize(requiredPermissions, { mode })`

- `mode: 'all'` (default) — account must have every listed permission.
- `mode: 'any'` — account must have at least one listed permission.

Used on RBAC routes and Module Management routes.

### `requireSuperAdmin`

Checks `req.v2Auth.account.accountType === 'super_admin'`. Exported for bootstrap/emergency use; RBAC routes use `authorize` instead.

---

## Auth integration

Login, refresh, and `/auth/me` now return:

```json
{
  "roles": [{ "id": "...", "key": "super_admin", "name": "Super Admin" }],
  "permissions": ["auth.me", "modules.view", "modules.manage", "rbac.view", "..."],
  "modules": [{ "id": "...", "key": "auth", "name": "Auth", "status": "active" }]
}
```

- **permissions** — active permission keys from assigned active roles.
- **roles** — active assigned roles.
- **modules** — active `pts_modules` rows whose keys appear in permission keys.

JWT payload stays small (`sub`, `type`, `accountType` only).

---

## Module Management enforcement

| Action | Required permission |
|--------|---------------------|
| GET `/modules`, GET `/modules/:id` | `modules.view` or `modules.manage` |
| POST/PATCH/DELETE `/modules` | `modules.manage` |

---

## Error codes

| Code | When |
|------|------|
| `RBAC_ROLE_NOT_FOUND` | Role or account context not found |
| `RBAC_PERMISSION_NOT_FOUND` | Permission not found |
| `RBAC_ROLE_KEY_ALREADY_EXISTS` | Duplicate role key |
| `RBAC_PERMISSION_ALREADY_EXISTS` | Duplicate permission key |
| `RBAC_SYSTEM_ROLE_DELETE_BLOCKED` | DELETE on system role |
| `RBAC_SYSTEM_PERMISSION_DELETE_BLOCKED` | DELETE on system permission |
| `RBAC_ACCOUNT_ROLE_ALREADY_EXISTS` | Role already assigned |
| `RBAC_ACCOUNT_ROLE_NOT_FOUND` | Assignment not found |
| `RBAC_FORBIDDEN` | Missing required permission |
| `RBAC_INVALID_ROLE_KEY` | Invalid role key format |
| `RBAC_INVALID_PERMISSION_KEY` | Invalid permission key format |

---

## Quick test

```bash
BASE=http://localhost:3001

# Login as super_admin account (must have super_admin role assigned by seed)
TOKEN=$(curl -s -X POST "$BASE/api/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Password123"}' | jq -r '.data.access_token')

curl -s "$BASE/api/v2/auth/me" -H "Authorization: Bearer $TOKEN" | jq '.data.roles, .data.permissions'

curl -s "$BASE/api/v2/rbac/roles" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/api/v2/rbac/permissions" -H "Authorization: Bearer $TOKEN" | jq

# Assign employee role to an account
curl -s -X POST "$BASE/api/v2/rbac/accounts/<accountId>/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"roleId":"<employeeRoleId>"}' | jq
```

**First-time setup:** ensure at least one account has `accountType: super_admin` in MongoDB so bootstrap auto-assigns the `super_admin` role.

User business profiles live in the Users module (`pts_users`) and are separate from role assignments. See [v2-users.md](./v2-users.md).

Client records live in the Clients module (`pts_clients`). Permissions `clients.view` and `clients.manage` are seeded by default — see [v2-clients.md](./v2-clients.md).

Projects, budgets, and assignments are implemented in the Projects module (`src/v2/modules/projects/`). Permissions `projects.view`, `projects.manage`, `budgets.view`, `budgets.manage`, `assignments.view`, and `assignments.manage` are seeded by default — see [v2-projects.md](./v2-projects.md).

Activity/time tracking lives in the Activity module (`src/v2/modules/activity/`). Permissions `activity.view` and `activity.manage` are seeded by default — see [v2-activity.md](./v2-activity.md).

Tasks (Phase 1 clone) lives in `src/v2/modules/tasks/` at `/api/v2/tasks/*`. Permissions `tasks.view` and `tasks.manage` are seeded — see [v2-tasks.md](./v2-tasks.md).

Reports module (`src/v2/modules/reports/`) at `/api/v2/reports/*` uses:

| Permission | Typical role | Reports access |
|------------|--------------|----------------|
| `reports.view` | manager | Read team/project/client reports |
| `reports.manage` | manager | Same as view plus manager scope checks |
| `activity.view` | employee | Own user time report and own approval weeks only |
| `activity.manage` | manager | Full manager report scope |

Default status filters differ by scope — see [v2-reports.md](./v2-reports.md).

See [v2 engineering standards](./v2-engineering-standards.md).

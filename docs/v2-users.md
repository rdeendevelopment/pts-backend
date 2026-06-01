# PTS API v2 — Users Module

Module path: `src/v2/modules/users/`  
Routes: `/api/v2/users/*` (requires `PTS_V2_ENABLED=true`, Bearer token, and RBAC permissions)

---

## Folder layout

```text
users/
├── index.js
├── users.routes.js
├── constants/users.constants.js
├── controllers/user.controller.js
├── dto/user.dto.js
├── errors/userErrorCodes.js
├── helpers/
├── models/user.model.js
├── repositories/user.repository.js
├── schemas/
├── services/user.service.js
├── validators/user.validators.js
└── tests/
```

---

## Purpose

Users manages **employee/admin business profiles** (`pts_users`).

- **`pts_accounts`** — login identity (Auth module)
- **`pts_users`** — business profile linked 1:1 to an account

Passwords stay in Auth only. RBAC stays in the RBAC module.

---

## Collection: `pts_users`

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Primary key |
| `accountId` | ObjectId | Unique (partial: `isDeleted: false`), ref `pts_accounts` |
| `firstName`, `lastName` | string | Required on create |
| `displayName` | string | Auto-generated from name if omitted |
| `email` | string | Synced with account email |
| `phone`, `avatarUrl` | string | Optional |
| `jobTitle`, `department` | string | Optional |
| `employmentType` | enum | `full_time`, `part_time`, `contractor`, `intern` |
| `status` | enum | `active`, `inactive`, `suspended`, `pending` |
| `managerId` | ObjectId | Optional ref to another `pts_users` row |
| `joiningDate` | date | Optional |
| `timezone` | string | Default `UTC` |
| `notes` | string | Internal admin note |
| soft-delete + timestamps | | Standard v2 fields |

**Indexes:** unique `accountId`, `email`, `status`, `managerId`, `department`, `createdAt`

---

## Routes

| Method | Path | Permission |
|--------|------|------------|
| GET | `/users` | `users.view` or `users.manage` |
| GET | `/users/:id` | `users.view` or `users.manage` |
| POST | `/users` | `users.manage` |
| PATCH | `/users/:id` | `users.manage` |
| PATCH | `/users/:id/status` | `users.manage` |
| DELETE | `/users/:id` | `users.manage` |
| GET | `/users/me/profile` | Authenticated account only |

### List filters

- `search` — name or email
- `status`, `department`, `employmentType`, `managerId`
- Cursor pagination: `cursor`, `limit` (default 20, max 100)

### Delete

- Soft-deletes user profile only (account is set to `inactive`, not hard deleted)
- Blocked when active direct reports exist unless `?force=true` (requires `users.manage`)
- With `force=true`, direct reports have `managerId` cleared

### Create

- **Without `accountId`:** creates `pts_accounts` + profile (requires `email`, `password`, `firstName`, `lastName`)
- **With `accountId`:** links existing account (must not already have a profile)

Status updates on `PATCH /users/:id/status` sync both `pts_users.status` and `pts_accounts.status`.

---

## Auth integration

`/auth/me`, login, and refresh include:

```json
"user": {
  "id": "...",
  "display_name": "Ada Lovelace",
  "email": "ada@example.com",
  "job_title": "Engineer",
  "department": "Delivery",
  "status": "active"
}
```

`user` is `null` when no profile exists for the account. Roles and permissions behavior is unchanged.

---

## Error codes

| Code | When |
|------|------|
| `USER_NOT_FOUND` | Invalid user id |
| `USER_ACCOUNT_NOT_FOUND` | Linked account missing |
| `USER_ACCOUNT_ALREADY_LINKED` | Account already has a profile |
| `USER_EMAIL_ALREADY_EXISTS` | Duplicate email |
| `USER_MANAGER_NOT_FOUND` | Invalid/inactive manager |
| `USER_SELF_MANAGER_NOT_ALLOWED` | `managerId` equals own id |
| `USER_HAS_DIRECT_REPORTS` | Delete blocked by active reports |
| `USER_INVALID_STATUS` | Bad status or employment type |
| `USER_PROFILE_NOT_FOUND` | No profile for `/users/me/profile` |

---

## Quick test

```bash
BASE=http://localhost:3001

TOKEN=$(curl -s -X POST "$BASE/api/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin>","password":"<password>"}' | jq -r '.data.access_token')

curl -s "$BASE/api/v2/users?limit=10" -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/api/v2/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "firstName":"Ada",
    "lastName":"Lovelace",
    "email":"ada@example.com",
    "password":"Password123",
    "department":"Engineering",
    "jobTitle":"Developer"
  }' | jq

curl -s "$BASE/api/v2/users/me/profile" -H "Authorization: Bearer $TOKEN" | jq
curl -s "$BASE/api/v2/auth/me" -H "Authorization: Bearer $TOKEN" | jq '.data.user'
```

See [v2 engineering standards](./v2-engineering-standards.md).

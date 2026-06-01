# PTS API v2 — Module Management

Module path: `src/v2/modules/modules/`  
Routes: `/api/v2/modules/*` (requires `PTS_V2_ENABLED=true` and Bearer token)

---

## Folder layout

```text
modules/
├── index.js
├── modules.routes.js
├── constants/module.constants.js
├── controllers/
├── dto/
├── errors/
├── helpers/defaultModules.helper.js
├── models/
│   ├── module.model.js
│   └── index.js
├── repositories/
├── services/
├── validators/
└── tests/
```

---

## Purpose

Registry of platform product modules (projects, tasks, reports, etc.).

- Controls which modules **exist** and their **global status** (`active`, `inactive`, `deprecated`).
- Per-account access is enforced by Module 3 (RBAC) via `modules.view` / `modules.manage`.

---

## Auth integration

Session responses derive **`modules`** from permission keys (not all active system modules).

Example for a super_admin account:

```json
"roles": [{ "id": "...", "key": "super_admin", "name": "Super Admin" }],
"permissions": ["auth.me", "modules.view", "modules.manage", "rbac.view", "..."],
"modules": [
  { "id": "...", "key": "auth", "name": "Auth", "status": "active" },
  { "id": "...", "key": "modules", "name": "Modules", "status": "active" }
]
```

See [v2-rbac.md](./v2-rbac.md) for permission keys.

---

## Routes

All routes require `Authorization: Bearer <access_token>` and RBAC permissions.

| Method | Path | Permission |
|--------|------|------------|
| GET | `/modules` | `modules.view` or `modules.manage` |
| GET | `/modules/:id` | `modules.view` or `modules.manage` |
| POST | `/modules` | `modules.manage` |
| PATCH | `/modules/:id` | `modules.manage` |
| DELETE | `/modules/:id` | `modules.manage` |

---

## Seed behavior

Runs on v2 bootstrap after Mongo is ready:

1. Creates missing system modules from the default catalog (12 modules).
2. Updates `name`, `description`, `category`, `sortOrder`, `status`, `routeBase` on existing **system** modules.
3. Never deletes custom modules.
4. Idempotent — safe on every deploy.

Default active modules after seed: `auth`, `modules`.  
Others start as `inactive` until their feature module ships.

---

## Error codes

| Code | When |
|------|------|
| `MODULE_NOT_FOUND` | Invalid or deleted id |
| `MODULE_KEY_ALREADY_EXISTS` | Duplicate key on create |
| `MODULE_SYSTEM_DELETE_BLOCKED` | DELETE on system module |
| `MODULE_INVALID_KEY` | Key not lowercase snake_case |
| `MODULE_INVALID_STATUS` | Bad status enum |
| `MODULE_INVALID_CATEGORY` | Bad category enum |

See [v2 engineering standards](./v2-engineering-standards.md).

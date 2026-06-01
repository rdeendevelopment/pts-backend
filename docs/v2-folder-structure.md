# PTS API v2 — Folder Structure

Phase 0 foundation for the greenfield modular API mounted at `/api/v2`.

**Engineering standards (required reading):** [v2-engineering-standards.md](./v2-engineering-standards.md)

Legacy code under `src/app/` and `src/routes/` is **not modified** by v2 work except the single mount in `server.js`.

---

## Top-level layout

```text
project-tracking-system-api/
├── .eslintrc.cjs                 # v2 cannot import legacy src/app
├── config/
│   ├── constants.js              # legacy app config (shared Mongo URI)
│   └── mongo.js                  # shared Mongo connection
├── docs/
│   ├── v2-api-architecture-blueprint.md
│   ├── v2-folder-structure.md    # this file
│   └── projects-module-architecture-report.md
├── server.js                     # mounts app.use('/api/v2', v2Api.router)
└── src/
    └── v2/
        ├── index.js                # v2 router + exports bootstrap
        ├── bootstrap.js            # startup flow (mongo ready, env checks)
        ├── config/
        │   └── env.js              # development | staging | production
        ├── routes/
        │   └── health.routes.js    # GET /api/v2/health
        ├── kernel/                 # shared infrastructure (all modules use this)
        │   ├── index.js
        │   ├── errors/
        │   │   ├── AppError.js
        │   │   ├── errorCodes.js
        │   │   └── index.js
        │   ├── responses/
        │   │   ├── success.js
        │   │   ├── error.js
        │   │   └── index.js
        │   ├── middleware/
        │   │   ├── requestId.js
        │   │   ├── requestLogger.js
        │   │   ├── asyncHandler.js
        │   │   ├── errorHandler.js
        │   │   └── index.js
        │   ├── logger/
        │   │   └── index.js
        │   ├── validators/
        │   │   ├── objectId.js
        │   │   ├── validateRequest.js
        │   │   └── index.js
        │   └── utils/
        │       └── index.js
        └── modules/
            ├── auth/
            ├── modules/
            ├── rbac/
            ├── users/
            ├── clients/
            ├── projects/
            ├── activity/
            ├── tasks/
            └── socket/               # global v2 realtime (namespace /v2)
```

### Auth module (`src/v2/modules/auth/`)

```text
auth/
├── index.js
├── auth.routes.js
├── constants/auth.constants.js
├── controllers/
├── dto/
├── errors/
├── middleware/authenticate.js
├── models/
│   ├── account.model.js
│   ├── refreshToken.model.js
│   └── index.js
├── repositories/
├── services/
├── validators/
└── tests/
```

### Module Management (`src/v2/modules/modules/`)

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

### RBAC (`src/v2/modules/rbac/`)

```text
rbac/
├── index.js
├── rbac.routes.js
├── constants/rbac.constants.js
├── controllers/
├── dto/
├── errors/
├── helpers/
├── middleware/
│   ├── authorize.js
│   └── requireSuperAdmin.js
├── models/
├── repositories/
├── services/
├── validators/
└── tests/
```

### Users (`src/v2/modules/users/`)

```text
users/
├── index.js
├── users.routes.js
├── constants/users.constants.js
├── controllers/
├── dto/
├── errors/
├── helpers/
├── models/
├── repositories/
├── services/
├── validators/
└── tests/
```

### Clients (`src/v2/modules/clients/`)

```text
clients/
├── index.js
├── clients.routes.js
├── constants/clients.constants.js
├── controllers/
├── dto/
├── errors/
├── helpers/
├── models/
├── repositories/
├── services/
├── validators/
└── tests/
```

### Projects (`src/v2/modules/projects/`)

```text
projects/
├── index.js
├── projects.routes.js
├── constants/project.constants.js
├── controllers/
│   ├── project.controller.js
│   ├── projectBudget.controller.js
│   ├── projectAssignment.controller.js
│   ├── projectFile.controller.js
│   ├── projectStats.controller.js
│   └── projectEvent.controller.js
├── dto/
├── errors/
├── helpers/
├── models/
├── repositories/
├── services/
├── validators/
└── tests/
```

### Example reference (`src/v2/modules/example/`)

```text
example/
├── index.js
├── example.routes.js
├── controllers/
├── services/
├── repositories/
├── models/
├── schemas/
├── validators/
├── dto/
├── helpers/
├── constants/
├── errors/
└── tests/
```

---

## Module layout (required for every v2 module)

When adding `auth`, `users`, `projects`, etc., copy this shape:

```text
src/v2/modules/<module-name>/
├── index.js
├── <module-name>.routes.js
├── controllers/
├── services/
├── repositories/
├── models/
├── schemas/
├── validators/
├── dto/
├── helpers/
├── constants/
├── errors/
└── tests/
```

Optional: `middleware/` when the module exposes HTTP middleware other modules reuse (e.g. `auth`).

**Dependency rule:** modules import `src/v2/kernel/*` and earlier modules only.  
**Forbidden:** any import from `src/app/**`.

---

## Request lifecycle (v2 only)

```text
HTTP /api/v2/*
  → requestId middleware
  → requestLogger middleware
  → module routes
  → asyncHandler-wrapped controller
  → service → repository
  → sendSuccess(res, data)
  → on error: AppError → v2 errorHandler → sendError(res, ...)
```

---

## Environment variables (v2)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | `development` \| `staging` \| `production` |
| `PTS_V2_ENABLED` | `true` | When `false`, only `GET /api/v2/health` responds (disabled status). Business routes are not mounted. |
| `PTS_V2_LOG_LEVEL` | env-based | Winston level: `debug` (dev), `info` (prod) |
| `PTS_V2_ACCESS_TOKEN_TTL` | `15m` | JWT access token lifetime |
| `PTS_V2_REFRESH_TOKEN_DAYS` | `30` | Refresh token expiry in days |
| `PTS_V2_JWT_SECRET` | `APP_SECRET` | JWT signing secret (required in production) |
| `PTS_V2_BCRYPT_ROUNDS` | `12` | bcrypt cost factor |
| `PTS_V2_ALLOW_PUBLIC_REGISTER` | dev: allowed | Public `/auth/register`; off in staging/production unless `true` |
| `MONGO_URI` | from config.yaml | Shared Mongo connection with legacy API |

---

## NPM scripts

| Script | Command |
|--------|---------|
| `npm run lint:v2` | ESLint on `src/v2/**/*.js` |
| `npm run test:v2` | Node built-in test runner for v2 tests |

---

## Phase 0 endpoints

| Method | Path | `PTS_V2_ENABLED=true` | `PTS_V2_ENABLED=false` |
|--------|------|------------------------|-------------------------|
| GET | `/api/v2/health` | `200 ok` or `503 degraded` | `503 disabled` |
| GET | `/api/v2/*` (other, no auth module match) | `404 NOT_FOUND` | `503 SERVICE_DISABLED` |

## Module 1: Auth endpoints (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v2/auth/register` | Public (dev guard applies) |
| POST | `/api/v2/auth/login` | Public |
| POST | `/api/v2/auth/refresh` | Public |
| POST | `/api/v2/auth/logout` | Public |
| GET | `/api/v2/auth/me` | Bearer |

Auth details: [v2-auth.md](./v2-auth.md)

## Module 2: Module Management (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/modules` | Bearer + `modules.view` or `modules.manage` |
| GET | `/api/v2/modules/:id` | Bearer + `modules.view` or `modules.manage` |
| POST | `/api/v2/modules` | Bearer + `modules.manage` |
| PATCH | `/api/v2/modules/:id` | Bearer + `modules.manage` |
| DELETE | `/api/v2/modules/:id` | Bearer + `modules.manage` |

Module details: [v2-modules.md](./v2-modules.md)

## Module 3: RBAC (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/rbac/roles` | Bearer + `rbac.view` or `rbac.manage` |
| GET | `/api/v2/rbac/roles/:id` | Bearer + `rbac.view` or `rbac.manage` |
| POST | `/api/v2/rbac/roles` | Bearer + `rbac.manage` |
| PATCH | `/api/v2/rbac/roles/:id` | Bearer + `rbac.manage` |
| DELETE | `/api/v2/rbac/roles/:id` | Bearer + `rbac.manage` |
| GET | `/api/v2/rbac/permissions` | Bearer + `rbac.view` or `rbac.manage` |
| GET | `/api/v2/rbac/accounts/:accountId/roles` | Bearer + `rbac.view` or `rbac.manage` |
| POST | `/api/v2/rbac/accounts/:accountId/roles` | Bearer + `rbac.manage` |
| DELETE | `/api/v2/rbac/accounts/:accountId/roles/:roleId` | Bearer + `rbac.manage` |

RBAC details: [v2-rbac.md](./v2-rbac.md)

## Module 4: Users (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/users` | Bearer + `users.view` or `users.manage` |
| GET | `/api/v2/users/:id` | Bearer + `users.view` or `users.manage` |
| POST | `/api/v2/users` | Bearer + `users.manage` |
| PATCH | `/api/v2/users/:id` | Bearer + `users.manage` |
| PATCH | `/api/v2/users/:id/status` | Bearer + `users.manage` |
| DELETE | `/api/v2/users/:id` | Bearer + `users.manage` |
| GET | `/api/v2/users/me/profile` | Bearer (own account) |

Users details: [v2-users.md](./v2-users.md)

## Module 5: Clients (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/clients` | Bearer + `clients.view` or `clients.manage` |
| GET | `/api/v2/clients/:id` | Bearer + `clients.view` or `clients.manage` |
| POST | `/api/v2/clients` | Bearer + `clients.manage` |
| PATCH | `/api/v2/clients/:id` | Bearer + `clients.manage` |
| PATCH | `/api/v2/clients/:id/status` | Bearer + `clients.manage` |
| DELETE | `/api/v2/clients/:id` | Bearer + `clients.manage` |

Clients details: [v2-clients.md](./v2-clients.md)

## Module 6: Projects (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/projects` | Bearer + `projects.view` or `projects.manage` |
| GET | `/api/v2/projects/:id` | Bearer + `projects.view` or `projects.manage` |
| POST | `/api/v2/projects` | Bearer + `projects.manage` |
| PATCH | `/api/v2/projects/:id` | Bearer + `projects.manage` |
| PATCH | `/api/v2/projects/:id/status` | Bearer + `projects.manage` |
| DELETE | `/api/v2/projects/:id` | Bearer + `projects.manage` |
| GET/POST/PATCH/DELETE | `/api/v2/projects/:projectId/budgets/*` | Bearer + `budgets.view`/`budgets.manage` |
| GET/POST/PATCH/DELETE | `/api/v2/projects/:projectId/assignments/*` | Bearer + `assignments.view`/`assignments.manage` |
| GET/POST/DELETE | `/api/v2/projects/:projectId/files/*` | Bearer + `projects.manage` |
| GET | `/api/v2/projects/:projectId/stats` | Bearer + `projects.view` or `projects.manage` |
| GET | `/api/v2/projects/:projectId/events` | Bearer + `projects.view` or `projects.manage` |

Projects details: [v2-projects.md](./v2-projects.md)

## Module 7: Activity (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/api/v2/activity/weeks/*` | Bearer + `activity.view` or `activity.manage` |
| POST | `/api/v2/activity/weeks/:id/approve|reject` | Bearer + `activity.manage` |
| GET/POST/PATCH/DELETE | `/api/v2/activity/time-entries/*` | Bearer + activity permissions |
| POST | `/api/v2/activity/validate-time-entry` | Bearer + activity permissions |
| POST/GET | `/api/v2/activity/timers/*` | Bearer + activity permissions |
| GET | `/api/v2/activity/work-categories` | Bearer + activity permissions |

Activity details: [v2-activity.md](./v2-activity.md)

## Module 8: Tasks (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/tasks/projects/:projectId/board` | Bearer + `tasks.view` or `tasks.manage` |
| GET/POST | `/api/v2/tasks/projects/:projectId/*` | Bearer + task permissions |
| GET/PATCH/POST | `/api/v2/tasks/tasks/:taskId/*` | Bearer + task permissions |

Tasks details: [v2-tasks.md](./v2-tasks.md)

## Module 9: Socket / Realtime (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/socket/health` | Bearer (authenticated) |
| GET | `/api/v2/socket/presence` | Bearer + `rbac.manage` or `modules.manage` |

Socket.IO namespace: `/v2` (initialized from `server.js` after legacy `initSocket`)

```text
socket/
├── index.js                      # exports routes + public emit helpers
├── socket.routes.js
├── constants/socket.constants.js
├── controllers/socket.controller.js
├── services/
│   ├── socket.service.js         # public emit API for other modules
│   ├── socketServer.service.js   # namespace lifecycle + connection handlers
│   ├── socketRoomAccess.service.js
│   └── presence.service.js
├── helpers/
│   ├── socketAuth.helper.js
│   └── socketRooms.helper.js
├── errors/socketErrorCodes.js
└── tests/
```

Socket details: [v2-socket.md](./v2-socket.md)

## Module 10: Reports (`PTS_V2_ENABLED=true`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/reports/users/:userId/time` | Bearer + `activity.view` or `reports.view`/`manage` |
| GET | `/api/v2/reports/team/time` | Bearer + manager scope (`reports.manage` or `activity.manage`) |
| GET | `/api/v2/reports/projects/:projectId/time` | Bearer + manager scope |
| GET | `/api/v2/reports/clients/:clientId/time` | Bearer + manager scope |
| GET | `/api/v2/reports/approvals/weeks` | Bearer + activity/reports view; self or manager scope |

Reports details: [v2-reports.md](./v2-reports.md)

## Migration (Phase 1 — foundation + seed CLI)

Legacy → v2 database migration tooling lives under `src/v2/migration/`.

- Plan: [v2-migration-plan.md](./v2-migration-plan.md)
- CLI: [v2-migration.md](./v2-migration.md)
- Seed: [v2-seed.md](./v2-seed.md)

Reference module layout lives at `src/v2/modules/example/` but is **not mounted**.

---

## Bootstrap behavior

- Uses the **shared** legacy Mongo singleton from `config/mongo.js`.
- If mongoose is already connected (`readyState === 1`), bootstrap **reuses** it and does not open a second connection.
- If not connected yet, bootstrap calls `connectMongo()` once (same path legacy uses).
- When `PTS_V2_ENABLED=false`, bootstrap marks v2 as disabled and skips business-route readiness; health still reports Mongo status from the global connection when available.
- Runs auth indexes, module seed, RBAC seed, user indexes, client indexes, project indexes, then activity indexes + work category seed.

---

## Route mounting

```javascript
// src/v2/index.js
router.use(healthRoutes);           // always mounted

if (env.v2.enabled) {
  router.use('/auth', authModule.routes);
  router.use('/modules', modulesModule.routes);
  router.use('/rbac', rbacModule.routes);
  router.use('/users', usersModule.routes);
  router.use('/clients', clientsModule.routes);
  router.use('/projects', projectsModule.routes);
  router.use('/activity', activityModule.routes);
  router.use('/tasks', tasksModule.routes);
  router.use('/socket', socketModule.routes);
} else {
  // non-health paths → 503 SERVICE_DISABLED
}
```

## Next modules (planned order)

1. `auth` ✅
2. `modules` ✅
3. `rbac` ✅
4. `users` ✅
5. `clients` ✅
6. `projects` ✅
7. `activity` ✅
8. `tasks` ✅
9. `socket` ✅
10. `converse`
11. `reports`

Each new module adds a line inside the `if (env.v2.enabled)` block in `src/v2/index.js`:

```javascript
if (env.v2.enabled) {
  router.use('/auth', authModule.routes);
}
```

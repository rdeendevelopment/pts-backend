# PTS v2 cutover (final)

## API surface

| Surface | Path |
|---------|------|
| HTTP | `/api/v2/*` only |
| Realtime | Socket.IO namespace `/v2` only |
| Static files | `/uploads/*` |

Legacy `src/app/` and `src/routes/` have been **removed**. Roll back via git if needed.

## Angular client

All application HTTP calls use paths under `v2/` via `ApiService` (`environment.api_url` + `v2/...`).

Socket clients connect to `{apiHost}/v2` with v2 dot-notation events (`task.created`, `converse.message.created`, etc.).

## Module ownership (v2)

| Module | Path | Collections |
|--------|------|-------------|
| Auth | `src/v2/modules/auth` | `pts_accounts`, refresh tokens |
| Users | `src/v2/modules/users` | `pts_users` |
| RBAC | `src/v2/modules/rbac` | roles, permissions |
| Modules | `src/v2/modules/modules` | `pts_modules` |
| Clients | `src/v2/modules/clients` | `pts_clients` |
| Projects | `src/v2/modules/projects` | `pts_projects`, assignments, budgets, files |
| Activity | `src/v2/modules/activity` | time entries, weeks, timers |
| Tasks | `src/v2/modules/tasks` | `pts_tasks`, workflows |
| Reports | `src/v2/modules/reports` | report aggregates |
| Converse | `src/v2/modules/converse` | `pts_conversations`, `pts_messages` |
| Announcements | `src/v2/modules/announcements` | `announcements`, `announcement_receipts` |
| Socket | `src/v2/modules/socket` | namespace `/v2` |

## Kept for operations

- `scripts/` — one-off migration utilities (historical; may need git checkout to run against old code)
- `docs/` — architecture and migration notes
- `src/v2/migration/` — data migration CLI

## Verification

```bash
# server should only mount v2
rg "app\.use\('/api" project-tracking-system-api/server.js

# v2 must not import deleted legacy
rg "src/app|src/routes" project-tracking-system-api/src/v2
```

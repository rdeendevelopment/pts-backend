# v2 environment

Set `NODE_ENV` to one of:

- `development`
- `staging`
- `production`

Optional v2 variables:

```bash
PTS_V2_ENABLED=true          # false = health only, no business routes
PTS_V2_LOG_LEVEL=debug
PTS_V2_WEEK_START_DAY=monday # monday | sunday
MONGO_URI=mongodb://127.0.0.1:27017/pts_tasks_dev
MONGO_DB=rdn_pts_dev         # legacy/source DB
MONGO_V2_DB=pts_v2_dev       # v2 target DB (migration + seed CLI)
```

When `PTS_V2_ENABLED=false`:

- `GET /api/v2/health` → `503` with `status: "disabled"`
- Any other `/api/v2/*` path → `503 SERVICE_DISABLED`

When `PTS_V2_ALLOW_PUBLIC_REGISTER=false`:

- `POST /api/v2/auth/register` → `403 AUTH_REGISTRATION_DISABLED`

Shared Mongo settings come from `config/constants.js` / `config.yaml` (legacy config file reused for connection only).

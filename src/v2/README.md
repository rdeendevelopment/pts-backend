# PTS API v2

Greenfield API mounted at `/api/v2`. Legacy `/api/*` is untouched.

**Read first:** [docs/v2-engineering-standards.md](../../docs/v2-engineering-standards.md)

## Layout

- `kernel/` — shared errors, responses, middleware, logger, validators
- `modules/` — business modules (auth, …)
- `migration/` — seed CLI + migration foundation (see `docs/v2-migration.md`)
- `config/env.js` — environment helpers
- `bootstrap.js` — startup (Mongo readiness, indexes)

## Rules

- No imports from `src/app/**`
- MongoDB ObjectId only — no legacyId
- Modular monolith — no queues/Redis unless explicitly approved

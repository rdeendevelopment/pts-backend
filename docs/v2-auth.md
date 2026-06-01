# PTS API v2 — Auth Module

Module path: `src/v2/modules/auth/`  
Routes: `/api/v2/auth/*` (requires `PTS_V2_ENABLED=true`)

---

## Folder layout

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

---

## RBAC integration

Login, refresh, and `/auth/me` include:

- **`user`** — business profile summary when a `pts_users` row exists (`null` otherwise)
- **`roles`** — active roles assigned to the account
- **`permissions`** — permission keys from those roles
- **`modules`** — active modules derived from permissions

Permissions are loaded from MongoDB on each session response — **not stored in JWT**.

See [v2-rbac.md](./v2-rbac.md) and [v2-users.md](./v2-users.md).

---

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | Public | Create account (see registration guard below) |
| POST | `/auth/login` | Public | Login |
| POST | `/auth/refresh` | Public | Rotate refresh token |
| POST | `/auth/logout` | Public | Revoke refresh token |
| GET | `/auth/me` | Bearer | Current account |

---

## Collections

| Collection | Purpose |
|------------|---------|
| `pts_accounts` | Login identity (email, password hash, status, account type) |
| `pts_refresh_tokens` | Hashed refresh tokens with rotation families |

Public IDs are MongoDB ObjectId strings only.

---

## Public registration guard

`POST /auth/register` creates an **active employee** account. That is intentional for **local development**.

In **staging and production**, public registration is **disabled by default**.

| Environment | Default | Override |
|-------------|---------|----------|
| `development` | Allowed | `PTS_V2_ALLOW_PUBLIC_REGISTER=false` to disable |
| `staging` / `production` | Blocked | `PTS_V2_ALLOW_PUBLIC_REGISTER=true` to enable (use with care) |

When blocked, the API returns:

```json
{
  "success": false,
  "error": {
    "code": "AUTH_REGISTRATION_DISABLED",
    "message": "Public registration is disabled in this environment"
  }
}
```

**TODO before production go-live:** keep registration off unless you explicitly enable it; prefer admin-provisioned accounts or an invite flow later.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PTS_V2_JWT_SECRET` | `APP_SECRET` | JWT signing |
| `PTS_V2_ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `PTS_V2_REFRESH_TOKEN_DAYS` | `30` | Refresh token lifetime |
| `PTS_V2_BCRYPT_ROUNDS` | `12` | Password hashing cost |
| `PTS_V2_ALLOW_PUBLIC_REGISTER` | env-based | See registration guard above |

---

## Error codes

| Code | When |
|------|------|
| `AUTH_INVALID_CREDENTIALS` | Wrong email/password |
| `AUTH_EMAIL_ALREADY_EXISTS` | Register with existing email |
| `AUTH_TOKEN_INVALID` | Bad access or refresh token |
| `AUTH_TOKEN_EXPIRED` | Expired access or refresh token |
| `AUTH_REFRESH_TOKEN_REUSED` | Revoked refresh token reused (family revoked) |
| `AUTH_ACCOUNT_INACTIVE` | Account not `active` |
| `AUTH_UNAUTHORIZED` | Missing/invalid Bearer token |
| `AUTH_REGISTRATION_DISABLED` | Register blocked in this environment |

---

## Quick test (development)

```bash
BASE=http://localhost:3000

curl -s -X POST "$BASE/api/v2/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"Password123","firstName":"Dev","lastName":"User"}'

curl -s -X POST "$BASE/api/v2/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"Password123"}'
```

See [v2 engineering standards](./v2-engineering-standards.md) for team coding rules.

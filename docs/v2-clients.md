# PTS API v2 — Clients Module

Module path: `src/v2/modules/clients/`  
Routes: `/api/v2/clients/*` (requires `PTS_V2_ENABLED=true`, Bearer token, and RBAC permissions)

---

## Purpose

Clients manages **company/customer records** used by Projects, reporting, and billing context.

- Every future project will belong to one client.
- Supports business, individual, and internal client types.
- Soft-delete only; archived clients should not be used for new projects.

---

## Collection: `pts_clients`

| Field | Notes |
|-------|--------|
| `name`, `normalizedName` | Display name + unique normalized key among active rows |
| `code` | Optional unique short code (auto-generated from name if omitted) |
| `type` | `business`, `individual`, `internal` |
| `status` | `active`, `inactive`, `archived` |
| `industry`, `website`, `email`, `phone` | Optional contact metadata |
| `address` | `{ line1, line2, city, state, postalCode, country }` |
| `primaryContact` | `{ name, email, phone, jobTitle }` |
| `billing` | `{ billingEmail, billingPhone, currency, taxId, paymentTerms }` |
| `notes`, `tags` | Internal note + lowercase unique tags |
| `createdBy`, `updatedBy` | Ref `pts_accounts` |
| soft-delete + timestamps | Standard v2 fields |

**Indexes:** unique `normalizedName`, unique `code` (when set), `status`, `type`, `tags`, `updatedAt`, `createdBy`

---

## Routes

| Method | Path | Permission |
|--------|------|------------|
| GET | `/clients` | `clients.view` or `clients.manage` |
| GET | `/clients/:id` | `clients.view` or `clients.manage` |
| POST | `/clients` | `clients.manage` |
| PATCH | `/clients/:id` | `clients.manage` |
| PATCH | `/clients/:id/status` | `clients.manage` |
| DELETE | `/clients/:id` | `clients.manage` |

### List filters

- `search` — name, code, email, industry
- `status`, `type`, `tag`, `industry`
- `include_deleted=true` optional
- Cursor pagination: `cursor`, `limit` (default 20, max 100)
- Sort: recently updated first

### Delete guard

`clientHasActiveProjects()` checks `pts_projects` for non-deleted rows with status `draft`, `active`, or `on_hold`. Delete returns `CLIENT_HAS_ACTIVE_PROJECTS` when matches exist.

---

## Helpers

| Helper | Behavior |
|--------|----------|
| `normalizeClientName` | trim, lowercase, collapse spaces |
| `generateClientCode` | uppercase slug from name (e.g. `Acme Corp` → `ACME_CORP`) |
| `normalizeTags` | lowercase, trim, dedupe |

---

## Error codes

| Code | When |
|------|------|
| `CLIENT_NOT_FOUND` | Invalid client id |
| `CLIENT_NAME_ALREADY_EXISTS` | Duplicate normalized name |
| `CLIENT_CODE_ALREADY_EXISTS` | Duplicate code |
| `CLIENT_INVALID_STATUS` | Bad status enum |
| `CLIENT_INVALID_TYPE` | Bad type enum |
| `CLIENT_HAS_ACTIVE_PROJECTS` | Delete blocked (future Projects integration) |

---

## Quick test

```bash
BASE=http://localhost:3001

TOKEN=$(curl -s -X POST "$BASE/api/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin>","password":"<password>"}' | jq -r '.data.access_token')

curl -s "$BASE/api/v2/clients?limit=10" -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/api/v2/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Acme Corp",
    "type":"business",
    "email":"contact@acme.com",
    "industry":"Technology",
    "tags":["enterprise","saas"]
  }' | jq

curl -s -X PATCH "$BASE/api/v2/clients/<clientId>/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"archived"}' | jq
```

See [v2 engineering standards](./v2-engineering-standards.md).

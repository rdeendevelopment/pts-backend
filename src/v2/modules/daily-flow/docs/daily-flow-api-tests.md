# Daily Flow API Test Guide (Layer 1)

Base URL: `/api/v2/daily-flow`

## Setup

1. Ensure PTS v2 is enabled: `PTS_V2_ENABLED=true`
2. Run core seed: `npm run v2:seed`
3. Run Daily Flow seed: `npm run v2:seed:daily-flow`
4. Enable module (if not already active):

```http
PATCH /api/v2/modules/key/daily_flow/status
Authorization: Bearer <admin_token>
Content-Type: application/json

{ "enabled": true }
```

## Auth & Permissions

All routes require `Authorization: Bearer <access_token>`.

| Permission | Purpose |
|------------|---------|
| `daily_flow.view` | Read own records, status, settings |
| `daily_flow.manage` | Create/update own records, settings |
| `daily_flow.admin` | Admin summaries |

Note: RBAC keys are `view` / `manage` / `admin` (not `read` / `write` / `settings`).

## Access Rules

| Route group | Global module disabled | User `enable_daily_flow: false` |
|-------------|------------------------|----------------------------------|
| `GET /status` | Allowed | Allowed |
| `GET/PATCH /settings` | Blocked (`MODULE_NOT_AVAILABLE`) | Allowed |
| Admin routes | Blocked | Allowed (admin permission required) |
| All other user routes | Blocked | Blocked (`DAILY_FLOW_DISABLED_FOR_USER`) |

Re-enable user Daily Flow:

```http
PATCH /api/v2/daily-flow/settings
{ "enable_daily_flow": true }
```

---

## User API Examples

### GET /status

```http
GET /api/v2/daily-flow/status
```

Expected: `enabled`, `ai_enabled: false`, `settings`, `weekend_planning_enabled`.

### PATCH /settings

```http
PATCH /api/v2/daily-flow/settings
Content-Type: application/json

{
  "weekend_planning_enabled": true,
  "share_work_goals_with_admin": false,
  "share_personal_goals_with_admin": false,
  "allow_reward_eligibility": true
}
```

### GET /today

```http
GET /api/v2/daily-flow/today?goals_limit=100&catchups_limit=100
```

Expected: `day`, `work_goals`, `personal_goals`, `catchups`, `reflection`, `rewards`, `progress_summary`, `settings`, `meta`.

### POST /goals

```http
POST /api/v2/daily-flow/goals
Content-Type: application/json

{
  "title": "Complete sprint tasks",
  "goal_type": "work",
  "day_key": "2026-06-06",
  "target_value": 5,
  "current_value": 1
}
```

Personal goal example:

```http
POST /api/v2/daily-flow/goals
{
  "title": "Evening walk",
  "goal_type": "personal",
  "day_key": "2026-06-06",
  "category": "healthy_habit"
}
```

Expected: `is_private: true` for personal goals.

### PATCH /goals/:goalId/progress

```http
PATCH /api/v2/daily-flow/goals/<goalId>/progress
Content-Type: application/json

{ "current_value": 5 }
```

Expected: status becomes `completed` when `current_value >= target_value`.

### PATCH /goals/:goalId/complete

```http
PATCH /api/v2/daily-flow/goals/<goalId>/complete
```

### DELETE /goals/:goalId

```http
DELETE /api/v2/daily-flow/goals/<goalId>
```

Expected: soft delete (`status: deleted`, not hard removed).

### POST /catchups

```http
POST /api/v2/daily-flow/catchups
Content-Type: application/json

{
  "title": "Discuss sprint blockers",
  "type": "need_to_discuss",
  "day_key": "2026-06-06"
}
```

### PATCH /catchups/:catchupId/resolve

```http
PATCH /api/v2/daily-flow/catchups/<catchupId>/resolve
```

Expected: `status: done`, `resolved_at` set.

### POST /mood

```http
POST /api/v2/daily-flow/mood
Content-Type: application/json

{
  "day_key": "2026-06-06",
  "period": "morning",
  "mood": 4,
  "energy": 3,
  "note": "Focused start"
}
```

### POST /reflection

```http
POST /api/v2/daily-flow/reflection
Content-Type: application/json

{
  "day_key": "2026-06-06",
  "biggest_win": "Finished API layer",
  "blockers": "None",
  "learnings": "Keep privacy helpers strict",
  "tomorrow_plan": "Start Angular shell",
  "mood": 4,
  "energy": 4
}
```

### GET /weekly-summary

```http
GET /api/v2/daily-flow/weekly-summary
GET /api/v2/daily-flow/weekly-summary?week_start=2026-06-02&week_end=2026-06-08
```

Expected: summary counts, max 7 `days` records, no huge goal lists.

### POST /rewards/evaluate

```http
POST /api/v2/daily-flow/rewards/evaluate
Content-Type: application/json

{ "day_key": "2026-06-06" }
```

Expected: `created_rewards` and `existing_rewards` arrays; no duplicate rule per day.

---

## Admin API Examples

### GET /admin/team-summary

```http
GET /api/v2/daily-flow/admin/team-summary
```

Expected:
- `scope: "account"` (platform-wide until manager hierarchy exists)
- aggregate counts only
- `personal_goal_details_included: false`

### GET /admin/user/:userId

```http
GET /api/v2/daily-flow/admin/user/<PtsUserObjectId>?goals_limit=100
```

Privacy behavior:
- Work goal details only if `share_work_goals_with_admin: true`
- Personal goal details only if `share_personal_goals_with_admin: true`
- Otherwise counts only with `details_hidden: true`

---

## Expected Errors

| Code | When |
|------|------|
| `MODULE_NOT_AVAILABLE` | Global `daily_flow` module inactive |
| `DAILY_FLOW_DISABLED_FOR_USER` | User `enable_daily_flow: false` on user routes |
| `DAILY_FLOW_INVALID_DAY_KEY` | Bad `YYYY-MM-DD` date |
| `DAILY_FLOW_GOAL_NOT_FOUND` | Wrong goal id, deleted goal, or cross-account access |
| `DAILY_FLOW_WEEKEND_PLANNING_DISABLED` | Weekend day when `weekend_planning_enabled: false` |
| `DAILY_FLOW_REWARDS_DISABLED` | `allow_reward_eligibility: false` during evaluate |

## Edge Cases To Verify

1. Calling `GET /today` twice does not create duplicate day records.
2. Calling `POST /rewards/evaluate` twice returns existing rewards, not duplicates.
3. Personal goal titles never appear in admin team summary.
4. User A cannot update/delete User B goal/catchup (404).
5. Invalid ObjectId on `goalId` / `catchupId` / `userId` returns 400 `INVALID_ID`.
6. `PATCH /settings` works while user Daily Flow is disabled.

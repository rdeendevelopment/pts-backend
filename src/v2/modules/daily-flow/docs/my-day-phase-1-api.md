# My Day (Daily Flow) — Phase 1 API

Product name: **My Day** · AI assistant: **FlowMate AI**  
Module key: `daily_flow` · Route prefix: `/api/v2/daily-flow`

Phase 1 adds OpenAI-powered welcome messages, task recommendations, and end-day summaries with rule-based fallbacks. Task Board, Activity, and existing Daily Flow CRUD remain unchanged.

## Authentication & access

All routes require JWT (`Authorization: Bearer <token>`).

| Layer | Requirement |
|-------|-------------|
| Module | `daily_flow` must be `active` (except `GET /status`) |
| RBAC | `daily_flow.view` / `daily_flow.manage` / `daily_flow.admin` |
| User toggle | `enable_daily_flow: true` (except settings & admin routes) |

`GET /status` works when the module is disabled (no `requireSystemModule`).  
`GET/PATCH /settings` works when the user has disabled My Day (no `requireDailyFlowUserEnabled`).

## Settings

`GET /api/v2/daily-flow/settings`  
`PATCH /api/v2/daily-flow/settings`

| Field | Default | Description |
|-------|---------|-------------|
| `enable_daily_flow` | `true` | Per-user My Day on/off |
| `enable_ai_companion` | `true` | FlowMate AI master toggle |
| `allow_ai_task_recommendations` | `true` | AI text for task suggestions |
| `allow_ai_end_day_summary` | `true` | AI end-day summary |
| `share_work_goals_with_admin` | `false` | Admin sees work goal titles |
| `share_personal_goals_with_admin` | `false` | Admin sees personal goal details (default off) |

**AI toggle behavior:**

| Setting | Effect |
|---------|--------|
| `enable_ai_companion: false` | All AI calls use rule-based fallbacks |
| `allow_ai_task_recommendations: false` | Task list still returned; `recommendation_mode: rule_based` |
| `allow_ai_end_day_summary: false` | End-day uses rule-based `ai_summary` |
| `PTS_AI_ENABLED=false` or missing API key | Same as above — dashboard never crashes |

---

## FlowMate structured state (primary AI contract)

**Angular should use this endpoint** instead of `/ai/welcome` for all FlowMate UI rendering.

```http
POST /api/v2/daily-flow/ai/state
Content-Type: application/json
Authorization: Bearer <token>

{
  "event": "day_opened",
  "dayKey": "2026-06-08",
  "entityId": "optional ObjectId",
  "entityType": "task | goal | personal_goal | catchup | report | none",
  "taskSync": { "synced": true, "taskId": "..." }
}
```

### Events

| event | When to call |
|-------|----------------|
| `day_opened` | User opens My Day |
| `task_added_to_today` | After add-to-today succeeds |
| `goal_completed` | Work goal completed |
| `task_completed` | Linked task completed (include `taskSync`) |
| `personal_goal_completed` | Personal goal completed |
| `end_day_started` | User opens end-day flow |
| `day_submitted` | After end-day submit |
| `manual_refresh` | User taps refresh — uses latest context, not stale welcome |

### Assistant modes

`morning_planner` · `plan_updated` · `work_companion` · `important_task_completed` · `personal_goal_completed` · `next_task_suggestion` · `end_day_reporter` · `quiet_day` · `ai_disabled_fallback`

### Response shape (camelCase)

```json
{
  "success": true,
  "data": {
    "mode": "morning_planner",
    "event": "day_opened",
    "dayKey": "2026-06-08",
    "headline": "Start with the task that moves the day forward.",
    "message": "Good morning, Usama. I reviewed your Task Board and found 15 assigned tasks. I recommend starting with Multi Tenant Admin Panel because it is active and high priority.",
    "bullets": [
      "15 assigned tasks",
      "3 strong candidates for today",
      "Top priority: Multi Tenant Admin Panel"
    ],
    "primaryTask": {
      "taskId": "...",
      "title": "Multi Tenant Admin Panel",
      "priority": "medium",
      "status": "active",
      "reason": "Active and already in progress"
    },
    "nextTask": {
      "taskId": "...",
      "title": "threads Failed",
      "priority": "high",
      "status": "active",
      "reason": "High priority assigned task"
    },
    "actions": [
      { "type": "add_to_today", "label": "Add to Today", "taskId": "..." },
      { "type": "open_task", "label": "Open Task", "taskId": "..." }
    ],
    "celebration": { "enabled": false, "level": "none", "reason": null },
    "nudge": { "type": "focus", "text": "Pick one priority and give it a focused block." },
    "fallbackUsed": false,
    "recommendationMode": "openai"
  }
}
```

### Frontend rendering contract

| Field | UI use |
|-------|--------|
| `mode` | Card layout / animation variant |
| `headline` | Bold title above message |
| `message` | 3–4 lines max — main FlowMate copy |
| `bullets` | Optional chip list |
| `primaryTask` / `nextTask` | Task cards with real Task Board data |
| `actions` | CTA buttons (`add_to_today`, `open_task`) |
| `celebration` | Confetti / badge when `enabled: true` |
| `nudge` | Subtle footer hint (`privacy` on personal wins) |
| `fallbackUsed` | Show subtle “offline mode” if true |
| `recommendationMode` | `openai` or `rule_based` |

### Event behavior summary

- **day_opened** — no plan → `morning_planner`; plan exists → `work_companion`; submitted → `end_day_reporter`
- **task_added_to_today** → `plan_updated`, mentions task title, anti-overload nudge
- **goal_completed / task_completed** → celebration for priority work; `personal_goal_completed` stays gentle
- **day_submitted** → `end_day_reporter`, hours/blockers/tomorrow, privacy note
- **manual_refresh** → fresh context from dashboard + Task Board (not cached welcome)

### Fallback

OpenAI returns strict JSON. Parse failure → `buildRuleBasedFlowMateState()` with same shape.  
`enable_ai_companion: false` → `mode: ai_disabled_fallback`, `fallbackUsed: true`, `recommendationMode: rule_based`.

### AI memory & cache

Stored as `type: flowmate_state` with `event`, `cacheKey`, `outputText`, `structuredOutput`.  
`inputSnapshot` is compact and **not** exposed to admin APIs. Personal goal titles are never sent to the model.

**Cache key:** `userId|dayKey|event|dayState|plannedItemCount|completedItemCount|timeOfDay`

| Event | Cache behavior |
|-------|----------------|
| `day_opened`, `manual_refresh` | Reuse cached state when `cacheKey` matches |
| `task_added_to_today`, `goal_completed`, `task_completed`, `personal_goal_completed`, `day_submitted`, `end_day_started` | Always regenerate (new memory row) |

When `dayState` or `timeOfDay` changes, the cache key changes — e.g. morning welcome is not reused in the afternoon.

### Legacy endpoints (compatibility)

`POST /ai/welcome` and `POST /ai/recommend-tasks` remain available. New Angular work should call `/ai/state` only.

---

## 1. Today dashboard

```http
GET /api/v2/daily-flow/today
Authorization: Bearer <token>
```

**Does not call OpenAI.** Returns cached `ai_welcome` if present; `ai_learning_tip` is rule-based until generated elsewhere.

### Response fields

| Field | Description |
|-------|-------------|
| `day` | Day record |
| `today_items` | All goals for today |
| `work_goals` | Work goals (legacy field, unchanged) |
| `personal_goals` | Personal goals |
| `catchups` | Catch-ups |
| `assigned_task_suggestions` | Rule-ranked assigned tasks |
| `ai_welcome` | Cached welcome (`null` until `POST /ai/welcome`) |
| `ai_learning_tip` | Rule-based tip on dashboard |
| `progress_summary` | Goal completion stats |
| `end_day_report` | Report if day ended, else `null` |
| `settings` | User settings |
| `meta` | Limits, `product_name`, `ai_assistant_name`, and **day state** fields below |

### Day state (`meta`)

Computed from today's goals, catchups, activity minutes, end-day report, and the user's timezone (`settings.timezone`).

| Field | Values / type | Meaning |
|-------|----------------|---------|
| `day_state` | `not_started` \| `planned` \| `in_progress` \| `submitted` \| `quiet_day` | Current My Day lifecycle state |
| `time_of_day` | `morning` \| `afternoon` \| `evening` \| `night` | Local time bucket |
| `has_existing_plan` | boolean | Items exist and day not submitted |
| `should_resume_plan` | boolean | `planned` or `in_progress` |
| `should_show_end_day` | boolean | End-day UI visible (`planned` / `in_progress`) |

**Rules (priority order):**

1. `end_day_report` exists or `day.status === submitted` → `submitted`
2. `completed_items > 0` or `activity_minutes > 0` → `in_progress`
3. `today_items_count > 0` → `planned`
4. No items and local hour ≥ 14 → `quiet_day`
5. Else → `not_started`

`GET /today` never resets plan content or auto-adds tasks.

### Example

```json
{
  "success": true,
  "data": {
    "day": { "day_key": "2026-06-08", "status": "active" },
    "today_items": [],
    "work_goals": [],
    "personal_goals": [],
    "catchups": [],
    "assigned_task_suggestions": [
      {
        "task_id": "664a1b2c3d4e5f678901234",
        "title": "Fix timer duplicate issue",
        "project_name": "PTS",
        "priority": "high",
        "status": "active",
        "due_date": "2026-06-07T00:00:00.000Z",
        "reason": "Overdue — needs attention today",
        "recommendation_rank": 1,
        "already_added_to_today": false
      }
    ],
    "ai_welcome": null,
    "ai_learning_tip": {
      "message": "Pick two must-do items and treat everything else as bonus progress.",
      "fallback_used": true,
      "generated_at": null
    },
    "progress_summary": { "total_goals": 0, "completed_goals": 0, "completion_percentage": 0 },
    "end_day_report": null,
    "settings": { "enable_ai_companion": true },
    "meta": {
      "product_name": "My Day",
      "ai_assistant_name": "FlowMate AI",
      "day_state": "not_started",
      "time_of_day": "morning",
      "has_existing_plan": false,
      "should_resume_plan": false,
      "should_show_end_day": false
    }
  }
}
```

**Ranking:** overdue + high priority → due today → in progress (active) → recently updated → other assigned tasks. Completed/archived tasks are excluded.

---

## 2. AI welcome

```http
POST /api/v2/daily-flow/ai/welcome
Content-Type: application/json

{ "day_key": "2026-06-08", "force": false }
```

- Reuses cached welcome for same account/day unless `force: true`
- Saves to `pts_daily_flow_ai_memory` (`type: welcome`)
- Max ~80 words, supportive tone

### Example response

```json
{
  "success": true,
  "data": {
    "day_key": "2026-06-08",
    "message": "Good morning Hamza 👋 I reviewed your day. You have 6 assigned tasks, 2 high priority, and 1 overdue. I recommend starting with the timer duplicate issue because it affects active work. Pick 2–3 items and let's keep today focused.",
    "fallback_used": false,
    "provider": "openai",
    "model": "gpt-4o-mini",
    "reused": false,
    "context_summary": {
      "assigned_task_count": 6,
      "high_priority_count": 2,
      "overdue_count": 1,
      "pending_yesterday_count": 1,
      "top_priority_task": "Fix timer duplicate issue"
    }
  }
}
```

---

## 3. AI task recommendations

```http
POST /api/v2/daily-flow/ai/recommend-tasks
Content-Type: application/json

{ "day_key": "2026-06-08", "limit": 5 }
```

Returns top 3–5 tasks with AI-enhanced `reason` text.

### Example response

```json
{
  "success": true,
  "data": {
    "recommendation_mode": "openai",
    "fallback_used": false,
    "recommendations": [
      {
        "task_id": "664a...",
        "title": "Fix timer duplicate issue",
        "project_name": "PTS",
        "priority": "high",
        "status": "active",
        "due_date": "2026-06-07T00:00:00.000Z",
        "reason": "This is overdue and likely blocking active work — a strong first pick.",
        "recommendation_rank": 1,
        "already_added_to_today": false
      }
    ]
  }
}
```

When AI is disabled: `recommendation_mode: "rule_based"`, `fallback_used: true`.

---

## 4. Add assigned task to today

```http
POST /api/v2/daily-flow/tasks/664a1b2c3d4e5f678901234/add-to-today
Content-Type: application/json

{ "day_key": "2026-06-08" }
```

- `taskId` must be valid ObjectId
- Returns **existing goal** if already added (idempotent, not an error)
- Handles duplicate-index race safely

### Created goal fields

- `source_type: "task"`
- `linked_task_id` = task ID
- `sync_task_status: true`
- `status: "in_progress"`

---

## 5. Quick add

```http
POST /api/v2/daily-flow/quick-add
Content-Type: application/json

{
  "text": "Deploy PTS today",
  "type": "work_goal",
  "day_key": "2026-06-08"
}
```

| type | Creates |
|------|---------|
| `work_goal` | Work goal (`target_value: 1`, `current_value: 0`, `unit: goal`, `status: in_progress`) |
| `personal_goal` | Private personal goal |
| `catchup` | Catch-up (`need_to_discuss`) |
| `reminder` | Catch-up (`reminder`) |

`day_key` defaults to today if omitted. Empty `text` → validation error.

---

## 6. Goal completion + two-way task sync

```http
PATCH /api/v2/daily-flow/goals/:goalId/complete
PATCH /api/v2/daily-flow/goals/:goalId/reopen
```

**Complete (`/complete`):**
- Idempotent if goal already completed
- Linked task goals (`sync_task_status: true`, `linked_task_id` or `source_type: task`) call Task Board `completeTask()`
- Response may include `task_sync: { synced, taskId?, reason? }`

**Reopen (`/reopen`):**
- Idempotent if goal already `pending` / `in_progress`
- Sets status to `in_progress` (or `pending` if no progress) and clears `completed_at`
- Linked goals call Task Board `reopenTask()` when `sync_task_status: true`

**Never sync:** personal goals, manual work goals without linked task, goals with `sync_task_status: false`

**Task Board → My Day (wired in `taskBoard.service`):**
- `completeTask()` and move-to-done → `syncTaskCompleted(taskId, userId, accountId)`
- `reopenTask()` and move-off-done → `syncTaskReopened(taskId, userId, accountId)`
- Only today's linked goals for the assignee are updated

**Submitted day reports:** snapshot fields are preserved. If a linked item is reopened after submission, the report gains `has_changes_after_submission: true` and `changed_items_count` increments.

**Audit events (stored as `type: task_sync`):**
`my_day_goal_completed_task_completed` · `my_day_goal_reopened_task_reopened` · `task_completed_my_day_goal_completed` · `task_reopened_my_day_goal_reopened`

---

## 7. End day

```http
POST /api/v2/daily-flow/end-day
Content-Type: application/json

{
  "day_key": "2026-06-08",
  "blockers": "Waiting on QA",
  "tomorrow_plan": "Production deploy",
  "notes": "Good collaboration day"
}
```

- **Idempotent** — returns existing report if day already submitted
- Personal goals: **counts only** in report
- Activity minutes from Activity module (0 if unavailable)
- Empty completed work → neutral summary (no shaming)

### Example response

```json
{
  "success": true,
  "data": {
    "day_key": "2026-06-08",
    "status": "submitted",
    "submitted_at": "2026-06-08T18:30:00.000Z",
    "completed_work_items": [],
    "completed_linked_tasks": [],
    "pending_work_items": [],
    "blockers": "Waiting on QA",
    "tomorrow_plan": "Production deploy",
    "total_activity_minutes": 420,
    "personal_goals_count": 2,
    "completed_personal_goals_count": 1,
    "catchups_summary": { "total": 1, "open": 0, "resolved": 1 },
    "ai_summary": "You closed out the day. Even quiet days are valid — tomorrow is a fresh start. Your plan for tomorrow is noted.",
    "ai_fallback_used": true
  }
}
```

---

## 8. Admin daily reports

```http
GET /api/v2/daily-flow/admin/daily-reports?date=2026-06-08&userId=664...&status=submitted
GET /api/v2/daily-flow/admin/daily-reports/:userId/:date
```

Requires `daily_flow.admin`. Detail resolves user → account for scoping.

### List item example

```json
{
  "user": { "id": "664...", "display_name": "Hamza Ali", "email": "hamza@example.com" },
  "account_id": "663...",
  "day_key": "2026-06-08",
  "submitted_at": "2026-06-08T18:30:00.000Z",
  "completed_work_items_count": 3,
  "personal_goals_count": 2,
  "completed_personal_goals_count": 1,
  "personal_goal_titles_included": false,
  "ai_summary": "..."
}
```

**Never exposed:** AI `inputSnapshot`, personal goal titles (unless user opts in via `share_personal_goals_with_admin` — admin list still uses counts only in Phase 1).

---

## Privacy & fallback guarantees

| Guarantee | Implementation |
|-----------|----------------|
| Dashboard never crashes on AI failure | All AI wrapped in try/catch + rule fallbacks |
| Dashboard does not auto-call OpenAI | Only cached welcome; rule-based learning tip |
| Personal goals private | Default `share_personal_goals_with_admin: false` |
| Admin reports | Counts only for personal goals |
| AI memory | Not exposed via any API |
| No shaming language | Prompts + rule fallbacks audited |

---

## AI memory (`pts_daily_flow_ai_memory`)

| Field | Stored |
|-------|--------|
| `accountId`, `userId`, `dayKey`, `type` | Yes |
| `inputSnapshot` | Compact context (no personal goal titles) |
| `outputText`, `provider`, `model`, `tokens`, `fallbackUsed` | Yes |

---

## OpenAI environment variables

| Variable | Default |
|----------|---------|
| `OPENAI_API_KEY` / `PTS_OPENAI_API_KEY` / `config.yaml` `ai.openai.apiKey` | — |
| `PTS_AI_ENABLED` | `true` |
| `DAILY_FLOW_AI_ENABLED` | `true` |
| `DAILY_FLOW_AI_MODEL` | `gpt-4o-mini` |
| `DAILY_FLOW_AI_TIMEOUT_MS` | `15000` |

---

## Error codes (Phase 1)

| Code | HTTP | Meaning |
|------|------|---------|
| `DAILY_FLOW_DISABLED_FOR_USER` | 403 | User disabled My Day |
| `DAILY_FLOW_INVALID_DAY_KEY` | 400 | Invalid `day_key` |
| `DAILY_FLOW_TASK_NOT_FOUND` | 404 | Task does not exist |
| `DAILY_FLOW_TASK_NOT_ASSIGNED` | 403 | Task not assigned to user |
| `DAILY_FLOW_TASK_ALREADY_COMPLETED` | 400 | Task already done |
| `DAILY_FLOW_GOAL_NOT_FOUND` | 404 | Goal not found |
| `DAILY_FLOW_INVALID_QUICK_ADD_TYPE` | 400 | Invalid quick-add type |

AI unavailability does **not** surface as an error on dashboard or AI endpoints — fallbacks are returned instead.

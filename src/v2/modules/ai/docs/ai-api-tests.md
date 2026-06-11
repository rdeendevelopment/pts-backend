# PTS V2 AI — Postman / API Examples

Base: `{{baseUrl}}/api/v2/ai`

Auth: `Authorization: Bearer {{accessToken}}`

Requirements: `super_admin` account + `PTS_AI_DEBUG_ENABLED=true`

---

## List actions

```http
GET /api/v2/ai/actions
```

---

## Sync run — translate

```http
POST /api/v2/ai/run
Content-Type: application/json

{
  "action": "COMMON_TRANSLATE",
  "source_module": "common",
  "input": {
    "text": "Hello team",
    "targetLanguage": "Spanish"
  },
  "context": {}
}
```

Expected: `200`, `async: false`, `result.translated`

---

## Sync run — task summarize

```http
POST /api/v2/ai/run

{
  "action": "TASK_SUMMARIZE",
  "source_module": "tasks",
  "source_id": "TASK_ID_HERE",
  "input": {
    "title": "Implement login flow",
    "description": "Add JWT auth with refresh tokens"
  },
  "context": {
    "projectName": "PTS V2"
  }
}
```

---

## Async run — discuss import chat

```http
POST /api/v2/ai/run

{
  "action": "DISCUSS_IMPORT_CHAT",
  "source_module": "discussflow",
  "input": {
    "rawChat": "Alice: We need SSO\nBob: Agreed"
  }
}
```

Expected: `200`, `async: true`, `job_id`, `poll_url`

---

## Poll job (fallback if socket unavailable)

```http
GET /api/v2/ai/jobs/{{jobId}}
```

Statuses: `queued` → `running` → `completed` | `failed`

---

## Socket events (user room)

Subscribe on `/v2` namespace, join user room via existing auth.

| Event | Payload |
|-------|---------|
| `ai:job:created` | `{ job }` |
| `ai:job:started` | `{ job }` |
| `ai:job:progress` | `{ jobId, progress }` |
| `ai:job:completed` | `{ job }` |
| `ai:job:failed` | `{ job }` |

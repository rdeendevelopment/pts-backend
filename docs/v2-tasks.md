# PTS API v2 — Tasks Module

Module path: `src/v2/modules/tasks/`  
Routes: `/api/v2/tasks/*`  
Reference: legacy `src/app/Modules/task-v2/` (unchanged, still at `/api/task-v2`)

---

## Phase 1 scope

Cloned from Task V2 behavior into clean v2 structure with **new `pts_*` collections**.

Implemented:
- Project board read
- Workflow/status read (+ auto-provision default workflow)
- Task create/update/move/complete/archive/restore
- Archived task list
- Comments read/create
- Attachment metadata via task PATCH (`attachments` array)
- Task members read (merged with project assignments)
- Inbox / My Tasks aggregate views

Not implemented (intentionally):
- Private workspace
- Labels, watchers, saved views
- Permanent delete
- Workflow admin CRUD
- Legacy `projectRef.sourceId` mapping

---

## Phase 3 scope — Task Attachments

Implemented:
- Task attachment upload/delete on `pts_tasks.attachments`
- Local storage under `uploads/task-v2/` (same tree as legacy task-v2 uploads)
- Physical file delete on attachment removal when URL is under task-v2 prefix
- Realtime `task.updated` after upload/delete (full task DTO in payload)

**Comment attachment upload** remains on legacy route `POST /api/task-v2/tasks/:taskId/files/upload` until a later phase.

### Attachment DTO

```json
{
  "id": "<attachmentObjectId>",
  "_id": "<attachmentObjectId>",
  "fileName": "spec.pdf",
  "fileUrl": "/uploads/task-v2/2026/05/spec.pdf",
  "mimeType": "application/pdf",
  "fileType": "application/pdf",
  "fileSize": 1234,
  "uploadedBy": "<pts_accounts._id>",
  "uploadedAt": "2026-05-21T10:00:00.000Z",
  "name": "spec.pdf",
  "url": "/uploads/task-v2/2026/05/spec.pdf",
  "size": 1234
}
```

Upload: `multipart/form-data` with field name `file` (global `express-fileupload` middleware).

### RBAC

- Route requires `tasks.manage`
- Service also blocks archived tasks
- Non-managers with only `tasks.view` cannot upload/delete (matches other v2 task mutations)
- `tasks.manage` bypasses project assignment check; others must have active `pts_project_assignments` row

---

## Phase 4 scope — Workflow Settings / Admin

Implemented:
- Project settings read/update for ObjectId projects
- Workflow status CRUD admin (create, update, reorder, archive)
- Default workflow auto-provision via `getOrCreateProjectWorkflow`
- Realtime `task.workflow.updated` on workflow mutations

### Settings DTO

```json
{
  "id": "<pts_projects._id>",
  "name": "PTS Platform",
  "description": "Main project",
  "status": "active",
  "isActive": true,
  "createdAt": "2026-05-21T10:00:00.000Z",
  "project": {
    "id": "<pts_projects._id>",
    "name": "PTS Platform",
    "description": "Main project",
    "status": "active",
    "isActive": true,
    "createdAt": "2026-05-21T10:00:00.000Z"
  },
  "workflow": {
    "id": "<pts_task_workflows._id>",
    "projectId": "<pts_projects._id>",
    "name": "Default Workflow",
    "isDefault": true,
    "status": "active"
  },
  "statuses": [
    {
      "id": "<statusObjectId>",
      "_id": "<statusObjectId>",
      "name": "Todo",
      "key": "todo",
      "order": 1024,
      "category": "not_started",
      "color": "#3B82F6",
      "icon": null,
      "isTerminal": false,
      "status": "active",
      "isDefault": true,
      "isSystem": true
    }
  ],
  "stats": { "taskCount": 4, "memberCount": 2, "overdueCount": 1 },
  "canManage": true
}
```

### Workflow status lifecycle

- Active statuses use `status: "active"`; archived/inactive columns use `status: "inactive"`.
- Reorder accepts `{ updates: [{ statusId, order }] }` and applies all order writes before returning fresh list.
- Archive rules:
  - Cannot archive the last active status.
  - If tasks exist in the status, `replacementStatusId` is required.
  - When replacement is provided, tasks are moved first, then status is archived.
  - Empty statuses may archive without replacement if other active statuses remain.

### RBAC

- Settings read: `tasks.view` or `tasks.manage`
- Settings write + workflow admin: `tasks.manage`
- `canManage` flag in settings response mirrors `tasks.manage` permission

---

Implemented:
- Notification inbox (`pts_task_notifications`)
- Mentions feed from `pts_task_comments.mentions`
- Mention notifications on comment create (deduped per comment)
- Realtime `notification.created` to `user:{userId}` room

Angular uses v2 routes first with legacy `/api/task-v2` fallback during transition.

### Notification DTO (REST + socket payload)

```json
{
  "id": "<notificationObjectId>",
  "_id": "<notificationObjectId>",
  "userId": "<pts_users._id>",
  "taskId": "<pts_tasks._id>",
  "projectId": "<pts_projects._id>",
  "type": "task_mentioned",
  "title": "Fix deploy",
  "body": "Alex mentioned you in \"Fix deploy\"",
  "message": "Alex mentioned you in \"Fix deploy\"",
  "taskTitle": "Fix deploy",
  "isRead": false,
  "readAt": null,
  "triggeredByName": "Alex",
  "triggeredBy": "<pts_accounts._id>",
  "sourceCommentId": "<pts_task_comments._id>",
  "projectRef": { "sourceId": "<pts_projects._id>", "sourceType": "project" },
  "createdAt": "2026-05-21T10:00:00.000Z",
  "updatedAt": "2026-05-21T10:00:00.000Z"
}
```

Legacy UI fields (`message`, `taskTitle`, `projectRef`, `sourceCommentId`) are included for Angular mapper compatibility.

### Mention DTO

```json
{
  "id": "<commentObjectId>",
  "_id": "<commentObjectId>",
  "taskId": "<pts_tasks._id>",
  "projectId": "<pts_projects._id>",
  "text": "@you please review",
  "content": "@you please review",
  "createdAt": "2026-05-21T10:00:00.000Z",
  "mentionedAt": "2026-05-21T10:00:00.000Z",
  "authorName": "Alex Kim",
  "authorEmail": "alex@example.com",
  "authorId": "<pts_accounts._id>",
  "taskTitle": "Deploy fix",
  "taskNumber": 42,
  "projectSourceId": "<pts_projects._id>",
  "projectName": "PTS Platform",
  "task": { "id": "<pts_tasks._id>", "title": "Deploy fix", "taskNumber": 42 },
  "project": { "id": "<pts_projects._id>", "name": "PTS Platform" },
  "comment": { "id": "<commentObjectId>", "content": "@you please review", "createdAt": "..." }
}
```

### RBAC

- Authenticated users read **their own** notifications and mentions (`pts_users._id` from JWT account).
- `tasks.manage` may pass optional `?userId=` to list another user's notifications (managers only).
- Non-managers requesting another user's inbox are silently scoped to self.

Realtime (via global Socket module + task/notification helpers):

| Action | Event |
|--------|-------|
| Create | `task.created` |
| Update | `task.updated` |
| Move | `task.moved` (also `task.completed` when moved to a done column) |
| Complete | `task.completed` |
| Archive | `task.archived` |
| Restore | `task.restored` |
| Comment | `task.comment.created` |
| Mention notification | `notification.created` → `user:{userId}` |

- Emits are best-effort; REST responses are unchanged if socket is down
- Clients join project room via `room.join.project` on `/v2` namespace
- Notification badge: connect to `/v2`, auto-join `user:{userId}`, listen for `notification.created`
- See [v2-socket.md](./v2-socket.md)

---

## Collections

| Collection | Purpose |
|------------|---------|
| `pts_tasks` | Task documents |
| `pts_task_workflows` | Default workflow per project |
| `pts_task_workflow_statuses` | Kanban columns |
| `pts_task_comments` | Threaded comments (+ `mentions[]`) |
| `pts_task_activities` | Audit log |
| `pts_task_members` | Task-specific roles (optional overlay) |
| `pts_task_collaborators` | Model only (future phase) |
| `pts_task_notifications` | Inbox notifications |

Legacy collections (`tasksV2`, etc.) are **not used** by this module.

---

## Project identity

- Public API uses `projectId` = `pts_projects._id` (ObjectId string).
- No numeric IDs in responses.
- `helpers/projectTaskMapping.helper.js` documents legacy mapping rules with **no silent fallback**.

---

## Membership rules

- **Project assignment** (`pts_project_assignments`) = project access + time logging.
- **Task member** (`pts_task_members`) = task-system role overlay.
- **Task assignees** must have an active project assignment.
- `GET /tasks/projects/:projectId/members` returns assignments with optional task member role.
- Member mutations (`POST`/`PATCH`/`DELETE`) delegate to `pts_project_assignments` via the project assignment service.
- Task UI role `admin` maps to assignment role `lead`; `memberId` accepts either task member id or project assignment id.
- Remove soft-deletes the project assignment (v2 semantics); legacy only deactivated the task member overlay.

### Collaborators

- Stored in `pts_task_collaborators` with `accessType`: `comment`, `review`, or `edit`.
- Collaborators must exist in `pts_users`; active project members cannot be added as collaborators.
- Duplicate add reactivates the existing row and updates `accessType`.
- Permanent delete hard-removes the task, comments, notifications, and collaborators; task activity rows are retained for audit.

---

## Routes

| Method | Path | Permission |
|--------|------|------------|
| GET | `/tasks/inbox` | `tasks.view` or `tasks.manage` |
| GET | `/tasks/my-tasks` | view/manage |
| GET | `/tasks/notifications` | view/manage |
| GET | `/tasks/notifications/unread-count` | view/manage |
| PATCH | `/tasks/notifications/:id/read` | view/manage |
| POST | `/tasks/notifications/read-all` | view/manage |
| GET | `/tasks/mentions` | view/manage |
| GET | `/tasks/activity` | view/manage |
| GET | `/tasks/activity/summary` | `tasks.manage` |
| GET | `/tasks/calendar` | view/manage |
| GET | `/tasks/reports/workload` | `tasks.manage` |
| GET | `/tasks/reports/project-health` | `tasks.manage` |
| GET | `/tasks/reports` | view/manage |
| GET | `/tasks/projects/:projectId/board` | view/manage |
| GET | `/tasks/projects/:projectId/workflow` | view/manage |
| GET | `/tasks/projects/:projectId/settings` | view/manage |
| PATCH | `/tasks/projects/:projectId/settings` | `tasks.manage` |
| PATCH | `/tasks/projects/:projectId/workflow/statuses/reorder` | `tasks.manage` |
| POST | `/tasks/projects/:projectId/workflow/statuses` | `tasks.manage` |
| PATCH | `/tasks/projects/:projectId/workflow/statuses/:statusId` | `tasks.manage` |
| POST | `/tasks/projects/:projectId/workflow/statuses/:statusId/archive` | `tasks.manage` |
| GET | `/tasks/projects/:projectId/members` | view/manage |
| POST | `/tasks/projects/:projectId/members` | `tasks.manage` |
| PATCH | `/tasks/projects/:projectId/members/:memberId` | `tasks.manage` |
| DELETE | `/tasks/projects/:projectId/members/:memberId` | `tasks.manage` |
| GET | `/tasks/tasks/:taskId/collaborators` | view/manage |
| POST | `/tasks/tasks/:taskId/collaborators` | view/manage (project editors + task creator) |
| DELETE | `/tasks/tasks/:taskId/collaborators/:userId` | view/manage (self-remove or editors) |
| DELETE | `/tasks/tasks/:taskId/permanent` | `tasks.manage` |
| GET | `/tasks/projects/:projectId/tasks/archived` | view/manage |
| POST | `/tasks/projects/:projectId/tasks` | `tasks.manage` |
| GET | `/tasks/tasks/:taskId` | view/manage |
| PATCH | `/tasks/tasks/:taskId` | `tasks.manage` |
| PATCH | `/tasks/tasks/:taskId/move` | `tasks.manage` |
| POST | `/tasks/tasks/:taskId/complete` | `tasks.manage` |
| POST | `/tasks/tasks/:taskId/archive` | `tasks.manage` |
| POST | `/tasks/tasks/:taskId/restore` | `tasks.manage` |
| GET | `/tasks/tasks/:taskId/comments` | view/manage |
| POST | `/tasks/tasks/:taskId/comments` | view/manage (readable task) |
| POST | `/tasks/tasks/:taskId/comment-attachments` | view/manage |
| POST | `/tasks/tasks/:taskId/attachments` | `tasks.manage` |
| DELETE | `/tasks/tasks/:taskId/attachments/:attachmentId` | `tasks.manage` |

Query params for notifications/mentions: `page`, `limit`, `unread=true`, optional `userId` (managers only).

---

## Manual test

```bash
BASE=http://localhost:3001
TOKEN=$(curl -s -X POST "$BASE/api/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Password123"}' | jq -r '.data.access_token')

PROJECT_ID="<pts_project_object_id>"

curl -s "$BASE/api/v2/tasks/notifications?limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s "$BASE/api/v2/tasks/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s "$BASE/api/v2/tasks/mentions" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST "$BASE/api/v2/tasks/tasks/<task_id>/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./spec.pdf" | jq

curl -s "$BASE/api/v2/tasks/projects/$PROJECT_ID/settings" \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s "$BASE/api/v2/tasks/projects/$PROJECT_ID/board" \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Angular transition notes

Phase 7 complete — task module uses v2 REST and `/v2` socket only.

1. `TaskService` calls `/api/v2/tasks/*` and `/api/v2/projects/*` for all migrated features.
2. `TaskSocketService` connects to `/v2` namespace only (no legacy `taskV2:*` dual-listen).
3. `uploadCommentAttachment` uses `POST /api/v2/tasks/tasks/:taskId/comment-attachments`.
4. Activity, calendar, and reports use `/api/v2/tasks/*` analytics routes.
5. Notification bell connects to `/v2` and refreshes badge on `notification.created`.

---

## Phase 8 — QA lock

- **Checklist:** [v2-tasks-qa-checklist.md](./v2-tasks-qa-checklist.md)
- **Automated gate:** `node --test src/v2/modules/tasks/tests/*.test.js` + `ng build`
- **Inbox/my-tasks:** collaborator task ids included in aggregate scope (parity with legacy)
- **Analytics tail:** comment attachments, activity, calendar, reports on `/api/v2/tasks/*`

See [v2-rbac.md](./v2-rbac.md) and [v2-projects.md](./v2-projects.md).

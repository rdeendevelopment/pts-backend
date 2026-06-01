# Task Module v2 — QA Checklist (Phase 8)

Use this checklist to sign off the task module cutover after Phases 1–7. All core flows use `/api/v2/tasks/*`, `/api/v2/projects/*`, and the `/v2` Socket.IO namespace.

**Prerequisites**

- API running with `PTS_V2_ENABLED=true`
- Angular app pointed at the same API
- Test accounts: manager (`tasks.manage`), employee (`tasks.view`), collaborator (non-member on a task)
- At least one v2 project (`pts_projects` ObjectId) with tasks, workflow, and members

**Automated gate (run before manual QA)**

```bash
# Backend task module tests
cd project-tracking-system-api
node --test src/v2/modules/tasks/tests/*.test.js

# Angular build
cd ../pts-application
npm run build
```

Both must pass.

---

## 1. Realtime (Phase 1)

| # | Test | Pass |
|---|------|------|
| 1.1 | Open board in two sessions on same ObjectId project | ☐ |
| 1.2 | Create task in session A → appears live in session B | ☐ |
| 1.3 | Move task → column updates in both sessions | ☐ |
| 1.4 | Add comment in drawer → appears live in other session | ☐ |
| 1.5 | Archive task → removed from board in both sessions | ☐ |
| 1.6 | Permanent delete (archived) → `deleted` event closes drawer / removes card | ☐ |
| 1.7 | Disconnect network ~10s → reconnect → board reloads | ☐ |
| 1.8 | No legacy `taskV2:*` events in browser Network/WS tab (only `/v2`) | ☐ |

---

## 2. Board & CRUD

| # | Test | Pass |
|---|------|------|
| 2.1 | Project list loads from `GET /api/v2/projects` | ☐ |
| 2.2 | Board loads columns and tasks | ☐ |
| 2.3 | Create / edit / move / complete task | ☐ |
| 2.4 | Archive from board → appears on archived page | ☐ |
| 2.5 | Restore from archived page → back on board | ☐ |
| 2.6 | List / calendar views update on socket events | ☐ |

---

## 3. Notifications & Mentions (Phase 2)

| # | Test | Pass |
|---|------|------|
| 3.1 | `@mention` in comment creates notification for target user | ☐ |
| 3.2 | Bell badge increments on `notification.created` (v2 socket) | ☐ |
| 3.3 | Mark one read / mark all read updates badge | ☐ |
| 3.4 | Mentions nav shows unread mention rows | ☐ |
| 3.5 | Inbox lists assigned + mentioned tasks | ☐ |

---

## 4. Attachments (Phase 3)

| # | Test | Pass |
|---|------|------|
| 4.1 | Upload task attachment via drawer (`POST …/tasks/:id/attachments`) | ☐ |
| 4.2 | Delete task attachment | ☐ |
| 4.3 | Socket `task.updated` refreshes task in board | ☐ |
| 4.4 | Comment attachment upload via `POST /api/v2/tasks/tasks/:taskId/comment-attachments` | ☐ |

---

## 5. Workflow Settings (Phase 4)

| # | Test | Pass |
|---|------|------|
| 5.1 | Open project settings → loads statuses + stats | ☐ |
| 5.2 | Add / rename / reorder workflow status | ☐ |
| 5.3 | Archive status with tasks → moves tasks to replacement column | ☐ |
| 5.4 | Socket `task.workflow.updated` refreshes board columns | ☐ |

---

## 6. Members (Phase 5)

| # | Test | Pass |
|---|------|------|
| 6.1 | List members shows assignment-backed rows | ☐ |
| 6.2 | Add member by email (maps `admin` ↔ `lead`) | ☐ |
| 6.3 | Change role / remove member | ☐ |
| 6.4 | Cannot add active project member as duplicate | ☐ |

---

## 7. Collaborators & Permanent Delete (Phase 6)

| # | Test | Pass |
|---|------|------|
| 7.1 | List / add / remove collaborators in task drawer | ☐ |
| 7.2 | Collaborator can open task but not archive project settings | ☐ |
| 7.3 | Collaborator-only user sees shared tasks in inbox / my-tasks | ☐ |
| 7.4 | Permanent delete requires archived status + `tasks.manage` | ☐ |
| 7.5 | Related comments/notifications/collaborators removed; activity audit retained | ☐ |

---

## 8. Regression — No Legacy Fallback (Phase 7)

| # | Test | Pass |
|---|------|------|
| 8.1 | Browser devtools: task API calls use `/api/v2/tasks` or `/api/v2/projects` only (except deferred below) | ☐ |
| 8.2 | No `/api/task-v2` calls from Angular Task module | ☐ |
| 8.3 | Single WebSocket namespace `/v2` for task realtime | ☐ |

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Dev | | | Automated tests + build green |
| QA | | | Manual checklist complete |
| Product | | | Accept deferred items |

**Verdict:** Task module is on v2 when sections 1–8 pass.

See also [v2-tasks.md](./v2-tasks.md) and [v2-socket.md](./v2-socket.md).

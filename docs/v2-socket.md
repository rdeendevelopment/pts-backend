# PTS API v2 — Socket / Realtime Module

Module path: `src/v2/modules/socket/`  
Namespace: `/v2` (Socket.IO)  
REST: `/api/v2/socket/*`

Global realtime layer for all v2 modules. Business modules must **not** import `socket.io` directly — use the public helpers exported from this module.

---

## Architecture

```text
HTTP server (server.js)
  └── legacy Socket.IO server (default namespace — unchanged)
        └── v2 namespace `/v2` (initialized after legacy initSocket)
              ├── JWT auth middleware
              ├── auto-join account/user rooms
              ├── validated client room joins
              └── in-memory presence
```

Legacy sockets (`task-system`, `converse`, `task-v2`) remain on the default namespace and are untouched.

---

## Public service API

Import from `src/v2/modules/socket` (or `services/socket.service.js` inside the module):

| Method | Purpose |
|--------|---------|
| `initializeSocket(ioOrHttpServer)` | Attach `/v2` namespace (production: pass shared `io` from bootstrap) |
| `getSocketServer()` | Returns `/v2` namespace instance |
| `isSocketReady()` | Guard before emitting |
| `emitToAccount(accountId, event, payload)` | Account-wide channel |
| `emitToUser(userId, event, payload)` | User profile channel |
| `emitToProject(projectId, event, payload)` | Project board / project events |
| `emitToTask(taskId, event, payload)` | Task detail channel |
| `emitToConversation(conversationId, event, payload)` | Converse channel (future) |
| `broadcast(event, payload)` | All connected `/v2` clients |

All emits no-op safely when `isSocketReady()` is false if callers guard first (recommended).

### Module event helpers (preferred pattern)

Business services should **not** call `socketService` directly unless necessary. Use thin helpers:

| Helper | Module | Status |
|--------|--------|--------|
| `tasks/helpers/taskSocketEvents.helper.js` | Tasks | **Wired** (create/update/move/complete/archive/restore/delete/comment) |
| `activity/helpers/activitySocketEvents.helper.js` | Activity | **Wired** (week submit/approve/reject, timer start/stop) |
| `socket/helpers/notificationSocketEvents.helper.js` | Cross-cutting | **Wired** — `notification.created` on task mention inbox rows |
| `socket/helpers/converseSocketEvents.helper.js` | Converse | Prepared — v2 Converse module later |

Shared best-effort wrapper: `socket/helpers/socketEmit.helper.js`

**Engineering rule:** v2 modules must not import `socket.io` directly. See [v2-engineering-standards.md](./v2-engineering-standards.md).

---

## Socket authentication

Connections to `/v2` require a **v2 access token** (same JWT as REST).

Token sources (first match wins):

1. `handshake.auth.token`
2. `handshake.query.token`
3. `Authorization: Bearer <token>` header

On success the socket receives:

```javascript
socket.v2Auth = {
  accountId,   // string ObjectId
  account,     // pts_accounts document
  userId,      // pts_users._id if profile exists, else null
  user,        // user document or null
};
```

Rejected when:

- Token missing → `SOCKET_AUTH_REQUIRED`
- Token invalid/expired → `SOCKET_AUTH_INVALID`
- Account deleted or not `active` → `SOCKET_ACCOUNT_INACTIVE`

---

## Room strategy

Room names are built **only** via helpers in `helpers/socketRooms.helper.js`:

| Helper | Room pattern |
|--------|----------------|
| `getAccountRoom(accountId)` | `account:{accountId}` |
| `getUserRoom(userId)` | `user:{userId}` |
| `getProjectRoom(projectId)` | `project:{projectId}` |
| `getTaskRoom(taskId)` | `task:{taskId}` |
| `getConversationRoom(conversationId)` | `conversation:{conversationId}` |

### Auto-join on connect

- `account:{accountId}` — always
- `user:{userId}` — when a user profile exists

### Client-requested joins (validated)

Clients emit:

| Event | Payload | Validation |
|-------|---------|------------|
| `room.join.project` | `{ projectId }` | Project exists + active assignment |
| `room.leave.project` | `{ projectId }` | Room name via helper only |
| `room.join.task` | `{ taskId }` | Task exists + project access |
| `room.leave.task` | `{ taskId }` | Room name via helper only |
| `room.join.conversation` | `{ conversationId }` | ObjectId only (Converse RBAC later) |
| `room.leave.conversation` | `{ conversationId }` | Room name via helper only |

Clients cannot call `socket.join()` with arbitrary room strings — only server-validated flows apply.

---

## Event naming standard

Use **dot notation** for server → client events. Constants live in `constants/socket.constants.js` (`SERVER_EVENTS`).

Examples:

- `notification.created`
- `project.updated`
- `task.created` / `task.updated` / `task.moved` / `task.completed` / `task.archived` / `task.restored` / `task.deleted`
- `task.comment.created`
- `activity.week.submitted` / `activity.week.approved` / `activity.week.rejected`
- `activity.entry.created` / `activity.timer.started` / `activity.timer.stopped`
- `converse.message.created` / `converse.conversation.updated` / `converse.typing.started` / `converse.typing.stopped`
- `converse.message.created`
- `presence.updated`
- `system.alert`

---

## Presence (in-memory)

Tracked per connection:

- `accountId`, `userId`, `socketIds`, `connectedAt`, `lastSeenAt`

Helpers:

- `isAccountOnline(accountId)`
- `isUserOnline(userId)`
- `getOnlineAccountIds()`
- `getOnlineUserIds()`

Resets on process restart. No Redis yet.

`presence.updated` is emitted to the user's room on connect/disconnect.

---

## REST endpoints

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v2/socket/health` | v2 JWT | authenticated |
| GET | `/api/v2/socket/presence` | v2 JWT | `rbac.manage` or `modules.manage` |

---

## Module integration example (Tasks)

Task services emit through `tasks/helpers/taskSocketEvents.helper.js` (best-effort, non-blocking):

| REST action | Socket event | Target room |
|-------------|--------------|-------------|
| Create task | `task.created` | project |
| Update task | `task.updated` | project |
| Move task | `task.moved` (+ `task.completed` when moved to done) | project |
| Complete task | `task.completed` | project |
| Archive task | `task.archived` | project |
| Restore task | `task.restored` | project |
| Permanent delete task | `task.deleted` | project |
| Create comment | `task.comment.created` | project + task |
| Upload attachment | `task.updated` | project |
| Delete attachment | `task.updated` | project |
| Workflow admin change | `task.workflow.updated` | project |
| Mention notification | `notification.created` | user (`user:{userId}`) |

Clients must join `project:{projectId}` via `room.join.project` on `/v2` namespace (and `room.join.task` for task-detail comment events).

For inbox badge refresh, clients connect to `/v2` (auto-joins `user:{userId}`) and listen for `notification.created`. Angular `TaskNotificationBellComponent` calls `TaskService.refreshNotificationUnread()` on that event (full recount, not incremental).

Payload shape matches `toNotificationDto()` in `tasks/dto/task.dto.js` — DTO-safe fields only, no raw Mongoose documents.

---

## Module integration example (Task notifications)

| REST action | Socket event | Target room |
|-------------|--------------|-------------|
| Comment with `@mention` | `notification.created` | `user:{mentionedUserId}` |

Emitted from `tasks/services/taskNotification.service.js` via `notificationSocketEvents.helper.js` after persisting to `pts_task_notifications`.

---

## Module integration example (Task workflow admin)

| REST action | Socket event | Target room |
|-------------|--------------|-------------|
| Create/update/reorder/archive workflow status | `task.workflow.updated` | project |

Emitted from `tasks/services/taskProjectSettings.service.js` via `taskSocketEvents.helper.js` with `{ action, workflow, statuses }` payload.

---

## Module integration example (Activity)

Activity services emit through `activity/helpers/activitySocketEvents.helper.js` (best-effort, non-blocking):

| REST action | Socket event | Target rooms |
|-------------|--------------|--------------|
| Submit week | `activity.week.submitted` | user + each affected project |
| Approve week | `activity.week.approved` | user + each affected project |
| Reject week | `activity.week.rejected` | user + each affected project |
| Start timer | `activity.timer.started` | user + project |
| Stop timer | `activity.timer.stopped` | user + project |

Managers and submitters receive user-room events automatically on connect. Project-scoped listeners must join `project:{projectId}`.

`activity.entry.created` is defined in constants but not wired from draft entry CRUD yet.

---

## Server bootstrap

`server.js` initializes legacy sockets first, then attaches v2:

```javascript
initSocket(server);
const io = getIO();
initializeSocket(io); // when PTS_V2_ENABLED !== 'false'
```

v2 does **not** create a second HTTP server or a second Socket.IO root server in production.

---

## Error codes

| Code | Meaning |
|------|---------|
| `SOCKET_NOT_INITIALIZED` | Emit called before bootstrap |
| `SOCKET_AUTH_REQUIRED` | No token on handshake |
| `SOCKET_AUTH_INVALID` | Bad/expired token or missing account |
| `SOCKET_ACCOUNT_INACTIVE` | Account not active |
| `SOCKET_ROOM_INVALID` | Bad room id/prefix |
| `SOCKET_FORBIDDEN` | Failed room access validation |

---

## Manual test steps

1. Start API with `PTS_V2_ENABLED=true`.
2. `POST /api/v2/auth/login` → copy `accessToken`.
3. `GET /api/v2/socket/health` with Bearer token → `ready: true`.
4. Connect Socket.IO client to namespace `/v2` with `auth: { token }`.
5. Emit `room.join.project` with a project you are assigned to → `{ ok: true, room }`.
6. Create a task via REST → receive `task.created` on project room.
7. `GET /api/v2/socket/presence` as RBAC admin → online users/accounts listed.

---

## Risks before wiring Converse / Reports

1. **Activity manager visibility** — Week approval events reach project rooms; managers must join those projects to see team submissions in realtime.
2. **Conversation access** — `room.join.conversation` only validates ObjectId today; Converse membership must be enforced before production notifications.
3. **Scale** — In-memory presence and single-node emits break with horizontal scaling until Redis adapter is added.
4. **Delivery guarantees** — Fire-and-forget emits; no offline inbox yet (`pts_task_notifications` model exists but is unused).
5. **Duplicate clients** — Multiple tabs = multiple sockets; presence counts sockets, not unique humans.

---

## Tests

```bash
npm run test:v2 -- src/v2/modules/socket/tests/
```

Covers room helpers, event constants, presence add/remove, socket ready guards, task event helpers, and **`v2SocketAudit.test.js`** (grep-style proof that no v2 business module uses raw `socket.io` or hard-coded room strings).

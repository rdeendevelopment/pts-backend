# DiscussFlow Backend — Final Integration Guide

Base: `{{baseUrl}}/api/v2/discuss-flow`

Production-ready backend for Angular/Codex frontend integration. Does **not** modify Task V2, Projects, Activity, Converse, or Socket infrastructure internals.

---

## Architecture

```
DiscussFlow Module
├── Core (workspaces, topics, messages, members)
├── Live + Guest (guest links, guest JWT, socket rooms)
├── AI Import (import batches, AI review items, job handler)
├── Truth Layer (documents, requirement/decision locking, versions)
└── Finalization (handoffs, bulk review, search, resume, AI usage)
```

**Tenant model:** `req.v2Auth.accountId` is used as tenant ID throughout.

**Cross-module handoff:** Uses public `taskBoardService.createTask()` when `projectId` is provided; otherwise stores `pts_discuss_flow_handoffs` with `status: pending`.

---

## Entity Map

| Collection | Entity | Purpose |
|------------|--------|---------|
| `pts_discuss_flow_workspaces` | Workspace | Discussion workspaces |
| `pts_discuss_flow_topics` | Topic | Discussion threads |
| `pts_discuss_flow_messages` | Message | Chat messages |
| `pts_discuss_flow_requirements` | Requirement | Truth requirements |
| `pts_discuss_flow_decisions` | Decision | Truth decisions |
| `pts_discuss_flow_documents` | TopicDocument | Locked documents |
| `pts_discuss_flow_ai_review_items` | AiReviewItem | AI extraction queue |
| `pts_discuss_flow_import_batches` | ImportBatch | Chat imports |
| `pts_discuss_flow_guest_links` | GuestLink | External collaboration |
| `pts_discuss_flow_handoffs` | Handoff | PTS task/project bridge |
| `pts_discuss_flow_*_versions` | Version snapshots | Immutable lock history |
| `pts_discuss_flow_timeline` | Timeline | Audit events |
| `pts_ai_jobs` + `pts_ai_usage` | AI jobs/usage | AI execution + billing |

---

## Route List (Complete)

### Public / Guest
| Method | Path |
|--------|------|
| GET | `/guest/:token/preview` |
| POST | `/guest/:token/join` |
| GET | `/guest/session` |
| POST | `/guest/session/messages` |

### Workspaces & Topics
| Method | Path |
|--------|------|
| GET | `/search?q=&workspaceId=&type=&status=` |
| POST/GET/PATCH | `/workspaces`, `/workspaces/:id` |
| POST/GET/PATCH | `/topics`, `/topics/:id` |
| GET | `/topics/:id/panel` |
| GET | `/topics/:id/resume` |
| GET | `/topics/:id/ai-usage` |
| GET | `/topics/:id/timeline` |

### Messages & Import
| Method | Path |
|--------|------|
| POST/GET/PATCH/DELETE | `/topics/:id/messages[/:messageId]` |
| POST | `/topics/:id/messages/:messageId/reply` |
| POST | `/topics/:id/import-chat` |
| GET/POST | `/topics/:id/messages/:messageId/ai-suggestions|ai-analyze` |

### AI Review
| Method | Path |
|--------|------|
| GET | `/topics/:id/ai-review-items` |
| POST | `/topics/:id/ai-review-items/bulk-approve` |
| POST | `/topics/:id/ai-review-items/bulk-dismiss` |
| PATCH/POST | `/ai-review-items/:id`, `/approve`, `/dismiss` |
| POST | `/ai-review-items/:id/create-document-draft` |
| POST | `/ai-review-items/:id/create-task-candidate` |

### Documents
| Method | Path |
|--------|------|
| POST/GET | `/topics/:id/documents` |
| POST | `/topics/:id/documents/generate` |
| GET/PATCH | `/documents/:documentId` |
| POST | `/documents/:documentId/submit-review|lock|new-version` |
| GET | `/documents/:documentId/versions` |
| POST | `/documents/:documentId/create-project-brief` |

### Requirements & Decisions
| Method | Path |
|--------|------|
| POST/GET | `/topics/:id/requirements` |
| POST | `/requirements/:id/submit-review|approve|lock|new-version|create-task` |
| GET | `/requirements/:id/versions` |
| POST/GET | `/topics/:id/decisions` |
| POST | `/decisions/:id/approve|lock|new-version` |
| GET | `/decisions/:id/versions` |
| POST/GET | `/topics/:id/questions` |

### Guest Links
| Method | Path |
|--------|------|
| POST | `/guest-links` |
| PATCH | `/guest-links/:id/revoke` |

---

## Socket Events

| Event | Trigger |
|-------|---------|
| `discussflow:message:created|updated|deleted` | Message CRUD |
| `discussflow:import:created|messages_saved` | Chat import |
| `discussflow:ai-review:ready|failed` | Import/analysis jobs |
| `discussflow:ai-review:item:approved|dismissed` | Review actions |
| `discussflow:requirement:*` | Requirement lifecycle |
| `discussflow:decision:*` | Decision lifecycle |
| `discussflow:document:*` | Document lifecycle |
| `discussflow:truth:updated` | Truth layer changes |
| `discussflow:handoff:created|completed|failed` | PTS handoffs |
| `discussflow:resume:updated` | Continue-topic state |
| `discussflow:right-panel:updated` | Panel refresh |

---

## Permission Matrix

| Capability | viewer | commenter | contributor | manager | owner | guest |
|------------|--------|-----------|-------------|---------|-------|-------|
| Read topic/messages | ✓ | ✓ | ✓ | ✓ | ✓ | scoped* |
| Write messages | — | ✓ | ✓ | ✓ | ✓ | commenter+ |
| Create drafts | — | — | ✓ | ✓ | ✓ | suggestion only |
| Submit review | — | — | ✓ | ✓ | ✓ | — |
| Approve/lock | — | — | — | ✓ | ✓ | — |
| Bulk approve | — | — | — | ✓ | ✓ | — |
| Handoff (task/brief) | — | — | — | ✓ | ✓ | — |
| Global search | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Revoke guest links | — | — | — | ✓ | ✓ | — |
| Archive | — | — | — | — | ✓ | — |

\*Guest access limited to assigned topic via guest link JWT.

Central helper: `helpers/discussFlowPermissionMatrix.helper.js`

---

## Guest Access Flow

1. Manager creates guest link → `POST /guest-links`
2. Guest opens `/guest/:token/preview` → joins via `/guest/:token/join`
3. Guest JWT used for `/guest/session` routes only
4. Socket joins topic room via `room.join.discussflow.topic`
5. Guests cannot: approve, lock, bulk approve, handoff, global search

---

## AI Import Flow

1. `POST /topics/:id/import-chat` → parse + save messages
2. AI job `DISCUSS_IMPORT_CHAT` (async for large chats)
3. Review items created → `discussflow:ai-review:ready`
4. Manager approves/dismisses (single or bulk)
5. Approved items create requirements/decisions/questions/summaries
6. `task_candidate` → approve only; use `create-task-candidate` for handoff

---

## Document Locking Flow

`draft → review → locked → archived`  
Lock creates version snapshot. Changes via `new-version` only.

---

## Handoff Flow

### Task from requirement
```
POST /requirements/:id/create-task
Body: { "project_id": "..." }  // optional
```
- Requirement must be `approved` or `locked`
- With `project_id`: calls `taskBoardService.createTask()` → `status: created`
- Without `project_id`: `pts_discuss_flow_handoffs` → `status: pending`

### Task from AI review item
```
POST /ai-review-items/:id/create-task-candidate
Body: { "project_id": "..." }
```
- Item must be `approved` + type `task_candidate`
- On success: review item → `converted`, links `target_id`

### Project brief from document
```
POST /documents/:id/create-project-brief
```
- Document must be `locked`
- Always creates pending handoff (`targetModule: projects`) — no Projects V2 guessing

**Response shape:**
```json
{ "status": "created|pending", "handoff_id": "...", "target_id": "..." }
```

---

## Frontend Integration Notes

### Continue Topic
`GET /topics/:id/resume` — primary bootstrap for returning users:
- Latest summary, locked truth, open questions, pending AI items, suggested actions
- Subscribe to `discussflow:resume:updated`

### Right Panel
`GET /topics/:id/panel` — live sidebar data including `guest_links`, `handoffs`, `truth_status`

### Search
`GET /search?q=auth&workspaceId=...&type=all` — grouped results with pagination

### Bulk Review (WhatsApp imports)
```json
POST /topics/:id/ai-review-items/bulk-approve
{ "itemIds": ["...", "..."], "type": "requirement" }
→ { "approved": [], "dismissed": [], "failed": [] }
```

### Handoff UI
- Show pending handoffs from panel `handoffs.pending_count`
- Prompt for `project_id` when creating tasks
- Poll/listen for `discussflow:handoff:completed`

### AI Usage / Billing
`GET /topics/:id/ai-usage` — token totals and per-action breakdown

### Pagination Standard
All list/search endpoints: `page`, `limit` (max 200), `q`, `sort`

---

## Known Limitations

1. **Project brief handoff** — pending only; no automatic Projects V2 creation
2. **CRM/HRM handoffs** — model supports `targetModule` but no processors yet
3. **Search** — tenant-scoped; no cross-tenant; messages searched via topic ID set
4. **Task handoff without projectId** — queued as pending; requires manual PTS linking
5. **Guest search** — intentionally blocked on global `/search`
6. **AI usage** — joined via `jobId`; no direct `topicId` on `pts_ai_usage`
7. **Bulk approve** — sequential per item; partial success supported

---

## Testing Checklist

Run: `node --test src/v2/modules/discuss-flow/tests/*.test.js`

- [x] Handoff rules (approved/locked requirement, approved task_candidate, locked document)
- [x] Guest cannot handoff/search globally
- [x] Manager bulk approve permission
- [x] Owner revoke guest link permission matrix
- [x] Panel final shape (guest_links, handoffs)
- [x] Resume topic shape
- [x] Search entity types
- [x] AI usage aggregation shape
- [x] Pagination bounds
- [x] Socket events for handoff/resume

---

## Next Step for Angular/Codex

1. **Module shell** — DiscussFlow routes under `/discuss-flow` with `discuss_flow.view|manage` guards
2. **Topic workspace** — list topics, resume endpoint, panel subscription
3. **Live chat** — socket room join, message list with pagination
4. **AI review inbox** — bulk approve/dismiss for imports
5. **Truth panel** — requirements/decisions/documents lifecycle UI
6. **Handoff modals** — project picker for task creation from requirements/task_candidates
7. **Search bar** — global `/search` with grouped results
8. **Guest flow** — separate public routes, no dashboard auth

Reference docs:
- `discuss-flow-live-layer.md`
- `discuss-flow-ai-import-layer.md`
- `discuss-flow-truth-layer.md`
- `discuss-flow-backend-final.md` (this file)

# DiscussFlow Documents + Requirement/Decision Locking Layer

Base: `{{baseUrl}}/api/v2/discuss-flow`

Core rule: **AI generates drafts. Humans approve and lock. Locked items are immutable. Changes require a new version.**

## 1. Changed Files List

### New
- `models/discussFlowDocument.model.js`
- `models/discussFlowDocumentVersion.model.js`
- `models/discussFlowRequirementVersion.model.js`
- `models/discussFlowDecisionVersion.model.js`
- `repositories/discussFlowDocument.repository.js`
- `repositories/discussFlowDocumentVersion.repository.js`
- `repositories/discussFlowRequirementVersion.repository.js`
- `repositories/discussFlowDecisionVersion.repository.js`
- `helpers/discussFlowLifecycle.helper.js`
- `helpers/truthPanel.helper.js`
- `services/document.service.js`
- `services/documentGenerate.service.js`
- `services/requirementLifecycle.service.js`
- `services/decisionLifecycle.service.js`
- `controllers/document.controller.js`
- `tests/truthLayer.test.js`
- `docs/discuss-flow-truth-layer.md`

### Updated
- `constants/discussFlow.constants.js`
- `constants/discussFlowSocket.constants.js`
- `models/discussFlowRequirement.model.js`
- `models/discussFlowDecision.model.js`
- `models/index.js`
- `dto/discussFlow.dto.js`
- `errors/discussFlowErrorCodes.js`
- `helpers/discussFlowPermission.helper.js`
- `helpers/discussFlowSocketEvents.helper.js`
- `repositories/discussFlowRequirement.repository.js`
- `repositories/discussFlowDecision.repository.js`
- `services/panel.service.js`
- `services/aiReviewItem.service.js`
- `services/discussFlowAiJobHandler.service.js`
- `controllers/requirement.controller.js`
- `controllers/decision.controller.js`
- `controllers/aiReviewItem.controller.js`
- `validators/discussFlow.validators.js`
- `discussFlow.routes.js`
- `src/v2/modules/ai/constants/ai-actions.constants.js`
- `src/v2/modules/ai/prompts/discussflow.prompts.js`
- `tests/panel.service.test.js`

## 2. Models Added / Updated

| Collection | Model | Purpose |
|------------|-------|---------|
| `pts_discuss_flow_documents` | `TopicDocument` | Draft/review/locked topic documents |
| `pts_discuss_flow_document_versions` | `TopicDocumentVersion` | Immutable snapshot on lock |
| `pts_discuss_flow_requirement_versions` | `RequirementVersion` | Immutable requirement snapshot on lock |
| `pts_discuss_flow_decision_versions` | `DecisionVersion` | Immutable decision snapshot on lock |

**Requirement / Decision** fields added: `version`, `parent*Id`, `lockedAt/By`, `approvedAt/By`, `changeReason`, `sourceReviewItemId`, `sourceMessageIds`, `sourceAiJobId`, `archived` status.

## 3. Routes Added

| Method | Path | Auth |
|--------|------|------|
| POST | `/topics/:topicId/documents` | JWT + `discuss_flow.manage` |
| GET | `/topics/:topicId/documents` | JWT + `discuss_flow.view` |
| POST | `/topics/:topicId/documents/generate` | JWT + `discuss_flow.manage` |
| GET | `/documents/:documentId` | JWT + `discuss_flow.view` |
| PATCH | `/documents/:documentId` | JWT + `discuss_flow.manage` |
| POST | `/documents/:documentId/submit-review` | JWT + `discuss_flow.manage` |
| POST | `/documents/:documentId/lock` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/documents/:documentId/new-version` | JWT + `discuss_flow.manage` (manager/owner) |
| GET | `/documents/:documentId/versions` | JWT + `discuss_flow.view` |
| POST | `/requirements/:id/submit-review` | JWT + `discuss_flow.manage` |
| POST | `/requirements/:id/approve` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/requirements/:id/lock` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/requirements/:id/new-version` | JWT + `discuss_flow.manage` (manager/owner) |
| GET | `/requirements/:id/versions` | JWT + `discuss_flow.view` |
| POST | `/decisions/:id/approve` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/decisions/:id/lock` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/decisions/:id/new-version` | JWT + `discuss_flow.manage` (manager/owner) |
| GET | `/decisions/:id/versions` | JWT + `discuss_flow.view` |
| POST | `/ai-review-items/:id/create-document-draft` | JWT + `discuss_flow.manage` (manager/owner) |

Updated: `GET /topics/:id/panel` → `documents`, `truth_status`, expanded `next_actions`.

## 4. Document Lifecycle

```
draft → review → locked → archived (owner only)
         ↑ edit only in draft
```

- **draft**: create, edit title/content/links, submit for review
- **review**: manager locks (creates version snapshot)
- **locked**: immutable; `new-version` creates draft vN+1 with `parentDocumentId`
- **archived**: terminal (owner)

## 5. Requirement Lifecycle

```
draft → review → approved → locked → (new version → draft vN+1)
```

- Contributor/owner: create draft, submit review
- Manager/owner: approve, lock
- Lock creates `RequirementVersion` snapshot

## 6. Decision Lifecycle

```
draft → approved → locked → (new version → draft vN+1)
```

- Manager/owner: approve, lock
- Lock creates `DecisionVersion` snapshot

## 7. Versioning Rules

| Entity | When version record created | New version source |
|--------|----------------------------|-------------------|
| Document | On lock | From locked document → new draft with `version + 1`, `parentDocumentId` |
| Requirement | On lock | From locked requirement → new draft row with `parentRequirementId` |
| Decision | On lock | From locked decision → new draft row with `parentDecisionId` |

Locked entities cannot edit `title`, `content`, or truth links (documents). Changes require explicit `new-version` endpoint.

## 8. AI Document Generation Flow

```
POST /topics/:topicId/documents/generate
  → verify topic access (manager)
  → load requirements/decisions/questions/messages context
  → aiDispatcher.execute(DISCUSS_GENERATE_DOCUMENT)
  → if context ≥ 12 items: async job → returns { status: 'queued', job_id }
  → on completion: create draft TopicDocument, emit discussflow:document:draft_created
  → sync path: returns { status: 'ready', document_id, document }
```

**AI action**: `DISCUSS_GENERATE_DOCUMENT`  
**Output schema**: `title`, `document_type`, `content_markdown`, `sections`, `linked_requirement_refs`, `linked_decision_refs`, `unresolved_questions`, `assumptions`

## 9. Socket Events

| Event | When |
|-------|------|
| `discussflow:document:created` | Manual/AI draft created |
| `discussflow:document:updated` | Draft edited |
| `discussflow:document:draft_created` | AI generation completed |
| `discussflow:document:review_submitted` | Submitted for review |
| `discussflow:document:locked` | Document locked |
| `discussflow:document:version_created` | New version from locked |
| `discussflow:requirement:review_submitted` | Requirement in review |
| `discussflow:requirement:approved` | Requirement approved |
| `discussflow:requirement:locked` | Requirement locked |
| `discussflow:requirement:version_created` | Requirement new version |
| `discussflow:decision:approved` | Decision approved |
| `discussflow:decision:locked` | Decision locked |
| `discussflow:decision:version_created` | Decision new version |
| `discussflow:truth:updated` | Any truth-layer change |

## 10. Panel Response Example

```json
{
  "topic": { "id": "...", "title": "Sprint planning" },
  "counts": {
    "messages": 42,
    "requirements": 8,
    "open_questions": 2,
    "decisions": 3,
    "locked_documents": 1,
    "draft_documents": 2,
    "documents": 4
  },
  "documents": {
    "recent": [{ "id": "...", "title": "BRD v1", "status": "draft", "document_type": "brd" }],
    "locked_count": 1,
    "draft_count": 2
  },
  "truth_status": {
    "locked_requirements": 3,
    "approved_requirements": 5,
    "locked_decisions": 1,
    "approved_decisions": 2,
    "locked_documents": 1,
    "open_questions": 2
  },
  "next_actions": [
    { "type": "approve_requirement", "label": "Approve: Auth flow", "entity_id": "..." },
    { "type": "lock_document", "label": "Lock document: BRD v1", "entity_id": "..." },
    { "type": "answer_question", "label": "Answer: What is the deadline?", "entity_id": "..." }
  ]
}
```

## 11. Permission Matrix

| Role | Read docs | Create draft | Submit review | Approve | Lock | New version | Archive |
|------|-----------|--------------|---------------|---------|------|-------------|---------|
| viewer | ✓ | — | — | — | — | — | — |
| commenter | ✓ | — | — | — | — | — | — |
| contributor | ✓ | ✓ | ✓ | — | — | — | — |
| manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| guest viewer | ✓* | — | — | — | — | — | — |
| guest commenter | ✓* | — | — | — | — | — | — |
| guest contributor | ✓* | suggestion only | — | — | — | — | — |

\*Guest read requires guest link permission.

## 12. Postman Examples

**Create draft document**
```
POST {{baseUrl}}/api/v2/discuss-flow/topics/{{topicId}}/documents
Authorization: Bearer {{token}}
{ "title": "Project BRD", "document_type": "brd", "content": "# Scope\n..." }
```

**Generate document (async)**
```
POST {{baseUrl}}/api/v2/discuss-flow/topics/{{topicId}}/documents/generate
{ "document_type": "requirements_document", "instructions": "Focus on auth", "requirement_ids": ["..."] }
→ 202 { "status": "queued", "job_id": "..." }
```

**Lock document**
```
POST {{baseUrl}}/api/v2/discuss-flow/documents/{{documentId}}/lock
{ "change_reason": "Approved in sprint review" }
```

**New version from locked**
```
POST {{baseUrl}}/api/v2/discuss-flow/documents/{{documentId}}/new-version
{ "change_reason": "Scope change after client feedback" }
```

**Approve + lock requirement**
```
POST .../requirements/{{id}}/submit-review
POST .../requirements/{{id}}/approve
POST .../requirements/{{id}}/lock
```

**Create document draft from AI review item**
```
POST {{baseUrl}}/api/v2/discuss-flow/ai-review-items/{{itemId}}/create-document-draft
{ "document_type": "meeting_summary" }
```

## 13. Testing Checklist

- [x] Locked document cannot be edited (`assertDocumentEditable`)
- [x] New version only from locked document (service guard)
- [x] Requirement allowed transitions
- [x] Requirement locked cannot be edited
- [x] Decision allowed transitions
- [x] Decision locked cannot be edited
- [x] AI doc gen async threshold (context ≥ 12)
- [x] Panel includes document/truth counts
- [x] Guest cannot lock/approve
- [x] Timeline events defined for lock/version/truth_updated

Run: `node --test src/v2/modules/discuss-flow/tests/*.test.js`

## 14. Notes for Prompt 6 (Frontend)

- Subscribe to `discussflow:truth:updated` and `discussflow:right-panel:updated` for live truth counts
- Document editor should disable edits when `status === 'locked'`; show "Create new version" CTA for managers
- Requirement/decision cards: show `version`, `locked_at`, `approved_at` badges
- Generate document flow: poll `job_id` when `status === 'queued'`; listen for `discussflow:document:draft_created`
- Panel `next_actions` drives manager action queue (approve, lock, answer)
- Do **not** wire task generation from `task_candidate` approvals yet
- Guest UI: read-only documents; no lock/approve/archive controls

**Not built in this layer:** task/project generation, CRM/HRM, advanced editor, frontend, Task V2 changes.

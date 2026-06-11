# DiscussFlow AI Import + Extraction Layer

Base: `{{baseUrl}}/api/v2/discuss-flow`

## Changed / Added Files

### New
- `models/discussFlowImportBatch.model.js`
- `models/discussFlowAiReviewItem.model.js`
- `repositories/discussFlowImportBatch.repository.js`
- `repositories/discussFlowAiReviewItem.repository.js`
- `helpers/whatsappParser.helper.js`
- `services/importChat.service.js`
- `services/aiReviewItem.service.js`
- `services/discussFlowAiJobHandler.service.js`
- `services/aiJobQuery.service.js`
- `controllers/importChat.controller.js`
- `controllers/aiReviewItem.controller.js`
- `tests/whatsappParser.helper.test.js`
- `tests/importChat.service.test.js`
- `tests/discussFlowAiJobHandler.test.js`
- `tests/aiReviewPermissions.test.js`
- `tests/aiDispatcherImport.test.js`

### Updated
- `constants/discussFlow.constants.js`
- `constants/discussFlowSocket.constants.js`
- `models/discussFlowMessage.model.js` (authorType `imported`)
- `models/index.js`
- `dto/discussFlow.dto.js`
- `errors/discussFlowErrorCodes.js`
- `helpers/discussFlowPermission.helper.js`
- `helpers/discussFlowSocketEvents.helper.js`
- `middleware/resolveDiscussFlowActor.js`
- `repositories/discussFlowMessage.repository.js`
- `services/message.service.js`
- `services/panel.service.js`
- `controllers/message.controller.js`
- `validators/discussFlow.validators.js`
- `discussFlow.routes.js`
- `src/v2/modules/ai/constants/ai-actions.constants.js`
- `src/v2/modules/ai/prompts/discussflow.prompts.js`
- `src/v2/modules/ai/services/ai-job.service.js`

## Models Added

| Collection | Purpose |
|------------|---------|
| `pts_discuss_flow_import_batches` | Chat import runs, parse stats, AI job linkage |
| `pts_discuss_flow_ai_review_items` | AI-extracted items pending human approval |

## Routes Added

| Method | Path | Auth |
|--------|------|------|
| POST | `/topics/:id/import-chat` | JWT + `discuss_flow.manage` |
| GET | `/topics/:id/ai-review-items` | JWT + `discuss_flow.view` |
| PATCH | `/ai-review-items/:id` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/ai-review-items/:id/approve` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/ai-review-items/:id/dismiss` | JWT + `discuss_flow.manage` (manager/owner) |
| POST | `/topics/:id/messages/:messageId/ai-analyze` | JWT + `discuss_flow.manage` |

Updated:
- `GET /topics/:id/messages/:messageId/ai-suggestions` → returns linked review items
- `GET /topics/:id/panel` → includes `ai_jobs`, `ai_review`, `summary`

## Parser Examples

**Bracket format**
```
[06/06/2026, 5:01:15 PM] Cristian: We have things to do
[06/06/2026, 5:02:01 PM] Usama Ilyas: Yes you are right
```

**Dash format**
```
06/06/2026, 5:01 PM - Cristian: Message
6/6/26, 17:01 - Cristian: Message
```

Multiline lines append to the previous parsed message. Unparsed leading lines produce `parseWarnings`.

## AI Action Payload Example

```json
{
  "action": "DISCUSS_IMPORT_CHAT",
  "actor": "{{accountId}}",
  "tenantId": "{{accountId}}",
  "sourceModule": "discuss-flow",
  "sourceId": "{{topicId}}",
  "context": {
    "topicId": "{{topicId}}",
    "importBatchId": "{{importBatchId}}",
    "participants": ["Cristian", "Usama Ilyas"],
    "messageCount": 12
  },
  "input": {
    "rawText": "...pasted chat...",
    "parsedMessages": [
      { "id": "...", "ref": "line-1", "author_name": "Cristian", "content": "..." }
    ],
    "forceAsync": true
  }
}
```

Expected structured output:
```json
{
  "summary": { "title": "", "content": "", "key_points": [], "confidence": 0.8, "linked_message_refs": [] },
  "requirements": [{ "title": "", "description": "", "priority": "medium", "confidence": 0.7, "linked_message_refs": [] }],
  "questions": [{ "question": "", "context": "", "confidence": 0.7, "linked_message_refs": [] }],
  "decisions": [{ "title": "", "context": "", "impact": "", "confidence": 0.7, "linked_message_refs": [] }],
  "risks": [],
  "task_candidates": [],
  "next_actions": []
}
```

## Review Item Lifecycle

1. **pending** — created from AI job completion
2. **edited** — manager edits title/content/priority before approval
3. **approved** — human approved; may create official Requirement (`review`), Question (`open`), Decision (`draft`), or topic summary
4. **dismissed** — rejected by manager/owner
5. **converted** — reserved for future automation

Guests cannot approve or dismiss. Contributors can view queue if they have topic read access.

## Socket Events

- `discussflow:import:created`
- `discussflow:import:messages_saved`
- `discussflow:ai-review:ready`
- `discussflow:ai-review:failed`
- `discussflow:ai-review:item:approved`
- `discussflow:ai-review:item:dismissed`
- `discussflow:right-panel:updated` (includes AI slices)

## Panel Response Example

```json
{
  "topic": { "id": "...", "title": "Client sync" },
  "counts": { "messages": 24, "requirements": 2, "open_questions": 1, "decisions": 0, "locked_documents": 0 },
  "ai_jobs": [
    { "id": "...", "action": "DISCUSS_IMPORT_CHAT", "status": "running", "progress": 15 }
  ],
  "ai_review": {
    "pending_count": 6,
    "high_confidence_count": 3,
    "recent_items": []
  },
  "summary": {
    "title": "Sprint recap",
    "content": "Aligned on OAuth approach",
    "review_item_id": "...",
    "approved_at": "2026-06-06T12:00:00.000Z"
  },
  "next_actions": [
    { "type": "ai_next_action", "label": "Confirm deadline", "entity_id": "...", "source": "ai_review" }
  ],
  "documents": [],
  "participant_count": 3,
  "last_activity": "2026-06-06T11:00:00.000Z"
}
```

## Postman Examples

### Import chat
```
POST /api/v2/discuss-flow/topics/{{topicId}}/import-chat
Authorization: Bearer {{accessToken}}
{
  "source_type": "whatsapp",
  "raw_text": "[06/06/2026, 5:01:15 PM] Cristian: We need SSO\n[06/06/2026, 5:02:01 PM] Usama: Agreed",
  "run_ai_extraction": true
}
```

### List review items
```
GET /api/v2/discuss-flow/topics/{{topicId}}/ai-review-items?status=pending&type=requirement
Authorization: Bearer {{accessToken}}
```

### Approve requirement suggestion
```
POST /api/v2/discuss-flow/ai-review-items/{{reviewItemId}}/approve
Authorization: Bearer {{accessToken}}
```

### Analyze single message
```
POST /api/v2/discuss-flow/topics/{{topicId}}/messages/{{messageId}}/ai-analyze
Authorization: Bearer {{accessToken}}
```

## Testing Checklist

- [ ] `npm run lint:v2`
- [ ] `node --test src/v2/modules/discuss-flow/tests/*.test.js`
- [ ] Import WhatsApp paste → messages saved with `source: imported_whatsapp`
- [ ] Import returns `ai_job_id` without blocking HTTP
- [ ] On `ai:job:completed` → review items created, batch `review_ready`
- [ ] Approve requirement → official requirement with `status: review`
- [ ] Approve question → official question with `status: open`
- [ ] Approve decision → official decision with `status: draft`
- [ ] Guest cannot approve review item (403)
- [ ] Panel shows `ai_jobs` and `ai_review.pending_count`
- [ ] Message `ai-suggestions` returns linked review items

## Notes for Prompt 5

1. Document locking and BRD/PRD generation remain out of scope
2. `task_candidate` approved items stay in review queue — wire to Tasks module in Prompt 5
3. `converted` status reserved when auto-promotion flows are added
4. Consider batch UI for approve/dismiss multiple review items
5. Optional: guest-visible read-only review queue for contributors (view only, no approve)

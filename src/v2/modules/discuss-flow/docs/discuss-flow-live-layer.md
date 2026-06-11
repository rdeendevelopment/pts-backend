# DiscussFlow Live Discussion + Guest Collaboration Layer

Base: `{{baseUrl}}/api/v2/discuss-flow`

## Changed / Added Files

### New
- `constants/discussFlowSocket.constants.js`
- `helpers/discussFlowSocketEvents.helper.js`
- `helpers/discussFlowSocketHandlers.helper.js`
- `helpers/discussFlowActor.helper.js`
- `middleware/authenticateGuestSession.js`
- `middleware/resolveDiscussFlowActor.js`
- `models/discussFlowGuestLink.model.js`
- `repositories/discussFlowGuestLink.repository.js`
- `services/guestToken.service.js`
- `services/guestLink.service.js`
- `services/guestSession.service.js`
- `services/discussFlowSocketAccess.service.js`
- `services/panel.service.js`
- `controllers/guestLink.controller.js`
- `controllers/guest.controller.js`
- `controllers/panel.controller.js`
- `tests/guestToken.service.test.js`
- `tests/guestLink.service.test.js`
- `tests/guestPermissions.test.js`
- `tests/discussFlowSocketEvents.helper.test.js`
- `tests/panel.service.test.js`
- `tests/message.repository.test.js`

### Updated
- `constants/discussFlow.constants.js`
- `models/discussFlowMessage.model.js`
- `models/index.js`
- `dto/discussFlow.dto.js`
- `errors/discussFlowErrorCodes.js`
- `helpers/discussFlowPermission.helper.js`
- `helpers/payload.helper.js`
- `repositories/discussFlowMessage.repository.js`
- `repositories/discussFlowTopicMember.repository.js`
- `repositories/discussFlowQuestion.repository.js`
- `repositories/discussFlowRequirement.repository.js`
- `repositories/discussFlowDecision.repository.js`
- `services/message.service.js`
- `services/requirement.service.js`
- `services/question.service.js`
- `services/decision.service.js`
- `controllers/message.controller.js`
- `validators/discussFlow.validators.js`
- `discussFlow.routes.js`
- `index.js`
- `src/v2/modules/socket/constants/socket.constants.js`
- `src/v2/modules/socket/helpers/socketRooms.helper.js`
- `src/v2/modules/socket/services/socket.service.js`
- `src/v2/modules/socket/services/socketServer.service.js`

## Models

### Updated: `pts_discuss_flow_messages`
- `replyToMessageId`, `messageStatus`, `source`, `sourceLabel`, `importBatchId`, `clientMessageId`, `aiSuggestionStatus`, `authorName`

### Added: `pts_discuss_flow_guest_links`
- `tenantId`, `workspaceId`, `topicId`, `createdBy`, `role`, `permissions`, `tokenHash`, `label`, `status`, `expiresAt`, `maxUses`, `usedCount`, `allowAnonymousName`, `requireName`, `requireEmail`, `passwordHash`, `passwordEnabled`, `lastUsedAt`, `revokedAt`

## Routes Added

| Method | Path | Auth |
|--------|------|------|
| POST | `/guest-links` | JWT + discuss_flow.manage |
| PATCH | `/guest-links/:id/revoke` | JWT + discuss_flow.manage |
| GET | `/guest/:token/preview` | Public |
| POST | `/guest/:token/join` | Public |
| GET | `/guest/session` | Guest JWT |
| POST | `/guest/session/messages` | Guest JWT |
| GET | `/topics/:id/panel` | JWT + discuss_flow.view |
| PATCH | `/topics/:id/messages/:messageId` | JWT + discuss_flow.manage |
| DELETE | `/topics/:id/messages/:messageId` | JWT + discuss_flow.manage |
| POST | `/topics/:id/messages/:messageId/reply` | JWT + discuss_flow.manage |
| GET | `/topics/:id/messages/:messageId/ai-suggestions` | JWT + discuss_flow.view |

## Socket Events

Room: `discussflow:topic:{topicId}`

Client join: `room.join.discussflow.topic` with `{ topicId }`

Server events:
- `discussflow:topic:joined` / `discussflow:topic:left` (reserved)
- `discussflow:message:created|updated|deleted`
- `discussflow:typing:start|stop`
- `discussflow:requirement:created`
- `discussflow:question:created`
- `discussflow:decision:created`
- `discussflow:right-panel:updated`

## Guest Security

1. **Share tokens**: Only SHA-256 hash stored (`tokenHash`). Raw token returned once on create.
2. **Guest sessions**: Signed JWT (`type: discuss_flow_guest`) with `topicId`, `role`, `permissions`. Separate middleware — never mixed with PTS access tokens.
3. **Scope**: Guest JWT is bound to one `topicId` + `workspaceId`. `assertActorTopicScope` blocks cross-topic access.
4. **No PTS modules**: Guest routes live under `/discuss-flow/guest/*` without `authenticate` or `requireSystemModule`.
5. **Password links**: Optional bcrypt password on join.
6. **Expiry / revoke / max uses**: Enforced on preview and join.

## Right Panel Example

```json
{
  "topic": { "id": "...", "title": "Sprint planning" },
  "counts": {
    "messages": 42,
    "requirements": 5,
    "open_questions": 2,
    "decisions": 1,
    "locked_documents": 0
  },
  "requirements": [],
  "open_questions": [],
  "decisions": [],
  "documents": [],
  "ai_jobs": [],
  "next_actions": [
    { "type": "answer_question", "label": "Answer: What is the deadline?", "entity_id": "...", "priority": "medium" }
  ],
  "participant_count": 4,
  "last_activity": "2026-06-06T10:00:00.000Z"
}
```

## Permission Matrix

| Capability | viewer | commenter | contributor | Topic member (commenter+) | Topic manager |
|------------|--------|-----------|-------------|---------------------------|---------------|
| Read messages/panel | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send message | ✗ | ✓ | ✓ | ✓ | ✓ |
| Reply | ✗ | ✓ | ✓ | ✓ | ✓ |
| Draft requirement/question/decision | ✗ | ✗ | ✓ (service-ready) | ✓ (authenticated APIs) | ✓ |
| Edit/delete messages | ✗ | ✗ | ✗ | ✓ | ✓ |
| Create guest links | ✗ | ✗ | ✗ | ✗ | ✓ |
| PTS dashboard / tasks / projects | ✗ | ✗ | ✗ | ✓ | ✓ |

## Postman Examples

### Create guest link
```
POST /api/v2/discuss-flow/guest-links
Authorization: Bearer {{accessToken}}
{
  "topic_id": "{{topicId}}",
  "role": "commenter",
  "label": "Client review",
  "expires_at": "2026-12-31T23:59:59.000Z"
}
```

### Guest preview (public)
```
GET /api/v2/discuss-flow/guest/{{rawGuestToken}}/preview
```

### Guest join (public)
```
POST /api/v2/discuss-flow/guest/{{rawGuestToken}}/join
{
  "name": "Client User",
  "email": "client@example.com"
}
```

### Guest send message
```
POST /api/v2/discuss-flow/guest/session/messages
Authorization: Bearer {{guestSessionToken}}
{ "content": "Thanks for the update." }
```

### Right panel
```
GET /api/v2/discuss-flow/topics/{{topicId}}/panel
Authorization: Bearer {{accessToken}}
```

### Reply to message
```
POST /api/v2/discuss-flow/topics/{{topicId}}/messages/{{messageId}}/reply
Authorization: Bearer {{accessToken}}
{ "content": "Following up on this." }
```

### AI suggestions placeholder
```
GET /api/v2/discuss-flow/topics/{{topicId}}/messages/{{messageId}}/ai-suggestions
Authorization: Bearer {{accessToken}}
```

## Testing Checklist

- [ ] `npm run lint:v2`
- [ ] `node --test src/v2/modules/discuss-flow/tests/*.test.js`
- [ ] Create guest link → raw token returned once
- [ ] Preview/join with expired/revoked link returns 403
- [ ] Guest session cannot access different topic via forged topicId in URL
- [ ] Guest viewer cannot POST message (403)
- [ ] Guest commenter can POST message
- [ ] Message create emits `discussflow:message:created`
- [ ] Panel returns placeholder `documents` / `ai_jobs` empty arrays
- [ ] Soft delete sets `message_status: deleted`, does not remove row
- [ ] `ai_suggestion_status: pending` when `topic.settings.aiSuggestionsEnabled === true`
- [ ] Socket room join validates topic membership

## Notes for Prompt 4 (AI Layer)

1. Hook `aiDispatcher` from message create when `aiSuggestionStatus === 'pending'`.
2. Replace `GET .../ai-suggestions` placeholder with job status + extracted suggestions.
3. Populate `ai_jobs` in panel from global AI jobs filtered by `topicId` / `messageId`.
4. On AI completion: set `aiSuggestionStatus` to `ready`, emit socket update.
5. Do **not** wire WhatsApp import or document locking in this pass.

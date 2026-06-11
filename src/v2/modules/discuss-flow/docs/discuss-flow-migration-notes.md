# DiscussFlow Migration Notes

## Collections

| Collection | Entity |
|------------|--------|
| `pts_discuss_flow_workspaces` | Workspace |
| `pts_discuss_flow_topics` | Topic |
| `pts_discuss_flow_topic_members` | Topic Member |
| `pts_discuss_flow_messages` | Discussion Message |
| `pts_discuss_flow_requirements` | Requirement |
| `pts_discuss_flow_questions` | Question |
| `pts_discuss_flow_decisions` | Decision |
| `pts_discuss_flow_timeline_events` | Topic Timeline |

## Indexes

- Workspace: `{ tenantId, slug }` unique; text on `name`, `description`
- Topic: `{ workspaceId, slug }` unique; `{ tenantId, status, lastActivityAt }`; text on `title`, `description`, `tags`
- Message: `{ topicId, createdAt }`; text on `content`
- Requirement: text on `title`, `description`
- Decision: text on `title`, `context`, `impact`
- Timeline: `{ topicId, createdAt }`

## Bootstrap

Indexes created via `ensureDiscussFlowModuleIndexes()` on v2 bootstrap.

## Seed

```bash
npm run v2:seed:discuss-flow
```

Enables `discuss_flow` module and creates sample workspace + topic.

## Example create topic flow

1. `POST /workspaces` → get `workspace_id`
2. `POST /topics` with `workspace_id`, `title`
3. `POST /topics/:id/messages` — discussion
4. `POST /topics/:id/requirements` — capture requirement
5. `POST /topics/:id/decisions` — record decision
6. `GET /topics/:id/timeline` — audit trail

## Future integration points

- **AI**: call `aiDispatcher.execute({ action: 'DISCUSS_*', sourceModule: 'discussflow', sourceId: topicId })`
- **Guest**: extend `GUEST_ROLES` + `authorType: 'guest'` on messages
- **Documents**: `document_created` timeline + `documentCount` on topic
- **Tasks**: `linkedTaskIds` on requirements + `task_created` timeline

## Unchanged modules

Tasks, Projects, Activity, Converse — no modifications.

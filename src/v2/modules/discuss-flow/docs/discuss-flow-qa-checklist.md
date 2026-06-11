# DiscussFlow QA Checklist

## Setup
- [ ] Run `npm run v2:seed` then `npm run v2:seed:discuss-flow`
- [ ] Module `discuss_flow` is active
- [ ] User has `discuss_flow.view` and `discuss_flow.manage`

## Workspace
- [ ] Create workspace returns 201
- [ ] Duplicate slug auto-suffixes
- [ ] List with `?q=` text search works
- [ ] Non-owner cannot PATCH workspace

## Topic
- [ ] Create topic increments workspace `topic_count`
- [ ] Creator becomes topic member with role `owner`
- [ ] `topic_created` timeline event recorded
- [ ] List topics filters by `workspace_id`
- [ ] Topic search via `?q=`

## Messages
- [ ] Create message increments `message_count`
- [ ] `last_message_at` and `last_activity_at` update
- [ ] `message_created` timeline event
- [ ] Message search via `?q=`

## Requirements / Questions / Decisions
- [ ] Each create increments respective counter
- [ ] Each creates timeline event
- [ ] List endpoints paginate correctly

## Permissions
- [ ] Viewer role can read but not write (when member added as viewer)
- [ ] Topic owner can manage
- [ ] `403` for non-members on private topics

## Not in scope (Layer 1)
- [ ] No AI endpoints called
- [ ] No socket events
- [ ] No guest links
- [ ] No documents
- [ ] No task/project generation

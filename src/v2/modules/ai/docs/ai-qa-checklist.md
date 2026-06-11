# PTS V2 AI — Testing Checklist

## Setup
- [ ] `PTS_AI_ENABLED=true`
- [ ] `PTS_AI_DEBUG_ENABLED=true`
- [ ] `OPENAI_API_KEY` set (or mock provider for unit tests)
- [ ] V2 Mongo connected (`MONGO_V2_DB`)
- [ ] Super admin JWT available

## Registry
- [ ] `GET /actions` returns all registered actions
- [ ] Unknown action returns `AI_ACTION_NOT_FOUND`

## Sync execution
- [ ] `COMMON_TRANSLATE` completes sync (`async: false`)
- [ ] `TASK_SUMMARIZE` returns validated JSON
- [ ] Invalid JSON from model returns `AI_VALIDATION_FAILED`

## Async execution
- [ ] `DISCUSS_IMPORT_CHAT` returns `job_id`
- [ ] Job progresses `queued` → `running` → `completed`
- [ ] Socket events emitted to actor user room
- [ ] `GET /jobs/:jobId` matches socket final state

## Token accounting
- [ ] Wallet auto-created for tenant
- [ ] Insufficient balance returns `AI_INSUFFICIENT_TOKENS`
- [ ] Usage row created in `pts_ai_usage`
- [ ] Balance decreases after successful run

## Logging & tracing
- [ ] Log row in `pts_ai_logs` when `saveLogs: true`
- [ ] LangSmith disabled by default — no failures
- [ ] LangSmith enabled — best-effort trace export

## Security
- [ ] Non-super-admin gets `403`
- [ ] `PTS_AI_DEBUG_ENABLED=false` blocks admin routes
- [ ] Frontend cannot hit OpenAI directly (architecture review)

## Module integration
- [ ] Feature module imports `aiDispatcher` from `modules/ai`
- [ ] Feature module never imports `openai` provider

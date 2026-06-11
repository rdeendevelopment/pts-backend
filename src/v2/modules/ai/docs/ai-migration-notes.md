# PTS V2 AI — Migration Notes

## New collections

| Collection | Purpose |
|------------|---------|
| `pts_ai_jobs` | Async AI job queue and results |
| `pts_ai_usage` | Per-call token usage ledger |
| `pts_ai_logs` | Prompt/response audit logs |
| `pts_ai_token_wallets` | Internal token balance per tenant |
| `pts_ai_actions` | Optional DB overrides for action registry |

Indexes are created automatically on v2 bootstrap via `ensureAiModuleIndexes()`.

## Deployment steps

1. Set env vars (see `ai-env.example.md`)
2. `npm install` (adds `openai` SDK)
3. Restart API — bootstrap ensures indexes + starts AI worker
4. Verify `GET /api/v2/ai/actions` as super admin

## No changes required to

- Tasks, Projects, Activity modules
- Socket server infrastructure (reuses `emitToUser`)
- Auth, RBAC, module registry

## Feature module integration

```javascript
const { aiDispatcher } = require('../ai');

const result = await aiDispatcher.execute({
  action: 'TASK_SUMMARIZE',
  actor: accountId,
  tenantId: accountId,
  sourceModule: 'tasks',
  sourceId: taskId,
  context: { projectName },
  input: { title, description },
});

if (result.async) {
  return { jobId: result.job_id, pollUrl: result.poll_url };
}
return result.result;
```

## Future extraction

The module is designed as a standalone platform:
- `aiDispatcher` is the only public integration surface
- Providers, prompts, and wallet are internal
- Can be extracted to `pts-ai-service` with the same `execute()` contract

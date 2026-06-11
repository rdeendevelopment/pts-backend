# PTS V2 AI — Environment Variables

```bash
# Master switch
PTS_AI_ENABLED=true

# Internal admin/debug routes (POST /run, GET /jobs, GET /actions)
# Requires super_admin account + this flag
PTS_AI_DEBUG_ENABLED=true

# OpenAI (required for live calls)
OPENAI_API_KEY=sk-...
# OPENAI_ORG_ID=org-...
# OPENAI_BASE_URL=https://api.openai.com/v1
PTS_AI_MAX_OUTPUT_TOKENS=2048

# Token wallet defaults (internal accounting — not billing)
PTS_AI_DEFAULT_WALLET_TOKENS=500000
PTS_AI_RESERVE_BUFFER_RATIO=1.2

# Async worker
PTS_AI_WORKER_POLL_MS=2000
PTS_AI_WORKER_MAX_CONCURRENT=3

# LangSmith (optional tracing)
PTS_LANGSMITH_ENABLED=false
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=pts-v2
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
```

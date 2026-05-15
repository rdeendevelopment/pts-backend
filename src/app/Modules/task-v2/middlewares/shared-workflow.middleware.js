// Attaches req.useSharedWorkflows = true/false based on module toggle.
// Used by shim controllers to decide whether to route to v2 logic or fall through to v1.
// Does NOT block the request — it only annotates it, so old behavior is the safe default.
const SystemModule = require('../../modules-management/models/module.model');

let cached = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000; // re-read from DB at most every 30 s

async function resolveSharedWorkflowsEnabled() {
  const now = Date.now();
  if (cached !== null && now < cacheExpiry) return cached;

  try {
    const mod = await SystemModule.findOne({ key: 'shared_workflows' }).lean();
    cached = Boolean(mod?.enabled);
    cacheExpiry = now + CACHE_TTL_MS;
    return cached;
  } catch {
    return false;
  }
}

// Force a cache bust (called after admin toggles the module)
function invalidateSharedWorkflowsCache() {
  cached = null;
  cacheExpiry = 0;
}

async function annotateSharedWorkflows(req, _res, next) {
  req.useSharedWorkflows = await resolveSharedWorkflowsEnabled();
  next();
}

module.exports = { annotateSharedWorkflows, invalidateSharedWorkflowsCache };

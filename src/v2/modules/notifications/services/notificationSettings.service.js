const env = require('../../../config/env');
const { AppError } = require('../../../kernel/errors');
const { warn } = require('../../../kernel/logger');
const { EVENTS, byKey, resolveEvent } = require('../notificationEventRegistry');
const { getNotificationSettingsModel } = require('../models/notificationSettings.model');

const CACHE_TTL_MS = 5000;
let cache = null;
let cacheExpiresAt = 0;

function defaultSettings() {
  const modules = {};
  for (const item of EVENTS) {
    if (!modules[item.module]) {
      modules[item.module] = { enabled: item.module !== 'projects', events: {} };
    }
    if (item.module !== 'tasks') modules[item.module].events[item.event] = item.defaultEnabled;
    else if (item.event === 'mentioned') modules[item.module].events[item.event] = true;
    else if (item.scheduled) modules[item.module].events[item.event] = env.v2.taskFeatures.expandedNotifications && env.v2.taskFeatures.dueNotifications;
    else modules[item.module].events[item.event] = env.v2.taskFeatures.expandedNotifications && item.defaultEnabled;
  }
  return { scope: 'system', enabled: true, modules };
}

async function loadSettings() {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  try {
    const row = await getNotificationSettingsModel().findOne({ scope: 'system' }).lean();
    cache = row || defaultSettings();
  } catch (err) {
    warn('Notification settings lookup failed; safe defaults applied', { message: err.message });
    cache = defaultSettings();
  }
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cache;
}

async function isEnabled(payload = {}) {
  if (!env.v2.notificationsEnabled) return false;
  const definition = resolveEvent(payload.type, payload.module, payload.eventKey);
  if (!definition?.configurable) return true;
  const settings = await loadSettings();
  if (!settings.enabled) return false;
  const moduleSettings = settings.modules?.[definition.module];
  if (moduleSettings?.enabled === false) return false;
  return moduleSettings?.events?.[definition.event] ?? definition.defaultEnabled;
}

function validateSettings(input) {
  if (!input || typeof input !== 'object' || typeof input.enabled !== 'boolean') throw new AppError('enabled must be boolean', { status: 400 });
  for (const [moduleKey, moduleSettings] of Object.entries(input.modules || {})) {
    if (!EVENTS.some((item) => item.module === moduleKey)) throw new AppError(`Unknown notification module: ${moduleKey}`, { status: 400 });
    if (typeof moduleSettings?.enabled !== 'boolean') throw new AppError(`Invalid module setting: ${moduleKey}`, { status: 400 });
    for (const [eventKey, enabled] of Object.entries(moduleSettings.events || {})) {
      if (!byKey.has(`${moduleKey}.${eventKey}`) || typeof enabled !== 'boolean') throw new AppError(`Unknown or invalid notification event: ${moduleKey}.${eventKey}`, { status: 400 });
    }
  }
}

async function getAdminSettings() {
  return { environmentEnabled: env.v2.notificationsEnabled, settings: await loadSettings(), registry: EVENTS };
}

async function updateSettings(input, accountId) {
  validateSettings(input);
  const Model = getNotificationSettingsModel();
  const previous = await loadSettings();
  const next = { enabled: input.enabled, modules: input.modules };
  const audit = { at: new Date(), actorId: accountId, previous: { enabled: previous.enabled, modules: previous.modules }, next };
  const row = await Model.findOneAndUpdate({ scope: 'system' }, {
    $set: { ...next, updatedBy: accountId }, $push: { audit: { $each: [audit], $slice: -100 } },
  }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).lean();
  cache = row; cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return getAdminSettings();
}

function clearCache() { cache = null; cacheExpiresAt = 0; }
function setCachedSettings(settings) { cache = settings; cacheExpiresAt = Date.now() + CACHE_TTL_MS; }
module.exports = { CACHE_TTL_MS, defaultSettings, isEnabled, getAdminSettings, updateSettings, clearCache, setCachedSettings, validateSettings };

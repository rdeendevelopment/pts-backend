/** Product modules shown in Module Management (core + optional features). */
const CORE_MODULE_KEYS = ['dashboard', 'users', 'clients', 'projects', 'activity'];

const OPTIONAL_FEATURE_MODULE_KEYS = ['tasks', 'converse', 'clock_activity', 'daily_flow', 'discuss_flow'];

/** @deprecated Renamed to clock_activity — used only for seed migration */
const LEGACY_CLOCK_MODULE_KEY = 'clock';

/** Platform infrastructure — not toggled in Module Management UI. */
const SYSTEM_INFRA_MODULE_KEYS = [
  'auth',
  'modules',
  'rbac',
  'assignments',
  'budgets',
  'reports',
];

const MANAGED_MODULE_KEYS = [...CORE_MODULE_KEYS, ...OPTIONAL_FEATURE_MODULE_KEYS];

const CORE_MODULE_KEY_SET = new Set(CORE_MODULE_KEYS);
const OPTIONAL_FEATURE_MODULE_KEY_SET = new Set(OPTIONAL_FEATURE_MODULE_KEYS);
const MANAGED_MODULE_KEY_SET = new Set(MANAGED_MODULE_KEYS);

function isCoreModuleKey(key) {
  return CORE_MODULE_KEY_SET.has(String(key || '').toLowerCase());
}

function isManagedModuleKey(key) {
  return MANAGED_MODULE_KEY_SET.has(String(key || '').toLowerCase());
}

module.exports = {
  CORE_MODULE_KEYS,
  OPTIONAL_FEATURE_MODULE_KEYS,
  LEGACY_CLOCK_MODULE_KEY,
  SYSTEM_INFRA_MODULE_KEYS,
  MANAGED_MODULE_KEYS,
  CORE_MODULE_KEY_SET,
  OPTIONAL_FEATURE_MODULE_KEY_SET,
  MANAGED_MODULE_KEY_SET,
  isCoreModuleKey,
  isManagedModuleKey,
};

const {
  isCoreModuleKey,
  isManagedModuleKey,
  OPTIONAL_FEATURE_MODULE_KEYS,
} = require('../constants/moduleRegistry.constants');

function toModuleDto(moduleDoc) {
  if (!moduleDoc) return null;
  const row = moduleDoc.toObject ? moduleDoc.toObject() : moduleDoc;
  const key = String(row.key || '').toLowerCase();

  return {
    id: String(row._id),
    key: row.key,
    name: row.name,
    description: row.description || '',
    category: row.category,
    status: row.status,
    enabled: row.status === 'active',
    sort_order: row.sortOrder,
    icon: row.icon || null,
    route_base: row.routeBase || null,
    is_system: Boolean(row.isSystem),
    is_core: isCoreModuleKey(key),
    is_managed: isManagedModuleKey(key),
    module_tier: isCoreModuleKey(key)
      ? 'core'
      : (OPTIONAL_FEATURE_MODULE_KEYS.includes(key) || key === 'clock' ? 'optional' : 'system'),
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

/** Minimal shape for auth session responses. */
function toSessionModuleDto(moduleDoc) {
  if (!moduleDoc) return null;
  const row = moduleDoc.toObject ? moduleDoc.toObject() : moduleDoc;

  return {
    id: String(row._id),
    key: row.key,
    name: row.name,
    status: row.status,
  };
}

module.exports = {
  toModuleDto,
  toSessionModuleDto,
};

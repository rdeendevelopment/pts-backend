const { AppError } = require('../../../kernel/errors');
const { KEY_PATTERN, MODULE_CATEGORIES, MODULE_STATUSES } = require('../constants/module.constants');
const moduleErrorCodes = require('../errors/moduleErrorCodes');
const moduleRepository = require('../repositories/module.repository');
const { toModuleDto, toSessionModuleDto } = require('../dto/module.dto');
const DEFAULT_MODULES = require('../helpers/defaultModules.helper');
const {
  isCoreModuleKey,
  isManagedModuleKey,
  LEGACY_CLOCK_MODULE_KEY,
} = require('../constants/moduleRegistry.constants');
const { info } = require('../../../kernel/logger');

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase();
}

function assertValidKey(key) {
  const normalized = normalizeKey(key);
  if (!normalized || !KEY_PATTERN.test(normalized)) {
    throw new AppError('Module key must be lowercase snake_case', {
      status: 400,
      code: moduleErrorCodes.MODULE_INVALID_KEY,
      details: { key, pattern: 'lowercase letters, numbers, underscores' },
    });
  }
  return normalized;
}

function assertValidCategory(category) {
  if (!MODULE_CATEGORIES.includes(category)) {
    throw new AppError('Invalid module category', {
      status: 400,
      code: moduleErrorCodes.MODULE_INVALID_CATEGORY,
      details: { allowed: MODULE_CATEGORIES },
    });
  }
}

function assertValidStatus(status) {
  if (!MODULE_STATUSES.includes(status)) {
    throw new AppError('Invalid module status', {
      status: 400,
      code: moduleErrorCodes.MODULE_INVALID_STATUS,
      details: { allowed: MODULE_STATUSES },
    });
  }
}

async function getModuleOrThrow(moduleId) {
  const moduleDoc = await moduleRepository.findById(moduleId);
  if (!moduleDoc) {
    throw new AppError('Module not found', {
      status: 404,
      code: moduleErrorCodes.MODULE_NOT_FOUND,
    });
  }
  return moduleDoc;
}

async function listModules(query = {}) {
  const includeDeleted = String(query.include_deleted || query.includeDeleted || '').toLowerCase() === 'true';
  const managedOnly = ['true', '1'].includes(
    String(query.managed_only || query.managedOnly || '').toLowerCase()
  );
  const rows = await moduleRepository.listModules({ includeDeleted });
  const filtered = managedOnly
    ? rows.filter((row) => isManagedModuleKey(row.key))
    : rows;
  return filtered.map(toModuleDto);
}

async function getModuleById(moduleId) {
  const moduleDoc = await getModuleOrThrow(moduleId);
  return toModuleDto(moduleDoc);
}

async function createModule(payload) {
  const key = assertValidKey(payload.key);
  assertValidCategory(payload.category);
  if (payload.status) assertValidStatus(payload.status);

  const existing = await moduleRepository.findByKey(key, { includeDeleted: true });
  if (existing && !existing.isDeleted) {
    throw new AppError('Module key already exists', {
      status: 409,
      code: moduleErrorCodes.MODULE_KEY_ALREADY_EXISTS,
      details: { key },
    });
  }

  const moduleDoc = await moduleRepository.createModule({
    key,
    name: String(payload.name).trim(),
    description: payload.description ? String(payload.description).trim() : '',
    category: payload.category,
    status: payload.status || 'active',
    sortOrder: Number(payload.sortOrder ?? payload.sort_order ?? 0),
    icon: payload.icon || null,
    routeBase: payload.routeBase || payload.route_base || null,
    isSystem: false,
  });

  return toModuleDto(moduleDoc);
}

async function updateModuleByKey(key, payload = {}) {
  const normalizedKey = assertValidKey(key);
  const moduleDoc = await moduleRepository.findByKey(normalizedKey);
  if (!moduleDoc) {
    throw new AppError('Module not found', {
      status: 404,
      code: moduleErrorCodes.MODULE_NOT_FOUND,
      details: { key: normalizedKey },
    });
  }

  if (payload.enabled === false && isCoreModuleKey(normalizedKey)) {
    throw new AppError('Core modules cannot be disabled', {
      status: 409,
      code: moduleErrorCodes.MODULE_CORE_DISABLE_BLOCKED,
      details: { key: normalizedKey },
    });
  }

  const updates = {};
  if (payload.enabled !== undefined) {
    updates.status = payload.enabled ? 'active' : 'inactive';
  }
  if (payload.status !== undefined) {
    assertValidStatus(payload.status);
    updates.status = payload.status;
  }

  if (!Object.keys(updates).length) {
    return updateModule(moduleDoc._id, payload);
  }

  const updated = await moduleRepository.updateModule(moduleDoc._id, updates);
  try {
    const rbacAccessService = require('../../rbac/services/rbacAccess.service');
    rbacAccessService.clearSessionAccessCache();
  } catch (_err) {
    // Optional during tests without full graph
  }
  return toModuleDto(updated);
}

async function updateModule(moduleId, payload) {
  const moduleDoc = await getModuleOrThrow(moduleId);
  const updates = {};

  if (payload.name !== undefined) updates.name = String(payload.name).trim();
  if (payload.description !== undefined) updates.description = String(payload.description).trim();
  if (payload.category !== undefined) {
    assertValidCategory(payload.category);
    updates.category = payload.category;
  }
  if (payload.status !== undefined) {
    assertValidStatus(payload.status);
    if (payload.status !== 'active' && isCoreModuleKey(moduleDoc.key)) {
      throw new AppError('Core modules cannot be disabled', {
        status: 409,
        code: moduleErrorCodes.MODULE_CORE_DISABLE_BLOCKED,
        details: { key: moduleDoc.key },
      });
    }
    updates.status = payload.status;
  }
  if (payload.sortOrder !== undefined || payload.sort_order !== undefined) {
    updates.sortOrder = Number(payload.sortOrder ?? payload.sort_order);
  }
  if (payload.icon !== undefined) updates.icon = payload.icon || null;
  if (payload.routeBase !== undefined || payload.route_base !== undefined) {
    updates.routeBase = payload.routeBase || payload.route_base || null;
  }

  const updated = await moduleRepository.updateModule(moduleDoc._id, updates);
  return toModuleDto(updated);
}

async function deleteModule(moduleId) {
  const moduleDoc = await getModuleOrThrow(moduleId);

  if (moduleDoc.isSystem) {
    throw new AppError('System modules cannot be deleted', {
      status: 409,
      code: moduleErrorCodes.MODULE_SYSTEM_DELETE_BLOCKED,
      details: { key: moduleDoc.key },
    });
  }

  await moduleRepository.softDeleteModule(moduleDoc._id);
  return { deleted: true, id: String(moduleDoc._id) };
}

async function getActiveModulesForSession() {
  const rows = await moduleRepository.listActiveModules();
  return rows
    .filter((row) => row.isSystem)
    .map(toSessionModuleDto);
}

/**
 * Idempotent seed for built-in platform modules.
 * Creates missing rows and refreshes metadata on existing system modules.
 */
async function seedSystemModules() {
  const summary = { created: [], updated: [] };

  for (const seed of DEFAULT_MODULES) {
    const existing = await moduleRepository.findByKey(seed.key, { includeDeleted: true });

    if (!existing) {
      await moduleRepository.createModule(seed);
      summary.created.push(seed.key);
      continue;
    }

    if (!existing.isSystem) {
      continue;
    }

    const metadataPatch = {
      name: seed.name,
      description: seed.description,
      category: seed.category,
      sortOrder: seed.sortOrder,
      routeBase: seed.routeBase,
      isSystem: true,
      isDeleted: false,
      deletedAt: null,
    };
    if (isCoreModuleKey(seed.key)) {
      metadataPatch.status = 'active';
    }
    await moduleRepository.updateModule(existing._id, metadataPatch);
    summary.updated.push(seed.key);
  }

  await migrateLegacyClockModule(summary);

  info('PTS v2 modules seed completed', summary);
  return summary;
}

/**
 * One-time-safe migration: legacy `clock` row → `clock_activity` feature key.
 * Preserves admin toggle state; does not touch core `activity`.
 */
async function migrateLegacyClockModule(summary = { created: [], updated: [] }) {
  const legacy = await moduleRepository.findByKey(LEGACY_CLOCK_MODULE_KEY, { includeDeleted: true });
  const modern = await moduleRepository.findByKey('clock_activity', { includeDeleted: true });

  if (!modern) {
    const seed = DEFAULT_MODULES.find((row) => row.key === 'clock_activity');
    if (seed) {
      await moduleRepository.createModule({
        ...seed,
        status: legacy?.status || seed.status,
      });
      summary.created.push('clock_activity');
    }
  } else if (legacy && legacy.status === 'active' && modern.status !== 'active') {
    await moduleRepository.updateModule(modern._id, { status: 'active' });
    summary.updated.push('clock_activity');
  }

  if (legacy && legacy.isSystem && legacy.status !== 'inactive') {
    await moduleRepository.updateModule(legacy._id, { status: 'inactive' });
    summary.updated.push(LEGACY_CLOCK_MODULE_KEY);
  }
}

module.exports = {
  listModules,
  getModuleById,
  createModule,
  updateModule,
  updateModuleByKey,
  deleteModule,
  getActiveModulesForSession,
  seedSystemModules,
};

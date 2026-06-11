const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const workspaceRepository = require('../repositories/discussFlowWorkspace.repository');
const { toWorkspaceDto } = require('../dto/discussFlow.dto');
const { pickString, pickField, parsePagination } = require('../helpers/payload.helper');
const { ensureUniqueSlug } = require('../helpers/slug.helper');
const {
  WORKSPACE_VISIBILITY,
  WORKSPACE_STATUS,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} = require('../constants/discussFlow.constants');
const {
  assertWorkspaceRead,
  assertWorkspaceManage,
} = require('../helpers/discussFlowPermission.helper');

function assertEnum(value, allowed, field) {
  if (value && !allowed.includes(value)) {
    throw new AppError(`Invalid ${field}`, {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { field, allowed },
    });
  }
}

async function createWorkspace(tenantId, accountId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');

  const name = pickString(payload, 'name');
  if (!name) {
    throw new AppError('Workspace name is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { name: 'name is required' },
    });
  }

  const visibility = pickString(payload, 'visibility') || 'team';
  assertEnum(visibility, WORKSPACE_VISIBILITY, 'visibility');

  const slug = await ensureUniqueSlug(
    pickString(payload, 'slug') || name,
    (candidate) => workspaceRepository.slugExists(normalizedTenantId, candidate)
  );

  const row = await workspaceRepository.create({
    tenantId: normalizedTenantId,
    name,
    slug,
    description: pickString(payload, 'description'),
    icon: pickString(payload, 'icon'),
    visibility,
    status: 'active',
    ownerId: normalizedAccountId,
    memberCount: 1,
    topicCount: 0,
    settings: payload.settings || payload.settings_json || {},
    createdBy: normalizedAccountId,
    updatedBy: normalizedAccountId,
  });

  return toWorkspaceDto(row);
}

async function listWorkspaces(tenantId, accountId, query = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const search = pickString(query, 'q', 'search');

  const { items, total } = await workspaceRepository.list(normalizedTenantId, {
    search,
    status: pickString(query, 'status'),
    limit,
    skip,
  });

  return {
    items: items.map((row) => {
      assertWorkspaceRead(accountId, row);
      return toWorkspaceDto(row);
    }),
    meta: { page, limit, total },
  };
}

async function getWorkspace(tenantId, accountId, workspaceId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedWorkspaceId = assertObjectId(workspaceId, 'workspaceId');
  const row = await workspaceRepository.findById(normalizedWorkspaceId, normalizedTenantId);

  if (!row) {
    throw new AppError('Workspace not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_WORKSPACE_NOT_FOUND,
    });
  }

  assertWorkspaceRead(accountId, row);
  return toWorkspaceDto(row);
}

async function updateWorkspace(tenantId, accountId, workspaceId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedWorkspaceId = assertObjectId(workspaceId, 'workspaceId');

  const existing = await workspaceRepository.findById(normalizedWorkspaceId, normalizedTenantId);
  if (!existing) {
    throw new AppError('Workspace not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_WORKSPACE_NOT_FOUND,
    });
  }

  assertWorkspaceManage(accountId, existing);

  const updates = { updatedBy: normalizedAccountId };
  const name = pickString(payload, 'name');
  if (name) updates.name = name;

  const description = pickField(payload, 'description');
  if (description !== undefined) updates.description = pickString(payload, 'description');

  const icon = pickField(payload, 'icon');
  if (icon !== undefined) updates.icon = pickString(payload, 'icon');

  const visibility = pickString(payload, 'visibility');
  if (visibility) {
    assertEnum(visibility, WORKSPACE_VISIBILITY, 'visibility');
    updates.visibility = visibility;
  }

  const status = pickString(payload, 'status');
  if (status) {
    assertEnum(status, WORKSPACE_STATUS, 'status');
    updates.status = status;
  }

  if (payload.settings !== undefined) updates.settings = payload.settings;

  const row = await workspaceRepository.updateById(normalizedWorkspaceId, normalizedTenantId, updates);
  return toWorkspaceDto(row);
}

module.exports = {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
};

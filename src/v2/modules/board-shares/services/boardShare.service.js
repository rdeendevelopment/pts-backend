const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const {
  BOARD_SHARE_ROLES,
  BOARD_SHARE_STATUSES,
} = require('../constants/boardShare.constants');
const boardShareErrorCodes = require('../errors/boardShareErrorCodes');
const clientRepository = require('../../clients/repositories/client.repository');
const projectRepository = require('../../projects/repositories/project.repository');
const boardShareRepository = require('../repositories/boardShare.repository');
const {
  isBoardShareClientUser,
  resolveClientIdForAccount,
  assertShareIsUsable,
} = require('../helpers/boardShareAccess.helper');
const { toBoardShareDto, toSharedProjectListItem } = require('../dto/boardShare.dto');

const ARCHIVED_PROJECT_STATUSES = new Set(['archived', 'cancelled', 'completed']);

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!BOARD_SHARE_ROLES.includes(value)) {
    throw new AppError('Invalid board share role', {
      status: 400,
      code: boardShareErrorCodes.BOARD_SHARE_INVALID_ROLE,
      details: { allowed: BOARD_SHARE_ROLES },
    });
  }
  return value;
}

function normalizeStatus(status) {
  if (!status) return null;
  const value = String(status).trim().toLowerCase();
  if (!BOARD_SHARE_STATUSES.includes(value)) {
    throw new AppError('Invalid board share status', {
      status: 400,
      code: boardShareErrorCodes.BOARD_SHARE_INVALID_STATUS,
      details: { allowed: BOARD_SHARE_STATUSES },
    });
  }
  return value;
}

function parseProjectIds(rawIds = []) {
  const ids = Array.isArray(rawIds) ? rawIds : [rawIds];
  const normalized = [...new Set(ids.map((id) => assertObjectId(id, 'projectId')))];
  if (!normalized.length) {
    throw new AppError('At least one projectId is required', {
      status: 400,
      code: boardShareErrorCodes.BOARD_SHARE_PROJECT_NOT_FOUND,
    });
  }
  return normalized;
}

async function assertClientExists(clientId) {
  const client = await clientRepository.findById(clientId);
  if (!client || client.isDeleted) {
    throw new AppError('Client not found', {
      status: 404,
      code: boardShareErrorCodes.BOARD_SHARE_CLIENT_NOT_FOUND,
      details: { clientId: String(clientId) },
    });
  }
  return client;
}

async function assertProjectsBelongToClient(clientId, projectIds) {
  for (const projectId of projectIds) {
    const project = await projectRepository.findById(projectId);
    if (!project || project.isDeleted) {
      throw new AppError('Project not found', {
        status: 404,
        code: boardShareErrorCodes.BOARD_SHARE_PROJECT_NOT_FOUND,
        details: { projectId: String(projectId) },
      });
    }
    if (String(project.clientId) !== String(clientId)) {
      throw new AppError('Project does not belong to the selected client', {
        status: 400,
        code: boardShareErrorCodes.BOARD_SHARE_PROJECT_CLIENT_MISMATCH,
        details: { projectId: String(projectId), clientId: String(clientId) },
      });
    }
  }
}

async function getBoardShareOrThrow(shareId) {
  const share = await boardShareRepository.findById(shareId);
  if (!share) {
    throw new AppError('Board share not found', {
      status: 404,
      code: boardShareErrorCodes.BOARD_SHARE_NOT_FOUND,
    });
  }
  return share;
}

async function listBoardShares(query = {}) {
  const filters = {};
  if (query.client_id || query.clientId) {
    filters.clientId = assertObjectId(query.client_id || query.clientId, 'clientId');
  }
  if (query.status) filters.status = normalizeStatus(query.status);
  if (query.project_id || query.projectId) {
    filters.projectId = assertObjectId(query.project_id || query.projectId, 'projectId');
  }
  const rows = await boardShareRepository.listBoardShares(filters);
  return rows.map(toBoardShareDto);
}

async function getBoardShareById(shareId) {
  const share = await getBoardShareOrThrow(shareId);
  return toBoardShareDto(share);
}

async function createBoardShare(payload = {}, createdByAccountId = null) {
  const clientId = assertObjectId(payload.clientId || payload.client_id, 'clientId');
  const projectIds = parseProjectIds(payload.projectIds || payload.project_ids);
  const role = normalizeRole(payload.role);
  const expiresAt = payload.expiresAt || payload.expires_at || null;

  await assertClientExists(clientId);
  await assertProjectsBelongToClient(clientId, projectIds);

  const existingActive = await boardShareRepository.findActiveByClientId(clientId);
  if (existingActive) {
    throw new AppError('An active board share already exists for this client', {
      status: 409,
      code: boardShareErrorCodes.BOARD_SHARE_ALREADY_ACTIVE,
      details: { shareId: String(existingActive._id), clientId: String(clientId) },
    });
  }

  const share = await boardShareRepository.createBoardShare({
    clientId,
    projectIds,
    role,
    status: 'active',
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdBy: createdByAccountId || null,
  });

  return toBoardShareDto(share);
}

async function updateBoardShare(shareId, payload = {}) {
  const share = await getBoardShareOrThrow(shareId);
  const updates = {};

  if (payload.role !== undefined) updates.role = normalizeRole(payload.role);
  if (payload.expiresAt !== undefined || payload.expires_at !== undefined) {
    const raw = payload.expiresAt ?? payload.expires_at;
    updates.expiresAt = raw ? new Date(raw) : null;
  }
  if (payload.status !== undefined) {
    updates.status = normalizeStatus(payload.status);
    if (updates.status === 'revoked') {
      updates.revokedAt = new Date();
    }
  }
  if (payload.projectIds !== undefined || payload.project_ids !== undefined) {
    const projectIds = parseProjectIds(payload.projectIds || payload.project_ids);
    await assertProjectsBelongToClient(share.clientId, projectIds);
    updates.projectIds = projectIds;
  }

  if (!Object.keys(updates).length) {
    return toBoardShareDto(share);
  }

  const updated = await boardShareRepository.updateBoardShare(shareId, updates);
  return toBoardShareDto(updated);
}

async function revokeBoardShare(shareId, revokedByAccountId = null) {
  const share = await getBoardShareOrThrow(shareId);
  if (share.status === 'revoked') {
    return toBoardShareDto(share);
  }

  const updated = await boardShareRepository.updateBoardShare(shareId, {
    status: 'revoked',
    revokedAt: new Date(),
    revokedBy: revokedByAccountId || null,
  });
  return toBoardShareDto(updated);
}

function filterProjectsByScope(projects, scope = 'active') {
  if (scope === 'all') return projects;
  return projects.filter((project) => {
    const archived = ARCHIVED_PROJECT_STATUSES.has(String(project.status || '').toLowerCase());
    return scope === 'archived' ? archived : !archived;
  });
}

async function listMySharedProjects(req, query = {}) {
  if (!isBoardShareClientUser(req)) {
    throw new AppError('Only client portal accounts can list shared projects', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_ACCESS_DENIED,
    });
  }

  const clientId = resolveClientIdForAccount(req);
  if (!clientId) {
    throw new AppError('Client account is not linked to a client organization', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_ACCESS_DENIED,
    });
  }

  const share = await boardShareRepository.findActiveByClientId(clientId);
  if (!share) {
    return { items: [], share: null };
  }

  assertShareIsUsable(share);

  const scope = String(query.scope || 'active').toLowerCase();
  const projectRows = await Promise.all(
    (share.projectIds || []).map((projectId) => projectRepository.findById(projectId)),
  );
  const activeProjects = projectRows.filter((row) => row && !row.isDeleted);
  const scoped = filterProjectsByScope(activeProjects, scope);

  return {
    items: scoped.map((project) => toSharedProjectListItem(project, share)),
    share: {
      id: String(share._id),
      role: share.role,
      expiresAt: share.expiresAt || null,
    },
  };
}

module.exports = {
  listBoardShares,
  getBoardShareById,
  createBoardShare,
  updateBoardShare,
  revokeBoardShare,
  listMySharedProjects,
};

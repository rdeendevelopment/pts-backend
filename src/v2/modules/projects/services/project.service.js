const { AppError } = require('../../../kernel/errors');
const {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  PROJECT_PRIORITIES,
  BILLING_TYPES,
  DEFAULT_CURRENCY,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} = require('../constants/project.constants');
const projectErrorCodes = require('../errors/projectErrorCodes');
const {
  normalizeProjectName,
  generateProjectCode,
  normalizeTags,
  assertValidDateRange,
  resolveCompletedAt,
} = require('../helpers/project.helper');
const { validateBudgetTypeForProject, resolveInitialBudgetStatus } = require('../helpers/budget.helper');
const { syncBudgetCanonicalFields } = require('../helpers/budgetCapacity.helper');
const { clampRenewalDay } = require('../helpers/retainerPeriod.helper');
const {
  decodeCursor,
  encodeCursor,
  parseLimit,
  parsePage,
  buildPaginationMeta,
} = require('../helpers/pagination.helper');
const { projectHasActiveActivity } = require('../helpers/activityGuard.helper');
const clientRepository = require('../../clients/repositories/client.repository');
const projectRepository = require('../repositories/project.repository');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const projectBudgetRepository = require('../repositories/projectBudget.repository');
const projectStatsService = require('./projectStats.service');
const projectEventService = require('./projectEvent.service');
const retainerRenewalService = require('./retainerRenewal.service');
const { canManageTasks, resolveUserIdFromAuth } = require('../../tasks/helpers/taskAccessScope.helper');
const projectPermanentDeleteService = require('./projectPermanentDelete.service');
const { getProjectOrThrow } = require('./projectAccess.service');
const {
  toProjectDto,
  toProjectListItemDto,
  toProjectAssignmentDto,
} = require('../dto/project.dto');
const { info } = require('../../../kernel/logger');

function assertValidStatus(status) {
  if (!PROJECT_STATUSES.includes(status)) {
    throw new AppError('Invalid project status', {
      status: 400,
      code: projectErrorCodes.PROJECT_INVALID_STATUS,
      details: { allowed: PROJECT_STATUSES },
    });
  }
}

function assertValidType(type) {
  if (!PROJECT_TYPES.includes(type)) {
    throw new AppError('Invalid project type', {
      status: 400,
      code: projectErrorCodes.PROJECT_INVALID_TYPE,
      details: { allowed: PROJECT_TYPES },
    });
  }
}

function assertValidBillingType(billingType) {
  if (!BILLING_TYPES.includes(billingType)) {
    throw new AppError('Invalid billing type', {
      status: 400,
      code: projectErrorCodes.PROJECT_INVALID_BILLING_TYPE,
      details: { allowed: BILLING_TYPES },
    });
  }
}

async function assertActiveClient(clientId) {
  const client = await clientRepository.findById(clientId);
  if (!client) {
    throw new AppError('Client not found for project', {
      status: 404,
      code: projectErrorCodes.PROJECT_CLIENT_NOT_FOUND,
      details: { clientId: String(clientId) },
    });
  }
  if (client.status !== 'active') {
    throw new AppError('Project client must be active', {
      status: 400,
      code: projectErrorCodes.PROJECT_CLIENT_NOT_FOUND,
      details: { clientId: String(clientId), clientStatus: client.status },
    });
  }
  return client;
}

async function assertUniqueName(clientId, normalizedName, { excludeProjectId = null } = {}) {
  const existing = await projectRepository.findByClientAndNormalizedName(clientId, normalizedName);
  if (existing && (!excludeProjectId || String(existing._id) !== String(excludeProjectId))) {
    throw new AppError('Project name already exists for client', {
      status: 409,
      code: projectErrorCodes.PROJECT_NAME_ALREADY_EXISTS,
      details: { clientId: String(clientId), name: normalizedName },
    });
  }
}

async function assertUniqueCode(code, { excludeProjectId = null } = {}) {
  if (!code) return;

  const existing = await projectRepository.findByCode(code);
  if (existing && (!excludeProjectId || String(existing._id) !== String(excludeProjectId))) {
    throw new AppError('Project code already exists', {
      status: 409,
      code: projectErrorCodes.PROJECT_CODE_ALREADY_EXISTS,
      details: { code },
    });
  }
}

function mapSettings(payload = {}, existing = {}) {
  const source = payload.settings || {};
  return {
    requireBudgetForTime: source.requireBudgetForTime ?? existing.requireBudgetForTime ?? true,
    requireApprovalForExtraBudget: source.requireApprovalForExtraBudget
      ?? existing.requireApprovalForExtraBudget ?? true,
    autoApproveInitialBudgetOnActivation: source.autoApproveInitialBudgetOnActivation
      ?? existing.autoApproveInitialBudgetOnActivation ?? true,
    allowManualTimeEntry: source.allowManualTimeEntry ?? existing.allowManualTimeEntry ?? true,
  };
}

function buildProjectPayload(payload, { forUpdate = false, existing = null } = {}) {
  const data = {};

  if (payload.clientId !== undefined) {
    data.clientId = payload.clientId;
  }

  if (payload.name !== undefined) {
    data.name = String(payload.name).trim();
    data.normalizedName = normalizeProjectName(payload.name);
  }

  if (payload.code !== undefined && payload.code !== null && String(payload.code).trim()) {
    data.code = String(payload.code).trim().toUpperCase();
  } else if (!forUpdate && payload.name) {
    data.code = generateProjectCode(payload.name);
  } else if (payload.code !== undefined) {
    data.code = null;
  }

  if (payload.description !== undefined) data.description = payload.description || null;

  if (payload.type !== undefined) {
    assertValidType(payload.type);
    data.type = payload.type;
  } else if (!forUpdate) {
    data.type = 'fixed_hours';
  }

  if (payload.status !== undefined) {
    assertValidStatus(payload.status);
    data.status = payload.status;
  } else if (!forUpdate) {
    data.status = 'draft';
  }

  if (payload.priority !== undefined) {
    if (!PROJECT_PRIORITIES.includes(payload.priority)) {
      throw new AppError('Invalid project priority', {
        status: 400,
        code: projectErrorCodes.PROJECT_INVALID_STATUS,
        details: { allowed: PROJECT_PRIORITIES },
      });
    }
    data.priority = payload.priority;
  } else if (!forUpdate) {
    data.priority = 'medium';
  }

  if (payload.startDate !== undefined) {
    data.startDate = payload.startDate ? new Date(payload.startDate) : null;
  }
  if (payload.dueDate !== undefined) {
    data.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
  }

  const startDate = data.startDate ?? existing?.startDate;
  const dueDate = data.dueDate ?? existing?.dueDate;
  try {
    assertValidDateRange(startDate, dueDate);
  } catch (err) {
    throw new AppError('Project due date cannot be before start date', {
      status: 400,
      code: projectErrorCodes.PROJECT_INVALID_DATE_RANGE,
    });
  }

  if (payload.billingType !== undefined) {
    assertValidBillingType(payload.billingType);
    data.billingType = payload.billingType;
  } else if (!forUpdate) {
    data.billingType = 'billable';
  }

  if (payload.currency !== undefined) {
    data.currency = String(payload.currency || DEFAULT_CURRENCY).trim().toUpperCase();
  } else if (!forUpdate) {
    data.currency = DEFAULT_CURRENCY;
  }

  if (payload.allowBudgetExceed !== undefined) {
    data.allowBudgetExceed = Boolean(payload.allowBudgetExceed);
  }

  const resolvedType = data.type ?? existing?.type ?? payload.type;
  const isRetainer = resolvedType === 'retainer';

  if (payload.retainerHoursPerMonth !== undefined || payload.retainer_hours_per_month !== undefined) {
    const raw = payload.retainerHoursPerMonth ?? payload.retainer_hours_per_month;
    data.retainerHoursPerMonth = raw === null || raw === '' ? null : Math.max(0, Number(raw));
  } else if (!forUpdate && isRetainer) {
    data.retainerHoursPerMonth = null;
  }

  if (payload.retainerRenewalDay !== undefined || payload.retainer_renewal_day !== undefined) {
    const raw = payload.retainerRenewalDay ?? payload.retainer_renewal_day;
    data.retainerRenewalDay = clampRenewalDay(raw);
  } else if (!forUpdate && isRetainer) {
    data.retainerRenewalDay = 1;
  }

  if (payload.autoCreateMonthlyBudget !== undefined || payload.auto_create_monthly_budget !== undefined) {
    const raw = payload.autoCreateMonthlyBudget ?? payload.auto_create_monthly_budget;
    data.autoCreateMonthlyBudget = Boolean(raw);
  } else if (!forUpdate && isRetainer) {
    data.autoCreateMonthlyBudget = true;
  }

  if (isRetainer && (data.retainerHoursPerMonth === null || data.retainerHoursPerMonth === undefined) && !forUpdate) {
    const initialMinutes = Number(payload.initialBudget?.requestedMinutes || 0);
    if (initialMinutes > 0) {
      data.retainerHoursPerMonth = Math.round((initialMinutes / 60) * 100) / 100;
    }
  }

  if (isRetainer && (data.retainerHoursPerMonth !== undefined || (!forUpdate && resolvedType === 'retainer'))) {
    const hours = Number(data.retainerHoursPerMonth ?? existing?.retainerHoursPerMonth ?? 0);
    if (hours < 1) {
      throw new AppError('Retainer projects require at least 1 hour per month', {
        status: 400,
        code: projectErrorCodes.PROJECT_TYPE_REQUIREMENTS_FAILED,
      });
    }
  }

  if (payload.settings !== undefined || !forUpdate) {
    data.settings = mapSettings(payload, existing?.settings || {});
  }

  if (payload.tags !== undefined) {
    data.tags = normalizeTags(payload.tags);
  } else if (!forUpdate) {
    data.tags = [];
  }

  return data;
}

function buildInitialBudgetPayload(project, initialBudget, accountId) {
  if (!initialBudget) return null;

  const isRetainerInitial = project.type === 'retainer'
    || initialBudget.entryType === 'retainer_cycle'
    || initialBudget.sourceType === 'retainer_month'
    || initialBudget.sourceType === 'retainer_renewal';

  if (isRetainerInitial && project.type === 'retainer') {
    return null;
  }

  const budgetType = initialBudget.budgetType || 'hours';
  const typeCheck = validateBudgetTypeForProject(project.type, budgetType);
  if (!typeCheck.valid) {
    throw new AppError(typeCheck.reason, {
      status: 400,
      code: projectErrorCodes.PROJECT_TYPE_REQUIREMENTS_FAILED,
      details: { projectType: project.type, budgetType },
    });
  }

  const status = resolveInitialBudgetStatus(project, initialBudget);
  const approvedMinutes = Number(
    initialBudget.approvedMinutes ?? initialBudget.requestedMinutes ?? 0
  );
  const approvedAmount = Number(
    initialBudget.approvedAmount ?? initialBudget.requestedAmount ?? 0
  );

  return syncBudgetCanonicalFields({
    projectId: project._id,
    title: initialBudget.title || 'Initial budget',
    description: initialBudget.description || null,
    entryType: 'initial',
    sourceType: 'initial',
    budgetType,
    status,
    requestedAmount: Math.max(0, Number(initialBudget.requestedAmount ?? approvedAmount)),
    approvedAmount: status === 'approved' ? Math.max(0, approvedAmount) : 0,
    requestedMinutes: Math.max(0, Number(initialBudget.requestedMinutes ?? approvedMinutes)),
    approvedMinutes: status === 'approved' ? Math.max(0, approvedMinutes) : 0,
    currency: initialBudget.currency || project.currency || DEFAULT_CURRENCY,
    clientApproval: {
      required: Boolean(initialBudget.clientApprovalRequired),
    },
    adminApproval: {
      required: initialBudget.adminApprovalRequired !== false,
      approvedBy: status === 'approved' ? accountId : null,
      approvedAt: status === 'approved' ? new Date() : null,
    },
    requestedBy: accountId,
    approvedBy: status === 'approved' ? accountId : null,
    notes: initialBudget.notes || null,
    createdBy: accountId,
    updatedBy: accountId,
  });
}

async function resolveListProjectsAssignedUserId(query = {}, req = null) {
  const explicit = query.assigned_user_id || query.assignedUserId || null;

  if (!req?.v2Auth?.accountId) {
    return explicit;
  }

  const permissions = req.v2Auth.permissions || [];
  const canListAllProjects = permissions.includes('projects.manage') || canManageTasks(req);

  if (canListAllProjects) {
    return explicit;
  }

  const requesterUserId = await resolveUserIdFromAuth(req.v2Auth.accountId);

  if (explicit && String(explicit) !== String(requesterUserId)) {
    throw new AppError('You can only list your assigned projects', {
      status: 403,
      code: projectErrorCodes.PROJECT_ASSIGNED_LIST_FORBIDDEN,
    });
  }

  return requesterUserId;
}

async function listProjects(query = {}, req = null) {
  const startedAt = Date.now();
  const limit = parseLimit(query.limit, {
    defaultLimit: DEFAULT_LIST_LIMIT,
    maxLimit: MAX_LIST_LIMIT,
  });
  const page = parsePage(query.page);
  const cursor = decodeCursor(query.cursor);
  const useCursor = Boolean(query.cursor);
  const includeDeleted = String(query.include_deleted || query.includeDeleted || '').toLowerCase() === 'true';
  const assignedUserId = await resolveListProjectsAssignedUserId(query, req);

  let projectIds = null;
  if (assignedUserId) {
    projectIds = await projectAssignmentRepository.listActiveProjectIdsByUserId(assignedUserId);
    if (!projectIds.length) {
      info('projects.list.completed', {
        projectCount: 0,
        cachedStatsFound: 0,
        missingStatsCount: 0,
        fallbackRecalculationUsed: false,
        fallbackRecalculated: 0,
        durationMs: Date.now() - startedAt,
      });
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasMore: false,
          has_more: false,
          next_cursor: null,
        },
      };
    }
  }

  const loggableOnly = ['true', '1'].includes(
    String(query.loggable_only || query.loggableOnly || '').toLowerCase()
  );
  const rawStatus = loggableOnly ? 'active' : (query.status || null);
  let listStatus = rawStatus;
  let statusIn = null;
  if (rawStatus === 'archived') {
    listStatus = null;
    statusIn = ['archived', 'cancelled'];
  }

  const filters = {
    search: query.search,
    clientId: query.client_id || query.clientId,
    status: listStatus,
    statusIn,
    type: query.type,
    billingType: query.billing_type || query.billingType,
    priority: query.priority,
    tag: query.tag,
    includeDeleted,
    projectIds,
  };

  const sortBy = query.sort_by || query.sortBy || null;
  const sortOrder = query.sort_order || query.sortOrder || null;
  const sort = projectRepository.resolveListSort(sortBy, sortOrder);
  const includeSummary = ['true', '1'].includes(
    String(query.include_summary || query.includeSummary || '').toLowerCase()
  );

  const listResult = useCursor
    ? await projectRepository.listProjects(filters, { limit, cursor, sort })
    : await projectRepository.listProjectsPage(filters, {
      limit,
      skip: (page - 1) * limit,
      sort,
    });
  const { items } = listResult;
  const nextCursor = useCursor
    ? listResult.nextCursor
    : (listResult.total > page * limit ? items[items.length - 1] : null);
  const hasMore = useCursor ? listResult.hasMore : listResult.total > page * limit;

  const listProjectIds = items.map((item) => item._id);
  const {
    statsByProjectId,
    cachedFound,
    missingCount,
    fallbackRecalculated,
  } = await projectStatsService.resolveStatsForList(listProjectIds);
  const statsRows = items.map((item) => statsByProjectId.get(String(item._id)) || null);

  const clientIds = [...new Set(items.map((item) => item.clientId).filter(Boolean))];
  const clientRows = clientIds.length
    ? await clientRepository.findByIds(clientIds)
    : [];
  const clientById = new Map(clientRows.map((client) => [String(client._id), client]));

  const myAssignmentByProjectId = new Map();
  if (assignedUserId) {
    const assignmentRows = await Promise.all(
      items.map((item) => projectAssignmentRepository.findByProjectAndUser(item._id, assignedUserId))
    );
    items.forEach((item, index) => {
      const assignment = assignmentRows[index];
      if (assignment && !assignment.isDeleted && assignment.status === 'active') {
        myAssignmentByProjectId.set(String(item._id), assignment);
      }
    });
  }

  const teamSummaryByProjectId = await projectAssignmentRepository
    .listActiveMemberSummariesByProjectIds(listProjectIds, { sampleSize: 4 });

  const summary = includeSummary
    ? await projectRepository.getPortfolioSummary(filters)
    : null;

  info('projects.list.completed', {
    projectCount: items.length,
    cachedStatsFound: cachedFound,
    missingStatsCount: missingCount,
    fallbackRecalculationUsed: fallbackRecalculated > 0,
    fallbackRecalculated,
    durationMs: Date.now() - startedAt,
    includeSummary,
  });

  return {
    items: items.map((item, index) => {
      const client = clientById.get(String(item.clientId)) || null;
      const dto = toProjectListItemDto(item, statsRows[index], client);
      const myAssignment = myAssignmentByProjectId.get(String(item._id));
      if (myAssignment) {
        dto.myAssignment = toProjectAssignmentDto(myAssignment);
      }
      const teamSummary = teamSummaryByProjectId.get(String(item._id));
      if (teamSummary) {
        dto.teamSummary = teamSummary;
      } else {
        dto.teamSummary = { totalMembers: statsRows[index]?.totalMembers || 0, members: [] };
      }
      return dto;
    }),
    pagination: {
      ...(useCursor
        ? {}
        : buildPaginationMeta({
          page,
          limit,
          total: listResult.total,
          nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
        })),
      limit,
      has_more: hasMore,
      hasMore,
      next_cursor: nextCursor ? encodeCursor(nextCursor) : null,
    },
    ...(summary ? { summary } : {}),
  };
}

async function getProjectById(projectId, req = null) {
  await retainerRenewalService.ensureRetainerBudgetOnAccess(projectId);
  const project = await getProjectOrThrow(projectId);
  const stats = await projectStatsService.getStats(project._id);
  const dto = {
    ...toProjectDto(project),
    stats: require('../dto/project.dto').toProjectStatsDto(stats),
  };

  if (req?.v2Auth?.accountId) {
    const assignedUserId = await resolveUserIdFromAuth(req.v2Auth.accountId);
    if (assignedUserId) {
      const assignment = await projectAssignmentRepository.findByProjectAndUser(
        project._id,
        assignedUserId,
      );
      if (assignment && !assignment.isDeleted && assignment.status === 'active') {
        dto.myAssignment = toProjectAssignmentDto(assignment);
      }
    }
  }

  return dto;
}

async function createProject(payload, accountId, req = null) {
  const data = buildProjectPayload(payload);
  await assertActiveClient(data.clientId);
  await assertUniqueName(data.clientId, data.normalizedName);
  await assertUniqueCode(data.code);

  const project = await projectRepository.createProject({
    ...data,
    createdBy: accountId,
    updatedBy: accountId,
  });

  await projectStatsService.createInitialStats(project._id);

  const initialBudgetPayload = buildInitialBudgetPayload(
    project,
    payload.initialBudget,
    accountId
  );
  let budget = null;
  if (initialBudgetPayload) {
    budget = await projectBudgetRepository.createBudget(initialBudgetPayload);
  }

  if (project.type === 'retainer') {
    const retainerResult = await retainerRenewalService.ensureCurrentRetainerBudget(
      project._id,
      accountId,
      req,
    );
    if (retainerResult?.budget) {
      budget = retainerResult.budget;
    }
  }

  await projectStatsService.recalculateStats(project._id);

  await projectEventService.recordEvent({
    projectId: project._id,
    eventType: 'PROJECT_CREATED',
    title: 'Project created',
    description: project.name,
    performedBy: accountId,
    metadata: { status: project.status, type: project.type },
    req,
  });

  if (budget) {
    await projectEventService.recordEvent({
      projectId: project._id,
      eventType: 'PROJECT_BUDGET_CREATED',
      title: budget.title,
      performedBy: accountId,
      metadata: { budgetId: String(budget._id), status: budget.status },
      req,
    });
  }

  return getProjectById(project._id);
}

async function updateProject(projectId, payload, accountId, req = null) {
  const project = await getProjectOrThrow(projectId);
  const updates = buildProjectPayload(payload, { forUpdate: true, existing: project });

  if (updates.clientId && String(updates.clientId) !== String(project.clientId)) {
    await assertActiveClient(updates.clientId);
  }

  if (updates.normalizedName) {
    const clientId = updates.clientId || project.clientId;
    if (updates.normalizedName !== project.normalizedName || String(clientId) !== String(project.clientId)) {
      await assertUniqueName(clientId, updates.normalizedName, { excludeProjectId: project._id });
    }
  }

  if (updates.code !== undefined && updates.code !== project.code) {
    await assertUniqueCode(updates.code, { excludeProjectId: project._id });
  }

  updates.updatedBy = accountId;

  const updated = await projectRepository.updateProject(project._id, updates);

  await projectEventService.recordEvent({
    projectId: project._id,
    eventType: 'PROJECT_UPDATED',
    title: 'Project updated',
    performedBy: accountId,
    metadata: { fields: Object.keys(updates) },
    req,
  });

  return getProjectById(updated._id);
}

async function updateProjectStatus(projectId, status, accountId, req = null) {
  assertValidStatus(status);
  const project = await getProjectOrThrow(projectId);

  const completedAt = resolveCompletedAt(project.status, status, project.completedAt);

  const updated = await projectRepository.updateProject(projectId, {
    status,
    completedAt,
    updatedBy: accountId,
  });

  await projectEventService.recordEvent({
    projectId: project._id,
    eventType: 'PROJECT_STATUS_CHANGED',
    title: 'Project status changed',
    performedBy: accountId,
    metadata: { from: project.status, to: status },
    req,
  });

  return getProjectById(updated._id);
}

async function deleteProject(projectId, accountId, req = null) {
  const project = await getProjectOrThrow(projectId);

  if (await projectHasActiveActivity(project._id)) {
    throw new AppError('Project has active activity and cannot be deleted', {
      status: 409,
      code: projectErrorCodes.PROJECT_HAS_ACTIVE_ACTIVITY,
      details: { projectId: String(project._id) },
    });
  }

  await projectRepository.softDeleteProject(project._id, accountId);

  await projectEventService.recordEvent({
    projectId: project._id,
    eventType: 'PROJECT_DELETED',
    title: 'Project deleted',
    performedBy: accountId,
    req,
  });

  return { deleted: true, id: String(project._id) };
}

async function permanentDeleteProject(projectId, accountId, password) {
  const { verifyAccountPasswordOrThrow } = require('../../auth/helpers/passwordConfirmation.helper');
  await verifyAccountPasswordOrThrow(accountId, password);

  const project = await projectRepository.findById(projectId, { includeDeleted: true });
  if (!project) {
    throw new AppError('Project not found', {
      status: 404,
      code: projectErrorCodes.PROJECT_NOT_FOUND,
    });
  }

  return projectPermanentDeleteService.permanentDeleteProjectData(project._id);
}

module.exports = {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  updateProjectStatus,
  deleteProject,
  permanentDeleteProject,
  getProjectOrThrow,
  assertValidStatus,
  assertValidType,
  assertValidBillingType,
};

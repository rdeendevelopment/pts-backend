const {
  CoreProject,
  CoreUser,
  AccountAdmin,
  ProjectBudget,
  ProjectBudgetRequest,
  TimeEntry,
} = require('../MongoModels');

function serviceError(message, status = 400, data = null) {
  const error = new Error(message);
  error.status = status;
  if (data) error.data = data;
  return error;
}

function labelMinutes(minutes) {
  const m = Math.max(0, Number(minutes || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

function minutesFromHours(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) throw serviceError('Allocated hours must be a positive number');
  return Math.round(number * 60);
}

function minutesValue(value) {
  const number = Number(value || 0);
  if (!number || number < 1) throw serviceError('Requested hours are required');
  return Math.round(number * 60);
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function monthRange(fromDate = new Date(), offsetMonths = 0) {
  const date = new Date(fromDate);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return {
    label: start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function nextLegacyId(Model) {
  const row = await Model.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

async function resolveActorRef(actorRef) {
  if (!actorRef) return null;
  if (typeof actorRef === 'object') {
    return actorRef._id || actorRef.id || null;
  }

  const raw = String(actorRef).trim();
  if (!raw) return null;
  if (/^[a-f\d]{24}$/i.test(raw)) return raw;

  const legacyId = Number(raw);
  if (!Number.isFinite(legacyId)) return null;

  const [user, admin] = await Promise.all([
    CoreUser.findOne({ legacyId }, { _id: 1 }).lean(),
    AccountAdmin.findOne({ legacyId }, { _id: 1 }).lean(),
  ]);
  return user?._id || admin?._id || null;
}

async function assertProject(projectId) {
  const project = await CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false }).lean();
  if (!project) throw serviceError('Project not found', 404);
  return project;
}

function serializeBudget(row) {
  const budget = row?.toObject ? row.toObject() : row;
  if (!budget) return null;
  const allocated = budget.allocatedMinutes === null || budget.allocatedMinutes === undefined ? null : Number(budget.allocatedMinutes);
  const consumed = Number(budget.consumedMinutes || 0);
  const remaining = allocated === null ? null : allocated - consumed;
  const usagePercent = allocated ? Math.round((consumed / allocated) * 100) : null;
  const warningThreshold = Number(budget.warningThresholdPercent || 80);
  return {
    id: budget.legacyId,
    project_id: budget.projectId?.legacyId ?? null,
    name: budget.name,
    description: budget.description,
    budget_type: budget.budgetType,
    billing_type: budget.billingType,
    allocated_minutes: allocated,
    consumed_minutes: consumed,
    start_date: budget.startDate,
    end_date: budget.endDate,
    allow_exceed: budget.allowExceed,
    warning_threshold_percent: warningThreshold,
    status: budget.status,
    created_by: budget.createdBy,
    approved_by: budget.approvedBy,
    approved_at: budget.approvedAt,
    created_at: budget.createdAt,
    updated_at: budget.updatedAt,
    remainingMinutes: remaining,
    usagePercent,
    isWarning: usagePercent !== null && usagePercent >= warningThreshold && consumed < allocated,
    allocatedLabel: allocated === null ? 'Flexible' : labelMinutes(allocated),
    consumedLabel: labelMinutes(consumed),
    remainingLabel: remaining === null ? 'Flexible' : labelMinutes(Math.max(0, remaining)),
  };
}

function serializeRequest(row) {
  const request = row?.toObject ? row.toObject() : row;
  if (!request) return null;
  return {
    id: request.legacyId,
    project_id: request.projectId?.legacyId ?? null,
    budget_id: request.budgetId?.legacyId ?? null,
    requested_by: request.requestedBy,
    request_type: request.requestType,
    title: request.title,
    description: request.description,
    requested_minutes: Number(request.requestedMinutes || 0),
    status: request.status,
    reviewed_by: request.reviewedBy,
    reviewed_at: request.reviewedAt,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
    budgetName: request.budgetId?.name,
    requestedLabel: labelMinutes(request.requestedMinutes),
  };
}

async function recalculateBudget(budgetId) {
  if (!budgetId) return null;
  const rawBudgetId = String(budgetId || '').trim();
  const legacyBudgetId = Number(rawBudgetId);
  const query = /^[a-f\d]{24}$/i.test(rawBudgetId)
    ? { _id: rawBudgetId }
    : Number.isFinite(legacyBudgetId)
      ? { legacyId: legacyBudgetId }
      : null;
  if (!query) return null;
  const budget = await ProjectBudget.findOne(query);
  if (!budget) return null;
  const totals = await TimeEntry.aggregate([
    { $match: { budgetId: budget._id } },
    { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
  ]);
  const consumed = Number(totals[0]?.total || 0);
  let status = budget.status;
  const allocated = budget.allocatedMinutes === null ? null : Number(budget.allocatedMinutes);
  if (!['completed', 'cancelled', 'draft'].includes(status)) {
    if (allocated !== null && consumed >= allocated) status = 'exceeded';
    if (status === 'exceeded' && (allocated === null || consumed < allocated)) status = 'active';
  }
  budget.consumedMinutes = consumed;
  budget.status = status;
  await budget.save();
  return serializeBudget(budget);
}

async function refreshProjectBudgets(projectId) {
  const project = await CoreProject.findOne({ legacyId: Number(projectId) }, { _id: 1 }).lean();
  if (!project) return;
  const rows = await ProjectBudget.find({ projectId: project._id }, { legacyId: 1 }).lean();
  for (const row of rows) await recalculateBudget(row.legacyId);
}

async function getBudgets(projectId) {
  const project = await assertProject(projectId);
  await refreshProjectBudgets(projectId);
  const rows = await ProjectBudget.find({ projectId: project._id })
    .populate('projectId', 'legacyId')
    .sort({ status: 1, createdAt: -1, legacyId: -1 })
    .lean();
  return rows.map(serializeBudget);
}

async function budgetPayload(actorId, projectId, data = {}, existing = {}) {
  const project = await assertProject(projectId);
  return {
    projectId: project._id,
    name: data.name !== undefined ? String(data.name).trim() : existing.name,
    description: data.description !== undefined ? data.description || null : existing.description || null,
    budgetType: data.budgetType || data.budget_type || existing.budgetType || 'fixed',
    billingType: data.billingType || data.billing_type || existing.billingType || 'billable',
    allocatedMinutes: data.allocatedMinutes !== undefined
      ? Number(data.allocatedMinutes)
      : data.allocated_minutes !== undefined
        ? Number(data.allocated_minutes)
        : data.allocatedHours !== undefined || data.allocated_hours !== undefined
          ? minutesFromHours(data.allocatedHours ?? data.allocated_hours)
          : existing.allocatedMinutes ?? null,
    startDate: data.startDate !== undefined || data.start_date !== undefined ? dateOnly(data.startDate ?? data.start_date) : existing.startDate ?? null,
    endDate: data.endDate !== undefined || data.end_date !== undefined ? dateOnly(data.endDate ?? data.end_date) : existing.endDate ?? null,
    allowExceed: data.allowExceed !== undefined ? Boolean(data.allowExceed) : data.allow_exceed !== undefined ? Boolean(data.allow_exceed) : existing.allowExceed ?? true,
    warningThresholdPercent: Number(data.warningThresholdPercent || data.warning_threshold_percent || existing.warningThresholdPercent || 80),
    status: data.status || existing.status || 'active',
    createdBy: existing.createdBy || await resolveActorRef(actorId),
  };
}

async function createBudget(actorId, projectId, data) {
  const payload = await budgetPayload(actorId, projectId, data);
  if (!payload.name) throw serviceError('Budget name is required');
  await ProjectBudget.create({
    legacyId: await nextLegacyId(ProjectBudget),
    ...payload,
    consumedMinutes: 0,
  });
  return getBudgets(projectId);
}

async function updateBudget(actorId, projectId, budgetId, data) {
  const project = await assertProject(projectId);
  const existing = await ProjectBudget.findOne({ legacyId: Number(budgetId), projectId: project._id }).lean();
  if (!existing) throw serviceError('Budget not found', 404);
  const payload = await budgetPayload(actorId, projectId, data, existing);
  await ProjectBudget.updateOne({ legacyId: Number(budgetId) }, { $set: payload }, { runValidators: true });
  await recalculateBudget(budgetId);
  return getBudgets(projectId);
}

async function deleteBudget(projectId, budgetId) {
  const project = await assertProject(projectId);
  if (!budgetId || Number.isNaN(Number(budgetId))) throw serviceError('Invalid budget ID', 400);
  const budget = await ProjectBudget.findOne({ legacyId: Number(budgetId), projectId: project._id }).lean();
  if (!budget) throw serviceError('Budget not found', 404);
  if (['cancelled', 'completed'].includes(budget.status)) {
    throw serviceError(`Budget is already ${budget.status}`, 400);
  }
  const consumed = Number(budget.consumedMinutes || 0);
  if (consumed > 0) {
    // Has logged time — cap allocated at consumed and close; prevents any further logging
    await ProjectBudget.updateOne(
      { _id: budget._id },
      { $set: { status: 'completed', allocatedMinutes: consumed, allowExceed: false } }
    );
  } else {
    // No logged time — hard cancel
    await ProjectBudget.updateOne({ _id: budget._id }, { $set: { status: 'cancelled' } });
  }
  return getBudgets(projectId);
}

async function getBudgetSummary(projectId) {
  const project = await assertProject(projectId);
  await refreshProjectBudgets(projectId);
  const rows = await ProjectBudget.find({ projectId: project._id, status: { $ne: 'cancelled' } }).lean();
  const totalAllocatedMinutes = rows.reduce((sum, row) => sum + Number(row.allocatedMinutes || 0), 0);
  const totalConsumedMinutes = rows.reduce((sum, row) => sum + Number(row.consumedMinutes || 0), 0);
  return {
    totalAllocatedMinutes,
    totalConsumedMinutes,
    totalRemainingMinutes: Math.max(0, totalAllocatedMinutes - totalConsumedMinutes),
    activeBudgetCount: rows.filter((row) => row.status === 'active').length,
    exceededBudgetCount: rows.filter((row) => row.status === 'exceeded').length,
    budgetWarningCount: rows.filter((row) => {
      if (!row.allocatedMinutes || !['active', 'exceeded'].includes(row.status)) return false;
      const percent = (Number(row.consumedMinutes || 0) / Number(row.allocatedMinutes)) * 100;
      return percent >= Number(row.warningThresholdPercent || 80) && Number(row.consumedMinutes || 0) < Number(row.allocatedMinutes);
    }).length,
    totalAllocatedLabel: labelMinutes(totalAllocatedMinutes),
    totalConsumedLabel: labelMinutes(totalConsumedMinutes),
    totalRemainingLabel: labelMinutes(Math.max(0, totalAllocatedMinutes - totalConsumedMinutes)),
  };
}

async function createBudgetRequest(actorId, projectId, data) {
  const project = await assertProject(projectId);
  const title = String(data.title || '').trim();
  if (!title) throw serviceError('Request title is required');
  const legacyBudgetId = data.budgetId || data.budget_id || null;
  const budget = legacyBudgetId ? await ProjectBudget.findOne({ legacyId: Number(legacyBudgetId) }).lean() : null;
  const requestedBy = await resolveActorRef(actorId);
  if (!requestedBy) throw serviceError('Requester could not be resolved', 400);
  await ProjectBudgetRequest.create({
    legacyId: await nextLegacyId(ProjectBudgetRequest),
    projectId: project._id,
    budgetId: budget?._id || null,
    requestedBy,
    requestType: data.requestType || data.request_type || 'additional_hours',
    title,
    description: data.description || null,
    requestedMinutes: data.requestedMinutes !== undefined ? Number(data.requestedMinutes) : minutesValue(data.requestedHours || data.requested_hours),
    status: 'pending',
  });
  return getBudgetRequests(projectId);
}

async function getBudgetRequests(projectId) {
  const project = await assertProject(projectId);
  const rows = await ProjectBudgetRequest.find({ projectId: project._id })
    .populate('projectId', 'legacyId')
    .populate('budgetId', 'legacyId name')
    .sort({ status: 1, createdAt: -1, legacyId: -1 })
    .lean();
  return rows.map(serializeRequest);
}

function budgetTypeForRequest(type) {
  return type === 'phase_extension' ? 'phase' : 'change_request';
}

async function approveBudgetRequest(actorId, projectId, requestId) {
  const project = await assertProject(projectId);
  const request = await ProjectBudgetRequest.findOne({ legacyId: Number(requestId), projectId: project._id, status: 'pending' });
  if (!request) throw serviceError('Pending budget request not found', 404);
  const namePrefix = request.requestType === 'additional_hours' ? 'Additional Hours' : 'Approved Scope';
  const approvedBy = await resolveActorRef(actorId);
  const requestedBy = await resolveActorRef(request.requestedBy);
  await ProjectBudget.create({
    legacyId: await nextLegacyId(ProjectBudget),
    projectId: project._id,
    name: `${namePrefix} - ${request.title}`,
    description: request.description,
    budgetType: budgetTypeForRequest(request.requestType),
    billingType: 'billable',
    allocatedMinutes: request.requestedMinutes,
    consumedMinutes: 0,
    allowExceed: true,
    warningThresholdPercent: 80,
    status: 'active',
    createdBy: requestedBy,
    approvedBy,
    approvedAt: new Date(),
  });
  request.status = 'approved';
  request.reviewedBy = approvedBy;
  request.reviewedAt = new Date();
  await request.save();
  return getBudgetRequests(projectId);
}

async function rejectBudgetRequest(actorId, projectId, requestId) {
  const project = await assertProject(projectId);
  const reviewedBy = await resolveActorRef(actorId);
  const result = await ProjectBudgetRequest.updateOne(
    { legacyId: Number(requestId), projectId: project._id, status: 'pending' },
    { $set: { status: 'rejected', reviewedBy, reviewedAt: new Date() } }
  );
  if (!result.modifiedCount) throw serviceError('Pending budget request not found', 404);
  return getBudgetRequests(projectId);
}

async function resolveBudgetForTimeEntry(projectId, requestedBudgetId) {
  const normalized = requestedBudgetId === undefined || requestedBudgetId === null || requestedBudgetId === '' ? null : requestedBudgetId;
  const project = await CoreProject.findOne({ legacyId: Number(projectId) }, { _id: 1 }).lean();
  if (!project) return null;
  if (normalized) {
    const budget = await ProjectBudget.findOne({ legacyId: Number(normalized), projectId: project._id, status: { $in: ['active', 'exceeded'] } })
      .populate('projectId', 'legacyId')
      .lean();
    if (!budget) throw serviceError('Selected budget is not active for this project', 400);
    return serializeBudget(budget);
  }
  const active = await ProjectBudget.find({ projectId: project._id, status: { $in: ['active', 'exceeded'] } })
    .populate('projectId', 'legacyId')
    .sort({ createdAt: -1 })
    .lean();
  if (active.length === 1) return serializeBudget(active[0]);
  if (active.length > 1) throw serviceError('Select a budget or phase for this project', 400);
  return null;
}

async function assertBudgetCanConsume(budgetId, newDurationMinutes, excludeEntryId = null) {
  if (!budgetId) return null;
  const budget = await ProjectBudget.findOne({ legacyId: Number(budgetId) }).lean();
  if (!budget || budget.allocatedMinutes === null || budget.allocatedMinutes === undefined) return budget || null;
  const match = { budgetId: budget._id };
  if (excludeEntryId) match.legacyId = { $ne: Number(excludeEntryId) };
  const totals = await TimeEntry.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$durationMinutes' } } }]);
  const consumed = Number(totals[0]?.total || 0);
  const allocated = Number(budget.allocatedMinutes);
  const remaining = allocated - consumed;
  const projected = consumed + Number(newDurationMinutes || 0);
  if (projected > allocated && !Boolean(budget.allowExceed)) {
    throw serviceError(`Budget "${budget.name}" has ${labelMinutes(Math.max(0, remaining))} remaining but you are trying to log ${labelMinutes(Number(newDurationMinutes || 0))}.`, 409, {
      errorCode: 'BUDGET_EXCEEDED',
      budgetName: budget.name,
      allocatedMinutes: allocated,
      consumedMinutes: consumed,
      remainingMinutes: Math.max(0, remaining),
      requestedMinutes: Number(newDurationMinutes || 0),
    });
  }
  return budget;
}

module.exports = {
  ACTIVE_BUDGET_STATUSES: ['active', 'exceeded'],
  labelMinutes,
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  createBudgetRequest,
  getBudgetRequests,
  approveBudgetRequest,
  rejectBudgetRequest,
  recalculateBudget,
  refreshProjectBudgets,
  resolveBudgetForTimeEntry,
  assertBudgetCanConsume,
  createInitialBudgetSkeletons: async function createInitialBudgetSkeletons(actorId, projectId, projectType, data, options = {}) {
    const allowExceed = options.allowExceed !== undefined ? Boolean(options.allowExceed) : true;
    const project = await assertProject(projectId);
    const createdBy = await resolveActorRef(actorId);
    const create = (payload) => ProjectBudget.create({
      legacyId: payload.legacyId,
      projectId: project._id,
      billingType: 'billable',
      consumedMinutes: 0,
      allowExceed,
      warningThresholdPercent: 80,
      status: 'active',
      createdBy,
      ...payload,
    });
    if (projectType === 'fixed_hours' && Number(data.hours || 0) > 0) {
      await create({ legacyId: await nextLegacyId(ProjectBudget), name: 'Initial Fixed Hours', description: `Fixed hours budget: ${data.hours}h`, budgetType: 'fixed', allocatedMinutes: Math.round(Number(data.hours) * 60) });
    } else if (projectType === 'retainer' || projectType === 'hybrid') {
      const retainerHours = Number(data.retainer_hours_per_month || 0);
      if (retainerHours > 0) {
        const start = new Date();
        const rangeStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        const rangeEnd = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() + 1, 0));
        const label = rangeStart.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        await create({
          legacyId: await nextLegacyId(ProjectBudget),
          name: `${label} Retainer`,
          description: `Monthly retainer bucket for ${label}`,
          budgetType: 'retainer',
          allocatedMinutes: Math.round(retainerHours * 60),
          startDate: rangeStart.toISOString().slice(0, 10),
          endDate: rangeEnd.toISOString().slice(0, 10),
        });
      }
      const fixedHours = Number(data.extra_hours || data.hours || 0);
      if (projectType === 'hybrid' && fixedHours > 0) {
        await create({ legacyId: await nextLegacyId(ProjectBudget), name: 'Initial Phase', description: `Fixed phase budget: ${fixedHours}h`, budgetType: 'phase', allocatedMinutes: Math.round(fixedHours * 60) });
      }
    } else if (['fixed_budget', 'internal'].includes(projectType) && Number(data.estimated_hours || 0) > 0) {
      await create({
        legacyId: await nextLegacyId(ProjectBudget),
        name: projectType === 'internal' ? 'Internal Estimate' : 'Fixed Budget Estimate',
        description: projectType === 'internal' ? 'Internal effort estimate' : 'Estimated hours for fixed-price project',
        budgetType: projectType === 'internal' ? 'phase' : 'fixed',
        billingType: projectType === 'internal' ? 'non_billable' : 'billable',
        allocatedMinutes: Math.round(Number(data.estimated_hours) * 60),
      });
    }
  },
  createRetainerBudgetForRange: async function createRetainerBudgetForRange(actorId, projectId, projectData, range, options = {}) {
    if (projectData.project_type !== 'retainer' && projectData.projectType !== 'retainer' && !projectData.is_retain && !projectData.isRetain) {
      throw serviceError('Only retainer projects can create monthly retainer budgets', 400);
    }
    const hours = Number(projectData.retainer_hours_per_month || projectData.retainerHoursPerMonth || projectData.hours || 0);
    if (!hours || hours < 1) throw serviceError('Monthly retainer hours are required before creating a budget', 400);
    const name = `${range.label} Retainer`;
    const project = await assertProject(projectId);
    const createdBy = await resolveActorRef(actorId);
    const existing = await ProjectBudget.findOne({ projectId: project._id, name, status: { $ne: 'cancelled' } }).lean();
    if (existing) {
      if (options.returnExisting) return existing;
      throw serviceError(`${range.label} retainer budget already exists`, 409);
    }
    await ProjectBudget.create({
      legacyId: await nextLegacyId(ProjectBudget),
      projectId: project._id,
      name,
      description: `Monthly retainer bucket for ${range.label}`,
      budgetType: 'retainer',
      billingType: 'billable',
      allocatedMinutes: Math.round(hours * 60),
      consumedMinutes: 0,
      startDate: range.startDate,
      endDate: range.endDate,
      allowExceed: options.allowExceed !== undefined ? Boolean(options.allowExceed) : true,
      warningThresholdPercent: 80,
      status: 'active',
      createdBy,
    });
    return null;
  },
  monthRange,
};

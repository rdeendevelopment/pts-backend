const {
  CoreUser,
  CoreClient,
  CoreProject,
  ProjectAssignment,
  CoreAttachment,
  ProjectBudget,
  TimeEntry,
} = require('../MongoModels');
const mongoose = require('mongoose');

const { connectMongo } = require('../../../config/mongo');

function plain(row) {
  if (!row) return null;
  return typeof row.toJSON === 'function' ? row.toJSON() : row;
}

function serviceError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function id(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function bool(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function legacyDates(row) {
  return {
    legacyCreatedAt: dateOrNull(row.created_at || row.createdAt),
    legacyUpdatedAt: dateOrNull(row.updated_at || row.updatedAt),
    legacyDeletedAt: dateOrNull(row.deleted_at || row.deletedAt),
    migratedAt: new Date(),
  };
}

function snapshotClient(client) {
  if (!client) return {};
  return {
    companyName: client.companyName || client.company_name || '',
    firstName: client.firstName || client.first_name || '',
    lastName: client.lastName || client.last_name || '',
    email: client.email || '',
  };
}

function snapshotUser(user) {
  if (!user) return {};
  return {
    firstName: user.firstName || user.first_name || '',
    lastName: user.lastName || user.last_name || '',
    email: user.email || '',
  };
}

function serializeUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    id: id(user.legacyId),
    role: user.role,
    first_name: user.firstName,
    last_name: user.lastName,
    user_name: user.userName,
    email: user.email,
    contact: user.contact,
    password: user.password,
    is_active: Boolean(user.isActive),
    is_deleted: Boolean(user.isDeleted),
    is_verified: Boolean(user.isVerified),
    last_login: isoDate(user.lastLogin),
    created_at: isoDate(user.legacyCreatedAt || user.createdAt),
    updated_at: isoDate(user.legacyUpdatedAt || user.updatedAt),
    deleted_at: isoDate(user.legacyDeletedAt),
  };
}

function serializeClient(client) {
  if (!client) return null;
  return {
    id: id(client.legacyId),
    role: client.role,
    first_name: client.firstName,
    last_name: client.lastName,
    company_name: client.companyName,
    type: client.type,
    email: client.email,
    contact: client.contact,
    is_active: Boolean(client.isActive),
    is_deleted: Boolean(client.isDeleted),
    created_at: isoDate(client.legacyCreatedAt || client.createdAt),
    updated_at: isoDate(client.legacyUpdatedAt || client.updatedAt),
    deleted_at: isoDate(client.legacyDeletedAt),
  };
}

function serializeAttachment(attachment) {
  if (!attachment) return null;
  return {
    id: id(attachment.legacyId),
    link_id: attachment.linkId,
    type: attachment.type,
    title: attachment.title,
    url: attachment.url,
    status: attachment.status,
    size: attachment.size,
    is_deleted: Boolean(attachment.isDeleted),
    created_at: isoDate(attachment.legacyCreatedAt || attachment.createdAt),
    updated_at: isoDate(attachment.legacyUpdatedAt || attachment.updatedAt),
    deleted_at: isoDate(attachment.legacyDeletedAt),
  };
}

function serializeAssignment(assignment) {
  if (!assignment) return null;
  const user = assignment.user || assignment.userId || null;
  const derivedLegacyUserId = assignment.legacyUserId ?? user?.legacyId ?? assignment.userSnapshot?.id ?? null;
  const derivedLegacyProjectId = assignment.legacyProjectId ?? assignment.project?.legacyId ?? assignment.projectId?.legacyId ?? null;
  return {
    id: id(assignment.legacyId),
    project_id: derivedLegacyProjectId === null ? '' : String(derivedLegacyProjectId),
    user_id: derivedLegacyUserId === null ? '' : String(derivedLegacyUserId),
    assign_date: isoDate(assignment.assignDate),
    unassign_date: isoDate(assignment.unassignDate),
    status: assignment.status,
    is_deleted: Boolean(assignment.isDeleted),
    hours_cap_minutes: assignment.hoursCapMinutes,
    cap_period: assignment.capPeriod,
    assigned_role: assignment.assignedRole,
    assigned_at: isoDate(assignment.assignedAt),
    created_at: isoDate(assignment.legacyCreatedAt || assignment.createdAt),
    updated_at: isoDate(assignment.legacyUpdatedAt || assignment.updatedAt),
    deleted_at: isoDate(assignment.legacyDeletedAt),
    user: user ? serializeUser(user) : {
      id: id(derivedLegacyUserId),
      first_name: assignment.userSnapshot?.firstName || '',
      last_name: assignment.userSnapshot?.lastName || '',
      email: assignment.userSnapshot?.email || '',
    },
  };
}

function serializeProject(project, extras = {}) {
  if (!project) return null;
  const client = project.client || project.clientId || null;
  const clientPayload = client ? serializeClient(client) : {
    id: id(project.legacyClientId),
    first_name: project.clientSnapshot?.firstName || '',
    last_name: project.clientSnapshot?.lastName || '',
    company_name: project.clientSnapshot?.companyName || '',
    email: project.clientSnapshot?.email || '',
  };

  return {
    id: id(project.legacyId),
    title: project.title,
    client_id: id(project.legacyClientId),
    client_name: clientPayload?.company_name || [clientPayload?.first_name, clientPayload?.last_name].filter(Boolean).join(' ').trim(),
    clientName: clientPayload?.company_name || [clientPayload?.first_name, clientPayload?.last_name].filter(Boolean).join(' ').trim(),
    client: clientPayload,
    detail: project.detail,
    notes: project.notes,
    is_retain: Boolean(project.isRetain),
    project_type: project.projectType,
    retainer_hours_per_month: project.retainerHoursPerMonth,
    retainer_renewal_day: project.retainerRenewalDay,
    auto_create_monthly_budget: Boolean(project.autoCreateMonthlyBudget),
    allow_budget_exceed: Boolean(project.allowBudgetExceed),
    budget_amount: project.budgetAmount,
    estimated_hours: project.estimatedHours,
    extra_hours: project.extraHours,
    assign_users: project.assignUsers || [],
    next_steps: project.nextSteps || [],
    next_step_title: project.nextStepTitle,
    hours: project.hours,
    deadline: isoDate(project.deadline),
    status: project.status,
    is_active: Boolean(project.isActive),
    is_deleted: Boolean(project.isDeleted),
    created_at: isoDate(project.legacyCreatedAt || project.createdAt),
    updated_at: isoDate(project.legacyUpdatedAt || project.updatedAt),
    assignedUsers: (extras.assignedUsers || []).map(serializeAssignment),
    attachments: (extras.attachments || []).map(serializeAttachment),
    totalAllocatedMinutes: extras.totalAllocatedMinutes || 0,
    totalConsumedMinutes: extras.totalConsumedMinutes || 0,
    totalLoggedMinutes: extras.totalLoggedMinutes || 0,
    totalRemainingMinutes: Math.max(0, (extras.totalAllocatedMinutes || 0) - (extras.totalConsumedMinutes || 0)),
  };
}

async function nextLegacyId(Model) {
  const row = await Model.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

function projectPayloadFromBody(body = {}, existing = {}) {
  const projectType = body.project_type ?? body.projectType ?? existing.projectType ?? (bool(body.is_retain ?? existing.isRetain) ? 'retainer' : 'fixed_hours');
  return {
    title: body.title ?? existing.title ?? '',
    legacyClientId: numberOrNull(body.client_id ?? body.clientId ?? existing.legacyClientId),
    detail: body.detail ?? existing.detail ?? '',
    notes: body.notes ?? existing.notes ?? '',
    isRetain: body.is_retain !== undefined ? bool(body.is_retain) : projectType === 'retainer' || existing.isRetain || false,
    projectType,
    retainerHoursPerMonth: numberOrNull(body.retainer_hours_per_month ?? body.retainerHoursPerMonth ?? existing.retainerHoursPerMonth),
    retainerRenewalDay: numberOrNull(body.retainer_renewal_day ?? body.retainerRenewalDay ?? existing.retainerRenewalDay),
    autoCreateMonthlyBudget: body.auto_create_monthly_budget !== undefined ? bool(body.auto_create_monthly_budget) : existing.autoCreateMonthlyBudget ?? false,
    allowBudgetExceed: body.allow_budget_exceed !== undefined ? bool(body.allow_budget_exceed) : body.allowExceed !== undefined ? bool(body.allowExceed) : existing.allowBudgetExceed ?? true,
    budgetAmount: numberOrNull(body.budget_amount ?? body.budgetAmount ?? existing.budgetAmount),
    estimatedHours: numberOrNull(body.estimated_hours ?? body.estimatedHours ?? existing.estimatedHours),
    extraHours: numberOrNull(body.extra_hours ?? body.extraHours ?? existing.extraHours),
    assignUsers: Array.isArray(body.assign_users) ? body.assign_users.map(Number).filter(Number.isFinite) : existing.assignUsers || [],
    nextSteps: Array.isArray(body.next_steps) ? body.next_steps : parseJsonArray(body.next_steps ?? existing.nextSteps),
    nextStepTitle: body.next_step_title ?? body.nextStepTitle ?? existing.nextStepTitle ?? '',
    hours: body.hours === undefined || body.hours === null ? existing.hours ?? '' : String(body.hours),
    deadline: body.deadline !== undefined ? dateOrNull(body.deadline) : existing.deadline ?? null,
    status: body.status ?? existing.status ?? 'active',
    isActive: body.is_active !== undefined ? bool(body.is_active) : existing.isActive ?? true,
    isDeleted: body.is_deleted !== undefined ? bool(body.is_deleted) : existing.isDeleted ?? false,
  };
}

async function budgetSummaryByProject(projects) {
  const projectRows = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (!projectRows.length) return new Map();

  const objectIds = projectRows
    .map((project) => String(project._id || ''))
    .filter(Boolean)
    .map((value) => new mongoose.Types.ObjectId(value));
  const legacyIds = projectRows
    .map((project) => Number(project.legacyId || 0))
    .filter(Boolean);
  const legacyByObjectId = new Map(
    projectRows
      .filter((project) => project._id && project.legacyId !== undefined && project.legacyId !== null)
      .map((project) => [String(project._id), String(project.legacyId)])
  );

  const match = { status: { $ne: 'cancelled' } };
  const scopes = [];
  if (objectIds.length) scopes.push({ projectId: { $in: objectIds } });
  if (legacyIds.length) scopes.push({ legacyProjectId: { $in: legacyIds } });
  if (!scopes.length) return new Map();
  match.$or = scopes;

  const rows = await ProjectBudget.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $ifNull: ['$projectId', '$legacyProjectId'] },
        totalAllocatedMinutes: { $sum: { $ifNull: ['$allocatedMinutes', 0] } },
        totalConsumedMinutes: { $sum: { $ifNull: ['$consumedMinutes', 0] } },
      },
    },
  ]);

  return new Map(
    rows
      .map((row) => {
        const key = legacyByObjectId.get(String(row._id)) || (row._id === null || row._id === undefined ? null : String(row._id));
        return key ? [key, row] : null;
      })
      .filter(Boolean)
  );
}

async function loggedSummaryByProject(projects) {
  const projectRows = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (!projectRows.length) return new Map();
  const projectIds = projectRows.map((project) => String(project._id)).filter(Boolean);
  const legacyByObjectId = new Map(
    projectRows.map((project) => [String(project._id), String(project.legacyId)])
  );
  const aggregateRows = await TimeEntry.aggregate([
    { $match: { projectId: { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $in: ['submitted', 'approved'] } } },
    {
      $group: {
        _id: '$projectId',
        totalLoggedMinutes: { $sum: { $ifNull: ['$durationMinutes', 0] } },
      },
    },
  ]);
  return new Map(
    aggregateRows
      .map((row) => {
        const legacyId = legacyByObjectId.get(String(row._id));
        return legacyId ? [legacyId, row] : null;
      })
      .filter(Boolean)
  );
}

async function getAllProjects({ page = 1, limit = 5000 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5000, 5000));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;
  const [projects, count] = await Promise.all([
    CoreProject.find({ isDeleted: false })
      .populate('clientId')
      .sort({ legacyCreatedAt: -1, legacyId: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    CoreProject.countDocuments({ isDeleted: false }),
  ]);
  const projectObjectIds = projects.map((project) => project._id);
  const [budgetMap, loggedMap, assignmentRows] = await Promise.all([
    budgetSummaryByProject(projects),
    loggedSummaryByProject(projects),
    ProjectAssignment.find({
      projectId: { $in: projectObjectIds },
      status: 'assigned',
      isDeleted: false,
    }).populate('userId').lean(),
  ]);
  const assignmentMap = assignmentRows.reduce((map, row) => {
    const key = String(row.projectId);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
    return map;
  }, new Map());
  return {
    data: projects.map((project) => serializeProject(project, {
      ...(budgetMap.get(String(project.legacyId)) || {}),
      ...(loggedMap.get(String(project.legacyId)) || {}),
      assignedUsers: assignmentMap.get(String(project._id)) || [],
    })),
    total: count,
    page: safePage,
  };
}

async function getProjectById(legacyId) {
  const project = await CoreProject.findOne({ legacyId: Number(legacyId), isDeleted: false })
    .populate('clientId')
    .lean();
  if (!project) return null;

  const [assignedUsers, attachments, budgetMap, loggedMap] = await Promise.all([
    ProjectAssignment.find({ projectId: project._id, status: 'assigned', isDeleted: false })
      .populate('userId')
      .lean(),
    CoreAttachment.find({ linkId: String(legacyId), isDeleted: false }).lean(),
    budgetSummaryByProject([project]),
    loggedSummaryByProject([project]),
  ]);

  return serializeProject(project, {
    ...(budgetMap.get(String(legacyId)) || {}),
    ...(loggedMap.get(String(legacyId)) || {}),
    assignedUsers,
    attachments,
  });
}

async function createProject(body = {}) {
  await connectMongo();
  const payload = projectPayloadFromBody(body);
  const normalizedTitle = String(payload.title || '').trim();
  const duplicate = await CoreProject.findOne({
    isDeleted: false,
    legacyClientId: payload.legacyClientId,
    title: new RegExp(`^${escapeRegex(normalizedTitle)}$`, 'i'),
  }).lean();
  if (duplicate) throw serviceError('A project with this title already exists for this client', 409);

  const legacyId = await nextLegacyId(CoreProject);
  const client = payload.legacyClientId ? await CoreClient.findOne({ legacyId: payload.legacyClientId }).lean() : null;
  if (payload.legacyClientId && !client) throw serviceError('Client not found', 404);
  payload.clientId = client?._id || null;
  payload.clientSnapshot = snapshotClient(client);
  payload.legacyId = legacyId;
  payload.legacyCreatedAt = new Date();
  payload.legacyUpdatedAt = new Date();
  payload.migratedAt = new Date();
  const doc = await CoreProject.create(payload);
  return serializeProject(doc.toObject());
}

async function updateProject(legacyId, body = {}) {
  await connectMongo();
  const existing = await CoreProject.findOne({ legacyId: Number(legacyId) }).lean();
  if (!existing) return null;
  const payload = projectPayloadFromBody(body, existing);
  const client = payload.legacyClientId ? await CoreClient.findOne({ legacyId: payload.legacyClientId }).lean() : null;
  if (payload.legacyClientId && !client) throw serviceError('Client not found', 404);
  payload.clientId = client?._id || null;
  payload.clientSnapshot = snapshotClient(client);
  payload.legacyUpdatedAt = new Date();
  const doc = await CoreProject.findOneAndUpdate({ legacyId: Number(legacyId) }, { $set: payload }, { new: true, runValidators: true }).lean();
  return serializeProject(doc);
}

async function updateProjectField(legacyId, field, value) {
  const camelMap = {
    client_id: 'legacyClientId',
    is_retain: 'isRetain',
    project_type: 'projectType',
    retainer_hours_per_month: 'retainerHoursPerMonth',
    retainer_renewal_day: 'retainerRenewalDay',
    auto_create_monthly_budget: 'autoCreateMonthlyBudget',
    allow_budget_exceed: 'allowBudgetExceed',
    budget_amount: 'budgetAmount',
    estimated_hours: 'estimatedHours',
    extra_hours: 'extraHours',
    assign_users: 'assignUsers',
    next_steps: 'nextSteps',
    next_step_title: 'nextStepTitle',
    is_active: 'isActive',
    is_deleted: 'isDeleted',
  };
  const mongoField = camelMap[field] || field;
  const payload = { [mongoField]: value, legacyUpdatedAt: new Date() };
  if (mongoField === 'legacyClientId') {
    payload.legacyClientId = numberOrNull(value);
    const client = payload.legacyClientId ? await CoreClient.findOne({ legacyId: payload.legacyClientId }).lean() : null;
    if (payload.legacyClientId && !client) throw serviceError('Client not found', 404);
    payload.clientId = client?._id || null;
    payload.clientSnapshot = snapshotClient(client);
  }
  const doc = await CoreProject.findOneAndUpdate({ legacyId: Number(legacyId), isDeleted: false }, { $set: payload }, { new: true, runValidators: true }).lean();
  return serializeProject(doc);
}

async function createProjectAssignment(body = {}) {
  await connectMongo();
  const legacyId = await nextLegacyId(ProjectAssignment);
  const legacyProjectId = numberOrNull(body.project_id ?? body.projectId);
  const legacyUserId = numberOrNull(body.user_id ?? body.userId);
  const [project, user] = await Promise.all([
    legacyProjectId ? CoreProject.findOne({ legacyId: legacyProjectId }).lean() : null,
    legacyUserId ? CoreUser.findOne({ legacyId: legacyUserId }).lean() : null,
  ]);
  if (!project) throw serviceError('Project not found', 404);
  if (!user) throw serviceError('User not found', 404);
  const payload = {
    legacyId,
    projectId: project?._id || null,
    userId: user?._id || null,
    legacyProjectId,
    legacyUserId,
    userSnapshot: snapshotUser(user),
    assignDate: dateOrNull(body.assign_date) || new Date(),
    unassignDate: null,
    status: body.status || 'assigned',
    isDeleted: false,
    hoursCapMinutes: numberOrNull(body.hours_cap_minutes ?? body.hoursCapMinutes),
    capPeriod: body.cap_period || body.capPeriod || 'none',
    assignedRole: body.assigned_role || body.assignedRole || null,
    assignedAt: dateOrNull(body.assigned_at) || new Date(),
    legacyCreatedAt: new Date(),
    legacyUpdatedAt: new Date(),
    migratedAt: new Date(),
  };
  const doc = await ProjectAssignment.create(payload);
  const populated = await ProjectAssignment.findOne({ legacyId: doc.legacyId }).populate('userId').lean();
  return serializeAssignment(populated || doc.toObject());
}

async function updateAssignmentsForProject(legacyProjectId, update) {
  await connectMongo();
  const project = await CoreProject.findOne({ legacyId: Number(legacyProjectId) }, { _id: 1 }).lean();
  if (!project) return;
  const payload = { legacyUpdatedAt: new Date() };
  if (update.status !== undefined) payload.status = update.status;
  if (update.is_deleted !== undefined) payload.isDeleted = bool(update.is_deleted);
  if (update.unassign_date !== undefined) payload.unassignDate = dateOrNull(update.unassign_date) || new Date();
  await ProjectAssignment.updateMany({ projectId: project._id }, { $set: payload });
}

async function getUserAssignedProjects(legacyUserId, { page = 1, limit = 10 } = {}) {
  const safeLimit = Math.max(1, Number(limit) || 10);
  const safePage = Math.max(1, Number(page) || 1);
  const user = await CoreUser.findOne({ legacyId: Number(legacyUserId) }, { _id: 1 }).lean();
  if (!user) return { data: [], total: 0, page: safePage };
  const query = { userId: user._id, status: 'assigned', isDeleted: false };
  const [assignments, count] = await Promise.all([
    ProjectAssignment.find(query)
      .populate({ path: 'projectId', populate: { path: 'clientId' } })
      .populate('userId')
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    ProjectAssignment.countDocuments(query),
  ]);
  const assignedProjects = assignments.map((assignment) => assignment.projectId).filter(Boolean);
  const [budgetMap, loggedMap] = await Promise.all([
    budgetSummaryByProject(assignedProjects),
    loggedSummaryByProject(assignedProjects),
  ]);
  return {
    data: assignments.map((assignment) => serializeProject(assignment.projectId, {
      ...(budgetMap.get(String(assignment.projectId?.legacyId)) || {}),
      ...(loggedMap.get(String(assignment.projectId?.legacyId)) || {}),
      assignedUsers: [assignment],
    })).filter(Boolean),
    total: count,
    page: safePage,
  };
}

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  updateProjectField,
  createProjectAssignment,
  updateAssignmentsForProject,
  getUserAssignedProjects,
};

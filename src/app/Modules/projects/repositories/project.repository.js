const {
  CoreUser,
  CoreClient,
  CoreProject,
  ProjectAssignment,
  CoreAttachment,
  ProjectBudget,
  TimeEntry,
} = require('../../../MongoModels');
const mongoose = require('mongoose');

const { connectMongo } = require('../../../../config/mongo');
const {
  serializeUser,
  serializeClient,
  serializeAttachment,
  serializeAssignment,
  serializeProject,
  isoDate,
} = require('../serializers');

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

async function userTimeByProject(userId, projects) {
  const projectRows = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (!projectRows.length) return new Map();

  const objectIds = projectRows
    .map((project) => String(project._id || ''))
    .filter(Boolean)
    .map((value) => new mongoose.Types.ObjectId(value));
  if (!objectIds.length) return new Map();

  const { TimeEntry } = require('../../../MongoModels');
  const rows = await TimeEntry.aggregate([
    { $match: { userId, projectId: { $in: objectIds }, status: { $ne: 'rejected' } } },
    {
      $group: {
        _id: '$projectId',
        totalConsumedMinutes: { $sum: '$durationMinutes' },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), row]));
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
  const [budgetMap, loggedMap, userTimeMap] = await Promise.all([
    budgetSummaryByProject(assignedProjects),
    loggedSummaryByProject(assignedProjects),
    userTimeByProject(user._id, assignedProjects),
  ]);
  return {
    data: assignments.map((assignment) => {
      const projectData = serializeProject(assignment.projectId, {
        ...(budgetMap.get(String(assignment.projectId?.legacyId)) || {}),
        ...(loggedMap.get(String(assignment.projectId?.legacyId)) || {}),
        assignedUsers: [assignment],
      });
      // Override with user-specific pending hours
      const userTime = userTimeMap.get(String(assignment.projectId?._id)) || {};
      const userCapMinutes = Number(assignment.hoursCapMinutes || 0);
      const userConsumedMinutes = Number(userTime.totalConsumedMinutes || 0);
      const userRemainingMinutes = userCapMinutes > 0 ? Math.max(0, userCapMinutes - userConsumedMinutes) : null;
      if (userCapMinutes > 0) {
        projectData.totalAllocatedMinutes = userCapMinutes;
        projectData.totalConsumedMinutes = userConsumedMinutes;
        projectData.totalRemainingMinutes = userRemainingMinutes;
      }
      return projectData;
    }).filter(Boolean),
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

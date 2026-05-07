const { CoreProject, CoreUser, ProjectAssignment } = require('../MongoModels');
const projectRepo = require('../Repositories/project.repository');
const { createInitialProjectBudgets } = require('./project-budget.service');

function serviceError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeAssignUsers(assignUsers = []) {
  return assignUsers
    .map((item) => (typeof item === 'object' ? item.user_id || item.userId || item.id : item))
    .filter(Boolean);
}

function actorIdFromContext(req = {}, fallback = 1) {
  return req.user?._id || req.auth?.user?._id || req.user?.id || req.auth?.user?.id || fallback;
}

async function saveProject(body = {}, req = {}) {
  const { assign_users = [], assign_user_options = {}, next_steps, ...rest } = body;
  const normalizedAssignUsers = normalizeAssignUsers(assign_users);
  const projectType = rest.project_type || (rest.is_retain ? 'retainer' : 'fixed_hours');
  const isRetainer = projectType === 'retainer' || Boolean(rest.is_retain);
  const monthlyRetainerHours = Number(rest.retainer_hours_per_month || 0);
  const allowBudgetExceed = rest.allow_budget_exceed !== undefined
    ? Boolean(rest.allow_budget_exceed)
    : rest.allow_exceed !== undefined
      ? Boolean(rest.allow_exceed)
      : rest.allowExceed !== undefined
        ? Boolean(rest.allowExceed)
        : true;

  if (!rest.client_id) throw serviceError('Client is required', 400);
  if (!String(rest.title || '').trim()) throw serviceError('Project title is required', 400);
  if (!projectType) throw serviceError('Project type is required', 400);
  if ((projectType === 'retainer' || projectType === 'hybrid') && isRetainer && (!monthlyRetainerHours || monthlyRetainerHours < 1)) {
    if (projectType !== 'hybrid' || !Number(rest.hours)) {
      throw serviceError('Monthly hours per month are required for retainer projects', 400);
    }
  }
  const renewalDay = Number(rest.retainer_renewal_day || 0);
  if ((projectType === 'retainer' || projectType === 'hybrid') && renewalDay && (renewalDay < 1 || renewalDay > 28)) {
    throw serviceError('Renewal day must be between 1 and 28', 400);
  }
  if (projectType === 'fixed_hours' && rest.hours !== undefined && Number(rest.hours) < 1) {
    throw serviceError('Fixed project hours must be greater than 0', 400);
  }
  if (projectType === 'fixed_budget' && rest.budget_amount !== undefined && Number(rest.budget_amount) < 1) {
    throw serviceError('Budget amount must be positive for fixed-budget projects', 400);
  }

  const project = await projectRepo.createProject({
    ...rest,
    is_retain: isRetainer,
    project_type: projectType,
    allow_budget_exceed: allowBudgetExceed,
    assign_users: normalizedAssignUsers,
    next_steps,
  });

  for (const userId of normalizedAssignUsers) {
    const options = assign_user_options[String(userId)] || {};
    await projectRepo.createProjectAssignment({
      project_id: project.id,
      user_id: userId,
      hours_cap_minutes: options.hoursCapMinutes || options.hours_cap_minutes || null,
      cap_period: options.capPeriod || options.cap_period || 'none',
      assigned_role: options.assignedRole || options.assigned_role || null,
    });
  }

  await createInitialProjectBudgets(
    actorIdFromContext(req, rest.created_by || rest.createdBy || 1),
    project.id,
    projectType,
    {
      hours: rest.hours,
      retainer_hours_per_month: rest.retainer_hours_per_month,
      estimated_hours: rest.estimated_hours,
      extra_hours: rest.extra_hours,
    },
    { allowExceed: allowBudgetExceed }
  );

  return project;
}

async function listProjects(query = {}) {
  return projectRepo.getAllProjects(query);
}

async function getProjectById(projectId) {
  return projectRepo.getProjectById(projectId);
}

async function deleteProject(projectId) {
  const project = await projectRepo.updateProject(projectId, { is_deleted: true, is_active: false });
  if (!project) throw serviceError('Project not found', 404);
  await projectRepo.updateAssignmentsForProject(projectId, { status: 'unassigned', is_deleted: true, unassign_date: new Date() });
  return project;
}

async function updateProjectField(projectId, field, value) {
  const project = await projectRepo.updateProjectField(projectId, field, value);
  if (!project) throw serviceError('Project not found', 404);
  return project;
}

async function getUserAssignedProjects(userId, query = {}) {
  return projectRepo.getUserAssignedProjects(userId, query);
}

async function getUserProjectDetail(projectId) {
  return projectRepo.getProjectById(projectId);
}

function serializeAssignment(assignment) {
  if (!assignment) return null;
  return {
    id: assignment.legacyId,
    project_id: assignment.legacyProjectId,
    user_id: assignment.legacyUserId,
    assign_date: assignment.assignDate,
    unassign_date: assignment.unassignDate,
    status: assignment.status,
    is_deleted: assignment.isDeleted,
    hours_cap_minutes: assignment.hoursCapMinutes,
    cap_period: assignment.capPeriod,
    assigned_role: assignment.assignedRole,
    assigned_at: assignment.assignedAt,
    user: assignment.userId ? {
      id: assignment.userId.legacyId,
      first_name: assignment.userId.firstName,
      last_name: assignment.userId.lastName,
      email: assignment.userId.email,
    } : undefined,
  };
}

async function fetchAssignment(projectId, userId) {
  const [project, user] = await Promise.all([
    CoreProject.findOne({ legacyId: Number(projectId) }, { _id: 1 }).lean(),
    CoreUser.findOne({ legacyId: Number(userId) }, { _id: 1 }).lean(),
  ]);
  if (!project || !user) return null;
  return ProjectAssignment.findOne({
    projectId: project._id,
    userId: user._id,
  }).populate('userId').lean();
}

async function assignOrReassignUser(body = {}) {
  const { projectId, userId, hoursCapMinutes, hours_cap_minutes, capPeriod, cap_period, assignedRole, assigned_role } = body;
  const [project, user] = await Promise.all([
    CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false }).lean(),
    CoreUser.findOne({ legacyId: Number(userId), isDeleted: false }).lean(),
  ]);
  if (!project) throw serviceError('Project not found', 404);
  if (!user) throw serviceError('User not found', 404);

  let projectUser = await ProjectAssignment.findOne({ projectId: project._id, userId: user._id }).populate('userId');
  const payload = {
    legacyProjectId: Number(projectId),
    legacyUserId: Number(userId),
    projectId: project._id,
    userId: user._id,
    userSnapshot: { firstName: user.firstName, lastName: user.lastName, email: user.email },
    status: 'assigned',
    isDeleted: false,
    assignDate: new Date(),
    unassignDate: null,
    assignedAt: projectUser?.assignedAt || new Date(),
    hoursCapMinutes: hoursCapMinutes ?? hours_cap_minutes ?? null,
    capPeriod: capPeriod || cap_period || 'none',
    assignedRole: assignedRole || assigned_role || null,
    legacyUpdatedAt: new Date(),
  };

  if (projectUser) {
    Object.assign(projectUser, payload);
    await projectUser.save();
    const refreshed = await fetchAssignment(projectId, userId);
    return serializeAssignment(refreshed || projectUser);
  }

  projectUser = await projectRepo.createProjectAssignment({
    project_id: projectId,
    user_id: userId,
    hours_cap_minutes: payload.hoursCapMinutes,
    cap_period: payload.capPeriod,
    assigned_role: payload.assignedRole,
  });
  return projectUser;
}

async function unassignUser(body = {}) {
  const { projectId, userId } = body;
  const [project, user] = await Promise.all([
    CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false }, { _id: 1 }).lean(),
    CoreUser.findOne({ legacyId: Number(userId), isDeleted: false }, { _id: 1 }).lean(),
  ]);
  if (!project || !user) throw serviceError('Assignment not found.', 404);
  const projectUser = await ProjectAssignment.findOne({ projectId: project._id, userId: user._id, status: 'assigned', isDeleted: false }).populate('userId');
  if (!projectUser) throw serviceError('User is not assigned to this project.', 404);
  projectUser.status = 'unassigned';
  projectUser.unassignDate = new Date();
  projectUser.isDeleted = true;
  projectUser.legacyUpdatedAt = new Date();
  await projectUser.save();
  const refreshed = await fetchAssignment(projectId, userId);
  return serializeAssignment(refreshed || projectUser);
}

module.exports = {
  saveProject,
  listProjects,
  getProjectById,
  deleteProject,
  updateProjectField,
  getUserAssignedProjects,
  getUserProjectDetail,
  assignOrReassignUser,
  unassignUser,
};

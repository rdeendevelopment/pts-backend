const {
  CoreUser,
  CoreClient,
  CoreProject,
  ProjectBudget,
  ProjectBudgetRequest,
  ActivityCategory,
  TimeWeek,
  TimeEntry,
  ActiveTimer,
  AccountAdmin,
  Role,
  CoreModule,
  Permission,
  RoleModule,
  RolePermission,
  UserRole,
  RefreshToken,
} = require('../MongoModels');

const { connectMongo } = require('../../../config/mongo');
const projectRepo = require('./project.repository');

function enabled() {
  return true;
}

function dualWriteEnabled() {
  return false;
}

async function ensureMongoForWrite() {
  await connectMongo();
  return true;
}

function plain(row) {
  if (!row) return null;
  return typeof row.toJSON === 'function' ? row.toJSON() : row;
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

async function nextLegacyId(Model) {
  const row = await Model.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

function legacyDates(row) {
  return {
    legacyCreatedAt: dateOrNull(row.created_at || row.createdAt),
    legacyUpdatedAt: dateOrNull(row.updated_at || row.updatedAt),
    legacyDeletedAt: dateOrNull(row.deleted_at || row.deletedAt),
    migratedAt: new Date(),
  };
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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

function clientName(client) {
  if (!client) return '';
  return client.companyName || [client.firstName, client.lastName].filter(Boolean).join(' ');
}

function serializeUser(user) {
  if (!user) return null;
  return {
    _id: user._id,          // MongoDB ObjectId — used for FK queries in services
    id: id(user.legacyId),
    role: user.roleId?.name ?? user.role ?? null,
    roleId: user.roleId?._id ?? user.roleId ?? null,
    first_name: user.firstName,
    last_name: user.lastName,
    user_name: user.userName,
    email: user.email,
    contact: user.contact,
    password: user.password,
    image_url: user.imageUrl || '',
    must_change_password: Boolean(user.mustChangePassword),
    is_active: Boolean(user.isActive),
    is_deleted: Boolean(user.isDeleted),
    is_verified: Boolean(user.isVerified),
    last_login: isoDate(user.lastLogin),
    created_at: isoDate(user.legacyCreatedAt || user.createdAt),
    updated_at: isoDate(user.legacyUpdatedAt || user.updatedAt),
    deleted_at: isoDate(user.legacyDeletedAt),
  };
}

function serializeAdmin(admin) {
  if (!admin) return null;
  return {
    _id: admin._id,         // MongoDB ObjectId — used for FK queries in services
    id: id(admin.legacyId),
    type: admin.type,
    name: admin.name,
    email: admin.email,
    password: admin.password,
    image_url: admin.imageUrl,
    forgot_password_code: admin.forgotPasswordCode,
    is_deleted: Boolean(admin.isDeleted),
    is_active: Boolean(admin.isActive),
    is_verified: Boolean(admin.isVerified),
    last_login: isoDate(admin.lastLogin),
    created_at: isoDate(admin.legacyCreatedAt || admin.createdAt),
    updated_at: isoDate(admin.legacyUpdatedAt || admin.updatedAt),
    save: async function save() {
      const updates = {
        name: this.name,
        email: this.email,
        password: this.password,
        imageUrl: this.image_url,
        forgotPasswordCode: this.forgot_password_code,
        isDeleted: bool(this.is_deleted),
        isActive: bool(this.is_active),
        isVerified: this.is_verified === undefined ? true : bool(this.is_verified),
        lastLogin: dateOrNull(this.last_login),
        legacyUpdatedAt: new Date(),
      };
      await AccountAdmin.updateOne({ legacyId: Number(this.id) }, { $set: updates });
      return this;
    },
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

async function resolveRoleId(roleRef) {
  if (!roleRef) return null;
  const str = String(roleRef).trim();
  console.log('[resolveRoleId] looking up role:', str);
  // ObjectId (24-char hex)
  if (/^[a-f\d]{24}$/i.test(str)) return roleRef;
  // Numeric legacyId
  if (/^\d+$/.test(str)) {
    const role = await Role.findOne({ legacyId: Number(str) }).lean();
    return role?._id || null;
  }
  // Case-insensitive role name (normalise hyphens/underscores before matching)
  const normalised = str.replace(/[-_]/g, '[_-]?');
  const role = await Role.findOne({ name: new RegExp(`^${normalised}$`, 'i') }).lean();
  console.log('[resolveRoleId] found role doc:', role ? role.name : 'NOT FOUND');
  return role?._id || null;
}

function userPayloadFromBody(body = {}, existing = {}) {
  return {
    role: body.role ?? existing.role ?? 'employee',
    firstName: body.first_name ?? body.firstName ?? existing.firstName ?? '',
    lastName: body.last_name ?? body.lastName ?? existing.lastName ?? '',
    userName: body.user_name ?? body.userName ?? existing.userName ?? '',
    email: body.email ?? existing.email ?? '',
    contact: body.contact ?? existing.contact ?? '',
    password: body.password ?? existing.password ?? '',
    imageUrl: body.image_url ?? body.imageUrl ?? existing.imageUrl ?? '',
    mustChangePassword:
      body.must_change_password !== undefined
        ? bool(body.must_change_password)
        : body.mustChangePassword !== undefined
          ? bool(body.mustChangePassword)
          : (existing.mustChangePassword ?? false),
    isActive: body.is_active !== undefined ? bool(body.is_active) : body.isActive !== undefined ? bool(body.isActive) : (existing.isActive ?? true),
    isDeleted: body.is_deleted !== undefined ? bool(body.is_deleted) : body.isDeleted !== undefined ? bool(body.isDeleted) : (existing.isDeleted ?? false),
    isVerified: body.is_verified !== undefined ? bool(body.is_verified) : body.isVerified !== undefined ? bool(body.isVerified) : (existing.isVerified ?? true),
    lastLogin: body.last_login !== undefined ? dateOrNull(body.last_login) : body.lastLogin !== undefined ? dateOrNull(body.lastLogin) : (existing.lastLogin ?? null),
  };
}

function clientPayloadFromBody(body = {}, existing = {}) {
  return {
    role: body.role ?? existing.role ?? 'client',
    firstName: body.first_name ?? body.firstName ?? existing.firstName ?? '',
    lastName: body.last_name ?? body.lastName ?? existing.lastName ?? '',
    companyName: body.company_name ?? body.companyName ?? existing.companyName ?? '',
    type: body.type ?? existing.type ?? '',
    email: body.email ?? existing.email ?? '',
    contact: body.contact ?? existing.contact ?? '',
    isActive: body.is_active !== undefined ? bool(body.is_active) : body.isActive !== undefined ? bool(body.isActive) : (existing.isActive ?? true),
    isDeleted: body.is_deleted !== undefined ? bool(body.is_deleted) : body.isDeleted !== undefined ? bool(body.isDeleted) : (existing.isDeleted ?? false),
  };
}

async function getAllUsers() {
  await connectMongo();
  const users = await CoreUser.find({ isDeleted: false }).populate('roleId', 'name').sort({ legacyId: 1 }).lean();
  return users.map(serializeUser);
}

async function getUserById(legacyId) {
  await connectMongo();
  const user = await CoreUser.findOne({ legacyId: Number(legacyId) }).populate('roleId', 'name').lean();
  return serializeUser(user);
}

async function findUserByEmailOrUsername(identifier, excludeLegacyId = null) {
  await connectMongo();
  const value = String(identifier || '').trim();
  if (!value) return null;
  const query = {
    isDeleted: false,
    $or: [{ email: value.toLowerCase() }, { userName: value }],
  };
  if (excludeLegacyId !== null && excludeLegacyId !== undefined && excludeLegacyId !== '') {
    query.legacyId = { $ne: Number(excludeLegacyId) };
  }
  const user = await CoreUser.findOne(query).populate('roleId', 'name').lean();
  return serializeUser(user);
}

async function createUser(body) {
  await connectMongo();
  const legacyId = await nextLegacyId(CoreUser);
  const roleId = await resolveRoleId(body.role ?? body.roleId);
  console.log('[createUser] role from body:', body.role, '| resolved roleId:', roleId);
  const payload = {
    legacyId,
    ...userPayloadFromBody(body),
    mustChangePassword: body.must_change_password !== undefined || body.mustChangePassword !== undefined
      ? bool(body.must_change_password ?? body.mustChangePassword)
      : true,
    ...(roleId ? { roleId } : {}),
    ...legacyDates(body),
  };
  const doc = await CoreUser.create(payload);
  const populated = await CoreUser.findById(doc._id).populate('roleId', 'name').lean();
  return serializeUser(populated);
}

async function updateUser(legacyId, body) {
  await connectMongo();
  const current = await CoreUser.findOne({ legacyId: Number(legacyId) });
  if (!current) return null;
  const roleId = (body.role !== undefined || body.roleId !== undefined)
    ? await resolveRoleId(body.role ?? body.roleId)
    : undefined;
  const updates = {
    ...userPayloadFromBody(body, current.toObject()),
    // Only write roleId when a matching Role document was actually found
    ...(roleId != null ? { roleId } : {}),
    legacyUpdatedAt: new Date(),
  };
  await CoreUser.updateOne({ legacyId: Number(legacyId) }, { $set: updates }, { runValidators: true });
  const updated = await CoreUser.findOne({ legacyId: Number(legacyId) }).populate('roleId', 'name').lean();
  return serializeUser(updated);
}

async function getAllClients() {
  await connectMongo();
  const clients = await CoreClient.find({ isDeleted: false }).sort({ legacyId: 1 }).lean();
  return clients.map(serializeClient);
}

async function getClientById(legacyId) {
  await connectMongo();
  const client = await CoreClient.findOne({ legacyId: Number(legacyId) }).lean();
  return serializeClient(client);
}

async function findClientByEmail(identifier, excludeLegacyId = null) {
  await connectMongo();
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return null;
  const query = { isDeleted: false, email: value };
  if (excludeLegacyId !== null && excludeLegacyId !== undefined && excludeLegacyId !== '') {
    query.legacyId = { $ne: Number(excludeLegacyId) };
  }
  const client = await CoreClient.findOne(query).lean();
  return serializeClient(client);
}

async function createClient(body) {
  await connectMongo();
  const legacyId = await nextLegacyId(CoreClient);
  const payload = {
    legacyId,
    ...clientPayloadFromBody(body),
    ...legacyDates(body),
  };
  const doc = await CoreClient.create(payload);
  return serializeClient(doc.toObject());
}

async function updateClient(legacyId, body) {
  await connectMongo();
  const current = await CoreClient.findOne({ legacyId: Number(legacyId) });
  if (!current) return null;
  const updates = {
    ...clientPayloadFromBody(body, current.toObject()),
    legacyUpdatedAt: new Date(),
  };
  await CoreClient.updateOne({ legacyId: Number(legacyId) }, { $set: updates }, { runValidators: true });
  const updated = await CoreClient.findOne({ legacyId: Number(legacyId) }).lean();
  return serializeClient(updated);
}

async function createAdmin(body) {
  await connectMongo();
  const legacyId = await nextLegacyId(AccountAdmin);
  const payload = {
    legacyId,
    type: body.type || 'super-admin',
    name: body.name || '',
    email: body.email || '',
    password: body.password || '',
    imageUrl: body.image_url || body.imageUrl || '',
    isActive: body.is_active === undefined ? true : bool(body.is_active),
    isDeleted: false,
    isVerified: true,
    legacyCreatedAt: new Date(),
    legacyUpdatedAt: new Date(),
    migratedAt: new Date(),
  };
  const doc = await AccountAdmin.create(payload);
  return serializeAdmin(doc.toObject());
}

async function getAdminById(legacyId) {
  await connectMongo();
  const admin = await AccountAdmin.findOne({ legacyId: Number(legacyId) }).lean();
  return serializeAdmin(admin);
}

async function updateAdmin(legacyId, body = {}) {
  await connectMongo();
  const current = await AccountAdmin.findOne({ legacyId: Number(legacyId) });
  if (!current) return null;
  const updates = {
    name: body.name ?? current.name ?? '',
    email: body.email ?? current.email ?? '',
    password: body.password ?? current.password ?? '',
    imageUrl: body.image_url ?? body.imageUrl ?? current.imageUrl ?? '',
    isActive: body.is_active !== undefined ? bool(body.is_active) : current.isActive,
    isDeleted: body.is_deleted !== undefined ? bool(body.is_deleted) : current.isDeleted,
    isVerified: body.is_verified !== undefined ? bool(body.is_verified) : current.isVerified,
    lastLogin: body.last_login !== undefined ? dateOrNull(body.last_login) : current.lastLogin,
    legacyUpdatedAt: new Date(),
  };
  await AccountAdmin.updateOne({ legacyId: Number(legacyId) }, { $set: updates }, { runValidators: true });
  const updated = await AccountAdmin.findOne({ legacyId: Number(legacyId) }).lean();
  return serializeAdmin(updated);
}

async function findLoginAccount(identifier) {
  await connectMongo();
  const value = String(identifier || '').trim();
  const admin = await AccountAdmin.findOne({ email: value.toLowerCase(), isDeleted: false }).lean();
  if (admin) return { accountType: 'admin', account: serializeAdmin(admin) };
  const user = await CoreUser.findOne({
    isDeleted: false,
    $or: [{ email: value.toLowerCase() }, { userName: value }],
  }).populate('roleId', 'name').lean();
  return user ? { accountType: 'user', account: serializeUser(user) } : null;
}

async function findAccountFromToken(accountType, legacyId) {
  await connectMongo();
  if (accountType === 'admin') {
    const admin = await AccountAdmin.findOne({ legacyId: Number(legacyId), isDeleted: false, isActive: true }).lean();
    return admin ? { accountType: 'admin', account: serializeAdmin(admin) } : null;
  }
  const user = await CoreUser.findOne({ legacyId: Number(legacyId), isDeleted: false, isActive: true }).populate('roleId', 'name').lean();
  return user ? { accountType: 'user', account: serializeUser(user) } : null;
}

async function upsertUserFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const user = plain(row);
  if (!user?.id) return null;
  const payload = {
    legacyId: Number(user.id),
    role: user.role || 'user',
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    userName: user.user_name || '',
    email: user.email || '',
    contact: user.contact || '',
    password: user.password || '',
    imageUrl: user.image_url || user.imageUrl || '',
    mustChangePassword: user.must_change_password !== undefined ? bool(user.must_change_password) : bool(user.mustChangePassword),
    isActive: bool(user.is_active),
    isDeleted: bool(user.is_deleted),
    isVerified: user.is_verified === undefined ? true : bool(user.is_verified),
    lastLogin: dateOrNull(user.last_login),
    ...legacyDates(user),
  };
  await CoreUser.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return CoreUser.findOne({ legacyId: payload.legacyId }).lean();
}

async function upsertClientFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const client = plain(row);
  if (!client?.id) return null;
  const payload = {
    legacyId: Number(client.id),
    role: client.role || 'client',
    firstName: client.first_name || '',
    lastName: client.last_name || '',
    companyName: client.company_name || '',
    type: client.type || '',
    email: client.email || '',
    contact: client.contact || '',
    isActive: client.is_active === undefined ? true : bool(client.is_active),
    isDeleted: bool(client.is_deleted),
    ...legacyDates(client),
  };
  await CoreClient.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return CoreClient.findOne({ legacyId: payload.legacyId }).lean();
}

async function upsertProjectBudgetFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const budget = plain(row);
  if (!budget?.id) return null;
  const legacyProjectId = numberOrNull(budget.project_id);
  const project = legacyProjectId ? await CoreProject.findOne({ legacyId: legacyProjectId }).lean() : null;
  const payload = {
    legacyId: Number(budget.id),
    projectId: project?._id || null,
    legacyProjectId,
    name: budget.name || '',
    description: budget.description || null,
    budgetType: budget.budget_type || 'fixed',
    billingType: budget.billing_type || 'billable',
    allocatedMinutes: numberOrNull(budget.allocated_minutes),
    consumedMinutes: Number(budget.consumed_minutes || 0),
    startDate: budget.start_date ? String(budget.start_date).slice(0, 10) : null,
    endDate: budget.end_date ? String(budget.end_date).slice(0, 10) : null,
    allowExceed: budget.allow_exceed === undefined ? true : bool(budget.allow_exceed),
    warningThresholdPercent: Number(budget.warning_threshold_percent || 80),
    status: budget.status || 'active',
    createdBy: Number(budget.created_by || 0),
    approvedBy: numberOrNull(budget.approved_by),
    approvedAt: dateOrNull(budget.approved_at),
    ...legacyDates(budget),
  };
  await ProjectBudget.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return ProjectBudget.findOne({ legacyId: payload.legacyId }).lean();
}

async function upsertActivityCategoryFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const category = plain(row);
  if (!category?.id) return null;
  const payload = {
    legacyId: Number(category.id),
    name: category.name || '',
    description: category.description || null,
    isActive: category.is_active === undefined ? true : bool(category.is_active),
    ...legacyDates(category),
  };
  await ActivityCategory.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return ActivityCategory.findOne({ legacyId: payload.legacyId }).lean();
}

async function upsertProjectBudgetRequestFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const request = plain(row);
  if (!request?.id) return null;
  const legacyProjectId = numberOrNull(request.project_id);
  const legacyBudgetId = numberOrNull(request.budget_id);
  const [project, budget] = await Promise.all([
    legacyProjectId ? CoreProject.findOne({ legacyId: legacyProjectId }).lean() : null,
    legacyBudgetId ? ProjectBudget.findOne({ legacyId: legacyBudgetId }).lean() : null,
  ]);
  const payload = {
    legacyId: Number(request.id),
    projectId: project?._id || null,
    budgetId: budget?._id || null,
    legacyProjectId,
    legacyBudgetId,
    requestedBy: Number(request.requested_by || 0),
    requestType: request.request_type || 'additional_hours',
    title: request.title || '',
    description: request.description || null,
    requestedMinutes: Number(request.requested_minutes || 0),
    status: request.status || 'pending',
    reviewedBy: numberOrNull(request.reviewed_by),
    reviewedAt: dateOrNull(request.reviewed_at),
    ...legacyDates(request),
  };
  await ProjectBudgetRequest.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return ProjectBudgetRequest.findOne({ legacyId: payload.legacyId }).lean();
}

async function upsertTimeWeekFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const week = plain(row);
  if (!week?.id) return null;
  const legacyUserId = numberOrNull(week.user_id);
  const user = legacyUserId ? await CoreUser.findOne({ legacyId: legacyUserId }).lean() : null;
  const payload = {
    legacyId: Number(week.id),
    userId: user?._id || null,
    legacyUserId,
    weekStartDate: dateOnly(week.week_start_date),
    weekEndDate: dateOnly(week.week_end_date),
    totalMinutes: Number(week.total_minutes || 0),
    status: week.status || 'draft',
    submittedAt: dateOrNull(week.submitted_at),
    approvedBy: numberOrNull(week.approved_by),
    approvedAt: dateOrNull(week.approved_at),
    rejectionReason: week.rejection_reason || null,
    ...legacyDates(week),
  };
  await TimeWeek.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return TimeWeek.findOne({ legacyId: payload.legacyId }).lean();
}

async function upsertTimeEntryFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const entry = plain(row);
  if (!entry?.id) return null;
  const legacyUserId = numberOrNull(entry.user_id);
  const legacyProjectId = numberOrNull(entry.project_id);
  const legacyWeekId = numberOrNull(entry.week_id);
  const legacyBudgetId = numberOrNull(entry.budget_id);
  const legacyActivityCategoryId = numberOrNull(entry.activity_category_id);
  const [user, project, week, budget, activityCategory] = await Promise.all([
    legacyUserId ? CoreUser.findOne({ legacyId: legacyUserId }).lean() : null,
    legacyProjectId ? CoreProject.findOne({ legacyId: legacyProjectId }).lean() : null,
    legacyWeekId ? TimeWeek.findOne({ legacyId: legacyWeekId }).lean() : null,
    legacyBudgetId ? ProjectBudget.findOne({ legacyId: legacyBudgetId }).lean() : null,
    legacyActivityCategoryId ? ActivityCategory.findOne({ legacyId: legacyActivityCategoryId }).lean() : null,
  ]);
  const payload = {
    legacyId: Number(entry.id),
    userId: user?._id || null,
    projectId: project?._id || null,
    weekId: week?._id || null,
    budgetId: budget?._id || null,
    legacyUserId,
    legacyProjectId,
    legacyWeekId,
    legacyBudgetId,
    taskId: entry.task_id || null,
    activityCategoryId: activityCategory?._id || null,
    legacyActivityCategoryId,
    entryDate: dateOnly(entry.entry_date),
    startTime: dateOrNull(entry.start_time),
    endTime: dateOrNull(entry.end_time),
    durationMinutes: Number(entry.duration_minutes || 0),
    description: entry.description || null,
    entryType: entry.entry_type || 'manual',
    status: entry.status || 'draft',
    isBillable: entry.is_billable === undefined ? true : bool(entry.is_billable),
    ...legacyDates(entry),
  };
  await TimeEntry.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return TimeEntry.findOne({ legacyId: payload.legacyId }).lean();
}

async function deleteTimeEntryByLegacyId(legacyId) {
  if (!(await ensureMongoForWrite())) return;
  await TimeEntry.deleteOne({ legacyId: Number(legacyId) });
}

async function upsertActiveTimerFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const timer = plain(row);
  if (!timer?.id) return null;
  const legacyUserId = numberOrNull(timer.user_id);
  const legacyProjectId = numberOrNull(timer.project_id);
  const legacyBudgetId = numberOrNull(timer.budget_id);
  const legacyActivityCategoryId = numberOrNull(timer.activity_category_id);
  const [user, project, budget, activityCategory] = await Promise.all([
    legacyUserId ? CoreUser.findOne({ legacyId: legacyUserId }).lean() : null,
    legacyProjectId ? CoreProject.findOne({ legacyId: legacyProjectId }).lean() : null,
    legacyBudgetId ? ProjectBudget.findOne({ legacyId: legacyBudgetId }).lean() : null,
    legacyActivityCategoryId ? ActivityCategory.findOne({ legacyId: legacyActivityCategoryId }).lean() : null,
  ]);
  const payload = {
    legacyId: Number(timer.id),
    userId: user?._id || null,
    projectId: project?._id || null,
    budgetId: budget?._id || null,
    legacyUserId,
    legacyProjectId,
    legacyBudgetId,
    taskId: timer.task_id || null,
    activityCategoryId: activityCategory?._id || null,
    legacyActivityCategoryId,
    startTime: dateOrNull(timer.start_time),
    isRunning: timer.is_running === undefined ? true : bool(timer.is_running),
    isBillable: timer.is_billable === undefined ? true : bool(timer.is_billable),
    ...legacyDates(timer),
  };
  await ActiveTimer.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return ActiveTimer.findOne({ legacyId: payload.legacyId }).lean();
}

async function getMongoRolesForAccount(accountType, account) {
  if (!enabled()) return null;
  // roleId is now embedded directly on the user/admin document
  const Model = accountType === 'admin' ? AccountAdmin : CoreUser;
  const doc = await Model.findOne({ legacyId: Number(account?.id) }, { roleId: 1 }).populate('roleId', 'name').lean();
  const roleName = doc?.roleId?.name;
  return roleName ? [roleName] : null;
}

async function getMongoModulesForRoles(roleNames) {
  if (!enabled() || !roleNames?.length) return null;
  // moduleIds are embedded in Role — populate and return keyNames
  const roles = await Role.find({ name: { $in: roleNames } }).populate('moduleIds', 'keyName isActive').lean();
  if (!roles.length) return [];
  const keys = new Set();
  for (const role of roles) {
    for (const mod of (role.moduleIds || [])) {
      if (mod?.isActive !== false && mod?.keyName) keys.add(mod.keyName);
    }
  }
  return Array.from(keys);
}

async function getMongoPermissionsForRoles(roleNames) {
  if (!enabled() || !roleNames?.length) return null;
  // permissionIds are embedded in Role — populate and return keyNames
  const roles = await Role.find({ name: { $in: roleNames } }).populate('permissionIds', 'keyName').lean();
  if (!roles.length) return [];
  const keys = new Set();
  for (const role of roles) {
    for (const perm of (role.permissionIds || [])) {
      if (perm?.keyName) keys.add(perm.keyName);
    }
  }
  return Array.from(keys);
}

async function upsertRefreshTokenFromMysql(row) {
  if (!(await ensureMongoForWrite())) return null;
  const token = plain(row);
  if (!token?.id) return null;
  const userType = token.user_type || 'user';
  const account = userType === 'admin'
    ? await AccountAdmin.findOne({ legacyId: Number(token.user_id) }).lean()
    : await CoreUser.findOne({ legacyId: Number(token.user_id) }).lean();
  const payload = {
    legacyId: Number(token.id),
    accountId: account?._id || null,
    legacyUserId: Number(token.user_id),
    userType,
    tokenHash: token.token_hash,
    expiresAt: dateOrNull(token.expires_at),
    revokedAt: dateOrNull(token.revoked_at),
    ...legacyDates(token),
  };
  await RefreshToken.updateOne({ legacyId: payload.legacyId }, { $set: payload }, { upsert: true, runValidators: true });
  return RefreshToken.findOne({ legacyId: payload.legacyId }).lean();
}

async function createRefreshToken(accountType, account, tokenHashValue, expiresAt) {
  await connectMongo();
  const legacyId = await nextLegacyId(RefreshToken);
  const userType = accountType || 'user';
  // account._id is available from serializeUser/serializeAdmin; fall back to DB lookup
  const ownerId = account._id || (() => {
    const AccountModel = userType === 'admin' ? AccountAdmin : CoreUser;
    return AccountModel.findOne({ legacyId: Number(account.id) }, { _id: 1 }).lean().then((r) => r?._id);
  })();
  const payload = {
    legacyId,
    userId: await Promise.resolve(ownerId) || null,
    userType,
    tokenHash: tokenHashValue,
    expiresAt,
    revokedAt: null,
    migratedAt: new Date(),
  };
  await RefreshToken.create(payload);
  return { id: legacyId, user_id: account.id, user_type: userType, token_hash: tokenHashValue, expires_at: expiresAt };
}

async function findValidRefreshToken(tokenHashValue) {
  if (!enabled()) return null;
  const token = await RefreshToken.findOne({
    tokenHash: tokenHashValue,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!token) return null;
  const AccountModel = token.userType === 'admin' ? AccountAdmin : CoreUser;
  const account = token.userId
    ? await AccountModel.findOne({ _id: token.userId }, { legacyId: 1 }).lean()
    : null;
  const legacyUserId = token.legacyUserId || account?.legacyId;
  if (!legacyUserId) return null;

  return {
    id: token.legacyId,
    user_id: legacyUserId,
    user_type: token.userType,
    token_hash: token.tokenHash,
    expires_at: token.expiresAt,
    revoked_at: token.revokedAt,
  };
}

async function revokeRefreshTokenByLegacyId(legacyId) {
  if (!(await ensureMongoForWrite())) return;
  await RefreshToken.updateOne(
    { legacyId: Number(legacyId) },
    { $set: { revokedAt: new Date(), legacyUpdatedAt: new Date() } }
  );
}

async function revokeRefreshTokenByHash(tokenHashValue) {
  if (!(await ensureMongoForWrite())) return;
  await RefreshToken.updateMany(
    { tokenHash: tokenHashValue },
    { $set: { revokedAt: new Date(), legacyUpdatedAt: new Date() } }
  );
}

async function mirrorSafely(label, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`Mongo dual-write failed for ${label}:`, error.message);
  }
}

module.exports = {
  enabled,
  dualWriteEnabled,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  findUserByEmailOrUsername,
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  findClientByEmail,
  ...projectRepo,
  createAdmin,
  getAdminById,
  updateAdmin,
  findLoginAccount,
  findAccountFromToken,
  getMongoRolesForAccount,
  getMongoModulesForRoles,
  getMongoPermissionsForRoles,
  findValidRefreshToken,
  createRefreshToken,
  mirrorSafely,
  upsertUserFromMysql,
  upsertClientFromMysql,
  upsertProjectBudgetFromMysql,
  upsertProjectBudgetRequestFromMysql,
  upsertActivityCategoryFromMysql,
  upsertTimeWeekFromMysql,
  upsertTimeEntryFromMysql,
  deleteTimeEntryByLegacyId,
  upsertActiveTimerFromMysql,
  upsertRefreshTokenFromMysql,
  revokeRefreshTokenByLegacyId,
  revokeRefreshTokenByHash,
};

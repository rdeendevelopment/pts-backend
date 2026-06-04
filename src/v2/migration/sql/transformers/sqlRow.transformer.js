const { buildNormalizedName, normalizeName } = require('../../helpers/migrationBase.helper');
const {
  mapSqlProjectStatus,
  mapSqlUserStatus,
  mapSqlAdminAccountType,
  mapClientStatus,
  mapClientType,
  mapAssignmentStatus,
  parseLegacyHoursToMinutes,
  slugifyCategoryCode,
} = require('../helpers/sqlEnumMaps.helper');
const { normalizeEmail, resolvePasswordMigration, splitLegacyName } = require('../../transformers/user.transformer');

function coerceBool(value) {
  return value === 1 || value === true || value === '1';
}

function coerceDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function transformSqlUserRow(row) {
  const email = normalizeEmail(row.email);
  const { firstName, lastName } = splitLegacyName(
    null,
    row.first_name,
    row.last_name
  );

  return {
    legacyId: Number(row.id),
    email,
    username: row.user_name ? String(row.user_name).trim().toLowerCase() : null,
    firstName,
    lastName,
    password: row.password || '',
    mustChangePassword: coerceBool(row.password_reset_required),
    status: mapSqlUserStatus({
      isActive: coerceBool(row.is_active),
      isDeleted: coerceBool(row.is_deleted),
      isVerified: coerceBool(row.is_verified),
    }),
    phone: row.contact || null,
    lastLoginAt: coerceDate(row.last_login),
    createdAt: coerceDate(row.created_at),
    updatedAt: coerceDate(row.updated_at),
    deletedAt: coerceDate(row.deleted_at),
    isDeleted: coerceBool(row.is_deleted),
    accountType: 'employee',
  };
}

function transformSqlAdminRow(row) {
  const email = normalizeEmail(row.email);
  const { firstName, lastName } = splitLegacyName(row.name, null, null);
  const accountType = mapSqlAdminAccountType(row.type);

  return {
    legacyId: Number(row.id),
    email,
    username: email && email.includes('@') ? email.split('@')[0] : 'admin',
    firstName,
    lastName,
    password: row.password || '',
    mustChangePassword: false,
    status: mapSqlUserStatus({
      isActive: coerceBool(row.is_active),
      isDeleted: coerceBool(row.is_deleted),
      isVerified: coerceBool(row.is_verified),
    }),
    lastLoginAt: coerceDate(row.last_login),
    createdAt: coerceDate(row.created_at),
    updatedAt: coerceDate(row.updated_at),
    isDeleted: coerceBool(row.is_deleted),
    accountType,
    imageUrl: row.image_url || null,
  };
}

function transformSqlClientRow(row) {
  const company = normalizeName(row.company_name, '');
  const person = `${normalizeName(row.first_name, '')} ${normalizeName(row.last_name, '')}`.trim();
  const name = company || person;

  if (!name) {
    return { error: { code: 'CLIENT_NAME_MISSING', message: 'SQL client row has no usable name.' } };
  }

  return {
    legacyId: Number(row.id),
    payload: {
      name,
      normalizedName: buildNormalizedName(name),
      type: mapClientType(row.type),
      status: mapClientStatus({
        isActive: coerceBool(row.is_active),
        isDeleted: coerceBool(row.is_deleted),
      }),
      email: row.email ? String(row.email).toLowerCase().trim() : null,
      phone: row.contact || null,
      primaryContact: person
        ? {
          name: person,
          email: row.email ? String(row.email).toLowerCase().trim() : null,
          phone: row.contact || null,
        }
        : null,
      isDeleted: coerceBool(row.is_deleted),
      deletedAt: coerceBool(row.is_deleted) ? coerceDate(row.deleted_at) || new Date() : null,
    },
  };
}

function transformSqlProjectRow(row) {
  const name = normalizeName(row.title, '');
  if (!name) {
    return { error: { code: 'PROJECT_NAME_MISSING', message: 'SQL project row has no title.' } };
  }

  const isRetainer = coerceBool(row.is_retain);
  const hoursMinutes = parseLegacyHoursToMinutes(row.hours);
  const descriptionParts = [row.detail, row.notes].filter(Boolean);
  const legacyExtras = [];
  if (row.next_steps) legacyExtras.push(`next_steps: ${row.next_steps}`);
  if (row.next_step_title) legacyExtras.push(`next_step_title: ${row.next_step_title}`);
  if (row.assign_users) legacyExtras.push(`assign_users: ${row.assign_users}`);
  if (legacyExtras.length) {
    descriptionParts.push(`[legacy] ${legacyExtras.join(' | ')}`);
  }

  return {
    legacyId: Number(row.id),
    legacyClientId: row.client_id !== null && row.client_id !== undefined
      ? Number(row.client_id)
      : null,
    payload: {
      name,
      normalizedName: buildNormalizedName(name),
      description: descriptionParts.length ? descriptionParts.join('\n\n') : null,
      type: isRetainer ? 'retainer' : 'fixed_hours',
      status: mapSqlProjectStatus({
        status: row.status,
        isActive: coerceBool(row.is_active),
        isDeleted: coerceBool(row.is_deleted),
      }),
      dueDate: coerceDate(row.deadline),
      allowBudgetExceed: false,
      billingType: 'billable',
      retainerHoursPerMonth: isRetainer && hoursMinutes > 0 ? hoursMinutes / 60 : null,
      isDeleted: coerceBool(row.is_deleted),
      deletedAt: coerceBool(row.is_deleted) ? coerceDate(row.updated_at) || new Date() : null,
    },
    hoursMinutes,
    createdAt: coerceDate(row.created_at),
    updatedAt: coerceDate(row.updated_at),
  };
}

function transformSqlAssignmentRow(row) {
  return {
    legacyId: Number(row.id),
    legacyProjectId: row.project_id !== null && row.project_id !== undefined
      ? Number(row.project_id)
      : null,
    legacyUserId: row.user_id !== null && row.user_id !== undefined
      ? Number(row.user_id)
      : null,
    payload: {
      status: mapAssignmentStatus({
        status: row.status,
        isDeleted: coerceBool(row.is_deleted),
      }),
      assignedAt: coerceDate(row.assign_date) || coerceDate(row.created_at),
      isDeleted: coerceBool(row.is_deleted),
      deletedAt: coerceBool(row.is_deleted) ? coerceDate(row.deleted_at) || new Date() : null,
      allocation: {
        allocatedMinutes: 0,
        capPeriod: 'project',
        allowExceed: false,
        canLogTime: true,
      },
      stats: {
        consumedMinutes: 0,
        remainingMinutes: 0,
      },
      role: 'member',
    },
  };
}

function transformSqlWorkCategoryRow(row, { usedCodes = new Set() } = {}) {
  const name = normalizeName(row.task_name, '');
  if (!name) {
    return { error: { code: 'WORK_CATEGORY_NAME_MISSING', message: 'SQL default task has no name.' } };
  }

  let code = slugifyCategoryCode(name);
  let suffix = 1;
  while (usedCodes.has(code)) {
    suffix += 1;
    code = `${slugifyCategoryCode(name)}_${suffix}`;
  }
  usedCodes.add(code);

  return {
    legacyId: Number(row.id),
    payload: {
      name,
      code,
      description: null,
      status: 'active',
      isDefault: false,
      sortOrder: Number(row.id) || 0,
    },
  };
}

module.exports = {
  transformSqlUserRow,
  transformSqlAdminRow,
  transformSqlClientRow,
  transformSqlProjectRow,
  transformSqlAssignmentRow,
  transformSqlWorkCategoryRow,
};

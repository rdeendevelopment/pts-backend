const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { bcryptRounds } = require('../../modules/auth/constants/auth.constants');

const TRANSFORM_VERSION = '1.0.0';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;

const ACCOUNT_TYPE_PRIORITY = {
  employee: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};

function normalizeEmail(email) {
  if (email === null || email === undefined) return null;
  const normalized = String(email).toLowerCase().trim();
  return normalized || null;
}

function isCompatibleBcryptHash(hash) {
  if (!hash || typeof hash !== 'string') return false;
  return BCRYPT_HASH_PATTERN.test(hash);
}

async function resolvePasswordMigration(legacyPassword, { mustChangePassword = false } = {}) {
  if (isCompatibleBcryptHash(legacyPassword)) {
    return {
      passwordHash: legacyPassword,
      passwordMigrated: true,
      passwordResetRequired: Boolean(mustChangePassword),
      forcedReset: false,
    };
  }

  const randomSecret = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomSecret, bcryptRounds);

  return {
    passwordHash,
    passwordMigrated: false,
    passwordResetRequired: true,
    forcedReset: true,
  };
}

function mapLegacyStatus({ isActive = false, isDeleted = false, isVerified = true } = {}) {
  if (isDeleted) return 'inactive';
  if (!isActive) return 'inactive';
  if (isVerified === false) return 'pending';
  return 'active';
}

function mapLegacyRoleName(roleName) {
  const normalized = String(roleName || '').trim().toUpperCase().replace(/-/g, '_');
  if (normalized === 'SUPER_ADMIN' || normalized === 'SUPERADMIN') return 'super_admin';
  if (normalized === 'ADMIN') return 'admin';
  if (normalized === 'MANAGER') return 'manager';
  if (normalized === 'EMPLOYEE' || normalized === 'USER' || normalized === 'STAFF') return 'employee';
  return null;
}

function mapLegacyAccountType({ sourceCollection, roleName, roleString, adminType } = {}) {
  if (sourceCollection === 'account_admins') {
    const fromType = mapLegacyRoleName(adminType) || mapLegacyRoleName(roleName);
    if (fromType === 'employee' && String(adminType || '').includes('admin')) {
      return String(adminType).includes('super') ? 'super_admin' : 'admin';
    }
    return fromType || 'admin';
  }

  const fromRole = mapLegacyRoleName(roleName) || mapLegacyRoleName(roleString);
  return fromRole || 'employee';
}

function mapAccountTypeToRoleKey(accountType) {
  if (accountType === 'super_admin') return 'super_admin';
  if (accountType === 'admin') return 'admin';
  if (accountType === 'manager') return 'manager';
  return 'employee';
}

function pickStrongerAccountType(current, candidate) {
  const currentScore = ACCOUNT_TYPE_PRIORITY[current] || 0;
  const candidateScore = ACCOUNT_TYPE_PRIORITY[candidate] || 0;
  return candidateScore > currentScore ? candidate : current;
}

function splitLegacyName(name, firstName, lastName) {
  if (firstName || lastName) {
    return {
      firstName: String(firstName || '').trim() || 'Unknown',
      lastName: String(lastName || '').trim() || 'User',
    };
  }

  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: 'Unknown', lastName: 'User' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'User' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function buildSourceHash(sourceRow) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      collection: sourceRow.sourceCollection,
      legacyId: sourceRow.legacyId || null,
      objectId: sourceRow.oldObjectId ? String(sourceRow.oldObjectId) : null,
      email: sourceRow.email || null,
      updatedAt: sourceRow.updatedAt || null,
    }))
    .digest('hex');
}

function normalizeLegacySourceRow(doc, sourceCollection, roleNameById = new Map()) {
  const roleName = doc.roleId ? roleNameById.get(String(doc.roleId)) : null;

  return {
    sourceCollection,
    oldObjectId: doc._id,
    legacyId: doc.legacyId ?? null,
    email: doc.email || null,
    password: doc.password || '',
    firstName: doc.firstName || null,
    lastName: doc.lastName || null,
    name: doc.name || null,
    userName: doc.userName || null,
    contact: doc.contact || null,
    imageUrl: doc.imageUrl || null,
    roleString: doc.role || null,
    roleName,
    adminType: doc.type || null,
    mustChangePassword: Boolean(doc.mustChangePassword),
    isActive: Boolean(doc.isActive),
    isDeleted: Boolean(doc.isDeleted),
    isVerified: doc.isVerified !== false,
    lastLogin: doc.lastLogin || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function groupSourceRowsByEmail(sourceRows) {
  const grouped = new Map();

  for (const row of sourceRows) {
    const email = normalizeEmail(row.email);
    if (!email) {
      grouped.set(`__missing__:${row.sourceCollection}:${String(row.oldObjectId)}`, {
        email: null,
        rows: [row],
        missingEmail: true,
      });
      continue;
    }

    if (!grouped.has(email)) {
      grouped.set(email, { email, rows: [], missingEmail: false });
    }
    grouped.get(email).rows.push(row);
  }

  return grouped;
}

function detectDuplicateEmailConflict(rows) {
  const activeRows = rows.filter((row) => !row.isDeleted);
  if (activeRows.length <= 1) return null;

  const accountTypes = new Set(activeRows.map((row) => mapLegacyAccountType(row)));
  const hasSuperAdmin = accountTypes.has('super_admin');
  const hasEmployee = accountTypes.has('employee');

  // Two active principals with super_admin + employee and different legacy IDs is allowed (merge).
  // Flag conflict when two active admins claim different super-admin types.
  const superAdmins = activeRows.filter((row) => mapLegacyAccountType(row) === 'super_admin');
  if (superAdmins.length > 1) {
    const types = new Set(superAdmins.map((row) => String(row.adminType || row.roleName || 'super_admin')));
    if (types.size > 1) {
      return 'Multiple active super-admin source rows with conflicting admin types';
    }
  }

  if (hasSuperAdmin && hasEmployee && activeRows.length > 2) {
    return null;
  }

  return null;
}

function buildMergedAccountPayload(rows) {
  const conflict = detectDuplicateEmailConflict(rows);
  if (conflict) {
    return { error: { code: 'USER_DUPLICATE_EMAIL_CONFLICT', message: conflict } };
  }

  let accountType = 'employee';
  let primary = rows[0];

  for (const row of rows) {
    accountType = pickStrongerAccountType(accountType, mapLegacyAccountType(row));
  }

  primary = rows.find((row) => mapLegacyAccountType(row) === accountType) || rows[0];
  const names = splitLegacyName(primary.name, primary.firstName, primary.lastName);
  const mustChangePassword = rows.some((row) => row.mustChangePassword);
  const status = rows.some((row) => mapLegacyStatus(row) === 'active' && !row.isDeleted)
    ? 'active'
    : mapLegacyStatus(primary);

  return {
    email: normalizeEmail(primary.email),
    firstName: names.firstName,
    lastName: names.lastName,
    accountType,
    status: primary.isDeleted ? 'inactive' : status,
    lastLoginAt: rows.reduce((latest, row) => {
      if (!row.lastLogin) return latest;
      if (!latest || row.lastLogin > latest) return row.lastLogin;
      return latest;
    }, null),
    mustChangePassword,
    primary,
    mergedCount: rows.length,
  };
}

function buildUserProfilePayload(accountId, mergedAccount, primaryRow) {
  const displayName = `${mergedAccount.firstName} ${mergedAccount.lastName}`.trim();

  return {
    accountId,
    firstName: mergedAccount.firstName,
    lastName: mergedAccount.lastName,
    displayName,
    email: mergedAccount.email,
    phone: primaryRow.contact || null,
    avatarUrl: primaryRow.imageUrl || null,
    jobTitle: null,
    department: null,
    employmentType: 'full_time',
    status: mergedAccount.status,
    managerId: null,
    joiningDate: primaryRow.createdAt || null,
    timezone: 'UTC',
  };
}

module.exports = {
  TRANSFORM_VERSION,
  BCRYPT_HASH_PATTERN,
  ACCOUNT_TYPE_PRIORITY,
  normalizeEmail,
  isCompatibleBcryptHash,
  resolvePasswordMigration,
  mapLegacyStatus,
  mapLegacyAccountType,
  mapAccountTypeToRoleKey,
  pickStrongerAccountType,
  splitLegacyName,
  buildSourceHash,
  normalizeLegacySourceRow,
  groupSourceRowsByEmail,
  detectDuplicateEmailConflict,
  buildMergedAccountPayload,
  buildUserProfilePayload,
};

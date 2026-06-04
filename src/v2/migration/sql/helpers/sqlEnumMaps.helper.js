const { mapClientStatus, mapClientType, mapAssignmentStatus } = require('../../helpers/enumMaps.helper');

/**
 * Legacy MySQL project.status → V2 PROJECT_STATUSES.
 * Note: V2 has no "inactive"; legacy inactive maps to on_hold.
 */
function mapSqlProjectStatus({ status, isActive = true, isDeleted = false } = {}) {
  if (isDeleted) return 'archived';
  const normalized = String(status || '').trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'active' || normalized === 'in_progress') return 'active';
  if (normalized === 'inactive') return 'on_hold';
  if (normalized === 'completed' || normalized === 'done') return 'completed';
  if (normalized === 'on_hold' || normalized === 'hold') return 'on_hold';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (!isActive) return 'on_hold';
  return 'active';
}

function mapSqlUserStatus({ isActive = false, isDeleted = false, isVerified = true } = {}) {
  if (isDeleted) return 'inactive';
  if (!isActive) return 'inactive';
  if (isVerified === false) return 'pending';
  return 'active';
}

function mapSqlAdminAccountType(adminType) {
  const normalized = String(adminType || '').trim().toLowerCase().replace(/-/g, '_');
  if (normalized.includes('super')) return 'super_admin';
  return 'admin';
}

function mapSqlRoleKey(accountType) {
  if (accountType === 'super_admin') return 'super_admin';
  if (accountType === 'admin') return 'admin';
  if (accountType === 'manager') return 'manager';
  return 'employee';
}

function parseLegacyHoursToMinutes(hoursValue) {
  const hours = parseFloat(String(hoursValue || '').replace(/,/g, ''));
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 60);
}

function slugifyCategoryCode(name, fallback = 'category') {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

module.exports = {
  mapSqlProjectStatus,
  mapSqlUserStatus,
  mapSqlAdminAccountType,
  mapSqlRoleKey,
  mapClientStatus,
  mapClientType,
  mapAssignmentStatus,
  parseLegacyHoursToMinutes,
  slugifyCategoryCode,
};

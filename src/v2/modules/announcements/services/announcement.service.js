const { Types } = require('mongoose');
const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const {
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_PRIORITIES,
  AUDIENCE_TYPES,
  MAX_TITLE_LENGTH,
  MAX_MESSAGE_LENGTH,
} = require('../constants/announcement.constants');
const { getAnnouncementModel } = require('../models/announcement.model');
const { getAnnouncementReceiptModel } = require('../models/announcementReceipt.model');

function serviceError(message, status = 400) {
  return new AppError(message, { status });
}

function authContext(v2Auth = {}) {
  const roleSource = v2Auth.sessionAccess?.roles || v2Auth.roles || [];
  const roles = roleSource
    .map((role) => (typeof role === 'string' ? role : role?.key))
    .filter(Boolean);
  const accountId = String(v2Auth.accountId || '');
  return {
    roles,
    accountType: v2Auth.account?.accountType,
    user: { _id: accountId, id: accountId },
    tokenPayload: { user: { id: accountId, roles } },
  };
}

function isAdmin(auth = {}) {
  const roles = (auth.roles || []).map((role) => String(role).toLowerCase());
  return auth.accountType === 'admin'
    || auth.accountType === 'super_admin'
    || roles.includes('super_admin')
    || roles.includes('admin');
}

function actorId(auth = {}) {
  const id = auth.user?._id || auth.user?.id;
  return id && Types.ObjectId.isValid(String(id)) ? new Types.ObjectId(String(id)) : null;
}

function actorKey(auth = {}) {
  return String(auth.user?._id || auth.user?.id || '');
}

function actorRoles(auth = {}) {
  return (auth.roles || []).map((role) => String(role).toUpperCase());
}

function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw serviceError(`${fieldName} must be a valid date`);
  return date;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function validatePayload(payload = {}, partial = false) {
  const next = {};
  if (!partial || payload.title !== undefined) {
    const title = String(payload.title || '').trim();
    if (!title) throw serviceError('Title is required');
    if (title.length > MAX_TITLE_LENGTH) throw serviceError(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
    next.title = title;
  }

  if (!partial || payload.message !== undefined) {
    const message = String(payload.message || '').trim();
    if (!message) throw serviceError('Message is required');
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw serviceError(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
    }
    next.message = message;
  }

  if (payload.type !== undefined) {
    if (!ANNOUNCEMENT_TYPES.includes(payload.type)) throw serviceError('Invalid announcement type');
    next.type = payload.type;
  } else if (!partial) next.type = 'info';

  if (payload.priority !== undefined) {
    if (!ANNOUNCEMENT_PRIORITIES.includes(payload.priority)) throw serviceError('Invalid announcement priority');
    next.priority = payload.priority;
  } else if (!partial) next.priority = 'normal';

  ['isActive', 'isPinned', 'isDismissible'].forEach((key) => {
    if (payload[key] !== undefined) next[key] = Boolean(payload[key]);
  });
  if (!partial && next.isActive === undefined) next.isActive = true;
  if (!partial && next.isPinned === undefined) next.isPinned = false;
  if (!partial && next.isDismissible === undefined) next.isDismissible = true;

  if (payload.startAt !== undefined) next.startAt = normalizeDate(payload.startAt, 'startAt');
  if (payload.expiresAt !== undefined) next.expiresAt = normalizeDate(payload.expiresAt, 'expiresAt');
  if (next.startAt && next.expiresAt && next.expiresAt <= next.startAt) {
    throw serviceError('expiresAt must be after startAt');
  }

  if (payload.audienceType !== undefined) {
    if (!AUDIENCE_TYPES.includes(payload.audienceType)) throw serviceError('Invalid audience type');
    next.audienceType = payload.audienceType;
  } else if (!partial) next.audienceType = 'all';

  if (payload.roleIds !== undefined) {
    next.roleIds = normalizeStringArray(payload.roleIds).map((role) => role.toUpperCase());
  }
  if (payload.userIds !== undefined) next.userIds = normalizeStringArray(payload.userIds);
  if (payload.clientId !== undefined) next.clientId = payload.clientId ? String(payload.clientId) : null;

  const audience = next.audienceType || payload.audienceType;
  if (audience === 'roles' && !normalizeStringArray(next.roleIds ?? payload.roleIds).length) {
    throw serviceError('roleIds are required for role audience');
  }
  if (audience === 'users' && !normalizeStringArray(next.userIds ?? payload.userIds).length) {
    throw serviceError('userIds are required for user audience');
  }
  if (audience === 'client' && !(next.clientId ?? payload.clientId)) {
    throw serviceError('clientId is required for client audience');
  }

  if (audience === 'all') {
    next.roleIds = [];
    next.userIds = [];
    next.clientId = null;
  }

  return next;
}

function audienceMatches(announcement, auth) {
  const audienceType = announcement.audienceType || 'all';
  if (audienceType === 'all') return true;
  if (audienceType === 'roles') {
    const roles = new Set(actorRoles(auth));
    return (announcement.roleIds || []).some((role) => roles.has(String(role).toUpperCase()));
  }
  if (audienceType === 'users') {
    return (announcement.userIds || []).map(String).includes(actorKey(auth));
  }
  if (audienceType === 'client') {
    return String(announcement.clientId || '') === actorKey(auth);
  }
  return false;
}

function serialize(row, receipt) {
  const item = row?.toObject ? row.toObject() : row;
  return {
    ...item,
    _id: String(item._id),
    createdBy: item.createdBy ? String(item.createdBy) : null,
    updatedBy: item.updatedBy ? String(item.updatedBy) : null,
    receipt: receipt ? {
      readAt: receipt.readAt || null,
      dismissedAt: receipt.dismissedAt || null,
    } : undefined,
    readAt: receipt?.readAt || null,
    dismissedAt: receipt?.dismissedAt || null,
  };
}

function sortAnnouncements(a, b) {
  const priorityRank = { critical: 4, high: 3, normal: 2, low: 1 };
  return Number(b.isPinned) - Number(a.isPinned)
    || (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)
    || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

async function listAdmin(v2Auth, filters = {}) {
  const auth = authContext(v2Auth);
  if (!isAdmin(auth)) throw serviceError('Access denied', 403);
  const Announcement = getAnnouncementModel();
  const query = {};
  if (String(filters.includeArchived) !== 'true') query.archivedAt = null;
  if (filters.status === 'active') Object.assign(query, { isActive: true, archivedAt: null });
  if (filters.status === 'archived') query.archivedAt = { $ne: null };
  if (filters.type) query.type = filters.type;
  if (filters.priority) query.priority = filters.priority;
  if (filters.audienceType) query.audienceType = filters.audienceType;
  const rows = await Announcement.find(query).sort({ isPinned: -1, createdAt: -1 }).lean();
  return rows.map((row) => serialize(row));
}

async function create(v2Auth, payload) {
  const auth = authContext(v2Auth);
  if (!isAdmin(auth)) throw serviceError('Access denied', 403);
  const Announcement = getAnnouncementModel();
  const data = validatePayload(payload);
  const row = await Announcement.create({ ...data, createdBy: actorId(auth), updatedBy: actorId(auth) });
  return serialize(row);
}

async function update(v2Auth, announcementId, payload) {
  const auth = authContext(v2Auth);
  if (!isAdmin(auth)) throw serviceError('Access denied', 403);
  const id = assertObjectId(announcementId, 'announcementId');
  const Announcement = getAnnouncementModel();
  const existing = await Announcement.findOne({ _id: id, archivedAt: null });
  if (!existing) throw serviceError('Announcement not found', 404);
  const data = validatePayload({ ...existing.toObject(), ...payload }, true);
  Object.assign(existing, data, { updatedBy: actorId(auth) });
  await existing.save();
  return serialize(existing);
}

async function setEnabled(v2Auth, announcementId, isActive) {
  return update(v2Auth, announcementId, { isActive });
}

async function archive(v2Auth, announcementId) {
  const auth = authContext(v2Auth);
  if (!isAdmin(auth)) throw serviceError('Access denied', 403);
  const id = assertObjectId(announcementId, 'announcementId');
  const Announcement = getAnnouncementModel();
  const row = await Announcement.findOneAndUpdate(
    { _id: id, archivedAt: null },
    { $set: { archivedAt: new Date(), isActive: false, updatedBy: actorId(auth) } },
    { new: true }
  );
  if (!row) throw serviceError('Announcement not found', 404);
  return serialize(row);
}

async function listActive(v2Auth) {
  const auth = authContext(v2Auth);
  const Announcement = getAnnouncementModel();
  const Receipt = getAnnouncementReceiptModel();
  const now = new Date();
  const rows = await Announcement.find({
    isActive: true,
    archivedAt: null,
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    ],
  }).lean();

  const visibleRows = rows.filter((row) => audienceMatches(row, auth));
  if (!visibleRows.length) return [];

  const ids = visibleRows.map((row) => row._id);
  const receipts = await Receipt.find({ announcementId: { $in: ids }, userId: actorKey(auth) }).lean();
  const receiptMap = new Map(receipts.map((receipt) => [String(receipt.announcementId), receipt]));
  return visibleRows
    .filter((row) => !(row.isDismissible && receiptMap.get(String(row._id))?.dismissedAt))
    .map((row) => serialize(row, receiptMap.get(String(row._id))))
    .sort(sortAnnouncements);
}

async function markRead(v2Auth, announcementId) {
  const auth = authContext(v2Auth);
  const id = assertObjectId(announcementId, 'announcementId');
  const visible = await listActive(v2Auth);
  if (!visible.some((item) => item._id === String(id))) throw serviceError('Announcement not found', 404);
  const Receipt = getAnnouncementReceiptModel();
  const receipt = await Receipt.findOneAndUpdate(
    { announcementId: id, userId: actorKey(auth) },
    { $set: { readAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { readAt: receipt.readAt };
}

async function dismiss(v2Auth, announcementId) {
  const auth = authContext(v2Auth);
  const id = assertObjectId(announcementId, 'announcementId');
  const visible = await listActive(v2Auth);
  const announcement = visible.find((item) => item._id === String(id));
  if (!announcement) throw serviceError('Announcement not found', 404);
  if (!announcement.isDismissible) throw serviceError('Announcement cannot be dismissed', 422);
  const Receipt = getAnnouncementReceiptModel();
  const now = new Date();
  const receipt = await Receipt.findOneAndUpdate(
    { announcementId: id, userId: actorKey(auth) },
    { $set: { readAt: now, dismissedAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { dismissedAt: receipt.dismissedAt };
}

module.exports = {
  archive,
  create,
  dismiss,
  listActive,
  listAdmin,
  markRead,
  setEnabled,
  update,
};

// In-memory only — survives only for this process lifetime.
// For multi-process deployments, replace with Redis adapter.

// userId (string) -> { sockets: Set<socketId>, lastSeenAt: Date|null, manualStatus: null|'away'|'offline' }
const presenceMap = new Map();

function addSocket(userId, socketId) {
  const key = String(userId);
  if (!presenceMap.has(key)) {
    presenceMap.set(key, { sockets: new Set(), lastSeenAt: null, manualStatus: null });
  }
  presenceMap.get(key).sockets.add(socketId);
}

function setManualStatus(userId, status) {
  const key = String(userId);
  const entry = presenceMap.get(key);
  if (entry) entry.manualStatus = status || null;
}

// Returns true when the user's LAST socket disconnects (i.e. now offline).
function removeSocket(userId, socketId) {
  const key = String(userId);
  const entry = presenceMap.get(key);
  if (!entry) return true;
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) {
    entry.lastSeenAt = new Date();
    return true;
  }
  return false;
}

function isOnline(userId) {
  const entry = presenceMap.get(String(userId));
  return Boolean(entry && entry.sockets.size > 0);
}

function getStatus(userId) {
  const key = String(userId);
  const entry = presenceMap.get(key);
  const hasSocket = Boolean(entry && entry.sockets.size > 0);
  if (!hasSocket) {
    return { userId: key, status: 'offline', lastSeenAt: entry?.lastSeenAt || null };
  }
  const status = entry.manualStatus || 'online';
  return { userId: key, status, lastSeenAt: null };
}

function getManyStatuses(userIds) {
  return userIds.map(String).map(getStatus);
}

function getOnlineUserIds() {
  const ids = [];
  for (const [userId, entry] of presenceMap) {
    if (entry.sockets.size > 0) ids.push(userId);
  }
  return ids;
}

// Returns only the ids from the given array that are currently online.
function getOnlineUsers(userIds) {
  return userIds.map(String).filter(isOnline);
}

// Returns lastSeenAt for a user (null if currently online or never seen).
function getLastSeenAt(userId) {
  const entry = presenceMap.get(String(userId));
  return entry?.lastSeenAt || null;
}

module.exports = {
  addSocket,
  removeSocket,
  setManualStatus,
  isOnline,
  getOnlineUsers,
  getStatus,
  getManyStatuses,
  getOnlineUserIds,
  getLastSeenAt,
};

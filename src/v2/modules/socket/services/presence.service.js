/**
 * Lightweight in-memory presence tracking.
 * Resets on process restart — no Redis or persistence yet.
 */

const accountSessions = new Map();
const userSessions = new Map();
const socketIndex = new Map();

function touchSession(session) {
  session.lastSeenAt = new Date().toISOString();
}

function addSocketToIndex(socketId, session) {
  socketIndex.set(String(socketId), session);
}

function removeSocketFromIndex(socketId) {
  socketIndex.delete(String(socketId));
}

function removeSocketFromBucket(bucket, idKey, socketId) {
  const bucketKey = String(idKey);
  const session = bucket.get(bucketKey);
  if (!session) return;

  session.socketIds.delete(String(socketId));
  if (session.socketIds.size === 0) {
    bucket.delete(bucketKey);
  } else {
    touchSession(session);
  }
}

function addConnection({ socketId, accountId, userId = null }) {
  const now = new Date().toISOString();
  const accountKey = String(accountId);
  const sid = String(socketId);

  let accountSession = accountSessions.get(accountKey);
  if (!accountSession) {
    accountSession = {
      accountId: accountKey,
      userId: userId ? String(userId) : null,
      socketIds: new Set(),
      connectedAt: now,
      lastSeenAt: now,
    };
    accountSessions.set(accountKey, accountSession);
  }

  accountSession.socketIds.add(sid);
  if (userId) accountSession.userId = String(userId);
  touchSession(accountSession);
  addSocketToIndex(sid, accountSession);

  if (userId) {
    const userKey = String(userId);
    let userSession = userSessions.get(userKey);
    if (!userSession) {
      userSession = {
        accountId: accountKey,
        userId: userKey,
        socketIds: new Set(),
        connectedAt: now,
        lastSeenAt: now,
      };
      userSessions.set(userKey, userSession);
    }

    userSession.socketIds.add(sid);
    touchSession(userSession);
  }
}

function removeConnection(socketId) {
  const sid = String(socketId);
  const accountSession = socketIndex.get(sid);
  if (!accountSession) return null;

  removeSocketFromIndex(sid);
  removeSocketFromBucket(accountSessions, accountSession.accountId, sid);

  if (accountSession.userId) {
    removeSocketFromBucket(userSessions, accountSession.userId, sid);
  }

  return accountSession;
}

function isAccountOnline(accountId) {
  const session = accountSessions.get(String(accountId));
  return Boolean(session && session.socketIds.size > 0);
}

function isUserOnline(userId) {
  const session = userSessions.get(String(userId));
  return Boolean(session && session.socketIds.size > 0);
}

function getOnlineAccountIds() {
  return [...accountSessions.keys()];
}

function getOnlineUserIds() {
  return [...userSessions.keys()];
}

function serializeSession(session) {
  return {
    accountId: session.accountId,
    userId: session.userId,
    socketCount: session.socketIds.size,
    connectedAt: session.connectedAt,
    lastSeenAt: session.lastSeenAt,
  };
}

function getPresenceSnapshot() {
  return {
    accounts: [...accountSessions.values()].map(serializeSession),
    users: [...userSessions.values()].map(serializeSession),
    totals: {
      onlineAccounts: accountSessions.size,
      onlineUsers: userSessions.size,
      activeSockets: socketIndex.size,
    },
  };
}

function resetPresence() {
  accountSessions.clear();
  userSessions.clear();
  socketIndex.clear();
}

module.exports = {
  addConnection,
  removeConnection,
  isAccountOnline,
  isUserOnline,
  getOnlineAccountIds,
  getOnlineUserIds,
  getPresenceSnapshot,
  resetPresence,
};

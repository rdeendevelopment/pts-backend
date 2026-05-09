const mongoose = require('mongoose');
const userPresence = require('../services/userPresence.service');
const handlers = require('./converse.handlers');

// ─── Extract MongoDB ObjectId string from the existing socket auth ────────────
// socket.userKeys is set by the existing socket middleware:
//   socket.userKeys = [String(user._id), String(user.legacyId)]
// userKeys[0] is always the MongoDB ObjectId string.

function _getUserIdFromSocket(socket) {
  return socket.userKeys && socket.userKeys[0] ? socket.userKeys[0] : null;
}

// ─── Fetch display name once at connection (cached on socket object) ──────────

async function _resolveDisplayName(userId) {
  try {
    const { CoreUser, AccountAdmin } = require('../../../MongoModels/core.model');
    const oid = new mongoose.Types.ObjectId(userId);
    const user =
      (await CoreUser.findOne({ _id: oid }).select('firstName lastName email').lean()) ||
      (await AccountAdmin.findOne({ _id: oid }).select('name email').lean());
    if (!user) return '';
    return user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email ||
      '';
  } catch {
    return '';
  }
}

// ─── registerConverseSocket ───────────────────────────────────────────────────
// Called once from server.js after initSocket(server).
// Adds a NEW io.on('connection') handler — safe to stack alongside existing one.

function registerConverseSocket(io) {
  if (!io) {
    console.warn('[converse:socket] io not available — socket features disabled');
    return;
  }

  io.on('connection', async (socket) => {
    const userId = _getUserIdFromSocket(socket);
    if (!userId) return; // unauthenticated — existing middleware already rejected; just guard

    // Set default display info immediately (synchronous)
    socket.converseUser = { idStr: userId, name: '' };

    // Join personal room for user-level events (unread updates, etc.)
    socket.join(`user:${userId}`);

    // Track presence (supports multiple tabs/devices)
    userPresence.addSocket(userId, socket.id);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[converse:presence] connect userId=${userId} socketId=${socket.id}`);
    }

    // Broadcast to ALL connected clients that this user is now online.
    // Payload has no sensitive data — just userId and status.
    io.emit('converse:user_online', { userId, status: 'online' });

    // Resolve display name asynchronously — non-blocking
    _resolveDisplayName(userId)
      .then((name) => { socket.converseUser.name = name; })
      .catch(() => {});

    // ── Client event handlers ──────────────────────────────────────────────

    socket.on('converse:join', (data) =>
      handlers.handleJoin(socket, io, data, userId)
    );

    socket.on('converse:leave', (data) =>
      handlers.handleLeave(socket, io, data, userId)
    );

    socket.on('converse:send_message', (data) =>
      handlers.handleSendMessage(socket, io, data, userId)
    );

    socket.on('converse:typing_start', (data) =>
      handlers.handleTypingStart(socket, io, data, userId)
    );

    socket.on('converse:typing_stop', (data) =>
      handlers.handleTypingStop(socket, io, data, userId)
    );

    socket.on('converse:message_read', (data) =>
      handlers.handleMessageRead(socket, io, data, userId)
    );

    socket.on('converse:set_status', (data) =>
      handlers.handleSetStatus(socket, io, data, userId)
    );

    // ── Disconnect ────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      const isOffline = userPresence.removeSocket(userId, socket.id);

      if (process.env.NODE_ENV !== 'production') {
        const remaining = userPresence.isOnline(userId)
          ? [...(userPresence.getOnlineUserIds())].filter((id) => id === userId).length
          : 0;
        console.log(`[converse:presence] disconnect userId=${userId} socketId=${socket.id} remainingSockets=${remaining}`);
      }

      if (isOffline) {
        const lastSeenAt = userPresence.getLastSeenAt(userId);
        // Broadcast globally — no sensitive data in payload.
        io.emit('converse:user_offline', {
          userId,
          status: 'offline',
          lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : new Date().toISOString(),
        });
      }
    });
  });
}

module.exports = { registerConverseSocket };

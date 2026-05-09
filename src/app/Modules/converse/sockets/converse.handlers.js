const mongoose = require('mongoose');
const ConversationMember = require('../models/conversationMember.model');
const TypingIndicator = require('../models/typingIndicator.model');
const messageService = require('../services/message.service');
const unreadService = require('../services/unread.service');
const SystemModule = require('../../modules-management/models/module.model');
const userPresence = require('../services/userPresence.service');

// ─── Module check (30s TTL cache, fail closed) ────────────────────────────────

let _moduleCache = { enabled: null, expiresAt: 0 };

async function _isConverseEnabled() {
  const now = Date.now();
  if (now < _moduleCache.expiresAt && _moduleCache.enabled !== null) {
    return _moduleCache.enabled;
  }
  try {
    const mod = await SystemModule.findOne({ key: 'converse' }).lean();
    _moduleCache = { enabled: Boolean(mod && mod.enabled), expiresAt: now + 30_000 };
    return _moduleCache.enabled;
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _validOid(id) {
  return id && mongoose.Types.ObjectId.isValid(id);
}

async function _getMember(conversationId, userId) {
  return ConversationMember.findOne({
    conversationId,
    userId,
    leftAt: null,
    isDeletedForMe: false,
  }).lean();
}

// ─── converse:join ────────────────────────────────────────────────────────────
// Client sends { conversationId } to subscribe to room events.

async function handleJoin(socket, io, data, userId) {
  const { conversationId } = data || {};
  if (!_validOid(conversationId)) return;

  try {
    const convId = new mongoose.Types.ObjectId(conversationId);
    const uid = new mongoose.Types.ObjectId(userId);
    const member = await _getMember(convId, uid);
    if (!member) return;

    socket.join(`conversation:${conversationId}`);
    const conversationMembers = await ConversationMember.find({
      conversationId: convId,
      leftAt: null,
      isDeletedForMe: false,
    }).select('userId').lean();
    const onlineUserIds = userPresence.getOnlineUsers(
      conversationMembers.map((item) => item.userId).filter((id) => String(id) !== String(userId))
    );
    socket.emit('converse:presence_snapshot', {
      conversationId,
      onlineUserIds,
    });
    // Notify others in the room that this user is online
    socket.to(`conversation:${conversationId}`).emit('converse:user_online', {
      userId,
      conversationId,
    });
  } catch {
    // silent
  }
}

// ─── converse:leave ───────────────────────────────────────────────────────────

async function handleLeave(socket, io, data, userId) {
  const { conversationId } = data || {};
  if (!_validOid(conversationId)) return;

  // Only leave the room. Do NOT emit converse:user_offline here — the user is still
  // connected (just switched conversations). Offline is broadcast only on socket disconnect.
  socket.leave(`conversation:${conversationId}`);
}

// ─── converse:send_message ────────────────────────────────────────────────────
// Reuses message.service — all business logic + socket emits live there.

async function handleSendMessage(socket, io, data, userId) {
  if (!(await _isConverseEnabled())) {
    return socket.emit('converse:error', { event: 'send_message', message: 'Converse module is disabled' });
  }

  const { conversationId, text, replyToMessageId, attachments } = data || {};
  if (!_validOid(conversationId)) {
    return socket.emit('converse:error', { event: 'send_message', message: 'Invalid conversationId' });
  }

  try {
    await messageService.sendMessage(
      new mongoose.Types.ObjectId(userId),
      socket.converseUser?.name || '',
      {
        conversationId: new mongoose.Types.ObjectId(conversationId),
        text,
        replyToMessageId: _validOid(replyToMessageId) ? new mongoose.Types.ObjectId(replyToMessageId) : null,
        attachments,
      }
    );
    // message.service already emits converse:new_message + converse:conversation_updated
  } catch (err) {
    socket.emit('converse:error', { event: 'send_message', message: err.message || 'Send failed' });
  }
}

// ─── converse:typing_start ────────────────────────────────────────────────────

async function handleTypingStart(socket, io, data, userId) {
  if (!(await _isConverseEnabled())) return;

  const { conversationId } = data || {};
  if (!_validOid(conversationId)) return;

  try {
    const convId = new mongoose.Types.ObjectId(conversationId);
    const uid = new mongoose.Types.ObjectId(userId);
    const member = await _getMember(convId, uid);
    if (!member) return;

    await TypingIndicator.findOneAndUpdate(
      { conversationId: convId, userId: uid },
      { $set: { userName: socket.converseUser?.name || '', startedAt: new Date() } },
      { upsert: true, returnDocument: 'before' }
    );

    socket.to(`conversation:${conversationId}`).emit('converse:typing', {
      conversationId,
      userId,
      userName: socket.converseUser?.name || '',
      isTyping: true,
    });
  } catch {
    // silent — typing is fire-and-forget
  }
}

// ─── converse:typing_stop ─────────────────────────────────────────────────────

async function handleTypingStop(socket, io, data, userId) {
  const { conversationId } = data || {};
  if (!_validOid(conversationId)) return;

  try {
    const convId = new mongoose.Types.ObjectId(conversationId);
    const uid = new mongoose.Types.ObjectId(userId);
    await TypingIndicator.deleteOne({ conversationId: convId, userId: uid });
  } catch {
    // silent
  }

  socket.to(`conversation:${conversationId}`).emit('converse:typing', {
    conversationId,
    userId,
    userName: socket.converseUser?.name || '',
    isTyping: false,
  });
}

// ─── converse:message_read ────────────────────────────────────────────────────
// Reuses unread.service — emits converse:unread_updated + converse:message_read.

async function handleMessageRead(socket, io, data, userId) {
  if (!(await _isConverseEnabled())) return;

  const { messageId } = data || {};
  if (!_validOid(messageId)) return;

  try {
    await unreadService.markRead(
      new mongoose.Types.ObjectId(messageId),
      new mongoose.Types.ObjectId(userId)
    );
  } catch {
    // silent
  }
}

// ─── converse:set_status ──────────────────────────────────────────────────────
// Client sends { status: 'online'|'away'|'offline' } to manually set presence.

async function handleSetStatus(socket, io, data, userId) {
  const { status } = data || {};
  if (!['online', 'away', 'offline'].includes(status)) return;

  userPresence.setManualStatus(userId, status === 'online' ? null : status);

  // Broadcast the precise status to all clients
  io.emit('converse:user_status', { userId, status });
}

module.exports = {
  handleJoin,
  handleLeave,
  handleSendMessage,
  handleTypingStart,
  handleTypingStop,
  handleMessageRead,
  handleSetStatus,
};

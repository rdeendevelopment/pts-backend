const mongoose = require('mongoose');
const Conversation = require('../models/conversation.model');
const ConversationMember = require('../models/conversationMember.model');
const { sanitizeText } = require('../utils/sanitizeMessage.util');
const { CONVERSATION_TYPES, MEMBER_ROLES } = require('../constants/converse.constants');

// ─── Rename ───────────────────────────────────────────────────────────────────

async function renameGroup(conversationId, title) {
  const sanitizedTitle = sanitizeText(title);
  if (!sanitizedTitle) {
    throw Object.assign(new Error('Title cannot be empty'), { statusCode: 422 });
  }

  const conv = await Conversation.findOneAndUpdate(
    { _id: conversationId, type: CONVERSATION_TYPES.GROUP, isDeleted: false },
    { $set: { title: sanitizedTitle } },
    { returnDocument: 'after' }
  ).lean();

  if (!conv) throw Object.assign(new Error('Group not found'), { statusCode: 404 });
  return conv;
}

// ─── Add members ──────────────────────────────────────────────────────────────

async function addMembers(conversationId, actorId, newMemberIds) {
  const conv = await Conversation.findOne({
    _id: conversationId,
    type: CONVERSATION_TYPES.GROUP,
    isDeleted: false,
  }).lean();
  if (!conv) throw Object.assign(new Error('Group not found'), { statusCode: 404 });

  // Find members who are currently active — no duplicates
  const existing = await ConversationMember.find({
    conversationId,
    userId: { $in: newMemberIds },
    leftAt: null,
  })
    .select('userId')
    .lean();

  const activeSet = new Set(existing.map((m) => String(m.userId)));
  const toAdd = newMemberIds.filter((id) => !activeSet.has(String(id)));
  if (!toAdd.length) return [];

  const now = new Date();
  const inserted = [];

  for (const uid of toAdd) {
    const doc = await ConversationMember.findOneAndUpdate(
      { conversationId, userId: uid },
      {
        $set: {
          leftAt: null,
          isDeletedForMe: false,
          role: MEMBER_ROLES.MEMBER,
          joinedAt: now,
          unreadCount: 0,
          mentionCount: 0,
        },
      },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    inserted.push(doc);
  }

  // Re-sync denormalized memberIds / memberCount
  await _syncMemberIds(conversationId);

  return inserted;
}

// ─── Remove member ────────────────────────────────────────────────────────────

async function removeMember(conversationId, actorId, targetUserId) {
  const targetMember = await ConversationMember.findOne({
    conversationId,
    userId: targetUserId,
    leftAt: null,
  }).lean();

  if (!targetMember) {
    throw Object.assign(new Error('Member not found in this conversation'), { statusCode: 404 });
  }

  if (targetMember.role === MEMBER_ROLES.OWNER) {
    const otherAdmin = await ConversationMember.findOne({
      conversationId,
      userId: { $ne: targetUserId },
      role: { $in: [MEMBER_ROLES.OWNER, MEMBER_ROLES.ADMIN] },
      leftAt: null,
    }).lean();
    if (!otherAdmin) {
      throw Object.assign(
        new Error('Cannot remove the only owner — promote another admin first'),
        { statusCode: 422 }
      );
    }
  }

  await ConversationMember.updateOne(
    { conversationId, userId: targetUserId },
    { $set: { leftAt: new Date() } }
  );

  await _syncMemberIds(conversationId);
}

// ─── Internal: re-sync denormalized memberIds ─────────────────────────────────

async function _syncMemberIds(conversationId) {
  const active = await ConversationMember.find({ conversationId, leftAt: null })
    .select('userId')
    .lean();
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { memberIds: active.map((m) => m.userId), memberCount: active.length } }
  );
}

module.exports = { renameGroup, addMembers, removeMember };

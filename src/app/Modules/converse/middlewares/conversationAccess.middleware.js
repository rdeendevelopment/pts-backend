const mongoose = require('mongoose');
const Conversation = require('../models/conversation.model');
const ConversationMember = require('../models/conversationMember.model');
const { getActorId } = require('../services/converseMapper.service');

async function conversationAccess(req, res, next) {
  const { conversationId } = req.params;

  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
  }

  const actorId = getActorId(req);

  try {
    const [conv, member] = await Promise.all([
      Conversation.findOne({ _id: conversationId, isDeleted: false }).lean(),
      ConversationMember.findOne({
        conversationId,
        userId: actorId,
        leftAt: null,
        isDeletedForMe: false,
      }).lean(),
    ]);

    if (!conv || !member) {
      return res.status(403).json({ success: false, message: 'Access denied to this conversation' });
    }

    req.conversation = conv;
    req.conversationMember = member;
    return next();
  } catch (err) {
    console.error('[conversationAccess] error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = conversationAccess;

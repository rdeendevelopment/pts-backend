const mongoose = require('mongoose');
const { getActorId, getActorName } = require('../services/converseMapper.service');
const conversationService = require('../services/conversation.service');

exports.list = async function list(req, res) {
  try {
    const actorId = getActorId(req);
    const conversations = await conversationService.getConversationList(actorId);
    return res.send({ data: conversations });
  } catch (err) {
    console.error('[converse/conversation] list error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.createDirect = async function createDirect(req, res) {
  try {
    const actorId = getActorId(req);
    const actorName = getActorName(req);
    const { recipientUserId } = req.body;

    if (String(actorId) === String(recipientUserId)) {
      return res.status(422).send({ message: 'Cannot start a conversation with yourself' });
    }

    const { conversation, created } = await conversationService.createDirect(
      actorId,
      actorName,
      new mongoose.Types.ObjectId(recipientUserId)
    );

    return res.status(created ? 201 : 200).send({
      message: created ? 'Conversation created' : 'Conversation already exists',
      data: conversation,
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/conversation] createDirect error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.createGroup = async function createGroup(req, res) {
  try {
    const actorId = getActorId(req);
    const actorName = getActorName(req);
    const { title, memberIds } = req.body;

    const memberObjectIds = memberIds.map((id) => new mongoose.Types.ObjectId(id));
    const { conversation } = await conversationService.createGroup(actorId, actorName, title, memberObjectIds);

    return res.status(201).send({ message: 'Group created', data: conversation });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/conversation] createGroup error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.getDetail = async function getDetail(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId } = req.params;

    const detail = await conversationService.getConversationDetail(
      new mongoose.Types.ObjectId(conversationId),
      actorId
    );

    if (!detail) return res.status(404).send({ message: 'Conversation not found' });
    return res.send({ data: detail });
  } catch (err) {
    console.error('[converse/conversation] getDetail error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.mute = async function mute(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId } = req.params;
    const { isMuted } = req.body;

    await conversationService.muteConversation(
      new mongoose.Types.ObjectId(conversationId),
      actorId,
      isMuted
    );

    return res.send({ message: `Conversation ${isMuted ? 'muted' : 'unmuted'} successfully` });
  } catch (err) {
    console.error('[converse/conversation] mute error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.deleteForMe = async function deleteForMe(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId } = req.params;

    await conversationService.deleteForMe(new mongoose.Types.ObjectId(conversationId), actorId);

    return res.send({ message: 'Conversation removed from your list' });
  } catch (err) {
    console.error('[converse/conversation] deleteForMe error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.pin = async function pin(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId } = req.params;
    const { isPinned } = req.body;
    await conversationService.pinConversation(
      new mongoose.Types.ObjectId(conversationId),
      actorId,
      Boolean(isPinned)
    );
    return res.send({ message: `Conversation ${isPinned ? 'pinned' : 'unpinned'}` });
  } catch (err) {
    console.error('[converse/conversation] pin error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.leave = async function leave(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId } = req.params;

    await conversationService.leaveGroup(new mongoose.Types.ObjectId(conversationId), actorId);

    return res.send({ message: 'You have left the group' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/conversation] leave error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

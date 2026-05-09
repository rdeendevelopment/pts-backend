const mongoose = require('mongoose');
const { getActorId, getActorName } = require('../services/converseMapper.service');
const messageService = require('../services/message.service');
const unreadService = require('../services/unread.service');

exports.list = async function list(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId } = req.params;

    const result = await messageService.listMessages(
      new mongoose.Types.ObjectId(conversationId),
      actorId,
      req.query
    );

    return res.send(result);
  } catch (err) {
    console.error('[converse/message] list error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.send = async function send(req, res) {
  try {
    const actorId = getActorId(req);
    const actorName = getActorName(req);
    const { conversationId, text, replyToMessageId, attachments } = req.body;

    const msg = await messageService.sendMessage(actorId, actorName, {
      conversationId: new mongoose.Types.ObjectId(conversationId),
      text,
      replyToMessageId: replyToMessageId ? new mongoose.Types.ObjectId(replyToMessageId) : null,
      attachments,
    });

    return res.status(201).send({ message: 'Message sent', data: msg });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/message] send error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.edit = async function edit(req, res) {
  try {
    const actorId = getActorId(req);
    const { messageId } = req.params;
    const { text } = req.body;

    const msg = await messageService.editMessage(
      new mongoose.Types.ObjectId(messageId),
      actorId,
      text
    );

    return res.send({ message: 'Message updated', data: msg });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/message] edit error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.deleteForEveryone = async function deleteForEveryone(req, res) {
  try {
    const actorId = getActorId(req);
    const { messageId } = req.params;

    const msg = await messageService.deleteForEveryone(
      new mongoose.Types.ObjectId(messageId),
      actorId
    );

    return res.send({ message: 'Message deleted for everyone', data: msg });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/message] deleteForEveryone error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.markRead = async function markRead(req, res) {
  try {
    const actorId = getActorId(req);
    const { messageId } = req.params;

    await unreadService.markRead(new mongoose.Types.ObjectId(messageId), actorId);

    return res.send({ message: 'Marked as read' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/message] markRead error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.pin = async function pin(req, res) {
  try {
    const actorId = getActorId(req);
    const { messageId } = req.params;

    const pinDoc = await messageService.pinMessage(
      new mongoose.Types.ObjectId(messageId),
      actorId
    );

    return res.send({ message: 'Message pinned', data: pinDoc });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/message] pin error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.unpin = async function unpin(req, res) {
  try {
    const actorId = getActorId(req);
    const { messageId } = req.params;

    await messageService.unpinMessage(new mongoose.Types.ObjectId(messageId), actorId);

    return res.send({ message: 'Message unpinned' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/message] unpin error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.forward = async function forward(req, res) {
  try {
    const actorId = getActorId(req);
    const actorName = getActorName(req);
    const { messageId } = req.params;
    const { targetConversationIds } = req.body;

    const targetIds = targetConversationIds.map((id) => new mongoose.Types.ObjectId(id));
    const results = await messageService.forwardMessage(
      new mongoose.Types.ObjectId(messageId),
      actorId,
      actorName,
      targetIds
    );

    return res.send({
      message: `Forwarded to ${results.length} conversation(s)`,
      data: results,
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/message] forward error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

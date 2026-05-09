const mongoose = require('mongoose');
const { getActorId } = require('../services/converseMapper.service');
const groupService = require('../services/group.service');

exports.rename = async function rename(req, res) {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;

    const conv = await groupService.renameGroup(
      new mongoose.Types.ObjectId(conversationId),
      title
    );

    return res.send({ message: 'Group renamed successfully', data: { _id: conv._id, title: conv.title } });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/group] rename error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.addMembers = async function addMembers(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId } = req.params;
    const { memberIds } = req.body;

    const memberObjectIds = memberIds.map((id) => new mongoose.Types.ObjectId(id));
    const added = await groupService.addMembers(
      new mongoose.Types.ObjectId(conversationId),
      actorId,
      memberObjectIds
    );

    return res.send({ message: `${added.length} member(s) added`, data: added });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/group] addMembers error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

exports.removeMember = async function removeMember(req, res) {
  try {
    const actorId = getActorId(req);
    const { conversationId, userId } = req.params;

    await groupService.removeMember(
      new mongoose.Types.ObjectId(conversationId),
      actorId,
      new mongoose.Types.ObjectId(userId)
    );

    return res.send({ message: 'Member removed from group' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).send({ message: err.message });
    console.error('[converse/group] removeMember error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};

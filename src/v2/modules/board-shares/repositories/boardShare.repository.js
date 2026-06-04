const { getBoardShareModel } = require('../models/boardShare.model');

function buildListQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.status) query.status = filters.status;
  if (filters.projectId) {
    query.projectIds = filters.projectId;
  }
  return query;
}

async function listBoardShares(filters = {}) {
  const BoardShare = getBoardShareModel();
  return BoardShare.find(buildListQuery(filters))
    .sort({ updatedAt: -1 })
    .lean();
}

async function findById(shareId) {
  const BoardShare = getBoardShareModel();
  return BoardShare.findOne({ _id: shareId, isDeleted: false }).exec();
}

async function findActiveByClientId(clientId) {
  const BoardShare = getBoardShareModel();
  return BoardShare.findOne({
    clientId,
    status: 'active',
    isDeleted: false,
  }).exec();
}

async function findActiveShareForProject(projectId, clientId = null) {
  const BoardShare = getBoardShareModel();
  const query = {
    projectIds: projectId,
    status: 'active',
    isDeleted: false,
  };
  if (clientId) query.clientId = clientId;
  return BoardShare.findOne(query).sort({ updatedAt: -1 }).exec();
}

async function createBoardShare(payload) {
  const BoardShare = getBoardShareModel();
  return BoardShare.create(payload);
}

async function updateBoardShare(shareId, payload) {
  const BoardShare = getBoardShareModel();
  return BoardShare.findOneAndUpdate(
    { _id: shareId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

module.exports = {
  listBoardShares,
  findById,
  findActiveByClientId,
  findActiveShareForProject,
  createBoardShare,
  updateBoardShare,
};

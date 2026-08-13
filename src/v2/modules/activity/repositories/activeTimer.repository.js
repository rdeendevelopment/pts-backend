const { getActiveTimerModel } = require('../models/activeTimer.model');
const { buildContextQuery } = require('../helpers/timerContext.helper');

async function findById(timerId, { includeDeleted = false } = {}) {
  const ActiveTimer = getActiveTimerModel();
  const query = { _id: timerId };
  if (!includeDeleted) query.isDeleted = false;
  return ActiveTimer.findOne(query).exec();
}

async function findRunningByUserId(userId) {
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.findOne({ userId, status: 'running', isDeleted: false }).exec();
}

async function findByStartIdempotencyKey(userId, startIdempotencyKey) {
  if (!startIdempotencyKey) return null;
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.findOne({ userId, startIdempotencyKey, isDeleted: false }).exec();
}

async function findActionableByUserId(userId) {
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.findOne({
    userId,
    status: { $in: ['running', 'needs_correction'] },
    isDeleted: false,
  }).sort({ updatedAt: -1 }).exec();
}

async function findPausedByContext(userId, context) {
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.findOne(buildContextQuery(userId, context, { status: 'paused' })).exec();
}

async function findOpenByContext(userId, context) {
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.findOne({
    ...buildContextQuery(userId, context),
    status: { $in: ['running', 'paused', 'needs_correction'] },
  }).exec();
}

async function listPausedByUserId(userId, { limit = 50 } = {}) {
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.find({ userId, status: 'paused', isDeleted: false })
    .sort({ pausedAt: -1, updatedAt: -1 })
    .limit(limit)
    .exec();
}

async function listRunning({ limit = 500 } = {}) {
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.find({ status: 'running', isDeleted: false })
    .sort({ startedAt: 1 })
    .limit(limit)
    .exec();
}

async function createTimer(payload, session = null) {
  const ActiveTimer = getActiveTimerModel();
  const docs = await ActiveTimer.create([payload], session ? { session } : undefined);
  return docs[0];
}

async function updateTimer(
  timerId,
  payload,
  session = null,
  { expectedStatus = null, expectedRevision = null, incrementRevision = true } = {},
) {
  const ActiveTimer = getActiveTimerModel();
  const query = { _id: timerId, isDeleted: false };
  if (expectedStatus) query.status = expectedStatus;
  if (expectedRevision !== null && expectedRevision !== undefined) query.revision = Number(expectedRevision);

  const options = { returnDocument: 'after', runValidators: true };
  if (session) options.session = session;

  const update = { $set: payload };
  if (incrementRevision) update.$inc = { revision: 1 };
  return ActiveTimer.findOneAndUpdate(query, update, options).exec();
}

async function countRunningForProject(projectId) {
  const ActiveTimer = getActiveTimerModel();
  return ActiveTimer.countDocuments({
    projectId,
    status: 'running',
    isDeleted: false,
  }).exec();
}

module.exports = {
  findById,
  findRunningByUserId,
  findByStartIdempotencyKey,
  findActionableByUserId,
  findPausedByContext,
  findOpenByContext,
  listPausedByUserId,
  listRunning,
  createTimer,
  updateTimer,
  countRunningForProject,
};

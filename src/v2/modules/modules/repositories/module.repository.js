const { getModuleModel } = require('../models/module.model');

function buildListQuery({ includeDeleted = false, status = null } = {}) {
  const query = {};
  if (!includeDeleted) query.isDeleted = false;
  if (status) query.status = status;
  return query;
}

async function listModules(options = {}) {
  const Module = getModuleModel();
  return Module.find(buildListQuery(options))
    .sort({ sortOrder: 1, key: 1 })
    .lean();
}

async function listActiveModules() {
  return listModules({ status: 'active', includeDeleted: false });
}

async function listByKeys(keys = []) {
  const normalizedKeys = [...new Set(keys.map((key) => String(key).toLowerCase().trim()).filter(Boolean))];
  if (!normalizedKeys.length) return [];

  const Module = getModuleModel();
  return Module.find({
    key: { $in: normalizedKeys },
    isDeleted: false,
    status: 'active',
  })
    .sort({ sortOrder: 1, key: 1 })
    .lean();
}

async function findById(moduleId) {
  const Module = getModuleModel();
  return Module.findOne({ _id: moduleId, isDeleted: false }).exec();
}

async function findByKey(key, { includeDeleted = false } = {}) {
  const Module = getModuleModel();
  const query = { key: String(key).toLowerCase().trim() };
  if (!includeDeleted) query.isDeleted = false;
  return Module.findOne(query).exec();
}

async function createModule(payload) {
  const Module = getModuleModel();
  return Module.create(payload);
}

async function updateModule(moduleId, payload) {
  const Module = getModuleModel();
  return Module.findOneAndUpdate(
    { _id: moduleId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softDeleteModule(moduleId) {
  const Module = getModuleModel();
  return Module.findOneAndUpdate(
    { _id: moduleId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { returnDocument: 'after' }
  ).exec();
}

module.exports = {
  listModules,
  listActiveModules,
  listByKeys,
  findById,
  findByKey,
  createModule,
  updateModule,
  softDeleteModule,
};

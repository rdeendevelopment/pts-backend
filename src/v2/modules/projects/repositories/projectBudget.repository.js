const { getProjectBudgetModel } = require('../models/projectBudget.model');
const { syncBudgetCanonicalFields } = require('../helpers/budgetCapacity.helper');

async function listByProjectId(projectId, { includeDeleted = false } = {}) {
  const ProjectBudget = getProjectBudgetModel();
  const query = { projectId };
  if (!includeDeleted) query.isDeleted = false;
  return ProjectBudget.find(query).sort({ createdAt: -1 }).exec();
}

async function findById(budgetId, { projectId = null, includeDeleted = false } = {}) {
  const ProjectBudget = getProjectBudgetModel();
  const query = { _id: budgetId };
  if (projectId) query.projectId = projectId;
  if (!includeDeleted) query.isDeleted = false;
  return ProjectBudget.findOne(query).exec();
}

async function createBudget(payload) {
  const ProjectBudget = getProjectBudgetModel();
  return ProjectBudget.create(syncBudgetCanonicalFields(payload));
}

async function updateBudget(budgetId, projectId, payload) {
  const ProjectBudget = getProjectBudgetModel();
  return ProjectBudget.findOneAndUpdate(
    { _id: budgetId, projectId, isDeleted: false },
    { $set: syncBudgetCanonicalFields(payload) },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softDeleteBudget(budgetId, projectId, updatedBy) {
  const ProjectBudget = getProjectBudgetModel();
  return ProjectBudget.findOneAndUpdate(
    { _id: budgetId, projectId, isDeleted: false },
    {
      $set: syncBudgetCanonicalFields({
        isDeleted: true,
        deletedAt: new Date(),
        approvalStatus: 'cancelled',
        status: 'cancelled',
        approvedMinutes: 0,
        approvedAmount: 0,
        approvedBy: null,
        updatedBy,
      }),
    },
    { returnDocument: 'after' }
  ).exec();
}

async function countByProjectId(projectId, { includeDeleted = false } = {}) {
  const ProjectBudget = getProjectBudgetModel();
  const query = { projectId };
  if (!includeDeleted) query.isDeleted = false;
  return ProjectBudget.countDocuments(query).exec();
}

async function findRetainerCycleByPeriodStart(projectId, periodStart) {
  const ProjectBudget = getProjectBudgetModel();
  const start = new Date(periodStart);
  return ProjectBudget.findOne({
    projectId,
    isDeleted: false,
    entryType: 'retainer_cycle',
    periodStart: start,
  }).exec();
}

module.exports = {
  listByProjectId,
  findById,
  createBudget,
  updateBudget,
  softDeleteBudget,
  countByProjectId,
  findRetainerCycleByPeriodStart,
};
